import { KhibiSettings, StateSnapshot } from './types';

export type ExtensionToCompanionMessage =
    | {
        type: 'STATE_UPDATE';
        payload: StateSnapshot;
    }
    | {
        type: 'SETTINGS_UPDATE';
        payload: KhibiSettings;
    }
    | {
        type: 'WINDOW_VISIBILITY';
        payload: { visible: boolean };
    }
    | {
        type: 'SHUTDOWN';
    };

export type CompanionToExtensionMessage =
    | {
        type: 'AUTH';
        token: string;
    }
    | {
        type: 'READY';
    }
    | {
        type: 'USER_INTERACTION';
        action: 'PET_CHARACTER' | 'TOGGLE_MUTE' | 'HIDE_WINDOW';
    }
    | {
        type: 'HEARTBEAT';
        timestamp: number;
    };