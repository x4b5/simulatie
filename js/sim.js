import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from './audio.js';
import { VRUI } from './vrui.js';
import { LANGS, pair, langDir } from './i18n.js';
import { ICONS, MOOD_ICON } from './icons.js';
import { LIFE } from './human.js';

// Gedeeld raamwerk voor de oefeningen ("Bijna geraakt", "Grap in de kantine"):
// renderer en camera (first person), sequencer in simulatietijd, spreken met lipsync en
// meelezende ondertitels, keuzemoment, nabespreking in kaartjes, talen, VR en de animatielus.
// Een scenario (js/main.js, js/kantine.js) levert de wereld, de personages en de tijdlijn,
// en roept start() aan met zijn haken.

// ------------------------------------------------------------------
// Basis
// ------------------------------------------------------------------
export const $ = (s) => document.querySelector(s);
export const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Alleen voor testen: grotere tijdstap toestaan via ?dtmax=0.2
const DT_MAX = Number(new URLSearchParams(location.search).get('dtmax')) || 0.05;

const canvas = $('#scene');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
// VR: randen van het beeld met minder detail renderen (foveated rendering) voor een vloeiend beeld.
renderer.xr.setFoveation(0.6);

export const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

export const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 140);
// Zacht, warm vullicht vanuit de kijkrichting: gezichten blijven leesbaar, ook in de schaduw.
// Iets boven en links van de kijker, zodat het gezicht vorm houdt (niet plat van voren) en
// de ogen een klein lichtpuntje krijgen, zoals in het echt.
const faceFill = new THREE.SpotLight(0xffe4cc, 4.2, 5, 0.6, 1, 2);
faceFill.position.set(-0.3, 0.35, 0);
faceFill.target.position.set(0.05, -0.1, -1);
camera.add(faceFill, faceFill.target);
export const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

export const audio = new AudioEngine();
const vrui = new VRUI(renderer, scene, camera);
vrui.attachControllers(rig);

// Het scenario (haken en teksten), gezet door start().
let scn = null;
let T = null; // { UI, LINES, CHOICES, OUTCOMES }
let eye = 1.65;

// ------------------------------------------------------------------
// Toestand
// ------------------------------------------------------------------
export const S = {
  phase: 'loading', // loading | title | intro | choice | branch | reflect
  lang: 'nl',
  tried: new Set(),
  sub: null, // { who, key | choice }
  outcome: null,
  worldScale: 1,
  worldScaleTarget: 1,
  exposureTarget: 1,
  muted: false,
};
try {
  const saved = localStorage.getItem('bg-lang');
  if (saved && LANGS.some((l) => l.code === saved)) S.lang = saved;
} catch (e) {
  /* geen opslag beschikbaar */
}

// ------------------------------------------------------------------
// Sequencer: wachten in simulatietijd, afbreekbaar bij herstart
// ------------------------------------------------------------------
const ABORT = Symbol('abort');
export let runId = 0;
export let simT = 0;
let waits = [];
let tweens = [];
let untils = [];

export function wait(s) {
  return new Promise((res) => waits.push({ at: simT + s, res }));
}
export function until(fn) {
  return new Promise((res) => untils.push({ fn, res }));
}
export function tween(dur, fn) {
  return new Promise((res) => tweens.push({ t0: simT, dur, fn, res }));
}
export function guard(id) {
  if (id !== runId) throw ABORT;
}
function flushPending() {
  const all = [...waits, ...tweens, ...untils];
  waits = [];
  tweens = [];
  untils = [];
  all.forEach((w) => w.res());
}
async function run(fn) {
  const id = ++runId;
  flushPending();
  try {
    await fn(id);
  } catch (e) {
    if (e !== ABORT) console.error(e);
  }
}
// Een stuk tijdlijn dat los meeloopt (niet meteen afgewacht): afbreken bij een herstart is
// normaal en wordt hier afgevangen, zodat het nooit onafgehandeld blijft.
export function detach(promise) {
  return promise.catch((e) => {
    if (e !== ABORT) console.error(e);
  });
}
// Voert fn uit na s seconden, tenzij de tijdlijn intussen is afgebroken.
export function later(id, s, fn) {
  wait(s).then(() => {
    if (id === runId) fn();
  });
}
// Wachten in echte tijd, voor achtergrondanimaties die los van de tijdlijn doorlopen.
export function waitReal(s) {
  return new Promise((r) => setTimeout(r, s * 1000));
}
export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export function shortAngle(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ------------------------------------------------------------------
// Camera / speler
// ------------------------------------------------------------------
export const look = { yaw: 0, pitch: 0, fn: null, fYaw: 0, fPitch: 0, rate: 4, uYaw: 0, uPitch: 0, lastUser: -99, shake: 0 };
export const player = { path: [], speed: 1.35, phase: 0, moving: 0, lastSign: 0, arrive: null };
export const tmp = new THREE.Vector3();
export const tmp2 = new THREE.Vector3();

export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
export function lookAtFn(fn, rate = 4) {
  look.fn = fn;
  look.dirFn = null;
  look.rate = rate;
}
export function lookDir(yaw, pitch, rate = 3) {
  look.fn = null;
  look.dirFn = null;
  look.fYaw = yaw;
  look.fPitch = pitch;
  look.rate = rate;
}
export function snapLook() {
  const [y, p] = desiredLook();
  look.yaw = y;
  look.pitch = p;
}
// choiceEl wordt verderop gezet; lookFrame leest het pas tijdens het spelen.
let choiceEl = null;
// Keuzekader: kijk zo dat alle gezichten (heads: functie → [Vector3, …]) in de vrije strook
// tussen de bovenbalk en het keuzepaneel vallen; is de groep te breed, dan tijdelijk een
// grotere beeldhoek (tot 80°, staand scherm 95°). Zo blijft de emotionele aanleiding van de
// keuze in beeld terwijl je kiest.
const _fh = new THREE.Vector3();
export function lookFrame(heads, rate = 2) {
  look.fn = null;
  look.rate = rate;
  look.dirFn = () => {
    const all = heads();
    camera.getWorldPosition(_fh);
    const aspect = camera.aspect || 1;
    const maxV = aspect < 1 ? 95 : 80;
    const maxH = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(maxV) / 2) * aspect);
    // De eerste in de lijst is het belangrijkst; past de groep niet (staand scherm), dan vallen
    // de laatsten af.
    let n = all.length;
    let y0;
    let ymin;
    let ymax;
    let esum;
    for (;;) {
      y0 = null;
      ymin = 0;
      ymax = 0;
      esum = 0;
      for (let i = 0; i < n; i++) {
        const h = all[i];
        const dx = h.x - _fh.x;
        const dz = h.z - _fh.z;
        const y = Math.atan2(-dx, -dz);
        if (y0 === null) y0 = y;
        const r = shortAngle(y - y0);
        ymin = Math.min(ymin, r);
        ymax = Math.max(ymax, r);
        esum += Math.atan2(h.y - _fh.y, Math.hypot(dx, dz));
      }
      if (n === 1 || ymax - ymin + 0.3 <= maxH * 0.86) break;
      n--;
    }
    const pts = all.slice(0, n);
    const yaw = y0 + (ymin + ymax) / 2;
    const spread = ymax - ymin + 0.3; // plus een hoofdbreedte aan beide kanten
    const base = baseFov();
    const hfovBase = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * aspect);
    let vfov = base;
    if (spread > hfovBase * 0.86) vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(spread / 0.86 / 2) / aspect));
    vfov = Math.min(vfov, maxV);
    look.fovWant = vfov;
    // Vrije strook: onder de bovenbalk, boven het keuzepaneel (of 55% van de hoogte).
    const H = window.innerHeight || 1;
    const top = 64;
    const panel = choiceEl && !choiceEl.hidden ? choiceEl.getBoundingClientRect().top : H * 0.55;
    const mid = (top + 0.9 * (Math.max(top + 40, panel) - top) * 0.5) / H; // iets boven het midden van de strook (kin vrij)
    const yNdc = 1 - 2 * mid;
    const pitch = esum / pts.length - Math.atan(yNdc * Math.tan(THREE.MathUtils.degToRad(vfov) / 2));
    return [yaw, THREE.MathUtils.clamp(pitch, -1.0, 0.6)];
  };
}
function baseFov() {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  return w / h < 0.8 ? 78 : 68;
}

