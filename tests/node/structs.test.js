/**
 * Tests for OPL3 struct serialization/deserialization
 * 
 * These tests verify that Operator and Instrument structures
 * can be encoded and decoded correctly using the shared utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    SIZEOF_ADL_OPERATOR,
    SIZEOF_ADL_INSTRUMENT,
    OPERATOR_OFFSET,
    decodeOperator,
    encodeOperator,
    defaultOperator,
    decodeInstrument,
    encodeInstrument,
    defaultInstrument,
} from '../../src/utils/struct.js';

describe('Operator Encoding', () => {
    it('should encode and decode operator roundtrip', () => {
        const original = {
            am: true,
            vibrato: false,
            sustaining: true,
            ksr: false,
            freqMult: 5,
            keyScaleLevel: 2,
            totalLevel: 32,
            attack: 12,
            decay: 4,
            sustain: 8,
            release: 6,
            waveform: 3,
        };

        const encoded = encodeOperator(original);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(original);
    });

    it('should handle all flags enabled', () => {
        const allFlags = {
            am: true,
            vibrato: true,
            sustaining: true,
            ksr: true,
            freqMult: 15,
            keyScaleLevel: 3,
            totalLevel: 63,
            attack: 15,
            decay: 15,
            sustain: 15,
            release: 15,
            waveform: 7,
        };

        const encoded = encodeOperator(allFlags);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(allFlags);
    });

    it('should handle all flags disabled / minimum values', () => {
        const noFlags = {
            am: false,
            vibrato: false,
            sustaining: false,
            ksr: false,
            freqMult: 0,
            keyScaleLevel: 0,
            totalLevel: 0,
            attack: 0,
            decay: 0,
            sustain: 0,
            release: 0,
            waveform: 0,
        };

        const encoded = encodeOperator(noFlags);
        const decoded = decodeOperator(encoded);

        expect(decoded).toEqual(noFlags);
    });

    it('should produce correct byte values', () => {
        const op = {
            am: true,         // 0x80
            vibrato: true,    // 0x40
            sustaining: false,
            ksr: false,
            freqMult: 1,      // 0x01
            keyScaleLevel: 0,
            totalLevel: 20,   // 0x14
            attack: 15,       // 0xF0
            decay: 8,         // 0x08
            sustain: 2,       // 0x20
            release: 6,       // 0x06
            waveform: 1,      // 0x01
        };

        const bytes = encodeOperator(op);

        expect(bytes[0]).toBe(0xC1); // 0x80 | 0x40 | 0x01
        expect(bytes[1]).toBe(0x14); // totalLevel = 20
        expect(bytes[2]).toBe(0xF8); // attack=15, decay=8
        expect(bytes[3]).toBe(0x26); // sustain=2, release=6
        expect(bytes[4]).toBe(0x01); // waveform=1
    });
});

describe('Instrument Encoding', () => {
    it('should encode and decode instrument roundtrip', () => {
        const original = {
            version: 1,
            noteOffset1: -12,
            noteOffset2: 7,
            velocityOffset: -5,
            secondVoiceDetune: 3,
            percussionKey: 36,
            is4op: true,
            isPseudo4op: false,
            isBlank: false,
            rhythmMode: 2,
            feedback1: 5,
            connection1: 1,
            feedback2: 3,
            connection2: 0,
            operators: [
                defaultOperator(),
                defaultOperator(),
                defaultOperator(),
                defaultOperator(),
            ],
            delayOnMs: 100,
            delayOffMs: 50,
        };

        const encoded = encodeInstrument(original);
        expect(encoded.length).toBe(SIZEOF_ADL_INSTRUMENT);

        const decoded = decodeInstrument(encoded);

        expect(decoded.version).toBe(original.version);
        expect(decoded.noteOffset1).toBe(original.noteOffset1);
        expect(decoded.noteOffset2).toBe(original.noteOffset2);
        expect(decoded.velocityOffset).toBe(original.velocityOffset);
        expect(decoded.secondVoiceDetune).toBe(original.secondVoiceDetune);
        expect(decoded.percussionKey).toBe(original.percussionKey);
        expect(decoded.is4op).toBe(original.is4op);
        expect(decoded.isPseudo4op).toBe(original.isPseudo4op);
        expect(decoded.isBlank).toBe(original.isBlank);
        expect(decoded.rhythmMode).toBe(original.rhythmMode);
        expect(decoded.feedback1).toBe(original.feedback1);
        expect(decoded.connection1).toBe(original.connection1);
        expect(decoded.feedback2).toBe(original.feedback2);
        expect(decoded.connection2).toBe(original.connection2);
        expect(decoded.delayOnMs).toBe(original.delayOnMs);
        expect(decoded.delayOffMs).toBe(original.delayOffMs);
    });

    it('should handle all instrument flags', () => {
        const allFlags = {
            ...defaultInstrument(),
            is4op: true,
            isPseudo4op: true,
            isBlank: true,
            rhythmMode: 7,
        };

        const encoded = encodeInstrument(allFlags);
        const decoded = decodeInstrument(encoded);

        expect(decoded.is4op).toBe(true);
        expect(decoded.isPseudo4op).toBe(true);
        expect(decoded.isBlank).toBe(true);
        expect(decoded.rhythmMode).toBe(7);
    });

    it('should handle maximum feedback/connection values', () => {
        const maxValues = {
            ...defaultInstrument(),
            feedback1: 7,
            connection1: 1,
            feedback2: 7,
            connection2: 1,
        };

        const encoded = encodeInstrument(maxValues);
        const decoded = decodeInstrument(encoded);

        expect(decoded.feedback1).toBe(7);
        expect(decoded.connection1).toBe(1);
        expect(decoded.feedback2).toBe(7);
        expect(decoded.connection2).toBe(1);
    });

    it('should preserve operator data through roundtrip', () => {
        const customOp = {
            am: true,
            vibrato: true,
            sustaining: false,
            ksr: true,
            freqMult: 8,
            keyScaleLevel: 2,
            totalLevel: 25,
            attack: 10,
            decay: 5,
            sustain: 7,
            release: 9,
            waveform: 4,
        };

        const inst = {
            ...defaultInstrument(),
            operators: [customOp, customOp, defaultOperator(), defaultOperator()],
        };

        const encoded = encodeInstrument(inst);
        const decoded = decodeInstrument(encoded);

        expect(decoded.operators[0]).toEqual(customOp);
        expect(decoded.operators[1]).toEqual(customOp);
    });

    it('should create valid default instrument', () => {
        const inst = defaultInstrument();

        expect(inst.version).toBe(0);
        expect(inst.isBlank).toBe(true);
        expect(inst.operators).toHaveLength(4);

        // Should encode without error
        const encoded = encodeInstrument(inst);
        expect(encoded.length).toBe(SIZEOF_ADL_INSTRUMENT);
    });
});

describe('Struct Sizes', () => {
    it('should have correct operator size', () => {
        expect(SIZEOF_ADL_OPERATOR).toBe(5);
    });

    it('should have correct instrument size', () => {
        expect(SIZEOF_ADL_INSTRUMENT).toBe(40);
    });

    it('should have operators at correct offset', () => {
        // After: version(2) + flags(2) + percNote(1) + padding(1) + 
        //        noteOff1(1) + noteOff2(1) + velOff(1) + detune(1) +
        //        fb_conn1(1) + fb_conn2(1) + padding(2) = 14 bytes
        expect(OPERATOR_OFFSET).toBe(14);
    });

    it('should fit 4 operators between offset and delays', () => {
        // After operators: delays at offset 34 (2 bytes each = 4 bytes)
        // So operators take: 34 - 14 = 20 bytes = 4 * 5 ✓
        const operatorsTotalSize = 34 - OPERATOR_OFFSET;
        expect(operatorsTotalSize).toBe(4 * SIZEOF_ADL_OPERATOR);
    });
});
