import * as vscode from 'vscode';
import { SettingsManager } from './config/settings';
import { CompanionBridge } from './bridge/companionBridge';
import { CharacterController } from './character/characterController';
import { ActivityTracker } from './activity/activityTracker';
import { SaveHandler } from './events/saveHandler';
import { ErrorHandler } from './events/errorHandler';
import { TestHandler } from './events/testHandler';

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    const settingsManager = new SettingsManager();
    const bridge = new CompanionBridge(context.extensionPath);
    const character = new CharacterController(bridge, settingsManager);
    const activityTracker = new ActivityTracker(character, settingsManager);
    const saveHandler = new SaveHandler(character);
    const errorHandler = new ErrorHandler(character);
    const testHandler = new TestHandler(character, settingsManager);

    // Register user commands
    const commands = [
        vscode.commands.registerCommand('khibi.showCompanion', () => {
            character.showWindow();
        }),
        vscode.commands.registerCommand('khibi.hideCompanion', () => {
            character.hideWindow();
        }),
        vscode.commands.registerCommand('khibi.togglePause', async () => {
            const current = settingsManager.getSettings();
            const nextPaused = !current.paused;
            await settingsManager.updateSetting('paused', nextPaused);
            vscode.window.showInformationMessage(
                nextPaused
                    ? 'Khibi is now paused.'
                    : 'Khibi is active again! ❤️'
            );
        }),
        vscode.commands.registerCommand('khibi.petCompanion', () => {
            character.triggerReaction('MANUAL_PET');
        }),
        vscode.commands.registerCommand('khibi.reportTestPass', () => {
            character.triggerReaction('TESTS_PASSED');
        }),
        vscode.commands.registerCommand('khibi.reportTestFail', () => {
            character.triggerReaction('TESTS_FAILED');
        })
    ];

    context.subscriptions.push(
        settingsManager,
        bridge,
        character,
        activityTracker,
        saveHandler,
        errorHandler,
        testHandler,
        ...commands
    );

    if (settingsManager.getSettings().enabled) {
        await bridge.start();
    }
}

export function deactivate(): void {
    // Disposables registered in context.subscriptions clean up automatically
}