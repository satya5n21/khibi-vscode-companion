import * as vscode from 'vscode';
import { CharacterController } from '../character/characterController';
import { SettingsManager } from '../config/settings';

/**
 * Centralized ActivityTracker:
 * Tracks meaningful user activity across text documents, editor selections,
 * active editor switches, and terminal focus/shell executions.
 *
 * Transitions Khibi to SLEEPY at 80% of the inactivity timeout and SLEEPING at 100%.
 * Wakes Khibi immediately when meaningful coding activity resumes.
 */
export class ActivityTracker implements vscode.Disposable {
    private lastActivityTimestamp = Date.now();
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private idleStage: 'ACTIVE' | 'SLEEPY' | 'SLEEPING' = 'ACTIVE';
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly character: CharacterController,
        private readonly settingsManager: SettingsManager
    ) {
        this.registerActivityListeners();
        this.startInactivityMonitor();
    }

    public recordActivity(): void {
        this.lastActivityTimestamp = Date.now();

        if (this.idleStage !== 'ACTIVE' || this.character.isSleepingOrSleepy()) {
            this.idleStage = 'ACTIVE';
            this.character.triggerReaction('WAKE_UP');
        }
    }

    public getLastActivityTimestamp(): number {
        return this.lastActivityTimestamp;
    }

    private registerActivityListeners(): void {
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.contentChanges.length > 0 && e.document.uri.scheme === 'file') {
                    this.recordActivity();
                }
            }),
            vscode.workspace.onDidSaveTextDocument(() => {
                this.recordActivity();
            }),
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (e.textEditor.document.uri.scheme === 'file') {
                    this.recordActivity();
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.recordActivity();
            }),
            vscode.window.onDidChangeActiveTerminal(() => {
                this.recordActivity();
            }),
            vscode.window.onDidOpenTerminal(() => {
                this.recordActivity();
            })
        );

        // VS Code 1.93+ stable Terminal Shell Integration events
        if (typeof vscode.window.onDidStartTerminalShellExecution === 'function') {
            this.disposables.push(
                vscode.window.onDidStartTerminalShellExecution(() => {
                    this.recordActivity();
                }),
                vscode.window.onDidEndTerminalShellExecution(() => {
                    this.recordActivity();
                })
            );
        }
    }

    private startInactivityMonitor(): void {
        this.checkInterval = setInterval(() => {
            const settings = this.settingsManager.getSettings();
            if (!settings.enabled || settings.paused || !settings.reactions.onIdleSleep) {
                return;
            }

            const timeoutMs = settings.inactivityTimeoutMinutes * 60 * 1000;
            const sleepyThresholdMs = Math.floor(timeoutMs * 0.8);
            const elapsedMs = Date.now() - this.lastActivityTimestamp;

            if (elapsedMs >= timeoutMs && this.idleStage !== 'SLEEPING') {
                this.idleStage = 'SLEEPING';
                this.character.triggerReaction('FALL_ASLEEP');
            } else if (
                elapsedMs >= sleepyThresholdMs &&
                elapsedMs < timeoutMs &&
                this.idleStage === 'ACTIVE'
            ) {
                this.idleStage = 'SLEEPY';
                this.character.triggerReaction('IDLE_WARNING');
            }
        }, 5000);
    }

    public dispose(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}