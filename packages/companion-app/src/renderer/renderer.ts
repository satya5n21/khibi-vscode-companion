import type {
    CharacterExpression,
    KhibiSettings,
    ResolvedCharacter,
    StateSnapshot
} from '@khibi/shared';
import type { KhibiBridgeAPI } from '../preload/preload';

declare global {
    interface Window {
        khibiBridge: KhibiBridgeAPI;
    }
}

class SoundEngine {
    private ctx: AudioContext | null = null;
    private enabled = true;

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public playCue(cue?: StateSnapshot['soundCue']): void {
        if (!this.enabled || !cue) {
            return;
        }

        try {
            if (!this.ctx) {
                this.ctx = new AudioContext();
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            switch (cue) {
                case 'wakeup':
                    this.playNotes([523.25, 659.25, 783.99], 0.09);
                    break;
                case 'happy':
                    this.playNotes([659.25, 880], 0.08);
                    break;
                case 'celebrate':
                    this.playNotes([523.25, 659.25, 783.99, 1046.5], 0.08);
                    break;
                case 'worried':
                    this.playNotes([440, 392], 0.12);
                    break;
                case 'sad':
                    this.playNotes([392, 349.23, 329.63], 0.14);
                    break;
                case 'sleep':
                    this.playNotes([523.25, 392], 0.16);
                    break;
            }
        } catch {
            // AudioContext blocked or unavailable
        }
    }

    private playNotes(frequencies: number[], noteDurationSec: number): void {
        if (!this.ctx) {
            return;
        }
        const now = this.ctx.currentTime;
        frequencies.forEach((freq, idx) => {
            if (!this.ctx) {
                return;
            }
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * noteDurationSec);

            gain.gain.setValueAtTime(0.06, now + idx * noteDurationSec);
            gain.gain.exponentialRampToValueAtTime(
                0.001,
                now + (idx + 1) * noteDurationSec
            );

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now + idx * noteDurationSec);
            osc.stop(now + (idx + 1) * noteDurationSec);
        });
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

// ---------------------------------------------------------------------------
// Character packs
// ---------------------------------------------------------------------------

let character: ResolvedCharacter | null = null;
let currentExpression: CharacterExpression = 'normal';
let frameTimer: ReturnType<typeof setInterval> | null = null;
/** Bumped on every character change so a slow SVG fetch can't overwrite a newer pick. */
let mountToken = 0;

/**
 * Parses third-party SVG as an image document and drops anything executable, so a
 * downloaded pack can't run script inside the renderer.
 */
function sanitizeSvg(svgText: string): SVGSVGElement | null {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
        return null;
    }
    doc.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
    doc.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            const isLink = name === 'href' || name === 'xlink:href';
            if (name.startsWith('on') || (isLink && !value.startsWith('#'))) {
                el.removeAttribute(attr.name);
            }
        }
    });
    return document.importNode(root, true) as unknown as SVGSVGElement;
}

function stopFrameAnimation(): void {
    if (frameTimer) {
        clearInterval(frameTimer);
        frameTimer = null;
    }
}

async function mountCharacter(next: ResolvedCharacter): Promise<void> {
    const token = ++mountToken;
    stopFrameAnimation();
    character = next;
    stageEl.replaceChildren();
    stageEl.style.setProperty('--char-scale', String(next.scale));
    stageEl.title = `${next.name} – click to pat, drag to move.`;

    if (next.kind === 'svg' && next.svgUrl) {
        try {
            const response = await fetch(next.svgUrl);
            const svg = sanitizeSvg(await response.text());
            if (token !== mountToken || !svg) {
                return;
            }
            svg.classList.add('khibi-svg');
            stageEl.appendChild(svg);
        } catch (err) {
            console.error('[Khibi] Could not load SVG character', err);
        }
    } else if (next.expressions) {
        const wrap = document.createElement('div');
        wrap.className = 'pack-stage';
        const shadow = document.createElement('div');
        shadow.className = 'pack-shadow';
        wrap.appendChild(shadow);

        // De-duplicate: expressions that fell back to the same art share one element.
        const byKey = new Map<string, HTMLDivElement>();
        for (const [expr, spec] of Object.entries(next.expressions)) {
            const key = spec.frames.join('|');
            let layer = byKey.get(key);
            if (!layer) {
                layer = document.createElement('div');
                layer.className = 'pack-layer';
                layer.dataset.exprs = '';
                spec.frames.forEach((url, i) => {
                    const img = document.createElement('img');
                    img.className = 'pack-frame' + (i === 0 ? ' on' : '');
                    img.src = url;
                    img.draggable = false;
                    img.alt = '';
                    layer!.appendChild(img);
                });
                byKey.set(key, layer);
                wrap.appendChild(layer);
            }
            layer.dataset.exprs += ` ${expr} `;
        }
        stageEl.appendChild(wrap);
    }
    applyExpression(currentExpression);
}

/** Cross-fades to the layer for `expr`, starts its frame loop and swaps the body motion. */
function applyExpression(expr: CharacterExpression): void {
    currentExpression = expr;
    stopFrameAnimation();
    if (!character || character.kind !== 'images' || !character.expressions) {
        return;
    }
    const wrap = stageEl.querySelector('.pack-stage') as HTMLDivElement | null;
    const spec = character.expressions[expr];
    if (!wrap || !spec) {
        return;
    }

    wrap.className = `pack-stage motion-${spec.motion}`;
    let activeLayer: HTMLDivElement | null = null;
    wrap.querySelectorAll<HTMLDivElement>('.pack-layer').forEach((layer) => {
        const isActive = (layer.dataset.exprs ?? '').includes(` ${expr} `);
        layer.classList.toggle('active', isActive);
        if (isActive) {
            activeLayer = layer;
        }
    });

    const frames = activeLayer
        ? Array.from((activeLayer as HTMLDivElement).querySelectorAll<HTMLImageElement>('.pack-frame'))
        : [];
    if (frames.length > 1) {
        let index = 0;
        frameTimer = setInterval(() => {
            frames[index].classList.remove('on');
            index = (index + 1) % frames.length;
            frames[index].classList.add('on');
        }, 1000 / spec.fps);
    }
}

function renderStateSnapshot(snapshot: StateSnapshot): void {
    const kind = character?.kind ?? 'svg';
    shellEl.className = `companion-shell kind-${kind} state-${snapshot.state.toLowerCase()} expr-${snapshot.expression}`;
    applyExpression(snapshot.expression);

    statusLabelEl.textContent =
        snapshot.state === 'SLEEPING'
            ? 'Sleeping zzz'
            : snapshot.state === 'SLEEPY'
                ? 'Sleepy...'
                : character?.name ?? 'Khibi';
    statusDotEl.style.background =
        snapshot.state === 'SLEEPING'
            ? '#a78bfa'
            : snapshot.state === 'WORRIED' || snapshot.state === 'SAD'
                ? '#fb7185'
                : '#68d391';

    soundEngine.playCue(snapshot.soundCue);

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

window.khibiBridge.onCharacterUpdate((next) => {
    void mountCharacter(next);
});
window.khibiBridge.onStateUpdate(renderStateSnapshot);
window.khibiBridge.onSettingsUpdate(applySettings);
