import * as vscode from 'vscode';
import { CharacterController } from '../character/characterController';
import { SettingsManager } from '../config/settings';
import { matchesTestCommand, parseTestFrameworkOutput } from './testParser';

export { parseTestFrameworkOutput, matchesTestCommand } from './testParser';

export class TestHandler implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly character: CharacterController,
        private readonly settingsManager: SettingsManager
    ) {
        this.registerShellExecutionListeners();
        this.registerTaskListeners();
    }

    public isTestCommand(commandLine: string): boolean {
        const customPatterns =
            this.settingsManager.getSettings().customTestCommandPatterns;
        return matchesTestCommand(commandLine, customPatterns);
    }

    private registerShellExecutionListeners(): void {
        if (typeof vscode.window.onDidStartTerminalShellExecution !== 'function') {
            return;
        }

        const activeTestStreams = new Map<
            vscode.TerminalShellExecution,
            { buffer: string }
        >();

        this.disposables.push(
            vscode.window.onDidStartTerminalShellExecution(async (event) => {
                const cmd = event.execution.commandLine.value;
                if (!this.isTestCommand(cmd)) {
                    return;
                }

                this.character.triggerReaction('TESTS_RUNNING');
                const state = { buffer: '' };
                activeTestStreams.set(event.execution, state);

                try {
                    const stream = event.execution.read();
                    for await (const chunk of stream) {
                        state.buffer = (state.buffer + chunk).slice(-8000);
                    }
                } catch {
                    // Stream closed
                }
            }),
            vscode.window.onDidEndTerminalShellExecution((event) => {
                const cmd = event.execution.commandLine.value;
                const tracked = activeTestStreams.get(event.execution);
                activeTestStreams.delete(event.execution);

                if (!tracked && !this.isTestCommand(cmd)) {
                    return;
                }

                if (tracked && tracked.buffer.length > 0) {
                    const parsed = parseTestFrameworkOutput(tracked.buffer);
                    if (parsed.detected) {
                        this.character.triggerReaction(
                            parsed.passed ? 'TESTS_PASSED' : 'TESTS_FAILED'
                        );
                        return;
                    }
                }

                if (typeof event.exitCode === 'number') {
                    this.character.triggerReaction(
                        event.exitCode === 0 ? 'TESTS_PASSED' : 'TESTS_FAILED'
                    );
                }
            })
        );
    }

    private registerTaskListeners(): void {
        this.disposables.push(
            vscode.tasks.onDidEndTaskProcess((event) => {
                const task = event.execution.task;
                const isTestTask =
                    task.group === vscode.TaskGroup.Test ||
                    this.isTestCommand(task.name);

                if (!isTestTask || typeof event.exitCode !== 'number') {
                    return;
                }

                this.character.triggerReaction(
                    event.exitCode === 0 ? 'TESTS_PASSED' : 'TESTS_FAILED'
                );
            })
        );
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}