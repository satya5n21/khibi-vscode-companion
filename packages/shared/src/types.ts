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

export type WindowSizePreset = 'small' | 'medium' | 'large';

export interface KhibiSettings {
    enabled: boolean;
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