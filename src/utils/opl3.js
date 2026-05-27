/**
 * OPL3 register helpers for raw chip access.
 *
 * Pure-JS utilities for working with the OPL3 register layout. No WASM
 * dependency. Use alongside AdlMidiCore.rawOPL3() or AdlMidi.rawOPL3()
 * to program the chip directly.
 *
 * @module opl3
 */

/** Total per-chip channels including rhythm-mode percussion */
export const CHANNELS_PER_CHIP = 23;

/** Standard 2-op melodic channels per chip */
export const CHANNELS_STANDARD = 18;

/** Rhythm-mode percussion channels (indices 18-22) */
export const CHANNELS_RHYTHM = 5;

/** OPL3 internal sample rate (Hz), used for fnum calculation. 14.31818 MHz / 288. */
export const OPL3_SAMPLE_RATE = 49716;

/**
 * Operator register offsets per channel.
 *
 * Maps per-chip channel index (0-17) to [modulator, carrier] register
 * offsets. These are the low byte of the register address; for channels
 * 9-17, add 0x100 (use {@link channelBank}).
 *
 * Derived from Nuked OPL3's `ad_slot` and `ch_slot` tables.
 *
 * @type {ReadonlyArray<readonly [number, number]>}
 */
export const CHANNEL_OPERATORS = /** @type {ReadonlyArray<readonly [number, number]>} */ (Object.freeze([
    Object.freeze(/** @type {const} */ ([0x00, 0x03])), Object.freeze(/** @type {const} */ ([0x01, 0x04])), Object.freeze(/** @type {const} */ ([0x02, 0x05])),
    Object.freeze(/** @type {const} */ ([0x08, 0x0B])), Object.freeze(/** @type {const} */ ([0x09, 0x0C])), Object.freeze(/** @type {const} */ ([0x0A, 0x0D])),
    Object.freeze(/** @type {const} */ ([0x10, 0x13])), Object.freeze(/** @type {const} */ ([0x11, 0x14])), Object.freeze(/** @type {const} */ ([0x12, 0x15])),
    Object.freeze(/** @type {const} */ ([0x00, 0x03])), Object.freeze(/** @type {const} */ ([0x01, 0x04])), Object.freeze(/** @type {const} */ ([0x02, 0x05])),
    Object.freeze(/** @type {const} */ ([0x08, 0x0B])), Object.freeze(/** @type {const} */ ([0x09, 0x0C])), Object.freeze(/** @type {const} */ ([0x0A, 0x0D])),
    Object.freeze(/** @type {const} */ ([0x10, 0x13])), Object.freeze(/** @type {const} */ ([0x11, 0x14])), Object.freeze(/** @type {const} */ ([0x12, 0x15])),
]));

/**
 * Get the register bank bit for a channel.
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @returns {number} 0x000 for channels 0-8, 0x100 for channels 9-17
 */
export function channelBank(channel) {
    return channel >= 9 ? 0x100 : 0x000;
}

/**
 * Get the frequency-number low register address (0xA0 series).
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @returns {number} Register address
 */
export function fnumLoReg(channel) {
    return 0xA0 + (channel % 9) + channelBank(channel);
}

/**
 * Get the key-on / block / fnum-high register address (0xB0 series).
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @returns {number} Register address
 */
export function keyOnBlockReg(channel) {
    return 0xB0 + (channel % 9) + channelBank(channel);
}

/**
 * Get the feedback / connection register address (0xC0 series).
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @returns {number} Register address
 */
export function feedbackConnReg(channel) {
    return 0xC0 + (channel % 9) + channelBank(channel);
}

/**
 * Get the register address for an operator parameter.
 *
 * @param {number} baseReg - Register group base: 0x20 (AM/VIB/EG/KSR/MULT),
 *   0x40 (KSL/TL), 0x60 (AR/DR), 0x80 (SL/RR), or 0xE0 (waveform)
 * @param {number} channel - Per-chip channel (0-17)
 * @param {number} operatorSlot - 0 for modulator, 1 for carrier
 * @returns {number} Register address (0x000-0x1FF)
 */
export function operatorReg(baseReg, channel, operatorSlot) {
    return baseReg + CHANNEL_OPERATORS[channel][operatorSlot] + channelBank(channel);
}

/**
 * Convert a MIDI note number to OPL3 fnum and block values.
 *
 * Uses the standard OPL3 frequency formula:
 *   freq = fnum * OPL3_SAMPLE_RATE / 2^(20 - block)
 *
 * Picks the lowest block where fnum fits in 10 bits (maximum resolution).
 * Notes above ~6.2 kHz (above MIDI 110 or so) will saturate.
 *
 * @param {number} note - MIDI note number (0-127)
 * @returns {{fnum: number, block: number}}
 */
