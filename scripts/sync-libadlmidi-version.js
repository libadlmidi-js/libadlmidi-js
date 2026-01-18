#!/usr/bin/env node
/**
 * Syncs libADLMIDI upstream version info to package.json.
 *
 * This script:
 * 1. Parses ADLMIDI_VERSION_* from libADLMIDI/include/adlmidi.h
 * 2. Gets the git commit hash of the libADLMIDI submodule
 * 3. Updates the "libadlmidi" field in package.json
 *
 * Run with --check to verify without modifying (exits 1 if out of sync).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const HEADER_PATH = join(ROOT, 'libADLMIDI/include/adlmidi.h');
const PACKAGE_PATH = join(ROOT, 'package.json');

function parseUpstreamVersion() {
    const header = readFileSync(HEADER_PATH, 'utf8');

    const major = header.match(/^#define\s+ADLMIDI_VERSION_MAJOR\s+(\d+)/m)?.[1];
    const minor = header.match(/^#define\s+ADLMIDI_VERSION_MINOR\s+(\d+)/m)?.[1];
    const patch = header.match(/^#define\s+ADLMIDI_VERSION_PATCHLEVEL\s+(\d+)/m)?.[1];

    if (!major || !minor || !patch) {
        throw new Error(`Failed to parse ADLMIDI_VERSION from ${HEADER_PATH}`);
    }

    return `${major}.${minor}.${patch}`;
}

function getSubmoduleCommit() {
    try {
        const commit = execSync('git -C libADLMIDI rev-parse HEAD', {
            cwd: ROOT,
            encoding: 'utf8',
        }).trim();
        return commit;
    } catch (err) {
        throw new Error(`Failed to get libADLMIDI git commit: ${err.message}`);
    }
}

function main() {
    const checkOnly = process.argv.includes('--check');

    const version = parseUpstreamVersion();
    const commit = getSubmoduleCommit();

    const pkg = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
    const current = pkg.libadlmidi || {};

    const isInSync =
        current.version === version && current.commit === commit;

    if (checkOnly) {
        if (isInSync) {
            console.log(`✓ package.json libadlmidi field is in sync (${version} @ ${commit.slice(0, 8)})`);
            process.exit(0);
        } else {
            console.error('✗ package.json libadlmidi field is out of sync!');
            console.error(`  Expected: ${version} @ ${commit.slice(0, 8)}`);
            console.error(`  Got:      ${current.version || '(missing)'} @ ${(current.commit || '(missing)').slice(0, 8)}`);
            process.exit(1);
        }
    }

    if (isInSync) {
        console.log(`✓ Already in sync (${version} @ ${commit.slice(0, 8)})`);
        return;
    }

    // Update package.json preserving field order by inserting after "version"
    pkg.libadlmidi = { version, commit };

    // Pretty-print with 2-space indent
    writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n');

    console.log(`✓ Updated package.json libadlmidi field`);
    console.log(`  version: ${version}`);
    console.log(`  commit:  ${commit}`);
}

main();
