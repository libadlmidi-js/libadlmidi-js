import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        // Build as a library to test import handling
        lib: {
            entry: resolve(__dirname, 'src/index.js'),
            formats: ['es'],
            fileName: 'bundle'
        },
        // Don't minify so we can inspect output
        minify: false,
        // Output to dist/
        outDir: 'dist',
        // Don't empty outDir (for repeated testing)
        emptyOutDir: true
    }
});
