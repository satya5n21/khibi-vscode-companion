import * as vscode from 'vscode';
import { CharacterController } from '../character/characterController';

/**
 * Watches `languages.onDidChangeDiagnostics` with:
 * - Strict filtering for `DiagnosticSeverity.Error` (ignores Warnings/Hints/Info)
 * - Fingerprinting of seen diagnostics per URI so existing errors don't re-trigger
 * - 1.5s debounce so mid-keystroke syntax errors don't trigger on every character typed
 * - 10s cooldown between error reactions
 */
export class ErrorHandler implements vscode.Disposable {
    private readonly knownErrorsByUri = new Map<string, Set<string>>();
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private lastErrorReactionTime = 0;
    private readonly reactionCooldownMs = 10_000;
    private readonly debounceMs = 1500;
    private readonly disposable: vscode.Disposable;

    constructor(private readonly character: CharacterController) {
        // Seed initial errors so pre-existing workspace errors on startup do not trigger
        this.seedInitialDiagnostics();

        this.disposable = vscode.languages.onDidChangeDiagnostics((event) => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            const changedUris = [...event.uris];
            this.debounceTimer = setTimeout(() => {
                this.evaluateChangedUris(changedUris);
            }, this.debounceMs);
        });
    }

    private seedInitialDiagnostics(): void {
        for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
            if (uri.scheme !== 'file') {
                continue;
            }
            const errorFingerprints = this.extractErrorFingerprints(diagnostics);
            this.knownErrorsByUri.set(uri.toString(), errorFingerprints);
        }
    }

    private evaluateChangedUris(uris: readonly vscode.Uri[]): void {
        let foundBrandNewError = false;

        for (const uri of uris) {
            if (uri.scheme !== 'file') {
                continue;
            }
            const key = uri.toString();
            const diagnostics = vscode.languages.getDiagnostics(uri);
            const currentFingerprints = this.extractErrorFingerprints(diagnostics);
            const previousFingerprints = this.knownErrorsByUri.get(key) ?? new Set<string>();

            for (const fp of currentFingerprints) {
                if (!previousFingerprints.has(fp)) {
                    foundBrandNewError = true;
                    break;
                }
            }

            this.knownErrorsByUri.set(key, currentFingerprints);
        }

        if (foundBrandNewError) {
            const now = Date.now();
            if (now - this.lastErrorReactionTime >= this.reactionCooldownMs) {
                this.lastErrorReactionTime = now;
                this.character.triggerReaction('ERROR_DETECTED');
            }
        }
    }

    private extractErrorFingerprints(
        diagnostics: readonly vscode.Diagnostic[]
    ): Set<string> {
        const set = new Set<string>();
        for (const diag of diagnostics) {
            if (diag.severity === vscode.DiagnosticSeverity.Error) {
                const codeStr =
                    typeof diag.code === 'object' ? String(diag.code.value) : String(diag.code ?? '');
                set.add(`${diag.source ?? ''}:${codeStr}:${diag.message}`);
            }
        }
        return set;
    }

    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.disposable.dispose();
    }
}