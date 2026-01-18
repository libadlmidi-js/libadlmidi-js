/**
 * libadlmidi-js - Full profile
 * 
 * Includes all available emulators: Nuked, DosBox, Opal, Java, ESFMu, YMFM.
 * Largest build but maximum flexibility.
 * 
 * @example
 * ```javascript
 * import { AdlMidi, Emulator } from 'libadlmidi-js/full.js';
 * const synth = new AdlMidi();
 * await synth.init();
 * await synth.switchEmulator(Emulator.YMFM_OPL3);
 * ```
 */
export * from './src/profiles/full.js';
