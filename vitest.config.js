import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Default to Node tests only
        include: ['tests/node/**/*.test.js'],

        // Longer timeout for WASM operations
        testTimeout: 30000,

        // Run tests sequentially to avoid WASM conflicts
        isolate: false
    }
});
