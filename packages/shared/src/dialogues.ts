import { ReactionTrigger } from './types';

export const DIALOGUE_POOL: Record<ReactionTrigger, readonly string[]> = {
    STARTUP: [
        "Good morning! Let's build something today! ❤️",
        "You're here! I was waiting for you.",
        "Yay! Coding time!",
        "Let's make something awesome today!",
        "Khibi reporting for coding duty! ✨"
    ],
    FILE_SAVED: [
        "Yatta! Saved!",
        "Look at us being productive!",
        "Another file completed!",
        "You're doing great!",
        "Safe and sound on disk! 💾",
        "Progress locked in! ✨"
    ],
    ERROR_DETECTED: [
        "Oops! Something broke!",
        "Don't worry! We can fix it!",
        "Wait... that doesn't look right.",
        "Even the best developers make mistakes!",
        "Uh oh, a tiny bug appeared!",
        "Deep breath! Let's check that line together."
    ],
    TESTS_RUNNING: [
        "Hmm... running the tests! 🤞",
        "Let's see what the test runner says...",
        "Fingers crossed! Checking everything..."
    ],
    TESTS_PASSED: [
        "ALL TESTS PASSED!! You're amazing!",
        "Green across the board!! 🎉",
        "We crushed those tests! High five! 🙌",
        "Zero failures! You're a wizard! ✨"
    ],
    TESTS_FAILED: [
        "Oh no! The tests betrayed us!",
        "We're not giving up!",
        "One bug at a time!",
        "Aw, a failing test... we've got this though!",
        "So close! Let's inspect the assertion."
    ],
    IDLE_WARNING: [
        "Zzz... I'm getting sleepy...",
        "Are you taking a coffee break? ☕",
        "My eyelids are getting heavy..."
    ],
    FALL_ASLEEP: [
        "Wake me up when we code again...",
        "Good night... zzz...",
        "Nap time... dream of clean code... zzz..."
    ],
    WAKE_UP: [
        "Oh! You're back!",
        "Let's continue!",
        "Did I miss anything?",
        "Ready when you are!",
        "I'm awake! I'm awake! ✨"
    ],
    MANUAL_PET: [
        "Hehe, that tickles! ❤️",
        "Thanks for the headpat!",
        "You're the best coding partner ever! ✨",
        "Ehehe~ back to shipping code!"
    ]
};

export class DialoguePicker {
    private lastPickedByTrigger = new Map<ReactionTrigger, string>();

    public pick(trigger: ReactionTrigger): string {
        const options = DIALOGUE_POOL[trigger];
        if (!options || options.length === 0) {
            return '';
        }
        if (options.length === 1) {
            return options[0];
        }

        const lastPicked = this.lastPickedByTrigger.get(trigger);
        const candidates = options.filter((line) => line !== lastPicked);
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        this.lastPickedByTrigger.set(trigger, selected);
        return selected;
    }
}