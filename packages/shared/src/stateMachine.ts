import {
    CharacterExpression,
    CharacterState,
    ReactionTrigger,
    StateSnapshot
} from './types';
import { DialoguePicker } from './dialogues';

interface TransitionConfig {
    targetState: CharacterState;
    expression: CharacterExpression;
    priority: number;
    autoReturnToAwakeMs: number | null;
    dialogueDurationMs: number;
    soundCue?: StateSnapshot['soundCue'];
}

const TRIGGER_CONFIG: Record<ReactionTrigger, TransitionConfig> = {
    STARTUP: {
        targetState: 'WAKING_UP',
        expression: 'happy',
        priority: 100,
        autoReturnToAwakeMs: 4200,
        dialogueDurationMs: 4500,
        soundCue: 'wakeup'
    },
    WAKE_UP: {
        targetState: 'WAKING_UP',
        expression: 'surprised',
        priority: 95,
        autoReturnToAwakeMs: 3200,
        dialogueDurationMs: 3500,
        soundCue: 'wakeup'
    },
    TESTS_PASSED: {
        targetState: 'EXCITED',
        expression: 'celebrating',
        priority: 90,
        autoReturnToAwakeMs: 5000,
        dialogueDurationMs: 4800,
        soundCue: 'celebrate'
    },
    TESTS_FAILED: {
        targetState: 'SAD',
        expression: 'sad',
        priority: 85,
        autoReturnToAwakeMs: 4800,
        dialogueDurationMs: 4500,
        soundCue: 'sad'
    },
    ERROR_DETECTED: {
        targetState: 'WORRIED',
        expression: 'worried',
        priority: 75,
        autoReturnToAwakeMs: 4200,
        dialogueDurationMs: 4000,
        soundCue: 'worried'
    },
    FILE_SAVED: {
        targetState: 'HAPPY',
        expression: 'happy',
        priority: 60,
        autoReturnToAwakeMs: 3200,
        dialogueDurationMs: 3000,
        soundCue: 'happy'
    },
    TESTS_RUNNING: {
        targetState: 'THINKING',
        expression: 'thinking',
        priority: 55,
        autoReturnToAwakeMs: 6000,
        dialogueDurationMs: 3200
    },
    MANUAL_PET: {
        targetState: 'HAPPY',
        expression: 'excited',
        priority: 50,
        autoReturnToAwakeMs: 2800,
        dialogueDurationMs: 2800,
        soundCue: 'happy'
    },
    IDLE_WARNING: {
        targetState: 'SLEEPY',
        expression: 'sleepy',
        priority: 80,
        autoReturnToAwakeMs: null,
        dialogueDurationMs: 4000,
        soundCue: 'sleep'
    },
    FALL_ASLEEP: {
        targetState: 'SLEEPING',
        expression: 'sleeping',
        priority: 85,
        autoReturnToAwakeMs: null,
        dialogueDurationMs: 4200,
        soundCue: 'sleep'
    }
};

export type StateChangeListener = (snapshot: StateSnapshot) => void;

export class CharacterStateMachine {
    private currentState: CharacterState = 'INITIALIZING';
    private currentExpression: CharacterExpression = 'normal';
    private currentPriority = 0;
    private returnTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly dialoguePicker = new DialoguePicker();
    private readonly listeners = new Set<StateChangeListener>();

    public getState(): CharacterState {
        return this.currentState;
    }

    public getExpression(): CharacterExpression {
        return this.currentExpression;
    }

    public onStateChange(listener: StateChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public trigger(
        reaction: ReactionTrigger,
        options?: { suppressDialogue?: boolean; customDialogue?: string }
    ): StateSnapshot | null {
        const config = TRIGGER_CONFIG[reaction];

        // If sleeping, ignore non-wake triggers except explicit manual pet or wake
        if (
            (this.currentState === 'SLEEPING' || this.currentState === 'SLEEPY') &&
            reaction !== 'WAKE_UP' &&
            reaction !== 'FALL_ASLEEP' &&
            reaction !== 'STARTUP'
        ) {
            // Automatically wake up first on meaningful events like save/test
            this.clearReturnTimer();
            this.currentPriority = 0;
        }

        // Do not interrupt a higher-priority active transient animation with a lower-priority one
        if (
            this.returnTimer !== null &&
            config.priority < this.currentPriority &&
            reaction !== 'FALL_ASLEEP' &&
            reaction !== 'IDLE_WARNING'
        ) {
            return null;
        }

        this.clearReturnTimer();

        this.currentState = config.targetState;
        this.currentExpression = config.expression;
        this.currentPriority = config.priority;

        const dialogue = options?.suppressDialogue
            ? null
            : (options?.customDialogue ?? this.dialoguePicker.pick(reaction));

        const snapshot: StateSnapshot = {
            state: this.currentState,
            expression: this.currentExpression,
            dialogue,
            dialogueDurationMs: config.dialogueDurationMs,
            soundCue: config.soundCue,
            timestamp: Date.now()
        };

        this.emit(snapshot);

        if (config.autoReturnToAwakeMs !== null) {
            this.returnTimer = setTimeout(() => {
                this.returnTimer = null;
                this.transitionToAwake();
            }, config.autoReturnToAwakeMs);
        }

        return snapshot;
    }

    public transitionToAwake(): StateSnapshot {
        this.clearReturnTimer();
        this.currentState = 'AWAKE';
        this.currentExpression = 'normal';
        this.currentPriority = 0;

        const snapshot: StateSnapshot = {
            state: 'AWAKE',
            expression: 'normal',
            dialogue: null,
            dialogueDurationMs: 0,
            timestamp: Date.now()
        };
        this.emit(snapshot);
        return snapshot;
    }

    public dispose(): void {
        this.clearReturnTimer();
        this.listeners.clear();
    }

    private clearReturnTimer(): void {
        if (this.returnTimer !== null) {
            clearTimeout(this.returnTimer);
            this.returnTimer = null;
        }
    }

    private emit(snapshot: StateSnapshot): void {
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}