/**
 * libadlmidi-js - Light profile
 * 
 * Includes both Nuked and DosBox emulators. Good balance of flexibility and size.
 * 
 * @example
 * ```javascript
 * import { AdlMidi, Emulator } from 'libadlmidi-js/light.js';
 * const synth = new AdlMidi();
 * await synth.init();
 * await synth.switchEmulator(Emulator.DOSBOX);  // Switch at runtime
 * ```
 */
export * from './src/profiles/light.js';
