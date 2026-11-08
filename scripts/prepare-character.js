#!/usr/bin/env node
/**
 * Turns raw character art into a ready-to-use Khibi pack.
 *
 *   assets/<id>/<id>-<mood>.png   (raw: any size, flat-colour or transparent background)
 *        |  scale to 512px, key out the background, drop the corner watermark
 *        v
 *   packages/companion-app/characters/<id>/<id>-<mood>.webp  + character.json
 *
 * Usage:  npm run characters:prepare            (every folder in assets/)
 *         npm run characters:prepare -- character-1 other-hero
 *         options: --size 512  --keep-corner  --keep-bg  --similarity 0.26
 *
 * Needs `ffmpeg` on PATH. Moods = normal happy excited celebrating sleepy sleeping surprised sad
 * worried thinking; only `normal` is required.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const assetsDir = path.join(repo, 'assets');
const outRoot = path.join(repo, 'packages', 'companion-app', 'characters');

let shared;
try {
    shared = require(path.join(repo, 'packages', 'shared', 'dist', 'index.js'));
} catch {
    console.error('Build @khibi/shared first:  npm run build:shared');
    process.exit(1);
}

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const valueFlags = new Set(['--size', '--similarity']);
const ids = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));
const size = Math.max(128, Math.min(2048, Number(option('size', 512))));
const similarity = Number(option('similarity', 0.26));

// ---- ffmpeg helpers ---------------------------------------------------------
function ffmpeg(argv, binary = false) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...argv], {
        encoding: binary ? 'buffer' : 'utf8',
        maxBuffer: 64 * 1024 * 1024
    });
    if (r.error && r.error.code === 'ENOENT') {
        console.error('ffmpeg not found on PATH. Install it (e.g. `winget install Gyan.FFmpeg`) and retry.');
        process.exit(1);
    }
    if (r.status !== 0) {
        throw new Error(String(r.stderr || r.stdout).trim() || 'ffmpeg failed');
    }
    return r.stdout;
}

/** RGBA of one pixel, used to find the flat background colour. */
function samplePixel(file, x, y) {
    const buf = ffmpeg(['-i', file, '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], true);
    return { r: buf[0], g: buf[1], b: buf[2], a: buf[3] };
}

const hex = ({ r, g, b }) => [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function dimensions(file) {
    // ffmpeg prints stream info on stderr even with -v error off; use a tiny probe instead.
    const r = spawnSync('ffmpeg', ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
    const m = /Stream #.*Video:.* (\d{2,5})x(\d{2,5})/.exec(r.stderr || '');
    if (!m) {
        throw new Error(`Cannot read size of ${file}`);
    }
    return { w: Number(m[1]), h: Number(m[2]) };
}

// ---- main -------------------------------------------------------------------
if (!fs.existsSync(assetsDir)) {
    console.error(`No assets folder at ${assetsDir}`);
    process.exit(1);
}
const targets = ids.length
    ? ids
    : fs.readdirSync(assetsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

let failed = false;
for (const id of targets) {
    const srcDir = path.join(assetsDir, id);
    if (!fs.existsSync(srcDir)) {
        console.error(`✗ ${id}: assets/${id} does not exist`);
        failed = true;
        continue;
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) {
        console.error(`✗ ${id}: folder names must be lowercase letters, digits, "-" or "_"`);
        failed = true;
        continue;
    }
    const inferred = shared.inferManifest(srcDir, id);
    if (!inferred) {
        console.error(`✗ ${id}: no "normal" image found (expected e.g. ${id}-normal.png)`);
        failed = true;
        continue;
    }

    const outDir = path.join(outRoot, id);
    fs.mkdirSync(outDir, { recursive: true });
    const expressions = {};
    console.log(`\n${id}`);

    for (const [mood, srcName] of Object.entries(inferred.expressions)) {
        const src = path.join(srcDir, srcName);
        const outName = `${id}-${mood}.webp`;
        try {
            const { w, h } = dimensions(src);
            const corner = samplePixel(src, 4, 4);
            const hasAlpha = corner.a < 250;
            const filters = [];
            if (!hasAlpha && !flag('keep-bg')) {
                const bg = hex(corner);
                if (!flag('keep-corner')) {
                    // Paint over the bottom-right AI-generator sparkle with the background colour first.
                    const bx = Math.round(w * 0.9);
                    const by = Math.round(h * 0.8);
                    filters.push(`drawbox=x=${bx}:y=${by}:w=${w - bx}:h=${h - by}:color=0x${bg}:t=fill`);
                }
                filters.push(`scale=${size}:${size}:flags=lanczos`, 'format=rgba', `colorkey=0x${bg}:${similarity}:0.10`);
            } else {
                filters.push(`scale=${size}:${size}:flags=lanczos`, 'format=rgba');
            }
            ffmpeg([
                '-i', src, '-vf', filters.join(','), '-frames:v', '1',
                '-c:v', 'libwebp', '-quality', '92', '-compression_level', '6', '-pix_fmt', 'yuva420p',
                path.join(outDir, outName)
            ]);
            expressions[mood] = outName;
            const kb = Math.round(fs.statSync(path.join(outDir, outName)).size / 1024);
            console.log(`  ✓ ${mood.padEnd(12)} -> ${outName} (${kb} KB)`);
        } catch (err) {
            console.error(`  ✗ ${mood}: ${err.message}`);
            failed = true;
        }
    }

    const manifestPath = path.join(outDir, 'character.json');
    if (fs.existsSync(manifestPath)) {
        console.log('  • character.json already exists – left untouched (edit it to rename / retune)');
    } else {
        fs.writeFileSync(
            manifestPath,
            JSON.stringify({ name: inferred.name, type: 'images', scale: 1, expressions }, null, 4) + '\n'
        );
        console.log('  • wrote character.json');
    }
    const missing = shared.ALL_EXPRESSIONS.filter((m) => !expressions[m]);
    if (missing.length) {
        console.log(`  • no art for: ${missing.join(', ')} (they fall back automatically)`);
    }
}
process.exit(failed ? 1 : 0);
