import { KhibiSettings, StateSnapshot } from '@khibi/shared';
import { KhibiBridgeAPI } from '../preload/preload';
import { buildKhibiSvg } from './characterSvg';
import { SoundEngine } from './soundEngine';

declare global {
    interface Window {
        khibiBridge: KhibiBridgeAPI;
    }
}

const shellEl = document.getElementById('companion-shell') as HTMLDivElement;
const stageEl = document.getElementById('character-stage') as HTMLDivElement;
const bubbleEl = document.getElementById('speech-bubble') as HTMLDivElement;
const speechTextEl = document.getElementById('speech-text') as HTMLSpanElement;
const statusLabelEl = document.getElementById('status-label') as HTMLSpanElement;
const statusDotEl = document.getElementById('status-dot') as HTMLSpanElement;
const btnMute = document.getElementById('btn-mute') as HTMLButtonElement;
const btnHide = document.getElementById('btn-hide') as HTMLButtonElement;

const soundEngine = new SoundEngine();
let showBubbles = true;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;

// Mount the chibi vector artwork
stageEl.innerHTML = buildKhibiSvg();

function renderStateSnapshot(snapshot: StateSnapshot): void {
    // Update expression & state CSS classes
    shellEl.className = `companion-shell state-${snapshot.state.toLowerCase()} expr-${snapshot.expression}`;

    // Update status indicator
    statusLabelEl.textContent =
        snapshot.state === 'SLEEPING'
            ? 'Sleeping zzz'
            : snapshot.state === 'SLEEPY'
                ? 'Sleepy...'
                : 'Khibi';
    statusDotEl.style.background =
        snapshot.state === 'SLEEPING'
            ? '#a78bfa'
            : snapshot.state === 'WORRIED' || snapshot.state === 'SAD'
                ? '#fb7185'
                : '#68d391';

    // Play optional sound cue
    soundEngine.playCue(snapshot.soundCue);

    // Render speech bubble
    if (bubbleTimer) {
        clearTimeout(bubbleTimer);
        bubbleTimer = null;
    }

    if (showBubbles && snapshot.dialogue) {
        speechTextEl.textContent = snapshot.dialogue;
        bubbleEl.classList.remove('hidden');

        const duration = Math.max(1800, snapshot.dialogueDurationMs || 3500);
        bubbleTimer = setTimeout(() => {
            bubbleEl.classList.add('hidden');
        }, duration);
    } else if (!snapshot.dialogue) {
        bubbleEl.classList.add('hidden');
    }
}

function applySettings(settings: KhibiSettings): void {
    showBubbles = settings.showDialogueBubbles;
    soundEngine.setEnabled(settings.soundEffects);
    btnMute.textContent = settings.soundEffects ? '🔊' : '🔇';
    if (!showBubbles) {
        bubbleEl.classList.add('hidden');
    }
}

// Drag-to-move window support + click-to-pat detection
let isDragging = false;
let dragMoved = false;
let lastScreenX = 0;
let lastScreenY = 0;

stageEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) {
        return;
    }
    isDragging = true;
    dragMoved = false;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) {
        return;
    }
    const dx = e.screenX - lastScreenX;
    const dy = e.screenY - lastScreenY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        dragMoved = true;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        window.khibiBridge.moveWindowBy(dx, dy);
    }
});

window.addEventListener('mouseup', () => {
    if (isDragging && !dragMoved) {
        window.khibiBridge.sendUserAction('PET_CHARACTER');
    }
    isDragging = false;
});

btnMute.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextState = !soundEngine.isEnabled();
    soundEngine.setEnabled(nextState);
    btnMute.textContent = nextState ? '🔊' : '🔇';
    window.khibiBridge.sendUserAction('TOGGLE_MUTE');
});

btnHide.addEventListener('click', (e) => {
    e.stopPropagation();
    window.khibiBridge.sendUserAction('HIDE_WINDOW');
});

window.khibiBridge.onStateUpdate(renderStateSnapshot);
window.khibiBridge.onSettingsUpdate(applySettings);