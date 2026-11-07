import * as vscode from 'vscode';
import { CharacterController } from '../character/characterController';
import { SettingsManager } from '../config/settings';

const DEFAULT_TEST_CMD_REGEX =
    /\b(jest|vitest|mocha|pytest|cargo\s+test|go\s+test|dotnet\s+test|(npm|pnpm|yarn|bun)\s+(run\s+)?test)\b/i;

// Strip ANSI escape codes from terminal output streams
const ANSI_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export interface ParsedTestSummary {
    detected: boolean;
    passed: boolean;
}

/**
 * Pure parser for Jest, Vitest, and Mocha output chunks.
 */
export function parseTestFrameworkOutput(rawOutput: string): ParsedTestSummary {
    const clean = rawOutput.replace(ANSI_REGEX, '');

    // Jest & Vitest summary: e.g. "Tests: 1 failed, 4 passed, 5 total" or "Tests  2 passed (2)"
    const jestVitestFail = /Tests:?\s+\d+\s+failed/i.test(clean);
    if (jestVitestFail) {
        return { detected: true, passed: false };
    }

    const jestVitestPass =
        /Tests:?\s+\d+\s+passed/i.test(clean) && !/failed/i.test(clean);
    if (jestVitestPass) {
        return { detected: true, passed: true };
    }

    // Mocha summary: "3 passing (12ms)" and optional "1 failing"
    const mochaFailing = /\b\d+\s+failing\b/i.test(clean);
    if (mochaFailing) {
        return { detected: true, passed: false };
    }

    const mochaPassing = /\b\d+\s+passing\b/i.test(clean);
    if (mochaPassing) {
        return { detected: true, passed: true };
    }

    return { detected: false, passed: false };
}

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
        if (DEFAULT_TEST_CMD_REGEX.test(commandLine)) {
            return true;
        }
        const customPatterns =
            this.settingsManager.getSettings().customTestCommandPatterns;
        for (const pattern of customPatterns) {
            try {
                if (new RegExp(pattern, 'i').test(commandLine)) {
                    return true;
                }
            } catch {
                // Ignore invalid user regex
            }
        }
        return false;
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