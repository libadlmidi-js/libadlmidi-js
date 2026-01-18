/**
 * libadlmidi-js - DosBox OPL3 profile
 * 
 * Good accuracy with lower CPU usage than Nuked.
 * 
 * @example
 * ```javascript
 * import { AdlMidi } from 'libadlmidi-js/dosbox.js';
 * const synth = new AdlMidi();
 * await synth.init();
 * ```
 */
export * from './src/profiles/dosbox.js';
