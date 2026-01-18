// Generate manifest.json for fm_banks directory
// Only includes WOPL files since that's the only format loadable at runtime
import fs from 'fs';
import path from 'path';

function walkDir(dir, basePath = '') {
    const result = {};
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            const subResult = walkDir(fullPath, relativePath);
            Object.assign(result, subResult);
        } else if (entry.name.endsWith('.wopl')) {
            // Only include WOPL files - the only format loadable at runtime
            const topDir = relativePath.split('/')[0];
            if (!result[topDir]) result[topDir] = [];
            result[topDir].push(relativePath);
        }
    }
    return result;
}

const banks = walkDir('dist/fm_banks');
fs.writeFileSync('dist/fm_banks/manifest.json', JSON.stringify(banks, null, 2));
console.log('Generated manifest.json (WOPL files only)');
console.log(JSON.stringify(banks, null, 2));
