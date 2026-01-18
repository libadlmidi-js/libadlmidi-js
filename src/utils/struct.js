/**
 * OPL3 struct serialization utilities
 * Shared between processor and tests
 * 
 * @module utils/struct
 */

// =============================================================================
// Structure Sizes (verified with offsetof() - WASM is 32-bit)
// =============================================================================

/** Size of ADL_Operator struct (5 register bytes) */
export const SIZEOF_ADL_OPERATOR = 5;

/** Size of ADL_Instrument struct */
export const SIZEOF_ADL_INSTRUMENT = 40;  // Verified: ops at offset 14, delay at 34/36

/** Size of ADL_Bank struct (3 pointers × 4 bytes in 32-bit WASM) */
export const SIZEOF_ADL_BANK = 12;

/** Size of ADL_BankId struct (3 bytes + padding) */
export const SIZEOF_ADL_BANK_ID = 4;

/** Offset where operators start within ADL_Instrument */
export const OPERATOR_OFFSET = 14;

// =============================================================================
// Operator Encoding/Decoding
// =============================================================================

/**
 * @typedef {Object} Operator
 * @property {boolean} am - Amplitude modulation (tremolo)
 * @property {boolean} vibrato - Vibrato (frequency modulation)
 * @property {boolean} sustaining - Sustaining (EG type)
 * @property {boolean} ksr - Key scale rate
 * @property {number} freqMult - Frequency multiplier (0-15)
 * @property {number} keyScaleLevel - Key scale level (0-3)
 * @property {number} totalLevel - Total level / attenuation (0-63, 0 = loudest)
 * @property {number} attack - Attack rate (0-15)
 * @property {number} decay - Decay rate (0-15)
 * @property {number} sustain - Sustain level (0-15, 0 = loudest)
 * @property {number} release - Release rate (0-15)
 * @property {number} waveform - Waveform select (0-7)
 */

/**
 * Decode an OPL3 operator from raw register bytes to named properties
 * @param {Uint8Array | number[]} bytes - 5 bytes of operator register data
 * @returns {Operator} Decoded operator with named properties
 */
export function decodeOperator(bytes) {
    const avekf = bytes[0];
    const ksl_l = bytes[1];
    const atdec = bytes[2];
    const susrel = bytes[3];
    const waveform = bytes[4];

    return {
        // Register 0x20: AM/Vib/EG-type/KSR/Mult
        am: !!(avekf & 0x80),
        vibrato: !!(avekf & 0x40),
        sustaining: !!(avekf & 0x20),
        ksr: !!(avekf & 0x10),
        freqMult: avekf & 0x0F,

        // Register 0x40: KSL/TL
        keyScaleLevel: (ksl_l >> 6) & 0x03,
        totalLevel: ksl_l & 0x3F,

        // Register 0x60: AR/DR
        attack: (atdec >> 4) & 0x0F,
        decay: atdec & 0x0F,

        // Register 0x80: SL/RR
        sustain: (susrel >> 4) & 0x0F,
        release: susrel & 0x0F,

        // Register 0xE0: Waveform
        waveform: waveform & 0x07
    };
}

/**
 * Encode named operator properties to raw register bytes
 * @param {Operator} op - Operator with named properties
 * @returns {Uint8Array} 5 bytes of operator register data
 */
export function encodeOperator(op) {
    const avekf =
        (op.am ? 0x80 : 0) |
        (op.vibrato ? 0x40 : 0) |
        (op.sustaining ? 0x20 : 0) |
        (op.ksr ? 0x10 : 0) |
        (op.freqMult & 0x0F);

    const ksl_l = ((op.keyScaleLevel & 0x03) << 6) | (op.totalLevel & 0x3F);
    const atdec = ((op.attack & 0x0F) << 4) | (op.decay & 0x0F);
    const susrel = ((op.sustain & 0x0F) << 4) | (op.release & 0x0F);
    const waveform = op.waveform & 0x07;

    return new Uint8Array([avekf, ksl_l, atdec, susrel, waveform]);
}

/**
 * Default operator values (silent)
 * @returns {Operator} A silent operator configuration
 */
export function defaultOperator() {
    return {
        am: false,
        vibrato: false,
        sustaining: true,
        ksr: false,
        freqMult: 1,
        keyScaleLevel: 0,
        totalLevel: 63, // Max attenuation (silent)
        attack: 15,
        decay: 0,
        sustain: 0,
        release: 15,
        waveform: 0
    };
}

// =============================================================================
// Instrument Encoding/Decoding
// =============================================================================

/**
 * Complete OPL3 instrument definition
 * @typedef {Object} Instrument
 * @property {number} [version] - Instrument version
 * @property {number} [noteOffset1] - Note offset for voice 1
 * @property {number} [noteOffset2] - Note offset for voice 2
 * @property {number} [velocityOffset] - MIDI velocity offset
 * @property {number} [secondVoiceDetune] - Detune for second voice
 * @property {number} [percussionKey] - Percussion key number
 * @property {boolean} [is4op] - 4-operator mode enabled
 * @property {boolean} [isPseudo4op] - Pseudo 4-op (two 2-op voices)
 * @property {boolean} [isBlank] - Blank/unused instrument
 * @property {number} [rhythmMode] - Rhythm mode (0-7)
 * @property {number} [feedback1] - Feedback for voice 1 (0-7)
 * @property {number} [connection1] - Connection type for voice 1 (0-1)
 * @property {number} [feedback2] - Feedback for voice 2 (0-7)
 * @property {number} [connection2] - Connection type for voice 2 (0-1)
 * @property {[Operator, Operator, Operator, Operator]} operators - Four operators
 * @property {number} [delayOnMs] - Delay before note-on (ms)
 * @property {number} [delayOffMs] - Delay before note-off (ms)
 */

