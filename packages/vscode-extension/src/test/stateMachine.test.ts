import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CharacterStateMachine,
    DialoguePicker,
    StateSnapshot
} from '@khibi/shared';
import { parseTestFrameworkOutput } from '../events/testHandler';

describe('CharacterStateMachine & Dialogue System', () => {
    it('transitions from INITIALIZING -> WAKING_UP on STARTUP and emits greeting', () => {
        const sm = new CharacterStateMachine();
        assert.equal(sm.getState(), 'INITIALIZING');

        const snapshot = sm.trigger('STARTUP');
        assert.ok(snapshot);
        assert.equal(sm.getState(), 'WAKING_UP');
        assert.equal(snapshot.expression, 'happy');
        assert.ok(snapshot.dialogue && snapshot.dialogue.length > 0);
        sm.dispose();
    });

    it('prioritizes high-priority reactions over lower-priority active reactions', () => {
        const sm = new CharacterStateMachine();

        // Trigger FILE_SAVED (priority 60)
        const saveSnap = sm.trigger('FILE_SAVED');
        assert.ok(saveSnap);
        assert.equal(sm.getState(), 'HAPPY');

        // Lower priority MANUAL_PET (priority 50) should not preempt active FILE_SAVED
        const petSnap = sm.trigger('MANUAL_PET');
        assert.equal(petSnap, null);
        assert.equal(sm.getState(), 'HAPPY');

        // Higher priority ERROR_DETECTED (priority 75) SHOULD preempt FILE_SAVED
        const errSnap = sm.trigger('ERROR_DETECTED');
        assert.ok(errSnap);
        assert.equal(sm.getState(), 'WORRIED');
        assert.equal(sm.getExpression(), 'worried');

        sm.dispose();
    });

    it('handles inactivity SLEEPY -> SLEEPING -> WAKE_UP lifecycle', () => {
        const sm = new CharacterStateMachine();
        const events: StateSnapshot[] = [];
        sm.onStateChange((s) => events.push(s));

        sm.trigger('IDLE_WARNING');
        assert.equal(sm.getState(), 'SLEEPY');

        sm.trigger('FALL_ASLEEP');
        assert.equal(sm.getState(), 'SLEEPING');

        sm.trigger('WAKE_UP');
        assert.equal(sm.getState(), 'WAKING_UP');
        assert.equal(events.length, 3);

        sm.dispose();
    });

    it('never repeats the exact same dialogue twice in a row', () => {
        const picker = new DialoguePicker();
        let previous = '';
        for (let i = 0; i < 25; i++) {
            const current = picker.pick('FILE_SAVED');
            assert.notEqual(current, previous);
            previous = current;
        }
    });
});

describe('Test Framework Output Parser (Jest / Vitest / Mocha)', () => {
    it('detects passing Jest / Vitest output', () => {
        const res = parseTestFrameworkOutput(
            'Test Suites: 3 passed, 3 total\nTests:       14 passed, 14 total'
        );
        assert.deepEqual(res, { detected: true, passed: true });
    });

    it('detects failing Jest / Vitest output', () => {
        const res = parseTestFrameworkOutput(
            'Tests: 2 failed, 8 passed, 10 total'
        );
        assert.deepEqual(res, { detected: true, passed: false });
    });

    it('detects passing and failing Mocha output', () => {
        const passRes = parseTestFrameworkOutput('  12 passing (85ms)');
        assert.deepEqual(passRes, { detected: true, passed: true });

        const failRes = parseTestFrameworkOutput('  11 passing (85ms)\n  1 failing');
        assert.deepEqual(failRes, { detected: true, passed: false });
    });
});