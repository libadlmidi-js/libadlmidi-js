# Contributing to libADLMIDI-JS

## Development Setup

Install pre-commit hooks to automatically lint shell scripts:
```bash
pipx install pre-commit
pre-commit install
```

Hooks run automatically on commit. To run manually:
```bash
pre-commit run --all-files
```

## Development Rules

### Always Run Tests

After any code changes:
```bash
npm test              # Node unit tests (regenerates types first)
npm run test:browser  # Playwright browser tests
npm run test:bundler  # Bundler integration smoke test
npm run test:all      # All of the above
```

Other useful commands:
```bash
npm run test:watch    # Watch mode for Node tests
npm run typecheck     # Just validate TypeScript
npm run check         # Lint + typecheck + version sync check
```

### Types are Auto-Generated

**Do NOT edit `dist/libadlmidi.d.ts` directly!**

Types are generated from JSDoc in `src/libadlmidi.js`:
1. Add `@typedef` for new types
2. Add `@param` and `@returns` JSDoc to methods
3. Run `npm run build:types` to regenerate

### Struct Changes

When modifying processor.js struct code:
- Verify offsets match the verified WASM layout (ADL_Instrument = 40 bytes)
- Update `tests/node/structs.test.js` with roundtrip tests
- Test encoding AND decoding

### Updating libADLMIDI Submodule

When bumping the libADLMIDI submodule:
```bash
cd libADLMIDI && git pull origin master && cd ..
npm run sync-version  # Updates package.json with new version/commit
```

CI will fail if `package.json` is out of sync with the submodule.

### New Features

- New features require corresponding tests
- Instrument editing changes require struct roundtrip tests in Node
- Audio output changes should update browser test hash vectors

### Build Process

**WASM Build**
```bash
npm run build:wasm      # Build all profiles
./build.sh nuked        # Build single profile
./build.sh nuked slim   # Build only slim (no embedded banks)
```

Profiles: `nuked`, `dosbox`, `light`, `full`

The build uses Docker (`emscripten/emsdk`). No local Emscripten installation needed.

**JS Bundle**:
```bash
npm run build:js  # Rebundle JS
npm test          # Verify
```

***Bank Files***
`npm run build:banks` copies WOPL bank files from the libADLMIDI submodule to `dist/fm_banks/`.

**Full Rebuild**:
```bash
npm run build   # WASM + JS bundles + types + banks
```

## Test Structure

| Test File | Purpose |
|-----------|---------|
| `tests/node/wasm.test.js` | Build artifact verification |
| `tests/node/wasm-integration.test.js` | MIDI playback + audio hash verification |
| `tests/node/core.test.js` | Core API functionality |
| `tests/node/structs.test.js` | Operator/Instrument encoding |
| `tests/node/types.test.js` | TypeScript type validation |
| `tests/node/profile-consistency.test.js` | Profile parity checks |
| `tests/browser/audio.test.js` | AudioWorklet playback |
| `tests/browser/examples.test.js` | Example page smoke tests |

