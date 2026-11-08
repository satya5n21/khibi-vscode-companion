import { contextBridge, ipcRenderer } from 'electron';
import type { KhibiSettings, ResolvedCharacter, StateSnapshot } from '@khibi/shared';

export interface KhibiBridgeAPI {
    onStateUpdate: (callback: (snapshot: StateSnapshot) => void) => void;
    onCharacterUpdate: (callback: (character: ResolvedCharacter) => void) => void;
    onSettingsUpdate: (callback: (settings: KhibiSettings) => void) => void;
    sendUserAction: (action: 'PET_CHARACTER' | 'TOGGLE_MUTE' | 'HIDE_WINDOW') => void;
    moveWindowBy: (dx: number, dy: number) => void;
}

const api: KhibiBridgeAPI = {
    onStateUpdate: (callback) => {
        ipcRenderer.on('khibi:state-update', (_event, snapshot: StateSnapshot) => {
            callback(snapshot);
        });
    },
    onCharacterUpdate: (callback) => {
        ipcRenderer.on('khibi:character-update', (_event, character: ResolvedCharacter) => {
            callback(character);
        });
    },
    onSettingsUpdate: (callback) => {
        ipcRenderer.on('khibi:settings-update', (_event, settings: KhibiSettings) => {
            callback(settings);
        });
    },
    sendUserAction: (action) => {
        ipcRenderer.send('khibi:user-action', action);
    },
    moveWindowBy: (dx, dy) => {
        ipcRenderer.send('khibi:move-window', { dx, dy });
    }
};

contextBridge.exposeInMainWorld('khibiBridge', api);