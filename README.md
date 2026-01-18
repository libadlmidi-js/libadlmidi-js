# libadlmidi-js

WebAssembly build of [libADLMIDI](https://github.com/Wohlstand/libADLMIDI) - a free Software MIDI synthesizer library with OPL3 (FM synthesis) emulation.

## Features

- **Profile-based Builds**: Optimized builds for different use cases
- **AudioWorklet Integration**: Runs synthesis in a separate thread to prevent UI stuttering. Interoperates with all the usual browser audio APIs.
- **WOPL Bank Support**: Load custom FM banks or use the high-quality embedded banks.
- **Real-time API**: Fine-grained control over MIDI channels, notes, and controllers.
- **Instrument Editing**: Programmatic access to OPL3 operator parameters.

## Installation

```bash
npm install libadlmidi-js
```

## Quick Start (Browser + AudioWorklet)

```javascript
import { AdlMidi } from 'libadlmidi-js/nuked';

const synth = new AdlMidi();
await synth.init();  // Zero-config! No paths needed.

// Play a middle C on channel 0
synth.noteOn(0, 60, 100);

// Stop it after 1 second
setTimeout(() => {
    synth.noteOff(0, 60);
}, 1000);
```

## Low-Level API (Node.js / Custom Backends)

For batch rendering, custom audio backends, or non-browser environments:

```javascript
import { AdlMidiCore } from 'libadlmidi-js/nuked';

const synth = await AdlMidiCore.create();  // Zero-config!

synth.init(44100);
synth.setBank(72);

// Real-time synthesis
synth.noteOn(0, 60, 100);
const samples = synth.generate(4096);  // Float32Array, stereo interleaved

// Or MIDI file playback
import { readFileSync } from 'fs';
synth.loadMidi(readFileSync('song.mid'));
while (!synth.atEnd) {
  const audio = synth.play(4096);
  // ... write to file or audio output
}

synth.close();
```

### Slim Builds (No Embedded Banks)

For smaller bundles, use slim variants and load banks at runtime:

```javascript
import { AdlMidi } from 'libadlmidi-js/nuked/slim';

const synth = new AdlMidi();
await synth.init();
await synth.loadBankFile('./mybank.wopl');  // Load WOPL bank
```

### Struct Utilities

For direct OPL3 instrument manipulation:

```javascript
import { encodeInstrument, decodeInstrument, defaultInstrument } from 'libadlmidi-js/structs';

const inst = defaultInstrument();
inst.operators[0].attack = 15;
inst.feedback1 = 7;

const bytes = encodeInstrument(inst);  // 40-byte Uint8Array
const decoded = decodeInstrument(bytes);
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

