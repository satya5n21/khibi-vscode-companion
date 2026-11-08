import * as vscode from 'vscode';
import {
    CharacterStateMachine,
    ReactionTrigger,
    StateSnapshot
} from '@khibi/shared';
import { CompanionBridge } from '../bridge/companionBridge';
import { SettingsManager } from '../config/settings';

export class CharacterController implements vscode.Disposable {
    private readonly stateMachine = new CharacterStateMachine();
    private hasShownStartupGreeting = false;
    private lastWakeDialogueTimestamp = 0;
    private lastSnapshot: StateSnapshot | null = null;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly bridge: CompanionBridge,
        private readonly settingsManager: SettingsManager
    ) {
        const unsubState = this.stateMachine.onStateChange((snapshot) => {
            this.lastSnapshot = snapshot;
            this.bridge.send({
                type: 'STATE_UPDATE',
                payload: snapshot
            });
        });

        this.disposables.push({ dispose: unsubState });

        this.disposables.push(
            this.bridge.onReady(() => {
                const settings = this.settingsManager.getSettings();
                this.bridge.send({ type: 'SETTINGS_UPDATE', payload: settings });

                if (!this.hasShownStartupGreeting) {
                    this.hasShownStartupGreeting = true;
                    if (settings.reactions.onStartup && !settings.paused) {
                        this.stateMachine.trigger('STARTUP');
                    } else {
                        this.stateMachine.transitionToAwake();
                    }
                } else if (this.lastSnapshot) {
                    this.bridge.send({
                        type: 'STATE_UPDATE',
                        payload: this.lastSnapshot
                    });
                }
            })
        );

        this.disposables.push(
            this.bridge.onUserInteraction(async (action) => {
                if (action === 'PET_CHARACTER') {
                    this.triggerReaction('MANUAL_PET', undefined, true);
                } else if (action === 'TOGGLE_MUTE') {
                    const current = this.settingsManager.getSettings();
                    await this.settingsManager.updateSetting(
                        'soundEffects',
                        !current.soundEffects
                    );
                }
            })
        );

        this.disposables.push(
            this.settingsManager.onDidChange((newSettings) => {
                this.bridge.send({ type: 'SETTINGS_UPDATE', payload: newSettings });
            })
        );
    }

    /**
     * @param manual true when the user asked for this directly (headpat, "trigger test pass"
     *               commands, clicking the character). Manual requests ignore `khibi.paused`
     *               and the per-reaction toggles – those only gate *automatic* reactions.
     */
    public triggerReaction(
        reaction: ReactionTrigger,
        customDialogue?: string,
        manual = false
    ): void {
        const settings = this.settingsManager.getSettings();
        if (!settings.enabled || (settings.paused && !manual)) {
            return;
        }

        // Check individual reaction toggles
        if (!manual) {
            if (reaction === 'FILE_SAVED' && !settings.reactions.onSave) {
                return;
            }
            if (reaction === 'ERROR_DETECTED' && !settings.reactions.onError) {
                return;
            }
            if (
                (reaction === 'TESTS_PASSED' ||
                    reaction === 'TESTS_FAILED' ||
                    reaction === 'TESTS_RUNNING') &&
                !settings.reactions.onTestResult
            ) {
                return;
            }
            if (
                (reaction === 'IDLE_WARNING' || reaction === 'FALL_ASLEEP') &&
                !settings.reactions.onIdleSleep
            ) {
                return;
            }
        }

        // Throttle wake-up greeting dialogues so they feel natural and never spam
        if (reaction === 'WAKE_UP') {
            const now = Date.now();
            const suppressWakeBubble = now - this.lastWakeDialogueTimestamp < 60_000;
            if (!suppressWakeBubble) {
                this.lastWakeDialogueTimestamp = now;
            }
            this.stateMachine.trigger('WAKE_UP', {
                suppressDialogue: suppressWakeBubble
            });
            return;
        }

        this.stateMachine.trigger(reaction, { customDialogue });
    }

    public isSleepingOrSleepy(): boolean {
        const current = this.stateMachine.getState();
        return current === 'SLEEPING' || current === 'SLEEPY';
    }

    public showWindow(): void {
        this.bridge.ensureCompanionRunning();
        this.bridge.send({
            type: 'WINDOW_VISIBILITY',
            payload: { visible: true }
        });
    }

    public hideWindow(): void {
        this.bridge.send({
            type: 'WINDOW_VISIBILITY',
            payload: { visible: false }
        });
    }

    public dispose(): void {
        this.stateMachine.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}