import { app, BrowserWindow, ipcMain, net, protocol, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import WebSocket from 'ws';
import {
    CHARACTER_URL_SCHEME,
    CharacterPackInfo,
    CompanionToExtensionMessage,
    DEFAULT_CHARACTER_ID,
    ExtensionToCompanionMessage,
    KhibiSettings,
    WindowSizePreset,
    discoverCharacters,
    isAllowedImagePath,
    isPathInside,
    resolveCharacter
} from '@khibi/shared';

// Must run before `app` is ready. Lets the renderer load pack art through khibi-char://<pack>/<file>
// without opening up file:// access or weakening the CSP.
protocol.registerSchemesAsPrivileged([
    {
        scheme: CHARACTER_URL_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true }
    }
]);

const BUILTIN_CHARACTERS_DIR = path.join(__dirname, '../../characters');

const SIZE_MAP: Record<WindowSizePreset, { width: number; height: number }> = {
    small: { width: 210, height: 270 },
    medium: { width: 250, height: 320 },
    large: { width: 300, height: 380 }
};

let mainWindow: BrowserWindow | null = null;
let wsClient: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let parentWatchdog: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;
let rendererLoaded = false;
let activePacks = new Map<string, CharacterPackInfo>();
let characterKey = '';

/**
 * The extension can talk to us before the page has finished loading, and
 * `webContents.send` before that point is silently dropped. Keep the latest payload per
 * channel and replay it once the renderer is ready.
 */
const pendingForRenderer = new Map<string, unknown>();

function sendToRenderer(channel: string, payload: unknown): void {
    if (!mainWindow) {
        return;
    }
    if (!rendererLoaded) {
        pendingForRenderer.set(channel, payload);
        return;
    }
    mainWindow.webContents.send(channel, payload);
}

const wsPort = Number(process.env.KHIBI_WS_PORT || 0);
const wsToken = process.env.KHIBI_WS_TOKEN || '';
const parentPid = Number(process.env.KHIBI_PARENT_PID || 0);

// Prevent accidental multiple character windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.showInactive();
        }
    });
}

function createCompanionWindow(): void {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const defaultDims = SIZE_MAP.medium;

    mainWindow = new BrowserWindow({
        width: defaultDims.width,
        height: defaultDims.height,
        x: Math.max(20, screenWidth - defaultDims.width - 36),
        y: Math.max(20, screenHeight - defaultDims.height - 36),
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        focusable: false, // Prevents stealing focus from VS Code while typing
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false
        }
    });

    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setAlwaysOnTop(true, 'floating');

    const htmlPath = path.join(__dirname, '../renderer/index.html');
    mainWindow.loadFile(htmlPath);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.showInactive();
    });

    mainWindow.webContents.on('did-finish-load', () => {
        rendererLoaded = true;
        // If the extension hasn't told us which character to use yet, show the default.
        if (!pendingForRenderer.has('khibi:character-update') && !characterKey) {
            loadCharacter(DEFAULT_CHARACTER_ID, []);
        }
        for (const [channel, payload] of pendingForRenderer) {
            mainWindow?.webContents.send(channel, payload);
        }
        pendingForRenderer.clear();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        rendererLoaded = false;
    });
}

/** Re-scans packs and pushes the requested one (or the default) to the renderer. */
function loadCharacter(requestedId: string, customRoots: string[]): void {
    const { packs, errors } = discoverCharacters([
        { dir: BUILTIN_CHARACTERS_DIR, source: 'builtin' },
        ...customRoots.map((dir) => ({ dir, source: 'user' as const }))
    ]);
    for (const problem of errors) {
        console.warn(`[Khibi] Skipped character pack – ${problem}`);
    }

    activePacks = new Map(packs.map((p) => [p.id, p]));
    const pack = activePacks.get(requestedId) ?? activePacks.get(DEFAULT_CHARACTER_ID);
    if (!pack) {
        console.error('[Khibi] No character packs found – not even the built-in one.');
        return;
    }
    characterKey = `${requestedId}|${customRoots.join('|')}`;
    sendToRenderer('khibi:character-update', resolveCharacter(pack));
}

