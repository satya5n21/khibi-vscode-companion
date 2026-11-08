import * as fs from 'fs';
import * as path from 'path';
import {
    ALL_EXPRESSIONS,
    CharacterExpression,
    CharacterManifest,
    CharacterPackInfo,
    ExpressionSpec,
    MotionPreset,
    ResolvedCharacter,
    ResolvedExpression
} from './types';

/** Node-only helpers (uses `fs`). Import from the extension host or Electron main – not the renderer. */

export const CHARACTER_MANIFEST_FILE = 'character.json';
export const DEFAULT_CHARACTER_ID = 'khibi';
export const CHARACTER_URL_SCHEME = 'khibi-char';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.gif', '.jpg', '.jpeg', '.svg']);
const MOTIONS: readonly MotionPreset[] = [
    'none', 'breathe', 'bounce', 'jump', 'shiver', 'droop', 'nod', 'sway', 'pop'
];

/** First entry that has art wins. `normal` is always last, and always present. */
const FALLBACK_CHAIN: Record<CharacterExpression, CharacterExpression[]> = {
    normal: [],
    happy: ['normal'],
    excited: ['happy', 'normal'],
    celebrating: ['excited', 'happy', 'normal'],
    sleepy: ['sleeping', 'normal'],
    sleeping: ['sleepy', 'normal'],
    surprised: ['excited', 'normal'],
    sad: ['worried', 'normal'],
    worried: ['sad', 'normal'],
    thinking: ['normal']
};

const DEFAULT_MOTION: Record<CharacterExpression, MotionPreset> = {
    normal: 'breathe',
    happy: 'bounce',
    excited: 'jump',
    celebrating: 'jump',
    sleepy: 'nod',
    sleeping: 'droop',
    surprised: 'pop',
    sad: 'droop',
    worried: 'shiver',
    thinking: 'sway'
};

export interface DiscoveryResult {
    packs: CharacterPackInfo[];
    /** Human-readable reasons packs were skipped. */
    errors: string[];
}

/** True when `candidate` is `root` or lives inside it (symlinks resolved). */
export function isPathInside(root: string, candidate: string): boolean {
    try {
        const realRoot = fs.realpathSync(root);
        const realCandidate = fs.realpathSync(candidate);
        const rel = path.relative(realRoot, realCandidate);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    } catch {
        return false;
    }
}

