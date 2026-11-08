export type CharacterState =
    | 'INITIALIZING'
    | 'WAKING_UP'
    | 'AWAKE'
    | 'HAPPY'
    | 'EXCITED'
    | 'THINKING'
    | 'SURPRISED'
    | 'WORRIED'
    | 'SAD'
    | 'SLEEPY'
    | 'SLEEPING';

export type CharacterExpression =
    | 'normal'
    | 'happy'
    | 'excited'
    | 'celebrating'
    | 'sleepy'
    | 'sleeping'
    | 'surprised'
    | 'sad'
    | 'worried'
    | 'thinking';

export type ReactionTrigger =
    | 'STARTUP'
    | 'FILE_SAVED'
    | 'ERROR_DETECTED'
    | 'TESTS_RUNNING'
    | 'TESTS_PASSED'
    | 'TESTS_FAILED'
    | 'IDLE_WARNING'
    | 'FALL_ASLEEP'
    | 'WAKE_UP'
    | 'MANUAL_PET';

export const ALL_EXPRESSIONS: readonly CharacterExpression[] = [
    'normal',
    'happy',
    'excited',
    'celebrating',
    'sleepy',
    'sleeping',
    'surprised',
    'sad',
    'worried',
    'thinking'
];

export type WindowSizePreset = 'small' | 'medium' | 'large';

// ---------------------------------------------------------------------------
// Character packs
// ---------------------------------------------------------------------------

/** Built-in CSS motion presets a pack can attach to an expression. */
export type MotionPreset =
    | 'none'
    | 'breathe'
    | 'bounce'
    | 'jump'
    | 'shiver'
    | 'droop'
    | 'nod'
    | 'sway'
    | 'pop';

export interface ExpressionSpec {
    /** One image (static) or several (frame animation), relative to the pack folder. */
    src: string | string[];
    /** Frames per second when `src` has more than one frame. Default 6. */
    fps?: number;
    /** Body motion applied while this expression is active. Default depends on expression. */
    motion?: MotionPreset;
}

/** Shape of `character.json` inside a character pack folder. */
export interface CharacterManifest {
    name: string;
    author?: string;
    description?: string;
    /**
     * `svg`    – one inline SVG styled by the `.expr-*` classes (see docs/CHARACTER_GUIDE.md).
     * `images` – one image (or frame list) per expression: PNG / WebP / GIF / JPG / SVG.
     */
    type: 'svg' | 'images';
    /** type "svg": path of the SVG file. */
    svg?: string;
    /** Multiplier applied to the character inside the window (0.5 – 1.5). Default 1. */
    scale?: number;
    /** type "images": `normal` is required, everything else falls back automatically. */
    expressions?: Partial<
        Record<CharacterExpression, string | string[] | ExpressionSpec>
    >;
}

export interface ResolvedExpression {
    /** Fully-qualified `khibi-char://` URLs. */
    frames: string[];
    fps: number;
    motion: MotionPreset;
}

/** A pack after validation, fallback-filling and URL resolution – ready for the renderer. */
export interface ResolvedCharacter {
    id: string;
    name: string;
    author?: string;
    kind: 'svg' | 'images';
    svgUrl?: string;
    scale: number;
    expressions?: Record<CharacterExpression, ResolvedExpression>;
}

export interface CharacterPackInfo {
    id: string;
    name: string;
    author?: string;
    description?: string;
    kind: 'svg' | 'images';
    dir: string;
    source: 'builtin' | 'user';
    manifest: CharacterManifest;
}

export interface KhibiSettings {
    enabled: boolean;
    /** Folder name of the selected character pack. */
    character: string;
    /** Extra folders (beyond the built-in one) that contain character pack folders. */
    customCharacterRoots: string[];
    inactivityTimeoutMinutes: number;
    alwaysOnTop: boolean;
    windowSize: WindowSizePreset;
    windowOpacity: number;
    soundEffects: boolean;
    showDialogueBubbles: boolean;
    paused: boolean;
    reactions: {
        onStartup: boolean;
        onSave: boolean;
        onError: boolean;
        onTestResult: boolean;
        onIdleSleep: boolean;
    };
    customTestCommandPatterns: string[];
}

export interface StateSnapshot {
    state: CharacterState;
    expression: CharacterExpression;
    dialogue: string | null;
    dialogueDurationMs: number;
    soundCue?: 'wakeup' | 'happy' | 'celebrate' | 'worried' | 'sad' | 'sleep';
    timestamp: number;
}