export function noteToFnumBlock(note) {
    const freq = 440.0 * Math.pow(2.0, (note - 69) / 12.0);
    for (let block = 0; block <= 7; block++) {
        const fnum = Math.round(freq * Math.pow(2, 20 - block) / OPL3_SAMPLE_RATE);
        if (fnum <= 1023) {
            return { fnum, block };
        }
    }
    return { fnum: 1023, block: 7 };
}

/**
 * Encode fnum and block into the two register byte values.
 *
 * @param {number} fnum - Frequency number (0-1023)
 * @param {number} block - Block / octave (0-7)
 * @returns {{fnumLo: number, fnumHiBlock: number}} Values for A0h and B0h
 *   registers. The B0h value does NOT include the key-on bit.
 */
export function encodeFnumBlock(fnum, block) {
    return {
        fnumLo: fnum & 0xFF,
        fnumHiBlock: ((block & 0x07) << 2) | ((fnum >> 8) & 0x03),
    };
}

/**
 * Encode a key-on register write for a channel.
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @param {number} fnum - Frequency number (0-1023)
 * @param {number} block - Block / octave (0-7)
 * @returns {{reg: number, value: number}}
 */
export function keyOn(channel, fnum, block) {
    const { fnumHiBlock } = encodeFnumBlock(fnum, block);
    return {
        reg: keyOnBlockReg(channel),
        value: 0x20 | fnumHiBlock,
    };
}

/**
 * Encode a key-off register write for a channel.
 *
 * @param {number} channel - Per-chip channel (0-17)
 * @param {number} fnum - Frequency number (0-1023)
 * @param {number} block - Block / octave (0-7)
 * @returns {{reg: number, value: number}}
 */
export function keyOff(channel, fnum, block) {
    const { fnumHiBlock } = encodeFnumBlock(fnum, block);
    return {
        reg: keyOnBlockReg(channel),
        value: fnumHiBlock,
    };
}

/**
 * Encode an Operator's properties into OPL3 register writes.
 *
 * @param {import('./struct.js').Operator} op
 * @param {number} channel - Per-chip channel (0-17)
 * @param {number} operatorSlot - 0 for modulator, 1 for carrier
 * @returns {Array<{reg: number, value: number}>}
 */
export function encodeOperatorRegisters(op, channel, operatorSlot) {
    return [
        {
            reg: operatorReg(0x20, channel, operatorSlot),
            value: ((op.am ? 1 : 0) << 7)
                 | ((op.vibrato ? 1 : 0) << 6)
                 | ((op.sustaining ? 1 : 0) << 5)
                 | ((op.ksr ? 1 : 0) << 4)
                 | (op.freqMult & 0x0F),
        },
        {
            reg: operatorReg(0x40, channel, operatorSlot),
            value: ((op.keyScaleLevel & 0x03) << 6)
                 | (op.totalLevel & 0x3F),
        },
        {
            reg: operatorReg(0x60, channel, operatorSlot),
            value: ((op.attack & 0x0F) << 4)
                 | (op.decay & 0x0F),
        },
        {
            reg: operatorReg(0x80, channel, operatorSlot),
            value: ((op.sustain & 0x0F) << 4)
                 | (op.release & 0x0F),
        },
        {
            reg: operatorReg(0xE0, channel, operatorSlot),
            value: op.waveform & 0x07,
        },
    ];
}

/**
 * Generate all register writes to program a 2-op channel voice.
 *
 * Writes both operators and the feedback/connection register. Follows
 * the ADL_Instrument convention: operators[0] = carrier (slot 1),
 * operators[1] = modulator (slot 0). Sets stereo output bits (L+R)
 * on the C0h register, which is required for audible output in OPL3 mode.
 *
 * Only handles 2-op instruments. Throws on 4-op or pseudo-4-op
 * instruments, which require two paired channels.
 *
 * @param {import('./struct.js').Instrument} instrument
 * @param {number} channel - Per-chip channel (0-17)
 * @returns {Array<{reg: number, value: number}>}
 */
export function encodeChannelVoice(instrument, channel) {
    if (instrument.is4op || instrument.isPseudo4op) {
        throw new Error('encodeChannelVoice only supports 2-op instruments');
    }
    const writes = [
        ...encodeOperatorRegisters(instrument.operators[1], channel, 0),
        ...encodeOperatorRegisters(instrument.operators[0], channel, 1),
        {
            reg: feedbackConnReg(channel),
            value: 0x30
                 | (((instrument.feedback1 || 0) & 0x07) << 1)
                 | ((instrument.connection1 || 0) & 0x01),
        },
    ];
    return writes;
}

/**
 * Create a channel reservation bitmask from channel indices.
 *
 * @param {...number} channels - Per-chip channel indices (0-22)
 * @returns {number} Bitmask for use with reserveChipChannels()
 */
export function channelMask(...channels) {
    let mask = 0;
    for (const ch of channels) {
        mask |= (1 << ch);
    }
    return mask >>> 0;
}