export function isAllowedImagePath(relPath: string): boolean {
    return IMAGE_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function isSafeRelativePath(rel: string): boolean {
    return (
        typeof rel === 'string' &&
        rel.length > 0 &&
        !path.isAbsolute(rel) &&
        !rel.split(/[\\/]/).includes('..')
    );
}

function normalizeSpec(
    raw: string | string[] | ExpressionSpec | undefined
): ExpressionSpec | null {
    if (raw === undefined || raw === null) {
        return null;
    }
    if (typeof raw === 'string') {
        return { src: raw };
    }
    if (Array.isArray(raw)) {
        return { src: raw };
    }
    if (typeof raw === 'object' && raw.src !== undefined) {
        return raw;
    }
    return null;
}

function listFrames(spec: ExpressionSpec, packDir: string): string[] {
    const sources = Array.isArray(spec.src) ? spec.src : [spec.src];
    return sources.filter(
        (rel) =>
            isSafeRelativePath(rel) &&
            isAllowedImagePath(rel) &&
            fs.existsSync(path.join(packDir, rel))
    );
}

/** Validates a parsed `character.json`. Returns an error string, or null when valid. */
export function validateManifest(
    manifest: unknown,
    packDir: string
): string | null {
    if (!manifest || typeof manifest !== 'object') {
        return 'character.json must contain a JSON object';
    }
    const m = manifest as Partial<CharacterManifest>;
    if (typeof m.name !== 'string' || m.name.trim() === '') {
        return '"name" is required';
    }
    if (m.type === 'svg') {
        if (
            typeof m.svg !== 'string' ||
            !isSafeRelativePath(m.svg) ||
            path.extname(m.svg).toLowerCase() !== '.svg'
        ) {
            return '"svg" must be a relative path to an .svg file';
        }
        if (!fs.existsSync(path.join(packDir, m.svg))) {
            return `SVG file not found: ${m.svg}`;
        }
        return null;
    }
    if (m.type === 'images') {
        const normal = normalizeSpec(m.expressions?.normal);
        if (!normal) {
            return 'expressions.normal is required for "images" packs';
        }
        if (listFrames(normal, packDir).length === 0) {
            return 'expressions.normal has no readable image (png/webp/gif/jpg/svg)';
        }
        return null;
    }
    return '"type" must be "svg" or "images"';
}

/**
 * Scans each root for `<root>/<id>/character.json`. Later roots override earlier ones
 * with the same id, so a user pack can replace a built-in one.
 */
export function discoverCharacters(
    roots: ReadonlyArray<{ dir: string; source: 'builtin' | 'user' }>
): DiscoveryResult {
    const byId = new Map<string, CharacterPackInfo>();
    const errors: string[] = [];

    for (const root of roots) {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(root.dir, { withFileTypes: true });
        } catch {
            continue; // Root folder does not exist (yet) – that's fine.
        }

        for (const entry of entries) {
            if (!entry.isDirectory() && !entry.isSymbolicLink()) {
                continue;
            }
            const packDir = path.join(root.dir, entry.name);
            const manifestPath = path.join(packDir, CHARACTER_MANIFEST_FILE);
            if (!fs.existsSync(manifestPath)) {
                continue;
            }
            if (!ID_PATTERN.test(entry.name)) {
                errors.push(
                    `${entry.name}: folder name must be lowercase letters, digits, "-" or "_"`
                );
                continue;
            }
            try {
                const manifest = JSON.parse(
                    fs.readFileSync(manifestPath, 'utf8')
                ) as CharacterManifest;
                const problem = validateManifest(manifest, packDir);
                if (problem) {
                    errors.push(`${entry.name}: ${problem}`);
                    continue;
                }
                byId.set(entry.name, {
                    id: entry.name,
                    name: manifest.name.trim(),
                    author: manifest.author,
                    description: manifest.description,
                    kind: manifest.type,
                    dir: packDir,
                    source: root.source,
                    manifest
                });
            } catch (err) {
                errors.push(
                    `${entry.name}: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
    }

    const packs = [...byId.values()].sort((a, b) => {
        if (a.id === DEFAULT_CHARACTER_ID) {
            return -1;
        }
        if (b.id === DEFAULT_CHARACTER_ID) {
            return 1;
        }
        return a.name.localeCompare(b.name);
    });
    return { packs, errors };
}

export function characterAssetUrl(packId: string, relPath: string): string {
    const encoded = relPath
        .split(/[\\/]/)
        .map((part) => encodeURIComponent(part))
        .join('/');
    return `${CHARACTER_URL_SCHEME}://${packId}/${encoded}`;
}

/**
 * Turns a validated pack into what the renderer needs: every one of the 10 expressions
 * filled in (via fallbacks) with ready-to-load URLs.
 */
export function resolveCharacter(pack: CharacterPackInfo): ResolvedCharacter {
    const { manifest } = pack;
    const scale = Math.min(1.5, Math.max(0.5, manifest.scale ?? 1));
    const base = {
        id: pack.id,
        name: pack.name,
        author: pack.author,
        kind: pack.kind,
        scale
    };

    if (pack.kind === 'svg') {
        return { ...base, svgUrl: characterAssetUrl(pack.id, manifest.svg as string) };
    }

    const own = new Map<CharacterExpression, ResolvedExpression>();
    for (const expr of ALL_EXPRESSIONS) {
        const spec = normalizeSpec(manifest.expressions?.[expr]);
        if (!spec) {
            continue;
        }
        const frames = listFrames(spec, pack.dir);
        if (frames.length === 0) {
            continue;
        }
        const motion =
            spec.motion && MOTIONS.includes(spec.motion)
                ? spec.motion
                : DEFAULT_MOTION[expr];
        own.set(expr, {
            frames: frames.map((f) => characterAssetUrl(pack.id, f)),
            fps: Math.min(30, Math.max(1, spec.fps ?? 6)),
            motion
        });
    }

    const expressions = {} as Record<CharacterExpression, ResolvedExpression>;
    for (const expr of ALL_EXPRESSIONS) {
        const hit =
            own.get(expr) ??
            FALLBACK_CHAIN[expr].map((e) => own.get(e)).find((r) => r !== undefined);
        // `normal` is validated to exist, so `hit` is always defined here.
        expressions[expr] = hit as ResolvedExpression;
    }
    return { ...base, expressions };
}
