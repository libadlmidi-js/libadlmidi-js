/**
 * Shared constants for libADLMIDI-JS
 */

/**
 * Available OPL2/OPL3 emulator cores.
 * Use with switchEmulator() to change the synthesis engine at runtime.
 * Note: Only emulators compiled into the current profile are available.
 * @readonly
 * @enum {number}
 */
export const Emulator = Object.freeze({
    /** Nuked OPL3 v1.8 - Most accurate, higher CPU usage */
    NUKED: 0,
    /** Nuked OPL3 v1.7.4 - Slightly older version */
    NUKED_174: 1,
    /** DosBox OPL3 - Good accuracy, lower CPU usage */
    DOSBOX: 2,
    /** Opal - Reality Adlib Tracker emulator */
    OPAL: 3,
    /** Java OPL3 - Port of emu8950 */
    JAVA: 4,
    /** ESFMu - ESFM chip emulator */
    ESFMu: 5,
    /** MAME OPL2 */
    MAME_OPL2: 6,
    /** YMFM OPL2 */
    YMFM_OPL2: 7,
    /** YMFM OPL3 */
    YMFM_OPL3: 8,
    /** Nuked OPL2 LLE - Transistor-level emulation */
    NUKED_OPL2_LLE: 9,
    /** Nuked OPL3 LLE - Transistor-level emulation */
    NUKED_OPL3_LLE: 10,
    /** Nuked OPL2 Lite - Lightweight OPL2 emulation for AdLib-era music */
    NUKED_OPL2_LITE: 11,
});

/**
 * Track option flags for use with setTrackOptions().
 * @readonly
 * @enum {number}
 */
export const TrackOption = Object.freeze({
    /** Enable the track (default state) */
    ON: 1,
    /** Mute/disable the track */
    OFF: 2,
    /** Solo the track (mute all others) */
    SOLO: 3,
});