function desiredLook() {
  if (look.dirFn) return look.dirFn();
  if (look.fn) {
    const t = look.fn(tmp);
    camera.getWorldPosition(tmp2);
    const dx = t.x - tmp2.x;
    const dy = t.y - tmp2.y;
    const dz = t.z - tmp2.z;
    return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
  }
  return [look.fYaw, look.fPitch];
}
function angleDamp(cur, target, rate, dt) {
  return cur + shortAngle(target - cur) * (1 - Math.exp(-rate * dt));
}
export function playerWalk(points, speed = 1.35) {
  player.path = points.map((p) => p.clone());
  player.speed = speed;
  return new Promise((r) => (player.arrive = r));
}
export function playerStop() {
  player.path = [];
  if (player.arrive) {
    const r = player.arrive;
    player.arrive = null;
    r();
  }
}
export function pathRemaining() {
  let d = 0;
  let prev = rig.position;
  for (const p of player.path) {
    d += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return d;
}
// Speler deinst terug: korte verplaatsing (x,z in meters) en even door de knieën.
let crouch = 0;
export function flinch(delta, dur = 0.4, duck = true) {
  // VR: niet het beeld verplaatsen (dat geeft misselijkheid); alleen een tik in de controllers.
  if (renderer.xr.isPresenting) {
    haptic(0.6, 120);
    return;
  }
  const from = rig.position.clone();
  const to = from.clone().add(delta);
  tween(dur, (k) => {
    const e = 1 - Math.pow(1 - k, 3);
    rig.position.lerpVectors(from, to, e);
    if (duck && !reduceMotion) crouch = Math.sin(k * Math.PI) * 0.09;
  }).then(() => (crouch = 0));
}

function haptic(strength, ms) {
  try {
    const session = renderer.xr.getSession();
    for (const src of session?.inputSources || []) {
      const h = src.gamepad?.hapticActuators?.[0];
      if (h?.pulse) h.pulse(strength, ms);
      else src.gamepad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength });
    }
  } catch (e) {
    /* geen trilfunctie */
  }
}

// VR-comfort: tijdens gedwongen lopen een tunnelvignet (randen donker, midden vrij), zodat het
// zien van beweging zonder zelf te lopen minder misselijk maakt. Alleen in VR zichtbaar.
const tunnel = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { amount: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float amount; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(0.38, 0.75, r) * amount; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }',
  }),
);
tunnel.position.z = -0.1;
tunnel.scale.setScalar(0.22);
tunnel.renderOrder = 9998;
tunnel.frustumCulled = false;
tunnel.visible = false;
camera.add(tunnel);
function updateTunnel() {
  const on = renderer.xr.isPresenting ? player.moving : 0;
  tunnel.material.uniforms.amount.value = Math.min(0.92, on * 1.1);
  tunnel.visible = on > 0.02;
}

export function shake(a) {
  if (!reduceMotion) look.shake = Math.max(look.shake, a);
}

export const playerHead = (v) => camera.getWorldPosition(v);
export const playerChest = (v) => camera.getWorldPosition(v).add(tmp2.set(0, -0.4, 0));

// ------------------------------------------------------------------
// Spreken en ondertitels
// ------------------------------------------------------------------
let voice = null;
let LIPSYNC = {};

export function stopVoice() {
  if (voice) voice.stop();
  voice = null;
}

function fakeTalk() {
  return () => (Math.sin(simT * 17) * 0.5 + 0.5) * 0.08 + 0.02;
}

// Een personage zegt regel `key` (geluid, lipsync, ondertitel). cues: [[seconden, fn], …]
export async function say(id, key, cues = []) {
  const line = T.LINES[key];
  const person = scn.person(line.who);
  // Wie gaat praten, rondt een eigen handeling (slokje, nek wrijven) eerst af.
  person.settle?.(3);
  // Eerst zichtbaar inademen, dan pas spreken.
  // Beurtwisseling niet mechanisch gelijk: per regel kan het scenario de aanloop (pre, standaard
  // 0,22 s) en de stilte erna (tail, standaard 0,15 s) zetten in lineEmo; invallen of juist
  // een pijnlijke stilte.
  const timing = scn.lineEmo?.[key] || {};
  person.inhale(0.32);
  await wait(timing.pre ?? 0.22);
  guard(id);
  showSub({ who: line.who, key });
  stopVoice();
  voice = audio.ready && person.panner ? audio.voice(key, person.panner) : null;
  const v = voice;
  const dur = v ? v.duration : line.est;
  const live = v && audio.ctx.state === 'running' && !S.muted;
  const t0 = simT;
  const clock = live ? () => audio.ctx.currentTime - v.startTime : () => simT - t0;
  const level = live ? () => audio.level(v.analyser) : null;
  const track = LIPSYNC[key];
  if (track) person.speak(track, clock, scn.lineEmo[key], level);
  else person.talk = live ? () => audio.features(v.analyser) : fakeTalk();
  S.subClock = clock;
  for (const [t, fn] of cues) later(id, t, fn);
  await wait(dur + (timing.tail ?? 0.15));
  person.stopSpeaking();
  person.talk = null;
  guard(id);
  if (S.sub && S.sub.key === key) hideSub();
}

