/**
 * libadlmidi-js - Default entry point
 * 
 * Re-exports the 'light' profile which includes both Nuked and DosBox emulators.
 * This is the recommended default for most users.
 * 
 * @example
 * ```javascript
 * import { AdlMidi } from 'libadlmidi-js';
 * 
 * const synth = new AdlMidi();
 * await synth.init();
 * synth.noteOn(0, 60, 100);
 * ```
 */
export * from './src/profiles/light.js';
