// Bundles explorer/app.ts (+ engine) into one inline script inside explorer/template.html.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const out = await build({ entryPoints: ['explorer/app.ts'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
execSync('npx vitest run --reporter=json --outputFile=.vitest/report.json', { stdio: 'ignore' });
const report = JSON.parse(readFileSync('.vitest/report.json', 'utf8'));
if (report.numFailedTests) throw new Error('Tests failing — not building explorer');
const html = readFileSync('explorer/template.html', 'utf8').replace('__TESTS__', report.numPassedTests).replace('__APP__', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/scale-explorer.html', html);
// Standalone copy for running locally (needs its own document skeleton).
mkdirSync('dist/local', { recursive: true });
writeFileSync('dist/local/index.html',
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}\n</body>\n</html>\n`);
console.log(`dist/scale-explorer.html (${(html.length / 1024).toFixed(1)} KB, ${report.numPassedTests} tests)`);
