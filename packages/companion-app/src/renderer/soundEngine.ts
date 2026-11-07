import { StateSnapshot } from '@khibi/shared';

/**
 * Lightweight Web Audio API cute synth chime generator so Khibi requires zero external audio files.
 */
export class SoundEngine {
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