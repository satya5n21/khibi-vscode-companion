import * as vscode from 'vscode';
import { KhibiSettings, WindowSizePreset } from '@khibi/shared';

export class SettingsManager implements vscode.Disposable {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<KhibiSettings>();
    public readonly onDidChange = this.onDidChangeEmitter.event;
    private readonly configListener: vscode.Disposable;

    constructor() {
        this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('khibi')) {
                this.onDidChangeEmitter.fire(this.getSettings());
            }
        });
    }

    public getSettings(): KhibiSettings {
        const cfg = vscode.workspace.getConfiguration('khibi');
        return {
            enabled: cfg.get<boolean>('enabled', true),
            inactivityTimeoutMinutes: Math.max(
                1,
                cfg.get<number>('inactivityTimeoutMinutes', 5)
            ),
            alwaysOnTop: cfg.get<boolean>('alwaysOnTop', true),
            windowSize: cfg.get<WindowSizePreset>('windowSize', 'medium'),
            windowOpacity: cfg.get<number>('windowOpacity', 1.0),
            soundEffects: cfg.get<boolean>('soundEffects', true),
            showDialogueBubbles: cfg.get<boolean>('showDialogueBubbles', true),
            paused: cfg.get<boolean>('paused', false),
            reactions: {
                onStartup: cfg.get<boolean>('reactions.onStartup', true),
                onSave: cfg.get<boolean>('reactions.onSave', true),
                onError: cfg.get<boolean>('reactions.onError', true),
                onTestResult: cfg.get<boolean>('reactions.onTestResult', true),
                onIdleSleep: cfg.get<boolean>('reactions.onIdleSleep', true)
            },
            customTestCommandPatterns: cfg.get<string[]>(
                'customTestCommandPatterns',
                []
            )
        };
    }

    public async updateSetting<K extends keyof KhibiSettings>(
        key: K,
        value: KhibiSettings[K]
    ): Promise<void> {
        const cfg = vscode.workspace.getConfiguration('khibi');
        await cfg.update(key, value, vscode.ConfigurationTarget.Global);
    }

    public dispose(): void {
        this.configListener.dispose();
        this.onDidChangeEmitter.dispose();
    }
}