// De speler zegt het gekozen antwoord hardop (eigen stem: dichtbij, niet ruimtelijk).
export async function playerSays(id, key) {
  showSub({ who: 'you', choice: key });
  stopVoice();
  voice = audio.ready && selfOut ? audio.voice(`p${key}`, selfOut) : null;
  const words = T.CHOICES[key].nl.split(/\s+/).length;
  const dur = voice ? voice.duration + 0.35 : Math.max(2.4, words * 0.42 + 0.6);
  await wait(dur);
  guard(id);
  hideSub();
}

const subEl = $('#subs');
function speakerLabel(who) {
  return pair(T.UI[who], S.lang);
}
function showSub(sub) {
  S.sub = sub;
  renderSub();
}
export function hideSub() {
  S.sub = null;
  S.subClock = null;
  subEl.hidden = true;
  vrui.hideSubtitle();
}
function renderSub() {
  const sub = S.sub;
  if (!sub) return;
  const entry = sub.key ? T.LINES[sub.key].text : T.CHOICES[sub.choice];
  const [nl, other] = pair(entry, S.lang);
  const [whoNl] = speakerLabel(sub.who);
  subEl.dataset.who = sub.who;
  subEl.querySelector('.who').textContent = whoNl;
  const nlEl = subEl.querySelector('.nl');
  const words = sub.key && LIPSYNC[sub.key]?.w;
  if (words) {
    // Elk woord apart, zodat het meelicht op het moment dat het uitgesproken wordt.
    // Er staat steeds maar één zin in beeld (minder tekst tegelijk).
    let sent = 0;
    nlEl.replaceChildren(
      ...words.map(([, , w], i) => {
        const sp = document.createElement('span');
        sp.className = 'w';
        sp.dataset.s = sent;
        sp.textContent = w + ' ';
        if (/[.!?…]["”]?$/.test(w) && !runsOn(w, words[i + 1]?.[2])) sent++;
        return sp;
      }),
    );
    nlEl.classList.add('karaoke');
    karaokeIdx = -2;
    subSentence = -1;
  } else {
    nlEl.textContent = nl;
    nlEl.classList.remove('karaoke');
  }
  const tr = subEl.querySelector('.tr');
  tr.textContent = other || '';
  tr.hidden = !other;
  tr.dir = langDir(S.lang);
  subEl.hidden = false;
  if (words) {
    // De vertaling ook per zin, als het aantal zinnen gelijk is.
    const nlS = sentences(nl, true);
    const trS = other ? sentences(other) : [];
    subParts = { nl: nlS, tr: trS.length === nlS.length ? trS : null, other, who: sub.who, whoNl };
    showSentence(0);
  } else {
    subParts = null;
    vrui.showSubtitle(whoNl, scn.subColors[sub.who], nl, other, langDir(S.lang));
  }
}

let subParts = null;
let subSentence = -1;
// Aarzelen ("Een… oei") loopt door in dezelfde zin: na het weglatingsteken volgt een kleine letter.
const runsOn = (w, next) => /(…|\.\.\.)["”»]?$/.test(w) && /^[^\p{L}]*\p{Ll}/u.test(next || '');
function sentences(text, joinRunOn = false) {
  const parts = (text.match(/[^.!?…؟]+[.!?…؟]+["”»]?\s*|[^.!?…؟]+$/g) || [text]).map((t) => t.trim()).filter(Boolean);
  if (!joinRunOn) return parts;
  const out = [];
  for (const p of parts) {
    if (out.length && runsOn(out[out.length - 1], p)) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}
function showSentence(n) {
  if (!subParts || n === subSentence) return;
  subSentence = n;
  for (const sp of subEl.querySelectorAll('.nl .w')) sp.classList.toggle('off', Number(sp.dataset.s) !== n);
  const tr = subParts.tr ? subParts.tr[Math.min(n, subParts.tr.length - 1)] : subParts.other;
  const trEl = subEl.querySelector('.tr');
  trEl.textContent = tr || '';
  trEl.hidden = !tr;
  const nlText = subParts.nl[Math.min(n, subParts.nl.length - 1)];
  vrui.showSubtitle(subParts.whoNl, scn.subColors[subParts.who], nlText, tr, langDir(S.lang));
}

// Markeert in de ondertitel het woord dat nu wordt uitgesproken.
let karaokeIdx = -2;
function tickKaraoke() {
  const words = S.sub?.key && LIPSYNC[S.sub.key]?.w;
  if (!words || !S.subClock) {
    karaokeIdx = -2;
    return;
  }
  const t = S.subClock();
  let idx = -1;
  for (let i = 0; i < words.length; i++) if (words[i][0] - 0.03 <= t) idx = i;
  if (idx === karaokeIdx) return;
  karaokeIdx = idx;
  const spans = subEl.querySelectorAll('.nl .w');
  if (idx >= 0 && spans[idx]) showSentence(Number(spans[idx].dataset.s));
  spans.forEach((sp, i) => {
    sp.classList.toggle('said', i < idx || (i === idx && t > words[i][1]));
    sp.classList.toggle('now', i === idx && t <= words[i][1] + 0.12);
  });
}

// ------------------------------------------------------------------
// Verloop: keuze, reactie, nabespreking
// ------------------------------------------------------------------
export function setPhase(p) {
  S.phase = p;
  document.body.dataset.phase = p;
  const frozen = p === 'choice';
  // Bij de keuze begint niemand aan iets nieuws (kopje pakken, nek wrijven …): rust in beeld.
  LIFE.quiet = frozen;
  // Bij de keuze loopt de wereld nog 0,8 s op gewone snelheid, zodat iedereen zich eerst
  // helemaal naar de speler draait ("iedereen kijkt naar jou"), en vertraagt dan pas.
  S.worldScaleTarget = 1;
  S.freezeAt = frozen ? simT + 0.8 : 0;
  S.exposureTarget = frozen ? 0.85 : p === 'reflect' ? 0.85 : 1;
  $('#skip').hidden = p !== 'intro';
}

export function goChoice() {
  setPhase('choice');
  hideSub();
  scn.onChoice();
  renderChoice();
}

function pick(key) {
  if (S.phase !== 'choice') return;
  S.tried.add(key);
  hideChoice();
  run(async (id) => {
    setPhase('branch');
    await scn.branch(id, key);
    guard(id);
    showReflection(key);
  });
}

choiceEl = $('#choice');
function renderChoice() {
  if (S.phase !== 'choice') return;
  const { UI, CHOICES } = T;
  const [title, titleTr] = pair(UI.prompt, S.lang);
  const [sub, subTr] = pair(UI.pickOne, S.lang);
  choiceEl.querySelector('.c-title').textContent = title;
  setTr(choiceEl.querySelector('.c-title-tr'), titleTr);
  choiceEl.querySelector('.c-sub').textContent = sub;
  setTr(choiceEl.querySelector('.c-sub-tr'), subTr);
  const list = choiceEl.querySelector('.c-list');
  list.replaceChildren();
  const items = [];
  const listenNl = pair(UI.listen, S.lang)[0];
  for (const key of ['A', 'B', 'C']) {
    const [nl, other] = pair(CHOICES[key], S.lang);
    const wrap = document.createElement('div');
    wrap.className = 'opt-wrap';
    const b = document.createElement('button');
    b.className = 'opt';
    b.type = 'button';
    b.id = `opt-${key}`;
    b.innerHTML = `<span class="opt-pic" aria-hidden="true"><span class="opt-icon ic">${ICONS[scn.choiceIcon[key]]}</span><span class="opt-key">${key}</span></span><span class="opt-body"><span class="opt-nl"></span><span class="opt-tr"></span></span>`;
    b.querySelector('.opt-nl').textContent = nl;
    setTr(b.querySelector('.opt-tr'), other);
    if (S.tried.has(key)) {
      const t = document.createElement('span');
      t.className = 'opt-tried';
      t.innerHTML = `<span class="ic">${ICONS.check}</span>`;
      t.append(pair(UI.tried, S.lang)[0]);
      b.querySelector('.opt-body').appendChild(t);
    }
    b.addEventListener('click', () => pick(key));
    // Luisteren: het antwoord hardop horen, zonder het al te kiezen.
    const l = document.createElement('button');
    l.className = 'opt-listen';
    l.type = 'button';
    l.dataset.key = key;
    l.innerHTML = `<span class="ic">${ICONS.speaker}</span><span class="lbl"></span>`;
    l.querySelector('.lbl').textContent = listenNl;
    l.setAttribute('aria-label', `${listenNl}: ${nl}`);
    l.addEventListener('click', (e) => {
      e.stopPropagation();
      previewChoice(key);
    });
    wrap.append(b, l);
    list.appendChild(wrap);
    items.push({ letter: key, nl, other, tried: S.tried.has(key), onSelect: () => pick(key) });
  }
  choiceEl.hidden = false;
  vrui.showChoices(title, sub, pair(UI.vrHint, S.lang)[0], items, langDir(S.lang), pair(UI.tried, S.lang)[0]);
}

// Voorbeeld van een antwoord afspelen (eigen stem), los van de keuze.
let preview = null;
async function previewChoice(key) {
  await ensureAudio();
  stopPreview();
  const v = audio.ready && selfOut ? audio.voice(`p${key}`, selfOut) : null;
  if (!v) return;
  preview = v;
  const btn = choiceEl.querySelector(`.opt-listen[data-key="${key}"]`);
  btn?.classList.add('playing');
  v.ended.then(() => {
    btn?.classList.remove('playing');
    if (preview === v) preview = null;
  });
}
function stopPreview() {
  if (preview) preview.stop();
  preview = null;
  for (const b of choiceEl.querySelectorAll('.opt-listen.playing')) b.classList.remove('playing');
}

// ------------------------------------------------------------------
// Voorlezen van UI-tekst (startscherm, keuzevraag, nabespreking) met de Web Speech API.
// Eerst het Nederlands, daarna de vertaling (als er een stem voor die taal is). Zonder
// Nederlandse stem in de browser blijven de voorleesknoppen verborgen.
// ------------------------------------------------------------------
const TTS_LANG = { nl: 'nl-NL', en: 'en-GB', ar: 'ar-SA', pl: 'pl-PL', tr: 'tr-TR', uk: 'uk-UA' };
const tts = { synth: null, voices: [], btn: null, auto: false, token: 0 };
try {
  tts.synth = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function' ? window.speechSynthesis : null;
} catch (e) {
  tts.synth = null;
}
function ttsLoadVoices() {
  try {
    tts.voices = tts.synth ? tts.synth.getVoices() : [];
  } catch (e) {
    tts.voices = [];
  }
  document.body.classList.toggle('can-read', !!ttsVoice('nl'));
}
function ttsVoice(lang) {
  const want = (TTS_LANG[lang] || lang).toLowerCase();
  const base = want.slice(0, 2);
  const list = tts.voices.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith(base));
  if (!list.length) return null;
  // Liefst de juiste regio (nl-NL, niet nl-BE), en een lokale stem (werkt ook zonder internet).
  return list.find((v) => v.lang.toLowerCase().replace('_', '-') === want && v.localService) || list.find((v) => v.lang.toLowerCase().replace('_', '-') === want) || list[0];
}
if (tts.synth) {
  ttsLoadVoices();
  tts.synth.addEventListener?.('voiceschanged', ttsLoadVoices);
}
export function stopReading() {
  tts.token++;
  if (tts.synth) {
    try {
      tts.synth.cancel();
    } catch (e) {
      /* niets */
    }
  }
  if (tts.btn) tts.btn.classList.remove('playing');
  tts.btn = null;
}
// parts: [[tekst, taal], …]. Leest ze na elkaar voor; nogmaals op dezelfde knop = stoppen.
function readAloud(parts, btn) {
  if (btn && tts.btn === btn) {
    stopReading();
    return;
  }
  stopReading();
  stopPreview();
  if (!tts.synth || S.muted) return;
  const todo = parts.filter(([text, lang]) => text && ttsVoice(lang));
  if (!todo.length) return;
  const token = tts.token;
  tts.btn = btn || null;
  btn?.classList.add('playing');
  todo.forEach(([text, lang], i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = ttsVoice(lang);
    u.lang = u.voice?.lang || TTS_LANG[lang] || lang;
    u.rate = lang === 'nl' ? 0.86 : 0.92; // rustig tempo, voor wie net Nederlands leert
    if (i === todo.length - 1) {
      u.onend = u.onerror = () => {
        if (token !== tts.token) return;
        btn?.classList.remove('playing');
        tts.btn = null;
      };
    }
    tts.synth.speak(u);
  });
  window.__sim && (window.__sim.lastRead = todo.map(([t, l]) => `${l}:${t}`));
}
// Tekst voor voorlezen: de vertaling na het Nederlands, als die er is.
function withTr(entries) {
  const nl = [];
  const tr = [];
  for (const e of entries) {
    if (!e) continue;
    const [a, b] = pair(e, S.lang);
    const end = (t) => (/[.!?:…؟]["”»]?$/.test(t) ? t : `${t}.`); // kopjes: korte pauze erna
    nl.push(end(a));
    if (b) tr.push(end(b));
  }
  const out = [[nl.join(' '), 'nl']];
  if (tr.length) out.push([tr.join(' '), S.lang]);
  return out;
}
function makeReadBtn(cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `read-btn ${cls}`;
  b.innerHTML = `<span class="ic">${ICONS.speaker}</span><span class="lbl"></span>`;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}
function labelReadBtns() {
  const l = pair(T.UI.listen, S.lang)[0];
  for (const b of document.querySelectorAll('.read-btn')) {
    b.querySelector('.lbl').textContent = l;
    b.setAttribute('aria-label', l);
  }
}
function readStory(btn) {
  const keys = [...document.querySelectorAll('#start .story [data-t]')].map((el) => el.dataset.t);
  if (T.UI.noteShort) keys.push('noteShort');
  readAloud(withTr(keys.map((k) => T.UI[k])), btn);
}
function readPrompt(btn) {
  readAloud(withTr([T.UI.prompt, T.UI.pickOne]), btn);
}
function readCard(btn) {
  if (S.phase !== 'reflect') return;
  tts.auto = true; // wie één keer laat voorlezen, krijgt de volgende kaarten ook voorgelezen
  const cards = reflectionCards(S.outcome);
  const c = cards[Math.min(S.card || 0, cards.length - 1)];
  const entries = [c.head, c.body];
  if (c.quote) entries.push(T.UI.sayIt, c.quote);
  if (c.last && S.tried.size === 3) entries.push(T.UI.allTried);
  readAloud(withTr(entries), btn);
}
function setupReadButtons() {
  const story = $('#start .story');
  if (story) story.after(makeReadBtn('story-listen', readStory));
  $('#choice .c-head')?.appendChild(makeReadBtn('c-listen', readPrompt));
  $('#reflect .r-card')?.prepend(makeReadBtn('r-listen', readCard));
  labelReadBtns();
}

function hideChoice() {
  stopPreview();
  stopReading();
  choiceEl.hidden = true;
  vrui.clearPanel();
}

function setTr(el, text) {
  el.textContent = text || '';
  el.hidden = !text;
  el.dir = langDir(S.lang);
}

const reflEl = $('#reflect');
function showReflection(key) {
  S.outcome = key;
  S.card = 0;
  setPhase('reflect');
  hideSub();
  renderReflection();
}

// Nabespreking als kaartjes: steeds één stap (pictogram + 1 of 2 korte zinnen).
function reflectionCards(key) {
  const { UI } = T;
  const o = T.OUTCOMES[key];
  return [
    { icon: 'eye', head: UI.what, body: o.what },
    { icon: 'bulb', head: UI.why, body: o.why },
    { icon: 'tip', head: UI.tip, body: o.tip, quote: o.quote },
    // Extra kaarten van een oefening (bijv. de kantine: "En als het over jou gaat?").
    ...(o.extra || []),
    { icon: 'question', head: UI.q, body: o.q, last: true },
  ];
}

function renderReflection() {
  const key = S.outcome;
  if (!key) return;
  const { UI } = T;
  const o = T.OUTCOMES[key];
  const cards = reflectionCards(key);
  const n = Math.min(S.card || 0, cards.length - 1);
  const c = cards[n];
  reflEl.dataset.mood = o.mood;
  const q = (sel) => reflEl.querySelector(sel);
  const set = (sel, entry) => {
    const [nl, other] = pair(entry, S.lang);
    q(sel).textContent = nl;
    setTr(q(sel + '-tr'), other);
  };
  q('.r-face').innerHTML = ICONS[MOOD_ICON[o.mood]];
  q('.r-mood').textContent = pair(o.moodLabel, S.lang)[0];
  set('.r-title', o.title);

  const card = q('.r-card');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  q('.r-card-ic').innerHTML = ICONS[c.icon];
  set('.r-card-h', c.head);
  const [bNl, bTr] = pair(c.body, S.lang);
  q('.r-card-body').textContent = bNl;
  setTr(q('.r-card-tr'), bTr);
  const quote = q('.r-quote');
  quote.hidden = !c.quote;
  if (c.quote) {
    const [qNl, qTr] = pair(c.quote, S.lang);
    q('.r-quote-h').textContent = pair(UI.sayIt, S.lang)[0];
    q('.r-quote-nl').textContent = qNl;
    setTr(q('.r-quote-tr'), qTr);
  }
  const all = !!c.last && S.tried.size === 3;
  q('.r-all').hidden = !all;
  if (all) {
    const [nl, other] = pair(UI.allTried, S.lang);
    q('.r-all-nl').textContent = nl;
    setTr(q('.r-all-tr'), other);
  }

  q('.r-dots').replaceChildren(
    ...cards.map((_, i) => {
      const d = document.createElement('i');
      if (i === n) d.className = 'on';
      return d;
    }),
  );
  $('#r-back').disabled = n === 0;
  $('#r-back .b-nl').textContent = pair(UI.back, S.lang)[0];
  $('#r-next').hidden = !!c.last;
  $('#r-next .b-nl').textContent = pair(UI.next, S.lang)[0];
  q('.r-actions').hidden = !c.last;
  $('#btn-retry .b-nl').textContent = pair(UI.retry, S.lang)[0];
  setTr($('#btn-retry .b-tr'), pair(UI.retry, S.lang)[1]);
  $('#btn-restart .b-nl').textContent = pair(UI.restart, S.lang)[0];
  setTr($('#btn-restart .b-tr'), pair(UI.restart, S.lang)[1]);
  reflEl.hidden = false;
  // Past het paneel niet helemaal (kleine telefoon), dan in elk geval de knoppen in beeld.
  reflEl.scrollTop = 0;
  if (c.last && reflEl.scrollHeight > reflEl.clientHeight + 2) q('.r-actions').scrollIntoView({ block: 'nearest' });
  // Voorlezen: na één keer 'Luister' wordt elke volgende kaart vanzelf voorgelezen.
  stopReading();
  if (tts.auto && !S.muted) {
    const at = S.card;
    setTimeout(() => {
      if (S.phase === 'reflect' && S.card === at && !reflEl.hidden) readCard(q('.r-listen'));
    }, 600);
  }

  // VR: dezelfde kaart op een paneel, met vorige/volgende.
  const dir = langDir(S.lang);
  const tr = (e) => pair(e, S.lang)[1];
  const moodColor = { calm: '#3fbf73', tense: '#f2a900', escalated: '#e5483a' }[o.mood];
  const sec = [
    { text: `${pair(o.moodLabel, S.lang)[0].toUpperCase()} · ${n + 1}/${cards.length}`, size: 28, weight: 700, head: true, color: moodColor, gap: 0 },
    { text: pair(o.title, S.lang)[0], size: 56, weight: 800, head: true, color: '#ffffff', gap: 4 },
    { text: pair(c.head, S.lang)[0], size: 34, weight: 700, head: true, color: '#f2c500', gap: 26 },
    { text: c.body.nl, size: 40, weight: 700, gap: 8 },
  ];
  if (tr(c.body)) sec.push({ text: tr(c.body), size: 28, color: '#aab3ae', gap: 8, dir });
  if (c.quote) {
    sec.push({ text: pair(UI.sayIt, S.lang)[0], size: 28, color: '#5fd48b', gap: 22 });
    sec.push({ text: `“${c.quote.nl}”`, size: 40, weight: 700, color: '#d9ffe6', gap: 4 });
    if (tr(c.quote)) sec.push({ text: tr(c.quote), size: 28, color: '#aab3ae', gap: 6, dir });
  }
  if (all) sec.push({ text: pair(UI.allTried, S.lang)[0], size: 30, color: '#5fd48b', gap: 22 });
  const buttons = c.last
    ? [
        { label: pair(UI.retry, S.lang)[0], primary: true, onSelect: retry },
        { label: pair(UI.restart, S.lang)[0], onSelect: restart },
      ]
    : [{ label: `${pair(UI.next, S.lang)[0]}  →`, primary: true, onSelect: () => stepCard(1) }];
  if (n > 0) buttons.unshift({ label: `←  ${pair(UI.back, S.lang)[0]}`, onSelect: () => stepCard(-1) });
  if (ttsVoice('nl')) buttons.push({ label: pair(UI.listen, S.lang)[0], onSelect: () => readCard(q('.r-listen')) });
  vrui.showReflection(sec, buttons, moodColor, dir);
}

function stepCard(d) {
  if (S.phase !== 'reflect') return;
  const max = reflectionCards(S.outcome).length - 1;
  S.card = Math.max(0, Math.min(max, (S.card || 0) + d));
  renderReflection();
}

function hideReflection() {
  stopReading();
  reflEl.hidden = true;
  vrui.clearPanel();
}

// Overgang bij terugspoelen: kort naar zwart (scherm én VR), dan pas alles terugzetten. Zo
// springt er niets zichtbaar en zie je met pictogram en tekst dat de tijd terug is gezet.
let veilEl = null;
let veilMesh = null;
function setupVeil() {
  veilEl = document.createElement('div');
  veilEl.className = 'veil';
  veilEl.setAttribute('aria-hidden', 'true');
  veilEl.innerHTML = `<div class="veil-msg"><span class="ic">${ICONS.retry}</span><span class="veil-txt"><span class="veil-nl"></span><span class="veil-tr"></span></span></div>`;
  document.body.appendChild(veilEl);
  veilMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  );
  veilMesh.position.z = -0.12;
  veilMesh.renderOrder = 9999;
  veilMesh.visible = false;
  veilMesh.frustumCulled = false;
  camera.add(veilMesh);
}
const VEIL_S = 0.35;
async function veil(on, msg = null) {
  if (!veilEl) return;
  const msgEl = veilEl.querySelector('.veil-msg');
  msgEl.hidden = !msg;
  if (msg) {
    const [nl, tr] = pair(msg, S.lang);
    veilEl.querySelector('.veil-nl').textContent = nl;
    setTr(veilEl.querySelector('.veil-tr'), tr);
  }
  veilEl.classList.toggle('on', on);
  const from = veilMesh.material.opacity;
  const to = on ? 1 : 0;
  veilMesh.visible = true;
  const t0 = performance.now();
  await new Promise((res) => {
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (VEIL_S * 1000));
      veilMesh.material.opacity = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else res();
    };
    step();
  });
  if (!on) veilMesh.visible = false;
}

function rewindToChoice(holdMsg) {
  run(async (id) => {
    await veil(true, holdMsg);
    guard(id);
    stopVoice();
    hideSub();
    scn.reset('choice');
    setPhase('branch');
    snapLook();
    await waitReal(holdMsg ? 0.6 : 0.1);
    guard(id);
    veil(false);
    await wait(0.3);
    guard(id);
    goChoice();
  });
}

function retry() {
  hideReflection();
  rewindToChoice(T.UI.rewind);
}

function restart() {
  hideReflection();
  hideChoice();
  run(async (id) => {
    if (S.phase !== 'title' && S.phase !== 'loading') {
      await veil(true);
      guard(id);
      stopVoice();
    }
    const p = scn.intro(id); // zet de beginstand meteen (vóór het eerste wachten)
    snapLook();
    veil(false);
    await p;
  });
}

function skipIntro() {
  rewindToChoice(null);
}

// ------------------------------------------------------------------
// Taal en statische teksten
// ------------------------------------------------------------------
function renderStatic() {
  const L = S.lang;
  document.documentElement.lang = 'nl';
  for (const el of document.querySelectorAll('[data-t]')) {
    const [nl, other] = pair(T.UI[el.dataset.t], L);
    const nlEl = el.querySelector('.t-nl') || el;
    nlEl.textContent = nl;
    const trEl = el.querySelector('.t-tr');
    if (trEl) setTr(trEl, other);
  }
  for (const sel of document.querySelectorAll('select.lang')) sel.value = L;
  for (const el of document.querySelectorAll('[data-icon]')) {
    if (!el.firstChild) el.innerHTML = ICONS[el.dataset.icon] || '';
  }
}

function setLang(code) {
  S.lang = code;
  try {
    localStorage.setItem('bg-lang', code);
  } catch (e) {
    /* geen opslag */
  }
  renderStatic();
  labelReadBtns();
  if (S.sub) renderSub();
  if (S.phase === 'choice') renderChoice();
  if (S.phase === 'reflect') renderReflection();
}

function fillLangSelects() {
  for (const sel of document.querySelectorAll('select.lang')) {
    sel.replaceChildren(
      ...LANGS.map((l) => {
        const o = document.createElement('option');
        o.value = l.code;
        o.textContent = l.label;
        return o;
      }),
    );
    sel.value = S.lang;
    sel.addEventListener('change', () => setLang(sel.value));
  }
}

// ------------------------------------------------------------------
// Start, VR, knoppen
// ------------------------------------------------------------------
let selfOut = null;
let audioPrefetch = null;

async function ensureAudio() {
  if (!audio.ready) {
    if (!audio.init()) return;
    selfOut = audio.selfOut();
    scn.setupAudio();
  }
  await audio.resume();
  if (audioPrefetch) await audioPrefetch;
  await audio.decodeAll();
  audio.setMuted(S.muted);
}

async function startDesktop() {
  stopReading();
  $('#start').hidden = true;
  await ensureAudio();
  showDragHint();
  run(scn.intro);
}

async function startVR() {
  if (!navigator.xr) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await ensureAudio();
    await renderer.xr.setSession(session);
    $('#start').hidden = true;
    if (S.phase === 'title' || S.phase === 'loading') run(scn.intro);
  } catch (e) {
    console.warn('VR kon niet starten', e);
    $('#vr-note').hidden = false;
  }
}

// Zittende oefening in VR: het hoofd op zithoogte zetten, of je nu staat of zit.
let vrLift = 0;
let vrMeasure = 0;
renderer.xr.addEventListener('sessionstart', () => {
  // Kijkrichting van de speler overnemen als basisrichting.
  rig.rotation.y = look.yaw;
  vrLift = 0;
  vrMeasure = scn.seatedVR ? 3 : 0; // na een paar beelden is de hoofdpositie bekend
  if (S.sub) renderSub();
  if (S.phase === 'choice') renderChoice();
  if (S.phase === 'reflect') renderReflection();
});
renderer.xr.addEventListener('sessionend', () => {
  rig.rotation.set(0, 0, 0);
  vrLift = 0;
  rig.position.y = 0;
  camera.position.set(0, eye, 0);
  vrui.clearPanel();
  vrui.hideSubtitle();
  onResize();
});

function showDragHint() {
  const h = $('#hint');
  h.hidden = false;
  setTimeout(() => h.classList.add('fade'), 4500);
  setTimeout(() => (h.hidden = true), 5600);
}

function bindUI() {
  fillLangSelects();
  renderStatic();
  setupReadButtons();
  setupVeil();
  $('#btn-start').addEventListener('click', startDesktop);
  $('#btn-vr').addEventListener('click', startVR);
  $('#btn-retry').addEventListener('click', retry);
  $('#btn-restart').addEventListener('click', restart);
  $('#r-next').addEventListener('click', () => stepCard(1));
  $('#r-back').addEventListener('click', () => stepCard(-1));
  $('#skip').addEventListener('click', skipIntro);
  $('#tb-restart').addEventListener('click', () => {
    if (S.phase === 'title' || S.phase === 'loading') return;
    restart();
  });
  $('#tb-mute').addEventListener('click', () => {
    S.muted = !S.muted;
    audio.setMuted(S.muted);
    if (S.muted) stopReading();
    $('#tb-mute').setAttribute('aria-pressed', String(S.muted));
  });
  $('#tb-fs').addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  window.addEventListener('keydown', (e) => {
    if (S.phase === 'reflect' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      stepCard(e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (S.phase !== 'choice') return;
    const k = { 1: 'A', 2: 'B', 3: 'C', a: 'A', b: 'B', c: 'C' }[e.key.toLowerCase()];
    if (k) pick(k);
  });

  // Rondkijken door te slepen (muis, touch, pen).
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    look.uYaw = THREE.MathUtils.clamp(look.uYaw + dx * 0.0042, -1.7, 1.7);
    look.uPitch = THREE.MathUtils.clamp(look.uPitch + dy * 0.0042, -0.7, 0.7);
    look.lastUser = simT;
  });
  const end = () => (drag = null);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('visibilitychange', () => {
    if (!audio.ready) return;
    if (document.hidden) audio.ctx.suspend();
    else audio.ctx.resume();
  });
}

async function checkVR() {
  const btn = $('#btn-vr');
  let ok = false;
  try {
    ok = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
  } catch (e) {
    ok = false;
  }
  btn.disabled = !ok;
  if (!ok) btn.title = pair(T.UI.noVr, 'nl')[0];
  $('#vr-note').hidden = ok;
}

// ------------------------------------------------------------------
// Animatielus
// ------------------------------------------------------------------
let last = performance.now();
const camPos = new THREE.Vector3();
const camFwd = new THREE.Vector3();
const camUp = new THREE.Vector3();

function onResize() {
  if (renderer.xr.isPresenting) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

function updatePlayer(dt) {
  let moving = false;
  if (player.path.length) {
    const t = player.path[0];
    const dx = t.x - rig.position.x;
    const dz = t.z - rig.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.03) {
      player.path.shift();
      if (!player.path.length) playerStop();
    } else {
      const s = Math.min(d, player.speed * dt);
      rig.position.x += (dx / d) * s;
      rig.position.z += (dz / d) * s;
      moving = true;
    }
  }
  player.moving += ((moving ? 1 : 0) - player.moving) * (1 - Math.exp(-10 * dt));
  if (moving) player.phase += dt * player.speed * 4.4;
  const sgn = Math.sign(Math.sin(player.phase));
  if (moving && sgn !== player.lastSign && audio.ready) audio.step(0.2);
  player.lastSign = sgn;
}

function updateCamera(dt) {
  if (renderer.xr.isPresenting) return;
  const [dy, dp] = desiredLook();
  // Geen zwiepen: de geleide blik draait hooguit 120°/s (in een tak 65°/s), zodat het
  // aanvoelt als je eigen hoofd dat omkijkt en niet als een camera die wegschiet.
  const vmax = ((S.phase === 'branch' ? 65 : 120) * Math.PI) / 180;
  const k = 1 - Math.exp(-look.rate * dt);
  const lim = vmax * dt;
  look.yaw += THREE.MathUtils.clamp(shortAngle(dy - look.yaw) * k, -lim, lim);
  look.pitch += THREE.MathUtils.clamp((dp - look.pitch) * k, -lim, lim);
  if (simT - look.lastUser > 2.4) {
    look.uYaw *= Math.exp(-1.6 * dt);
    look.uPitch *= Math.exp(-1.6 * dt);
  }
  // Beeldhoek: tijdelijk groter als het keuzekader dat vraagt, daarna rustig terug.
  const fovT = look.dirFn && look.fovWant ? Math.max(baseFov(), look.fovWant) : baseFov();
  if (Math.abs(camera.fov - fovT) > 0.05) {
    camera.fov += (fovT - camera.fov) * (1 - Math.exp(-2.5 * dt));
    camera.updateProjectionMatrix();
  }
  look.shake *= Math.exp(-5 * dt);
  const sh = look.shake;
  const bobA = reduceMotion ? 0 : player.moving;
  const bobY = Math.sin(player.phase * 2) * 0.022 * bobA;
  const bobR = Math.sin(player.phase) * 0.006 * bobA;
  // Lichte ademhaling van de speler als die stilstaat.
  const still = 1 - player.moving;
  const breathY = reduceMotion ? 0 : Math.sin(simT * 1.45) * 0.006 * still;
  camera.position.set(0, eye + bobY + breathY - crouch, 0);
  camera.rotation.set(
    look.pitch + look.uPitch + (Math.random() - 0.5) * sh + (reduceMotion ? 0 : Math.sin(simT * 1.45 + 0.6) * 0.0035 * still),
    look.yaw + look.uYaw + (Math.random() - 0.5) * sh,
    bobR + (Math.random() - 0.5) * sh * 0.5,
    'YXZ',
  );
}

function updateAudio(dt) {
  if (!audio.ready) return;
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camFwd);
  camUp.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  audio.updateListener(camPos, camFwd, camUp);
  scn.updateAudio(dt, camPos);
}

// Automatisch de resolutie verlagen als het apparaat het niet bijhoudt (niet in VR).
const perf = { t: 0, frames: 0, ratio: Math.min(window.devicePixelRatio || 1, 2) };
function adaptResolution(rawDt) {
  if (renderer.xr.isPresenting || S.phase === 'loading') return;
  perf.t += rawDt;
  perf.frames++;
  if (perf.t < 2.5) return;
  const fps = perf.frames / perf.t;
  perf.t = 0;
  perf.frames = 0;
  if (fps < 38 && perf.ratio > 0.75) perf.ratio = Math.max(0.75, perf.ratio - 0.25);
  else if (fps > 58 && perf.ratio < Math.min(window.devicePixelRatio || 1, 2)) perf.ratio = Math.min(Math.min(window.devicePixelRatio || 1, 2), perf.ratio + 0.25);
  else return;
  renderer.setPixelRatio(perf.ratio);
  onResize();
}

function loop() {
  const now = performance.now();
  if (!/dtmax/.test(location.search)) adaptResolution(Math.min(1, (now - last) / 1000));
  const dt = window.__simFreeze ? 0 : Math.min(DT_MAX, (now - last) / 1000);
  last = now;
  simT += dt;

  for (let i = waits.length - 1; i >= 0; i--) {
    if (waits[i].at <= simT) {
      const w = waits[i];
      waits.splice(i, 1);
      w.res();
    }
  }
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (simT - tw.t0) / tw.dur);
    tw.fn(k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.res();
    }
  }
  for (let i = untils.length - 1; i >= 0; i--) {
    if (untils[i].fn()) {
      const u = untils[i];
      untils.splice(i, 1);
      u.res();
    }
  }

  if (S.freezeAt && simT >= S.freezeAt) {
    S.freezeAt = 0;
    if (S.phase === 'choice') S.worldScaleTarget = 0.12;
  }
  S.worldScale += (S.worldScaleTarget - S.worldScale) * (1 - Math.exp(-4 * dt));
  const wdt = dt * S.worldScale;
  renderer.toneMappingExposure += (S.exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-3 * dt));

  if (renderer.xr.isPresenting) {
    if (vrMeasure && --vrMeasure === 0) {
      camera.getWorldPosition(camPos);
      vrLift = eye - (camPos.y - rig.position.y);
    }
    rig.position.y = vrLift;
  }
  updatePlayer(dt);
  updateTunnel();
  scn.update(dt, wdt);
  updateCamera(dt);
  scn.lateUpdate?.(dt, wdt);
  updateAudio(dt);
  vrui.update(dt);
  tickKaraoke();
  renderer.render(scene, camera);
}

