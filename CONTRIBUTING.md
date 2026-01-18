# Contributing to libADLMIDI-JS

## Development Setup

Install pre-commit hooks to automatically lint shell scripts:
```bash
pip install pre-commit
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
npm test          # Generates types + runs all tests
npm run typecheck # Just validate TypeScript
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

### New Features

- New features require corresponding tests
- Instrument editing changes require struct roundtrip tests in Node
- Audio output changes should update browser test hash vectors (when implemented)

### Build Process

After changes to `processor.js` or `src/libadlmidi.js`:
```bash
node bundle.js  # Rebundle
npm test        # Verify
```

## Test Structure

| Test File | Purpose |
|-----------|---------|
| `tests/node/wasm.test.js` | Build artifact verification |
| `tests/node/structs.test.js` | Operator/Instrument encoding |
| `tests/node/types.test.js` | TypeScript type validation |
