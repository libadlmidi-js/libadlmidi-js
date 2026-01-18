#!/usr/bin/env node
/**
 * Copy bank files from libADLMIDI submodule to dist/fm_banks
 * and generate a manifest.json for dynamic loading.
 */

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_BANKS = join(ROOT, 'libADLMIDI', 'fm_banks');
const DEST_BANKS = join(ROOT, 'dist', 'fm_banks');

// Bank categories to copy (only WOPL files)
const BANK_SOURCES = [
    { src: 'wopl_files', dest: 'wopl', description: 'General WOPL banks' },
    { src: 'ail', dest: 'ail', description: 'AIL (Miles Sound System) banks' },
    { src: 'dmx', dest: 'dmx', description: 'DMX (Doom) banks' },
    { src: 'hmi', dest: 'hmi', description: 'HMI banks' },
    { src: 'junglevision', dest: 'junglevision', description: 'Jungle Vision banks' },
];

function copyWoplFiles(srcDir, destDir) {
    const banks = [];

    if (!existsSync(srcDir)) {
        console.warn(`Source directory not found: ${srcDir}`);
        return banks;
    }

    mkdirSync(destDir, { recursive: true });

    const entries = readdirSync(srcDir);
    for (const entry of entries) {
        const srcPath = join(srcDir, entry);
        const stats = statSync(srcPath);

        if (stats.isFile() && entry.endsWith('.wopl')) {
            const destPath = join(destDir, entry);
            copyFileSync(srcPath, destPath);
            banks.push({
                name: basename(entry, '.wopl'),
                file: entry,
                size: stats.size
            });
        }
    }

    return banks;
}

function main() {
    console.log('Copying bank files from libADLMIDI submodule...');

    if (!existsSync(SRC_BANKS)) {
        console.error('Error: libADLMIDI submodule not found. Run: git submodule update --init');
        process.exit(1);
    }

    // Ensure dest directory exists
    mkdirSync(DEST_BANKS, { recursive: true });

    const manifest = {
        generated: new Date().toISOString(),
        categories: {}
    };

    let totalBanks = 0;

    for (const { src, dest, description } of BANK_SOURCES) {
        const srcDir = join(SRC_BANKS, src);
        const destDir = join(DEST_BANKS, dest);

        const banks = copyWoplFiles(srcDir, destDir);

        if (banks.length > 0) {
            manifest.categories[dest] = {
                description,
                banks
            };
            totalBanks += banks.length;
            console.log(`  ${dest}: ${banks.length} banks`);
        }
    }

    // Write manifest
    const manifestPath = join(DEST_BANKS, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`\nCopied ${totalBanks} banks to dist/fm_banks/`);
    console.log('Generated manifest.json');
}

main();
