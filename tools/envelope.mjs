// Meet de luidheid (RMS per 10 ms) van elke stemopname en schrijft tools/envelope.json.
// Gebruik: start een webserver in de projectmap op poort 8123 (npx http-server -p 8123)
// en draai: node tools/envelope.mjs   (vereist Playwright)
// Met een setnaam (bijvoorbeeld `node tools/envelope.mjs kantine`) leest het
// tools/words_kantine.json, de opnames uit audio/kantine/ en schrijft tools/envelope_kantine.json.
import { chromium } from 'playwright';
import fs from 'fs';

const set = process.argv[2] || '';
const suffix = set ? `_${set}` : '';
const dir = set ? `/audio/${set}` : '/audio';
const ids = JSON.parse(fs.readFileSync(new URL(`./words${suffix}.json`, import.meta.url)));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8123/README.md');
const res = await page.evaluate(async ([list, dir]) => {
  const out = {};
  for (const id of list) {
    const ab = await (await fetch(`${dir}/${id}.mp3`)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const buf = await ctx.decodeAudioData(ab);
    const d = buf.getChannelData(0);
    const hop = Math.round(buf.sampleRate * 0.01);
    const env = [];
    for (let i = 0; i + hop <= d.length; i += hop) {
      let s = 0;
      for (let j = 0; j < hop; j++) s += d[i + j] * d[i + j];
      env.push(Math.sqrt(s / hop));
    }
    const max = Math.max(...env);
    out[id] = { hop: 0.01, max, env: env.map((v) => Math.round((v / max) * 1000) / 1000) };
  }
  return out;
}, [Object.keys(ids), dir]);
fs.writeFileSync(new URL(`./envelope${suffix}.json`, import.meta.url), JSON.stringify(res));
console.log(`envelope${suffix}.json:`, Object.keys(res).join(', '));
await browser.close();
