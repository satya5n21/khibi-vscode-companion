import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { ChildProcess, spawn } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import {
    CompanionToExtensionMessage,
    ExtensionToCompanionMessage
} from '@khibi/shared';

export class CompanionBridge implements vscode.Disposable {
    private wss: WebSocketServer | null = null;
    private authenticatedSocket: WebSocket | null = null;
    private companionProcess: ChildProcess | null = null;
    private readonly sessionToken = crypto.randomBytes(32).toString('hex');
    private boundPort = 0;
    private isDisposing = false;
    private restartCount = 0;
    private restartTimer: ReturnType<typeof setTimeout> | null = null;

    private readonly onReadyEmitter = new vscode.EventEmitter<void>();
    public readonly onReady = this.onReadyEmitter.event;

    private readonly onUserInteractionEmitter = new vscode.EventEmitter<
        'PET_CHARACTER' | 'TOGGLE_MUTE' | 'HIDE_WINDOW'
    >();
    public readonly onUserInteraction = this.onUserInteractionEmitter.event;

    constructor(private readonly extensionRootPath: string) { }

    public async start(): Promise<void> {
        await this.startWebSocketServer();
        this.spawnCompanionApp();
    }

    public send(message: ExtensionToCompanionMessage): void {
        if (
            this.authenticatedSocket &&
            this.authenticatedSocket.readyState === WebSocket.OPEN
        ) {
            this.authenticatedSocket.send(JSON.stringify(message));
        }
    }

    public ensureCompanionRunning(): void {
        if (!this.companionProcess && !this.isDisposing) {
            this.spawnCompanionApp();
        }
    }

    private startWebSocketServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wss = new WebSocketServer({
                host: '127.0.0.1',
                port: 0 // OS-assigned free local port
            });

            this.wss.once('listening', () => {
                const addr = this.wss?.address();
                if (addr && typeof addr === 'object') {
                    this.boundPort = addr.port;
                    resolve();
                } else {
                    reject(new Error('Failed to bind local WebSocket port for Khibi'));
                }
            });

            this.wss.on('connection', (socket) => {
                let isAuthenticated = false;

                const authTimeout = setTimeout(() => {
                    if (!isAuthenticated) {
                        socket.terminate();
                    }
                }, 3000);

                socket.on('message', (raw) => {
                    try {
                        const msg = JSON.parse(
                            raw.toString()
                        ) as CompanionToExtensionMessage;

                        if (msg.type === 'AUTH') {
                            const tokenMatch =
                                msg.token.length === this.sessionToken.length &&
                                crypto.timingSafeEqual(
                                    Buffer.from(msg.token),
                                    Buffer.from(this.sessionToken)
                                );

                            if (tokenMatch) {
                                isAuthenticated = true;
                                clearTimeout(authTimeout);
                                this.authenticatedSocket = socket;
                            } else {
                                socket.terminate();
                            }
                            return;
                        }

                        if (!isAuthenticated) {
                            socket.terminate();
                            return;
                        }

                        if (msg.type === 'READY') {
                            this.onReadyEmitter.fire();
                        } else if (msg.type === 'USER_INTERACTION') {
                            this.onUserInteractionEmitter.fire(msg.action);
                        }
                    } catch {
                        // Ignore invalid JSON frames
                    }
                });

                socket.on('close', () => {
                    clearTimeout(authTimeout);
                    if (this.authenticatedSocket === socket) {
                        this.authenticatedSocket = null;
                    }
                });
            });
        });
    }

    private spawnCompanionApp(): void {
        if (this.isDisposing || this.companionProcess) {
            return;
        }

        // Resolve companion-app directory & electron executable
        const companionDir = path.resolve(
            this.extensionRootPath,
            '../companion-app'
        );
        let electronBin: string;
        try {
            electronBin = require(
                require.resolve('electron', { paths: [companionDir, this.extensionRootPath] })
            ) as string;
        } catch {
            // Fallback to global electron binary if not resolved via node_modules
            electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron';
        }

        const mainEntry = path.join(companionDir, 'dist/main/main.js');

        this.companionProcess = spawn(electronBin, [mainEntry], {
            cwd: companionDir,
            stdio: 'ignore',
            windowsHide: false,
            env: {
                ...process.env,
                KHIBI_WS_PORT: String(this.boundPort),
                KHIBI_WS_TOKEN: this.sessionToken,
                KHIBI_PARENT_PID: String(process.pid)
            }
        });

        this.companionProcess.on('exit', () => {
            this.companionProcess = null;
            if (!this.isDisposing && this.restartCount < 5) {
                this.restartCount += 1;
                this.restartTimer = setTimeout(() => {
                    this.spawnCompanionApp();
                }, 2500);
            }
        });
    }

    public dispose(): void {
        this.isDisposing = true;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
        }
        this.send({ type: 'SHUTDOWN' });
        this.authenticatedSocket?.close();
        this.wss?.close();
        if (this.companionProcess && !this.companionProcess.killed) {
            this.companionProcess.kill();
        }
        this.onReadyEmitter.dispose();
        this.onUserInteractionEmitter.dispose();
    }
}