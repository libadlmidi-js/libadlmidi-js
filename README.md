# libadlmidi-js

WebAssembly build of [libADLMIDI](https://github.com/Wohlstand/libADLMIDI) - a free Software MIDI synthesizer library with OPL3 (FM synthesis) emulation.

This project brings the authentic sound of 90s PC gaming to the browser using WebAssembly and AudioWorklet for low-latency, high-fidelity synthesis.

## Features

- **Multiple OPL3 Emulators**: Includes Nuked OPL3, DosBox OPL3, Opal, and more.
- **Profile-based Builds**: Optimized builds for different use cases (Nuked for accuracy, Light for performance, Full for flexibility).
- **AudioWorklet Integration**: Runs synthesis in a separate thread to prevent UI stuttering.
- **WOPL Bank Support**: Load custom FM banks or use the high-quality embedded banks.
- **Real-time API**: Fine-grained control over MIDI channels, notes, and controllers.
- **Instrument Editing**: Programmatic access to OPL3 operator parameters.

## Installation

```bash
npm install libadlmidi-js
```

## Quick Start

```javascript
import { AdlMidi } from 'libadlmidi-js';

// Initialize the synth with a specific build profile
const synth = new AdlMidi();
await synth.init('./node_modules/libadlmidi-js/dist/libadlmidi.nuked.processor.js');

// Play a middle C on channel 0
synth.noteOn(0, 60, 100);

// Stop it after 1 second
setTimeout(() => {
    synth.noteOff(0, 60);
}, 1000);
```

## Profiles

| Profile | Emulator(s) | Usage |
|---------|-------------|-------|
| `nuked` | Nuked OPL3 v1.8 | Maximum accuracy, highest CPU usage. |
| `dosbox` | DosBox OPL3 | Great balance of speed and accuracy. |
| `light` | Nuked + DosBox | Flexible for varied performance needs. |
| `full` | All supported | Includes Opal, Java OPL3, ESFMu, etc. |

## Documentation

See the `examples/` directory for advanced usage, including:
- `player.html`: MIDI file playback.
- `keyboard.html`: Real-time interaction.
- `patch-editor.html`: Live OPL3 patch editing.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and rules.

## License

This project is licensed under the **LGPL-3.0**. See the [LICENSE](LICENSE) file for details.
Upstream libADLMIDI is licensed under a mix of GPL and LGPL; see the `libADLMIDI/LICENSE` for core engine licensing.