/**
 * Decode an ADL_Instrument from raw bytes to JS object
 * @param {Uint8Array} bytes - 40 bytes of instrument data
 * @returns {Instrument} Decoded instrument with named properties
 */
export function decodeInstrument(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, SIZEOF_ADL_INSTRUMENT);

    // int version (4 bytes)
    const version = view.getInt32(0, true);

    // int16_t note_offset1, note_offset2 (2 bytes each)
    const noteOffset1 = view.getInt16(4, true);
    const noteOffset2 = view.getInt16(6, true);

    // int8_t midi_velocity_offset, second_voice_detune (1 byte each)
    const velocityOffset = view.getInt8(8);
    const secondVoiceDetune = view.getInt8(9);

    // uint8_t percussion_key_number, inst_flags, fb_conn1, fb_conn2
    const percussionKey = bytes[10];
    const instFlags = bytes[11];
    const fbConn1 = bytes[12];
    const fbConn2 = bytes[13];

    // ADL_Operator operators[4] - 5 bytes each at offset 14
    /** @type {[Operator, Operator, Operator, Operator]} */
    const operators = /** @type {[Operator, Operator, Operator, Operator]} */ ([
        decodeOperator(bytes.slice(OPERATOR_OFFSET, OPERATOR_OFFSET + SIZEOF_ADL_OPERATOR)),
        decodeOperator(bytes.slice(OPERATOR_OFFSET + SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 2 * SIZEOF_ADL_OPERATOR)),
        decodeOperator(bytes.slice(OPERATOR_OFFSET + 2 * SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 3 * SIZEOF_ADL_OPERATOR)),
        decodeOperator(bytes.slice(OPERATOR_OFFSET + 3 * SIZEOF_ADL_OPERATOR, OPERATOR_OFFSET + 4 * SIZEOF_ADL_OPERATOR))
    ]);

    // uint16_t delay_on_ms, delay_off_ms at offset 34
    const delayOnMs = view.getUint16(34, true);
    const delayOffMs = view.getUint16(36, true);

    return {
        version,
        noteOffset1,
        noteOffset2,
        velocityOffset,
        secondVoiceDetune,
        percussionKey,

        // Decode flags
        is4op: !!(instFlags & 0x01),
        isPseudo4op: !!(instFlags & 0x02),
        isBlank: !!(instFlags & 0x04),
        rhythmMode: (instFlags >> 3) & 0x07,

        // Decode feedback/connection
        feedback1: (fbConn1 >> 1) & 0x07,
        connection1: fbConn1 & 0x01,
        feedback2: (fbConn2 >> 1) & 0x07,
        connection2: fbConn2 & 0x01,

        operators,
        delayOnMs,
        delayOffMs
    };
}

/**
 * Encode a JS instrument object to raw bytes
 * @param {Instrument} inst - Instrument with named properties
 * @returns {Uint8Array} 40 bytes of instrument data
 */
export function encodeInstrument(inst) {
    const bytes = new Uint8Array(SIZEOF_ADL_INSTRUMENT);
    const view = new DataView(bytes.buffer);

    // int version
    view.setInt32(0, inst.version || 0, true);

    // int16_t note_offset1, note_offset2
    view.setInt16(4, inst.noteOffset1 || 0, true);
    view.setInt16(6, inst.noteOffset2 || 0, true);

    // int8_t midi_velocity_offset, second_voice_detune
    view.setInt8(8, inst.velocityOffset || 0);
    view.setInt8(9, inst.secondVoiceDetune || 0);

    // uint8_t percussion_key_number
    bytes[10] = inst.percussionKey || 0;

    // uint8_t inst_flags
    let flags = 0;
    if (inst.is4op) flags |= 0x01;
    if (inst.isPseudo4op) flags |= 0x02;
    if (inst.isBlank) flags |= 0x04;
    flags |= ((inst.rhythmMode || 0) & 0x07) << 3;
    bytes[11] = flags;

    // uint8_t fb_conn1, fb_conn2
    bytes[12] = (((inst.feedback1 || 0) & 0x07) << 1) | ((inst.connection1 || 0) & 0x01);
    bytes[13] = (((inst.feedback2 || 0) & 0x07) << 1) | ((inst.connection2 || 0) & 0x01);

    // ADL_Operator operators[4]
    for (let i = 0; i < 4; i++) {
        const opBytes = encodeOperator(inst.operators?.[i] || defaultOperator());
        bytes.set(opBytes, OPERATOR_OFFSET + i * SIZEOF_ADL_OPERATOR);
    }

    // uint16_t delay_on_ms, delay_off_ms
    view.setUint16(34, inst.delayOnMs || 0, true);
    view.setUint16(36, inst.delayOffMs || 0, true);

    return bytes;
}

/**
 * Default instrument values (blank/silent)
 * @returns {Instrument} A blank instrument configuration
 */
export function defaultInstrument() {
    return {
        version: 0,
        noteOffset1: 0,
        noteOffset2: 0,
        velocityOffset: 0,
        secondVoiceDetune: 0,
        percussionKey: 0,
        is4op: false,
        isPseudo4op: false,
        isBlank: true,
        rhythmMode: 0,
        feedback1: 0,
        connection1: 0,
        feedback2: 0,
        connection2: 0,
        operators: [defaultOperator(), defaultOperator(), defaultOperator(), defaultOperator()],
        delayOnMs: 0,
        delayOffMs: 0
    };
}