// Prestaties (tablet, VR): kleine voorwerpen (kopjes, bestek, flesjes, borden, etiketten)
// werpen geen schaduw; hun schaduw is onzichtbaar klein maar kost elk een extra draw call in de
// schaduwpass. Op telefoon/tablet en in VR een kleinere, goedkopere schaduwkaart.
const LOW_END = /Android|iPhone|iPad|Mobile|Quest|OculusBrowser/i.test(navigator.userAgent || '');
function lightenShadows() {
  let culled = 0;
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  scene.traverse((n) => {
    if (!n.isMesh || n.isSkinnedMesh || !n.castShadow || !n.geometry) return;
    box.setFromObject(n).getSize(size);
    if (Math.max(size.x, size.y, size.z) < 0.3) {
      n.castShadow = false;
      culled++;
    }
  });
  const lowQ = () => {
    renderer.shadowMap.type = THREE.PCFShadowMap;
    scene.traverse((n) => {
      if (n.isLight && n.castShadow && n.shadow.mapSize.x > 1024) {
        n.shadow.mapSize.set(1024, 1024);
        n.shadow.map?.dispose();
        n.shadow.map = null;
      }
    });
  };
  if (LOW_END) lowQ();
  renderer.xr.addEventListener('sessionstart', lowQ);
  S.shadowCulled = culled;
}

