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

/**
 * Checks whether a command line matches built-in or user-configured test runner patterns.
 */
export function matchesTestCommand(
    commandLine: string,
    customPatterns: readonly string[] = []
): boolean {
    if (DEFAULT_TEST_CMD_REGEX.test(commandLine)) {
        return true;
    }
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