function registerCharacterProtocol(): void {
    protocol.handle(CHARACTER_URL_SCHEME, (request) => {
        try {
            const url = new URL(request.url);
            const pack = activePacks.get(url.hostname);
            if (!pack) {
                return new Response('Unknown character', { status: 404 });
            }
            const rel = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
            const target = path.resolve(pack.dir, rel);
            if (
                !isAllowedImagePath(rel) ||
                !fs.existsSync(target) ||
                !isPathInside(pack.dir, target)
            ) {
                return new Response('Forbidden', { status: 403 });
            }
            return net.fetch(pathToFileURL(target).toString());
        } catch {
            return new Response('Bad request', { status: 400 });
        }
    });
}

function applyWindowSettings(settings: KhibiSettings): void {
    if (!mainWindow) {
        return;
    }

    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
    mainWindow.setOpacity(Math.min(1, Math.max(0.25, settings.windowOpacity)));

    const targetDims = SIZE_MAP[settings.windowSize] ?? SIZE_MAP.medium;
    const [currentWidth, currentHeight] = mainWindow.getSize();
    if (currentWidth !== targetDims.width || currentHeight !== targetDims.height) {
        mainWindow.setSize(targetDims.width, targetDims.height, true);
    }

    if (!settings.enabled) {
        mainWindow.hide();
    } else if (!mainWindow.isVisible()) {
        mainWindow.showInactive();
    }
}

function sendToExtension(message: CompanionToExtensionMessage): void {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify(message));
    }
}

function connectBridge(): void {
    if (isShuttingDown || !wsPort || !wsToken) {
        return;
    }

    const url = `ws://127.0.0.1:${wsPort}`;
    wsClient = new WebSocket(url);

    wsClient.on('open', () => {
        sendToExtension({ type: 'AUTH', token: wsToken });
        sendToExtension({ type: 'READY' });
    });

    wsClient.on('message', (rawData) => {
        try {
            const msg = JSON.parse(rawData.toString()) as ExtensionToCompanionMessage;
            handleExtensionMessage(msg);
        } catch {
            // Ignore malformed frame
        }
    });

    wsClient.on('close', () => {
        if (!isShuttingDown) {
            reconnectTimer = setTimeout(() => connectBridge(), 1500);
        }
    });

    wsClient.on('error', () => {
        wsClient?.close();
    });
}

function handleExtensionMessage(msg: ExtensionToCompanionMessage): void {
    if (!mainWindow) {
        return;
    }

    switch (msg.type) {
        case 'STATE_UPDATE':
            sendToRenderer('khibi:state-update', msg.payload);
            break;
        case 'SETTINGS_UPDATE': {
            applyWindowSettings(msg.payload);
            const roots = msg.payload.customCharacterRoots ?? [];
            const wanted = msg.payload.character || DEFAULT_CHARACTER_ID;
            if (`${wanted}|${roots.join('|')}` !== characterKey) {
                loadCharacter(wanted, roots);
            }
            sendToRenderer('khibi:settings-update', msg.payload);
            break;
        }
        case 'WINDOW_VISIBILITY':
            if (msg.payload.visible) {
                mainWindow.showInactive();
            } else {
                mainWindow.hide();
            }
            break;
        case 'SHUTDOWN':
            isShuttingDown = true;
            app.quit();
            break;
    }
}

function startParentProcessWatchdog(): void {
    if (!parentPid || Number.isNaN(parentPid)) {
        return;
    }
    parentWatchdog = setInterval(() => {
        try {
            process.kill(parentPid, 0);
        } catch {
            // Parent VS Code extension host process exited
            isShuttingDown = true;
            app.quit();
        }
    }, 4000);
}

ipcMain.on(
    'khibi:user-action',
    (_event, action: 'PET_CHARACTER' | 'TOGGLE_MUTE' | 'HIDE_WINDOW') => {
        if (action === 'HIDE_WINDOW') {
            mainWindow?.hide();
        }
        sendToExtension({
            type: 'USER_INTERACTION',
            action
        });
    }
);

ipcMain.on('khibi:move-window', (_event, delta: { dx: number; dy: number }) => {
    if (!mainWindow) {
        return;
    }
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(Math.round(x + delta.dx), Math.round(y + delta.dy));
});

app.whenReady().then(() => {
    registerCharacterProtocol();
    createCompanionWindow();
    connectBridge();
    startParentProcessWatchdog();
});

app.on('before-quit', () => {
    isShuttingDown = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }
    if (parentWatchdog) {
        clearInterval(parentWatchdog);
    }
    wsClient?.close();
});