// ------------------------------------------------------------------
// Opstarten
// ------------------------------------------------------------------
// scenario: {
//   texts: { UI, LINES, CHOICES, OUTCOMES }, choiceIcon, subColors, lineEmo,
//   lipsync: url, audioDir: map met stemopnames, eye: ooghoogte (m), seatedVR: speler zit,
//   person(who), build(), reset(state), intro(id), onChoice(), branch(id, key),
//   update(dt, wdt), lateUpdate(dt, wdt): na de camera (dingen die aan de speler vastzitten),
//   setupAudio(), updateAudio(dt, camPos), debug: extra testhaken }
export async function start(scenario) {
  scn = scenario;
  T = scenario.texts;
  eye = scenario.eye ?? 1.65;
  camera.position.set(0, eye, 0);
  window.__sim = Object.defineProperties(
    { S, pick, skipIntro, restart, retry, stepCard, previewChoice, rig, camera, look, vrui, showReflection, readCard, stopReading },
    { simT: { get: () => simT }, ...Object.getOwnPropertyDescriptors(scenario.debug || {}) },
  );

  bindUI();
  onResize();
  const fontsReady = document.fonts
    ? Promise.race([
        Promise.all([
          document.fonts.load('800 40px "Barlow Condensed"'),
          document.fonts.load('700 40px "Barlow Condensed"'),
          document.fonts.load('400 20px "Atkinson Hyperlegible"'),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ])
    : Promise.resolve();
  await fontsReady;
  LIPSYNC = await fetch(scenario.lipsync)
    .then((r) => r.json())
    .catch(() => ({}));
  await scenario.build();
  lightenShadows();
  scenario.reset('start');
  setPhase('title');
  renderer.setAnimationLoop(loop);
  checkVR();

  // Luidheidstabel per opname (tools/loudness.py); zonder tabel klinkt alles zoals opgenomen.
  fetch(`${scenario.audioDir}gain.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((g) => (audio.gains = g || {}))
    .catch(() => (audio.gains = {}));
  const voiceIds = [...Object.keys(T.LINES), 'pA', 'pB', 'pC'];
  audioPrefetch = Promise.all(voiceIds.map((id) => audio.prefetch(id, `${scenario.audioDir}${id}.mp3`)));
  await audioPrefetch;
  const btn = $('#btn-start');
  btn.disabled = false;
  btn.classList.remove('is-loading');
  document.body.classList.add('ready');
}
