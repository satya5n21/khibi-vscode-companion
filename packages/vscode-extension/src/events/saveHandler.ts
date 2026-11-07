import * as vscode from 'vscode';
import { CharacterController } from '../character/characterController';

export class SaveHandler implements vscode.Disposable {
    private lastSaveReactionTime = 0;
    private readonly saveThrottleMs = 2500;
    private readonly disposable: vscode.Disposable;

    constructor(private readonly character: CharacterController) {
        this.disposable = vscode.workspace.onDidSaveTextDocument((doc) => {
            if (doc.uri.scheme !== 'file') {
                return;
            }
            const now = Date.now();
            if (now - this.lastSaveReactionTime < this.saveThrottleMs) {
                return;
            }
            this.lastSaveReactionTime = now;
            this.character.triggerReaction('FILE_SAVED');
        });
    }

    public dispose(): void {
        this.disposable.dispose();
    }
}