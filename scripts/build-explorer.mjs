// Bundles the apps into single self-contained HTML files.
//   app/monitor → dist/harmonic-monitor.html + dist/local/index.html (the Mac app's main look)
//   app/        → dist/harmonic.html (Orbit on cream) + dist/local/orbit.html
//   explorer/  → dist/scale-explorer.html + dist/local/explorer.html (engine review tool)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { buildDevice } from './m4l-device.mjs';

execSync('npx vitest run --reporter=json --outputFile=.vitest/report.json', { stdio: 'ignore' });
const report = JSON.parse(readFileSync('.vitest/report.json', 'utf8'));
if (report.numFailedTests) throw new Error('Tests failing — not building');

const standalone = (html) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}\n</body>\n</html>\n`;

async function bundle(entry, template) {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020' });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return readFileSync(template, 'utf8').replace('__TESTS__', report.numPassedTests).replace('__APP__', () => js);
}

mkdirSync('dist/local', { recursive: true });
const monitor = await bundle('app/monitor/main.ts', 'app/monitor/template.html');
writeFileSync('dist/harmonic-monitor.html', monitor);
writeFileSync('dist/local/index.html', standalone(monitor));
const app = await bundle('app/main.ts', 'app/template.html');
writeFileSync('dist/harmonic.html', app);
writeFileSync('dist/local/orbit.html', standalone(app));
const explorer = await bundle('explorer/app.ts', 'explorer/template.html');
writeFileSync('dist/scale-explorer.html', explorer);
writeFileSync('dist/local/explorer.html', standalone(explorer));
// Portfolio / public web version: sound on, a short how-to on open, no Ableton sync.
mkdirSync('dist/web', { recursive: true });
const web = await bundle('app/web/main.ts', 'app/monitor/template.html');
writeFileSync('dist/web/index.html', standalone(web).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="description" content="Harmonique: a chord instrument you can play in your browser.">'));

// Max for Live device: the page (loaded by the device's [jweb]) + the .amxd.
// The device points at the page's absolute path on Diego's Mac (override with HARMONIQUE_ROOT).
mkdirSync('dist/m4l', { recursive: true });
const m4l = await bundle('app/m4l/main.ts', 'app/monitor/template.html');
writeFileSync('dist/m4l/harmonique-m4l.html', standalone(m4l));
const root = process.env.HARMONIQUE_ROOT ?? '/Users/diegocuevas/Documents/harmonic';
writeFileSync('dist/m4l/Harmonique.amxd', buildDevice(`file://${root}/dist/m4l/harmonique-m4l.html`));

console.log(`built monitor (${(monitor.length / 1024).toFixed(1)} KB) + orbit + explorer · ${report.numPassedTests} tests`);
