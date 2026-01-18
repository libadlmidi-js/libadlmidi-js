/**
 * Bundle Script for libADLMIDI-JS
 * 
 * Creates profile-specific AudioWorklet processor bundles using esbuild alias
 * to swap in the correct WASM module for each profile.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

/**
 * Discover profiles by scanning dist/ for browser-only split WASM modules.
 * Pattern: libadlmidi.<profile>.browser.js (split version without embedded WASM)
 * This makes build.sh the single source of truth for profile definitions.
 */
function discoverProfiles() {
    const distDir = 'dist';
    if (!fs.existsSync(distDir)) {
        return [];
    }

    const files = fs.readdirSync(distDir);
    const profiles = [];

    // Match libadlmidi.<profile>.browser.js for split browser builds
    for (const file of files) {
        if (file.startsWith('libadlmidi.') &&
            file.endsWith('.browser.js')) {
            // Extract profile name: libadlmidi.<profile>.browser.js
            const profile = file.slice('libadlmidi.'.length, -'.browser.js'.length);
            profiles.push(profile);
        }
    }

    return profiles.sort();
}

async function bundleProfile(profile) {
    const wasmModulePath = `dist/libadlmidi.${profile}.browser.js`;
    const outputFile = `dist/libadlmidi.${profile}.processor.js`;

    if (!fs.existsSync(wasmModulePath)) {
        console.warn(`Skipping ${profile}: ${wasmModulePath} not found`);
        return false;
    }

    try {
        await esbuild.build({
            entryPoints: ['src/processor.js'],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2020',
            outfile: outputFile,
            minify: false,
            sourcemap: false,
            alias: {
                // Replace the placeholder import with browser-only split module (no embedded WASM)
                'libadlmidi-wasm': path.resolve(wasmModulePath)
            },
            // Polyfill URL for AudioWorklet context (it exists in main thread but may not in worklet)
            banner: {
                js: `if (typeof URL === 'undefined') { globalThis.URL = class URL { constructor(url, base) { this.href = url; } }; }`
            }
        });

        const size = fs.statSync(outputFile).size;
        const sizeKB = (size / 1024).toFixed(0);
        console.log(`✓ libadlmidi.${profile}.processor.js (${sizeKB}KB)`);
        return true;
    } catch (error) {
        console.error(`✗ Failed to bundle ${profile}:`, error.message);
        return false;
    }
}

async function bundleInterface() {
    try {
        await esbuild.build({
            entryPoints: ['src/libadlmidi.js'],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2020',
            outfile: 'dist/libadlmidi.js',
            minify: false,
            sourcemap: true,
        });

        console.log('✓ libadlmidi.js');
        return true;
    } catch (error) {
        console.error('✗ Failed to bundle interface:', error.message);
        return false;
    }
}

async function main() {
    console.log('Bundling libADLMIDI-JS...\n');

    await bundleInterface();
    console.log('');

    const profiles = discoverProfiles();

    if (profiles.length === 0) {
        console.log('No WASM modules found in dist/. Run build.sh first.');
        return;
    }

    console.log(`Found ${profiles.length} profiles: ${profiles.join(', ')}\n`);

    let successCount = 0;
    for (const profile of profiles) {
        if (await bundleProfile(profile)) {
            successCount++;
        }
    }

    console.log(`\n${successCount}/${profiles.length} profiles bundled`);
}

main().catch(console.error);
