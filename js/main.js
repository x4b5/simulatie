import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, LAYOUT, softShadow } from './world.js';
import { Human } from './human.js';
import { Forklift, FORK_TIP } from './forklift.js';
import { AudioEngine } from './audio.js';
import { VRUI } from './vrui.js';
import { LANGS, UI, LINES, CHOICES, OUTCOMES, pair, langDir } from './i18n.js';
import { ICONS, CHOICE_ICON, MOOD_ICON } from './icons.js';

// ------------------------------------------------------------------
// Basis
// ------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const EYE = 1.65;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Alleen voor testen: grotere tijdstap toestaan via ?dtmax=0.2
const DT_MAX = Number(new URLSearchParams(location.search).get('dtmax')) || 0.05;

const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b3036);
scene.fog = new THREE.Fog(0x2b3036, 24, 62);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xe6edf5, 0x4a463f, 0.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xf4f6ff, 1.8);
sun.position.set(7, 19, 6);
sun.target.position.set(1, 0, -7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -21;
sun.shadow.camera.right = 21;
sun.shadow.camera.top = 21;
sun.shadow.camera.bottom = -21;
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 50;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 140);
// Zacht vullicht vanuit de kijkrichting: gezichten blijven leesbaar, ook in de schaduw van de kooi.
const faceFill = new THREE.SpotLight(0xfff1e2, 4.5, 5, 0.6, 1, 2);
faceFill.position.set(0, 0.15, 0);
faceFill.target.position.set(0, 0, -1);
camera.add(faceFill, faceFill.target);
const rig = new THREE.Group();
rig.add(camera);
camera.position.set(0, EYE, 0);
scene.add(rig);

const audio = new AudioEngine();
const vrui = new VRUI(renderer, scene, camera);
vrui.attachControllers(rig);

// ------------------------------------------------------------------
// Toestand
// ------------------------------------------------------------------
const S = {
  phase: 'loading', // loading | title | intro | choice | branch | reflect
  lang: 'nl',
  tried: new Set(),
  sub: null, // { who, key | text }
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

// Belangrijke plekken (zie world.js voor de plattegrond).
const P = {
  start: V(-6.1, 1.8),
  walk1: V(-6.05, -3.0),
  gap: V(-4.75, -4.3),
  stop: V(-0.75, -7.85),
  flStart: V(14.8, -8.0),
  flLane: -8.0,
  exitSide: V(2.3, -6.85),
  stand: V(0.45, -7.4),
  standClose: V(-0.05, -7.55),
  sandraStart: V(-3.0, -19.2),
  sandraStop: V(-0.9, -6.6),
};
P.flStop = V(P.stop.x + 0.85 + FORK_TIP, P.flLane);
const WALKWAY = LAYOUT.walkwayPoint.clone();
const OFFICE = LAYOUT.office.clone();

// ------------------------------------------------------------------
// Sequencer: wachten in simulatietijd, afbreekbaar bij herstart
// ------------------------------------------------------------------
const ABORT = Symbol('abort');
let runId = 0;
let simT = 0;
let waits = [];
let tweens = [];
let untils = [];

function wait(s) {
  return new Promise((res) => waits.push({ at: simT + s, res }));
}
function until(fn) {
  return new Promise((res) => untils.push({ fn, res }));
}
function tween(dur, fn) {
  return new Promise((res) => tweens.push({ t0: simT, dur, fn, res }));
}
function guard(id) {
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
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// ------------------------------------------------------------------
// Camera / speler
// ------------------------------------------------------------------
const look = { yaw: 0, pitch: 0, fn: null, fYaw: 0, fPitch: 0, rate: 4, uYaw: 0, uPitch: 0, lastUser: -99, shake: 0 };
const player = { path: [], speed: 1.35, phase: 0, moving: 0, lastSign: 0, arrive: null };
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
function lookAtFn(fn, rate = 4) {
  look.fn = fn;
  look.rate = rate;
}
function lookDir(yaw, pitch, rate = 3) {
  look.fn = null;
  look.fYaw = yaw;
  look.fPitch = pitch;
  look.rate = rate;
}
function snapLook() {
  const [y, p] = desiredLook();
  look.yaw = y;
  look.pitch = p;
}
function desiredLook() {
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
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-rate * dt));
}
function playerWalk(points, speed = 1.35) {
  player.path = points.map((p) => p.clone());
  player.speed = speed;
  return new Promise((r) => (player.arrive = r));
}
function playerStop() {
  player.path = [];
  if (player.arrive) {
    const r = player.arrive;
    player.arrive = null;
    r();
  }
}
function pathRemaining() {
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
function flinch(delta, dur = 0.4, duck = true) {
  const from = rig.position.clone();
  const to = from.clone().add(delta);
  tween(dur, (k) => {
    const e = 1 - Math.pow(1 - k, 3);
    rig.position.lerpVectors(from, to, e);
    if (duck && !reduceMotion) crouch = Math.sin(k * Math.PI) * 0.09;
  }).then(() => (crouch = 0));
}

function shake(a) {
  if (!reduceMotion) look.shake = Math.max(look.shake, a);
}

const playerHead = (v) => camera.getWorldPosition(v);
const playerChest = (v) => camera.getWorldPosition(v).add(tmp2.set(0, -0.4, 0));

// ------------------------------------------------------------------
// Wereld en personages
// ------------------------------------------------------------------
let fl;
let bgTruck;
let marco;
let sandra;
let npc;
let parked;

let worldGroup = null;
let npc2;
let npc3;
const blobs = [];

async function makeCast() {
  worldGroup = buildWorld(scene, renderer);

  fl = new Forklift({ number: '07' });
  scene.add(fl.root);

  bgTruck = new Forklift({ number: '03' });
  scene.add(bgTruck.root);
  const load = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.0, 1.1), new THREE.MeshStandardMaterial({ color: 0xc99a63, roughness: 0.9 }));
  load.position.set(0, 0.95, 0.75);
  load.castShadow = true;
  bgTruck.mast.add(load);
  bgTruck.mast.position.y += 0.4;

  parked = new Forklift({ number: '11', spot: false, beacon: false, color: 0xd99a00 });
  parked.root.position.set(9.0, 0, -18.3);
  parked.root.rotation.y = Math.PI * 0.62;
  parked.on = false;
  scene.add(parked.root);

  // Realistische personages (Microsoft Rocketbox, MIT-licentie).
  [marco, sandra, npc] = await Promise.all([
    Human.load({ model: 'models/marco.fbx', code: 'm108', anims: 'models/anim_m' }),
    Human.load({ model: 'models/sandra.fbx', code: 'f101', anims: 'models/anim_f' }),
    Human.load({ model: 'models/collega.fbx', code: 'm107', anims: 'models/anim_m' }),
  ]);
  scene.add(marco.root, sandra.root, npc.root);

  // Meer leven in de hal: een orderpicker bij de stelling en een collega bij de docks.
  [npc2, npc3] = await Promise.all([
    Human.load({ model: 'models/collega2.fbx', code: 'm102', anims: 'models/anim_m' }),
    Human.load({ model: 'models/collega3.fbx', code: 'm105', anims: 'models/anim_m' }),
  ]);
  npc2.root.position.set(-6.75, 0, -12.2);
  npc2.root.rotation.y = -Math.PI / 2;
  npc2.playForced('lookAround', 0.8, true);
  npc3.root.position.set(-5.6, 0, -19.4);
  npc3.root.rotation.y = Math.PI * 0.85;
  npc3.playForced('talkNeutral', 1, true);
  scene.add(npc2.root, npc3.root);

  // Zachte contactschaduwen onder personen en heftrucks.
  for (const p of [marco, sandra, npc, npc2, npc3]) {
    const b = softShadow(0.95, 0.95, 0.5, true);
    scene.add(b);
    blobs.push({ p, b });
  }
  for (const t of [fl, bgTruck, parked]) {
    const b = softShadow(1.7, 2.9, 0.55, false);
    b.position.set(0, 0.006, -0.05);
    b.rotation.x = -Math.PI / 2;
    t.root.add(b);
  }
  npc.root.position.set(-9, 0, -20.9);
  npcLoop();

  bgTruck.root.position.set(11.8, 0, 7);
  bgTruck.root.rotation.y = Math.PI;
  bgLoop();
}

async function npcLoop() {
  // Collega in de verte die heen en weer loopt langs de docks.
  for (;;) {
    await npc.walkTo([[6.5, -20.9]], 1.15);
    npc.faceTowards(6.5, -24);
    await waitReal(3.5);
    await npc.walkTo([[-9, -20.9]], 1.15);
    npc.faceTowards(-9, -24);
    await waitReal(4.5);
  }
}

async function bgLoop() {
  // Tweede heftruck in de gang achter de stellingen.
  for (;;) {
    await bgTruck.driveTo(11.8, -2, { maxSpeed: 2.2, accel: 0.9, decel: 1.2 });
    await waitReal(2.5);
    await bgTruck.driveTo(11.8, 7, { maxSpeed: 1.4, accel: 0.7, decel: 1.0 });
    await waitReal(3.0);
  }
}

// Wachten in echte tijd voor achtergrondanimaties (los van de sequencer).
function waitReal(s) {
  return new Promise((r) => setTimeout(r, s * 1000));
}

function seatMarco() {
  fl.seatAnchor.add(marco.root);
  marco.cancelWalk();
  marco.root.position.set(0, 0, 0);
  marco.root.rotation.set(0, 0, 0);
  marco.seat = 1;
  marco.setHands('wheel');
  marco.setAim('l', null);
  marco.setAim('r', null);
  marco.lookTarget = null;
  marco.faceYaw = null;
}

function resetScene(state) {
  stopVoice();
  hideSub();
  playerStop();
  marco.cancelWalk();
  sandra.cancelWalk();
  fl.cancelDrive();
  fl.setSpeedInstant(0);
  look.uYaw = 0;
  look.uPitch = 0;
  S.outcome = null;
  sandra.root.visible = false;
  sandra.root.position.copy(P.sandraStart);
  sandra.setAim('r', null);
  sandra.setHands('clipboard');
  sandra.angerTarget = 0.15;
  sandra.lookTarget = null;
  fl.on = true;
  [marco, sandra].forEach((p) => {
    p.clearForced();
    p.lockYaw = false;
    p.talk = null;
    p.stopSpeaking();
    p.pant = 0;
  });
  fl.root.rotation.y = -Math.PI / 2;
  if (state === 'start') {
    rig.position.copy(P.start);
    fl.root.position.copy(P.flStart);
    seatMarco();
    marco.anger = marco.angerTarget = 0.05;
    lookDir(yawTo(P.start, P.walk1), -0.08);
    snapLook();
  } else if (state === 'choice') {
    rig.position.copy(P.stop);
    fl.root.position.copy(P.flStop);
    if (marco.root.parent !== scene) scene.add(marco.root);
    marco.root.position.copy(P.stand);
    marco.root.rotation.set(0, Math.atan2(P.stop.x - P.stand.x, P.stop.z - P.stand.z), 0);
    marco.seat = 0;
    marco.anger = marco.angerTarget = 0.9;
    marco.setHands('angry');
    marco.setAim('l', null);
    marco.setAim('r', null);
    marco.lookTarget = playerHead;
    lookAtFn(marcoHead, 5);
    snapLook();
  }
}

const marcoHead = (v) => marco.headWorld(v);
const sandraHead = (v) => sandra.headWorld(v);

// ------------------------------------------------------------------
// Spreken en ondertitels
// ------------------------------------------------------------------
let voice = null;

function stopVoice() {
  if (voice) voice.stop();
  voice = null;
}

function fakeTalk() {
  return () => (Math.sin(simT * 17) * 0.5 + 0.5) * 0.08 + 0.02;
}

// Emotie per regel: stuurt mond, kaak en gezicht tijdens het praten.
const LINE_EMO = {
  m1: { shout: 1 },
  m2: { shout: 0.55 },
  m3: { shout: 0.15, worry: 0.5 },
  a1: { worry: 0.3 },
  a2: { smile: 0.2 },
  b1: { sarcasm: 1, shout: 0.3 },
  b2: { shout: 0.35 },
  c1: { shout: 1 },
  c2: { shout: 0.45 },
  s1: { shout: 0.45 },
};
let LIPSYNC = {};

async function say(id, key, cues = []) {
  const line = LINES[key];
  const person = line.who === 'sandra' ? sandra : marco;
  // Eerst zichtbaar inademen, dan pas spreken.
  person.inhale(0.32);
  await wait(0.22);
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
  if (track) person.speak(track, clock, LINE_EMO[key], level);
  else person.talk = live ? () => audio.features(v.analyser) : fakeTalk();
  S.subClock = clock;
  for (const [t, fn] of cues) {
    wait(t).then(() => {
      if (id === runId) fn();
    });
  }
  await wait(dur + 0.15);
  person.stopSpeaking();
  person.talk = null;
  guard(id);
  if (S.sub && S.sub.key === key) hideSub();
}

// Punt vlak voor iemand op heuphoogte: doel voor een hakgebaar.
function chopPoint(p) {
  const f = new THREE.Vector3(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
  return p.root.position.clone().addScaledVector(f, 0.7).setY(0.75);
}

// De speler zegt het gekozen antwoord hardop (eigen stem: dichtbij, niet ruimtelijk).
async function playerSays(id, key) {
  showSub({ who: 'you', choice: key });
  stopVoice();
  voice = audio.ready && selfOut ? audio.voice(`p${key}`, selfOut) : null;
  const words = CHOICES[key].nl.split(/\s+/).length;
  const dur = voice ? voice.duration + 0.35 : Math.max(2.4, words * 0.42 + 0.6);
  await wait(dur);
  guard(id);
  hideSub();
}

const subEl = $('#subs');
function speakerLabel(who) {
  return pair(UI[who], S.lang);
}
function showSub(sub) {
  S.sub = sub;
  renderSub();
}
function hideSub() {
  S.sub = null;
  S.subClock = null;
  subEl.hidden = true;
  vrui.hideSubtitle();
}
function renderSub() {
  const sub = S.sub;
  if (!sub) return;
  const entry = sub.key ? LINES[sub.key].text : CHOICES[sub.choice];
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
        if (/[.!?…]["”]?$/.test(w)) sent++;
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
    const nlS = sentences(nl);
    const trS = other ? sentences(other) : [];
    subParts = { nl: nlS, tr: trS.length === nlS.length ? trS : null, other, who: sub.who, whoNl };
    showSentence(0);
  } else {
    subParts = null;
    vrui.showSubtitle(whoNl, SUB_COLORS[sub.who], nl, other, langDir(S.lang));
  }
}

const SUB_COLORS = { marco: '#f2c500', sandra: '#ff8a3d', you: '#5fd48b' };
let subParts = null;
let subSentence = -1;
function sentences(text) {
  return (text.match(/[^.!?…؟]+[.!?…؟]+["”»]?\s*|[^.!?…؟]+$/g) || [text]).map((t) => t.trim()).filter(Boolean);
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
  vrui.showSubtitle(subParts.whoNl, SUB_COLORS[subParts.who], nlText, tr, langDir(S.lang));
}

// ------------------------------------------------------------------
// Heftruck in- en uitstappen
// ------------------------------------------------------------------
// Punt in het assenstelsel van de heftruck (x = linkerzijde, z = vooruit) naar de wereld.
function flLocal(x, y, z) {
  fl.root.updateMatrixWorld(true);
  return fl.root.localToWorld(new THREE.Vector3(x, y, z));
}

// Realistisch uitstappen: motor uit, zijwaarts draaien, opstaan met de hand aan de stijl
// van de kooi, via de treeplank naar beneden (driepuntscontact).
async function exitForklift(id) {
  const m = marco;
  m.lockYaw = true;
  // 1. Contactsleutel om: hand naar het dashboard, motor en zwaailamp uit.
  m.jab('r', flLocal(0.22, 1.05, 0.38), 0.7);
  await wait(0.45);
  guard(id);
  fl.on = false;
  if (audio.ready) audio.clank(fl.panner, 0, 900);
  await wait(0.35);
  guard(id);

  // Overstappen van stoel-houding (met offset) naar wortel op "stoelvloer"-hoogte.
  const seatFloor = flLocal(0, 0.4, -0.33);
  scene.attach(m.root);
  m.root.position.copy(seatFloor);
  m.root.rotation.set(0, fl.root.rotation.y, 0);
  m.seat = 0;
  m.playForced('sit', 1, true);

  // 2. Zijwaarts draaien op de stoel, richting de treeplank.
  const yawSeat = fl.root.rotation.y;
  const yawOut = yawSeat + Math.PI / 2;
  const swivelTo = flLocal(0.16, 0.4, -0.3);
  await tween(0.75, (k) => {
    const e = ease(k);
    m.root.rotation.y = yawSeat + (yawOut - yawSeat) * e;
    m.root.position.lerpVectors(seatFloor, swivelTo, e);
  });
  guard(id);

  // 3. Opstaan (motion capture) met de rechterhand aan de voorste stijl.
  const post = flLocal(0.5, 1.55, 0.5);
  m.setAim('r', post);
  const step = flLocal(0.62, 0.345, 0.18);
  const upDur = m.playForced('standUp', 1.25);
  await tween(upDur * 0.92, (k) => {
    const e = ease(Math.min(1, k * 1.15));
    m.root.position.lerpVectors(swivelTo, step, e);
  });
  guard(id);

  // 4. Van de treeplank naar de grond.
  const ground = flLocal(1.15, 0, 0.1);
  m.playForced('walk', 0.7, true);
  await tween(0.75, (k) => {
    const e = ease(k);
    m.root.position.lerpVectors(step, ground, e);
    m.root.position.y = step.y * (1 - e) + Math.sin(e * Math.PI) * 0.05;
    if (k > 0.55) m.setAim('r', null);
  });
  guard(id);
  m.setAim('r', null);
  m.clearForced();
  m.lockYaw = false;
}

// Instappen in omgekeerde volgorde: opstappen met de hand aan de stijl, draaien, gaan zitten, motor aan.
async function enterForklift(id) {
  const m = marco;
  m.lookTarget = null;
  m.lockYaw = true;
  const ground = flLocal(1.15, 0, 0.1);
  const step = flLocal(0.62, 0.345, 0.18);
  const seatFloor = flLocal(0, 0.4, -0.33);
  // Naar de treeplank toe draaien.
  const yawIn = fl.root.rotation.y - Math.PI / 2;
  const yaw0 = m.root.rotation.y;
  const from = m.root.position.clone();
  await tween(0.45, (k) => {
    const e = ease(k);
    m.root.rotation.y = yaw0 + shortAngle(yawIn - yaw0) * e;
    m.root.position.lerpVectors(from, ground, e);
  });
  guard(id);
  // Opstappen met de linkerhand aan de voorste stijl.
  m.setAim('l', flLocal(0.5, 1.55, 0.5));
  m.playForced('walk', 0.7, true);
  await tween(0.7, (k) => {
    const e = ease(k);
    m.root.position.lerpVectors(ground, step, e);
    m.root.position.y = step.y * e + Math.sin(e * Math.PI) * 0.08;
  });
  guard(id);
  // Omdraaien en gaan zitten (motion capture).
  const sitDur = m.playForced('sitDown', 1.3);
  const yawSeat = fl.root.rotation.y;
  await tween(sitDur * 0.9, (k) => {
    const e = ease(Math.min(1, k * 1.25));
    m.root.rotation.y = yawIn + shortAngle(yawSeat - yawIn) * e;
    m.root.position.lerpVectors(step, seatFloor, e);
    if (k > 0.35) m.setAim('l', null);
  });
  guard(id);
  m.clearForced();
  m.lockYaw = false;
  seatMarco();
  // Motor aan.
  m.jab('r', flLocal(0.22, 1.05, 0.38), 0.6);
  await wait(0.4);
  guard(id);
  fl.on = true;
}

function shortAngle(d) {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ------------------------------------------------------------------
// Het scenario
// ------------------------------------------------------------------
async function runIntro(id) {
  resetScene('start');
  setPhase('intro');
  showHud(true);
  if (audio.ready) audio.ambience();
  await wait(1.0);
  guard(id);

  playerWalk([P.walk1, P.gap, P.stop], 1.35);
  // Op weg naar de opening in het hek: blik naar beneden, op de scanner.
  until(() => rig.position.distanceTo(P.walk1) < 0.35).then(() => {
    if (id === runId) lookDir(yawTo(P.gap, P.stop), -0.5, 2.2);
  });

  // Heftruck start op het juiste moment uit de dwarsgang.
  const flSpeed = 4;
  const travel = P.flStart.x - (P.flStop.x + (flSpeed * flSpeed) / (2 * 3.6));
  await until(() => pathRemaining() <= (travel / flSpeed) * player.speed);
  guard(id);
  fl.setSpeedInstant(flSpeed);
  const drive = fl.driveTo(P.flStop.x, P.flLane, { maxSpeed: flSpeed, accel: 2, decel: 3.6 });

  await until(() => fl.speed < flSpeed - 0.05 || fl.root.position.x <= P.flStop.x + 2.3);
  guard(id);
  if (audio.ready) {
    audio.horn(fl.panner);
    audio.screech(fl.panner, 1.05);
  }
  playerStop();
  showHud(false);
  lookAtFn(marcoHead, 10);
  shake(0.05);
  // Marco schrikt eerst (ziet je pas laat), de speler deinst terug.
  marco.lookTarget = playerHead;
  marco.surprise = 1;
  flinch(V(-0.28, 0.12), 0.35);

  await drive;
  guard(id);
  shake(0.09);
  if (audio.ready) audio.heartbeat(5, 0.9, 0.8);
  marco.angerTarget = 0.95;
  marco.lookTarget = playerHead;
  marco.setHands('angry');
  await wait(0.7);
  guard(id);

  await say(id, 'm1', [
    [0.1, () => marco.setHands('shout')],
    [0.6, () => marco.jab('r', playerChest(new THREE.Vector3()), 0.6)],
  ]);
  await exitForklift(id);
  await marco.walkTo([[P.stand.x, P.stand.z]], 1.6);
  guard(id);
  marco.faceTowards(P.stop.x, P.stop.z);
  marco.setHands('angry');
  lookAtFn(marcoHead, 4);

  await say(id, 'm2', [
    [0.0, () => marco.setHands('armsOut')],
    [2.15, () => {
      marco.setAim('l', WALKWAY);
      marco.lookTarget = WALKWAY;
      lookAtFn(() => tmp.copy(WALKWAY), 2.2);
    }],
    [3.4, () => (marco.lookTarget = playerHead)],
    [4.6, () => lookAtFn(marcoHead, 2.5)],
    [5.15, () => {
      marco.setAim('l', null);
      marco.setHands('shout');
    }],
    [6.35, () => marco.jab('r', chopPoint(marco), 0.5)],
  ]);
  marco.setHands('angry');
  await say(id, 'm3', [
    [0.1, () => marco.setHands('armsOut')],
    [2.45, () => marco.setHands('headHand')],
  ]);
  marco.setHands('angry');
  await wait(0.5);
  guard(id);
  goChoice();
}

function goChoice() {
  setPhase('choice');
  hideSub();
  marco.lookTarget = playerHead;
  marco.setHands('angry');
  // Iets lager kijken, zodat Marco's gezicht boven het keuzepaneel blijft.
  lookAtFn((v) => marco.headWorld(v).add(tmp2.set(0, -0.62, 0)), 2);
  renderChoice();
}

function pick(key) {
  if (S.phase !== 'choice') return;
  S.tried.add(key);
  hideChoice();
  run((id) => runBranch(id, key));
}

async function runBranch(id, key) {
  setPhase('branch');
  lookAtFn(marcoHead, 4);
  marco.lookTarget = playerHead;
  if (key === 'A') await branchA(id);
  else if (key === 'B') await branchB(id);
  else await branchC(id);
  guard(id);
  showReflection(key);
}

async function branchA(id) {
  wait(0.9).then(() => id === runId && marco.react('soften'));
  await playerSays(id, 'A');
  marco.angerTarget = 0.4;
  marco.setHands('relaxed');
  await wait(0.6);
  guard(id);
  await say(id, 'a1', [
    [0.0, () => marco.setHands('calm')],
    [2.1, () => {
      marco.setHands('relaxed');
      marco.angerTarget = 0.12;
    }],
  ]);
  await say(id, 'a2', [
    [0.0, () => marco.setHands('calm')],
    [0.9, () => marco.setAim('l', WALKWAY)],
    [1.85, () => {
      marco.setAim('l', null);
      marco.nod();
    }],
    [3.9, () => marco.setHands('hips')],
  ]);
  marco.angerTarget = 0;
  marco.nod();
  await wait(1.2);
  guard(id);
  marco.setHands('relaxed');
  marco.lookTarget = null;
  await marco.walkTo([[P.exitSide.x, P.exitSide.z]], 1.25);
  guard(id);
  await enterForklift(id);
  lookAtFn(() => fl.root.localToWorld(tmp.set(0, 1.6, 0)), 2);
  fl.driveTo(10.5, P.flLane, { maxSpeed: 1.2, accel: 0.6, decel: 1 });
  await wait(2.6);
  guard(id);
}

async function branchB(id) {
  wait(1.3).then(() => id === runId && marco.react('scoff'));
  await playerSays(id, 'B');
  marco.angerTarget = 0.85;
  await say(id, 'b1', [
    [0.0, () => marco.setHands('armsOut')],
    [1.9, () => marco.jab('r', playerChest(new THREE.Vector3()), 0.8)],
    [3.0, () => marco.setHands('angry')],
  ]);
  let walk = null;
  await say(id, 'b2', [
    [0.0, () => marco.setHands('armsOut')],
    [0.9, () => marco.shake()],
    [4.0, () => marco.jab('r', chopPoint(marco), 0.55)],
    [5.2, () => {
      marco.lookTarget = null;
      marco.setHands('relaxed');
      walk = marco.walkTo([[P.exitSide.x, P.exitSide.z]], 1.45);
    }],
  ]);
  if (walk) await walk;
  guard(id);
  await enterForklift(id);
  lookAtFn(() => fl.root.localToWorld(tmp.set(0, 1.6, 0)), 2);
  fl.driveTo(10.5, P.flLane, { maxSpeed: 2.2, accel: 1.4, decel: 1.6 });
  await wait(2.2);
  guard(id);
}

async function branchC(id) {
  wait(0.7).then(() => id === runId && marco.react('startle'));
  await playerSays(id, 'C');
  marco.angerTarget = 1;
  marco.walkTo([[P.standClose.x, P.standClose.z]], 1.0).then(() => marco.faceTowards(P.stop.x, P.stop.z));
  wait(0.55).then(() => id === runId && flinch(V(-0.22, -0.12), 0.6, false));
  shake(0.04);
  await say(id, 'c1', [
    [0.0, () => marco.setHands('shout')],
    [1.38, () => marco.jab('r', playerChest(new THREE.Vector3()), 0.6)],
    [2.85, () => marco.jab('r', playerChest(new THREE.Vector3()), 0.5)],
    [3.5, () => marco.setHands('armsOut')],
  ]);
  sandra.root.visible = true;
  sandra.root.position.copy(P.sandraStart);
  sandra.lookTarget = marcoHead;
  const sw = sandra.walkTo([[-1.7, -12.0], [P.sandraStop.x, P.sandraStop.z]], 2.1);
  await say(id, 'c2', [
    [1.75, () => marco.setAim('r', OFFICE)],
    [2.6, () => {
      marco.setAim('r', null);
      marco.setHands('angry');
    }],
  ]);
  await sw;
  guard(id);
  sandra.faceTowards((marco.root.position.x + P.stop.x) / 2, (marco.root.position.z + P.stop.z) / 2);
  marco.lookTarget = sandraHead;
  lookAtFn(sandraHead, 4);
  await say(id, 's1', [
    [0.0, () => sandra.setHands('calm')],
    [1.6, () => (sandra.lookTarget = playerHead)],
    [2.9, () => sandra.setHands('firm')],
    [4.3, () => {
      sandra.setAim('r', OFFICE);
      sandra.lookTarget = marcoHead;
    }],
  ]);
  marco.angerTarget = 0.65;
  marco.setHands('crossed');
  marco.walkTo([[P.stand.x, P.stand.z]], 0.7);
  await wait(1.0);
  guard(id);
  sandra.setAim('r', null);
  sandra.setHands('clipboard');
  sandra.lookTarget = null;
  sandra.walkTo([[1.5, -11.5], [8.0, -15.6], [11.2, -16.4]], 1.4);
  await wait(0.7);
  guard(id);
  marco.lookTarget = null;
  marco.setHands('relaxed');
  marco.walkTo([[1.8, -11.0], [7.5, -15.8], [10.6, -16.6]], 1.3);
  lookAtFn(sandraHead, 2);
  await wait(2.4);
  guard(id);
}

// ------------------------------------------------------------------
// UI: fases, keuzes, nabespreking
// ------------------------------------------------------------------
function setPhase(p) {
  S.phase = p;
  document.body.dataset.phase = p;
  const frozen = p === 'choice';
  S.worldScaleTarget = frozen ? 0.12 : 1;
  S.exposureTarget = frozen ? 0.85 : p === 'reflect' ? 0.85 : 1;
  $('#skip').hidden = p !== 'intro';
}

const choiceEl = $('#choice');
function renderChoice() {
  if (S.phase !== 'choice') return;
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
    b.innerHTML = `<span class="opt-pic" aria-hidden="true"><span class="opt-icon ic">${ICONS[CHOICE_ICON[key]]}</span><span class="opt-key">${key}</span></span><span class="opt-body"><span class="opt-nl"></span><span class="opt-tr"></span></span>`;
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

function hideChoice() {
  stopPreview();
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
  const o = OUTCOMES[key];
  return [
    { icon: 'eye', head: UI.what, body: o.what },
    { icon: 'bulb', head: UI.why, body: o.why },
    { icon: 'tip', head: UI.tip, body: o.tip, quote: o.quote },
    { icon: 'question', head: UI.q, body: o.q, last: true },
  ];
}

function renderReflection() {
  const key = S.outcome;
  if (!key) return;
  const o = OUTCOMES[key];
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
  vrui.showReflection(sec, buttons, moodColor, dir);
}

function stepCard(d) {
  if (S.phase !== 'reflect') return;
  const max = reflectionCards(S.outcome).length - 1;
  S.card = Math.max(0, Math.min(max, (S.card || 0) + d));
  renderReflection();
}

function hideReflection() {
  reflEl.hidden = true;
  vrui.clearPanel();
}

function retry() {
  hideReflection();
  run(async (id) => {
    resetScene('choice');
    setPhase('branch');
    await wait(0.5);
    guard(id);
    goChoice();
  });
}

function restart() {
  hideReflection();
  hideChoice();
  run(runIntro);
}

function skipIntro() {
  run(async (id) => {
    showHud(false);
    resetScene('choice');
    setPhase('branch');
    await wait(0.3);
    guard(id);
    goChoice();
  });
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

// Scanner-scherm tijdens de intro.
const hudEl = $('#hud');
let hudT0 = 0;
function showHud(on) {
  hudEl.hidden = !on;
  hudT0 = performance.now();
}
function tickHud() {
  if (hudEl.hidden) return;
  const left = Math.max(0, 238 - (performance.now() - hudT0) / 1000);
  const m = Math.floor(left / 60);
  const s = Math.floor(left % 60);
  hudEl.querySelector('.hud-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ------------------------------------------------------------------
// Taal en statische teksten
// ------------------------------------------------------------------
function renderStatic() {
  const L = S.lang;
  document.documentElement.lang = 'nl';
  for (const el of document.querySelectorAll('[data-t]')) {
    const [nl, other] = pair(UI[el.dataset.t], L);
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
const VOICE_IDS = [...Object.keys(LINES), 'pA', 'pB', 'pC'];
let selfOut = null;
let audioPrefetch = null;

async function ensureAudio() {
  if (!audio.ready) {
    if (!audio.init()) return;
    setupAudioGraph();
  }
  await audio.resume();
  if (audioPrefetch) await audioPrefetch;
  await audio.decodeAll();
  audio.setMuted(S.muted);
}

function setupAudioGraph() {
  marco.panner = audio.spatial({ ref: 1.4, rolloff: 1.2 });
  sandra.panner = audio.spatial({ ref: 1.4, rolloff: 1.2 });
  fl.panner = audio.spatial({ ref: 2.2, rolloff: 1.0 });
  fl.engineSnd = audio.engine(fl.panner);
  fl.beeperSnd = audio.beeper(fl.panner);
  bgTruck.panner = audio.spatial({ ref: 1.5, rolloff: 1.3 });
  bgTruck.engineSnd = audio.engine(bgTruck.panner);
  bgTruck.beeperSnd = audio.beeper(bgTruck.panner);
  marco.onStep = () => audio.step(0.3, marco.panner);
  marco.breathSnd = audio.breather(marco.panner);
  selfOut = audio.selfOut();
  sandra.breathSnd = audio.breather(sandra.panner);
  sandra.onStep = () => audio.step(0.25, sandra.panner);
  distantPanner = audio.spatial({ ref: 3, rolloff: 1 });
}
let distantPanner = null;
let nextDistant = 6;

async function startDesktop() {
  $('#start').hidden = true;
  await ensureAudio();
  showDragHint();
  run(runIntro);
}

async function startVR() {
  if (!navigator.xr) return;
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    await ensureAudio();
    await renderer.xr.setSession(session);
    $('#start').hidden = true;
    if (S.phase === 'title' || S.phase === 'loading') run(runIntro);
  } catch (e) {
    console.warn('VR kon niet starten', e);
    $('#vr-note').hidden = false;
  }
}

renderer.xr.addEventListener('sessionstart', () => {
  // Kijkrichting van de speler overnemen als basisrichting.
  rig.rotation.y = look.yaw;
  if (S.sub) renderSub();
  if (S.phase === 'choice') renderChoice();
  if (S.phase === 'reflect') renderReflection();
});
renderer.xr.addEventListener('sessionend', () => {
  rig.rotation.set(0, 0, 0);
  camera.position.set(0, EYE, 0);
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
  if (!ok) btn.title = pair(UI.noVr, 'nl')[0];
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
  camera.fov = w / h < 0.8 ? 78 : 68;
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
  look.yaw = angleDamp(look.yaw, dy, look.rate, dt);
  look.pitch += (dp - look.pitch) * (1 - Math.exp(-look.rate * dt));
  if (simT - look.lastUser > 2.4) {
    look.uYaw *= Math.exp(-1.6 * dt);
    look.uPitch *= Math.exp(-1.6 * dt);
  }
  look.shake *= Math.exp(-5 * dt);
  const sh = look.shake;
  const bobA = reduceMotion ? 0 : player.moving;
  const bobY = Math.sin(player.phase * 2) * 0.022 * bobA;
  const bobR = Math.sin(player.phase) * 0.006 * bobA;
  // Lichte ademhaling van de speler als die stilstaat.
  const still = 1 - player.moving;
  const breathY = reduceMotion ? 0 : Math.sin(simT * 1.45) * 0.006 * still;
  camera.position.set(0, EYE + bobY + breathY - crouch, 0);
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
  for (const p of [marco, sandra]) {
    p.headWorld(tmp);
    audio.place(p.panner, tmp);
    // Hoe verder weg, hoe meer galm van de hal (direct geluid vs. reflecties).
    const dist = tmp.distanceTo(camPos);
    audio.setWet(p.panner, THREE.MathUtils.clamp(0.25 + dist * 0.09, 0.25, 0.95));
    // Hoorbaar ademen: inademen voor een zin, hijgen na het schreeuwen.
    p.breathSnd?.set(p.breath * 0.5 + p.pant * (0.55 + 0.45 * Math.sin(p.time * 7.5)), Math.sin(p.time * 7.5) > 0);
  }
  for (const t of [fl, bgTruck]) {
    audio.place(t.panner, t.root.localToWorld(tmp.set(0, 1.0, 0)));
    t.engineSnd.set(t.speed, t.on);
    if (t.speed < -0.05) t.beeperSnd.on();
    else t.beeperSnd.off();
  }
  nextDistant -= dt;
  if (nextDistant < 0 && S.phase !== 'loading') {
    nextDistant = 7 + Math.random() * 9;
    audio.place(distantPanner, tmp.set(-10 + Math.random() * 28, 3, -20 + Math.random() * 26));
    audio.distantEvent(distantPanner);
  }
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

  S.worldScale += (S.worldScaleTarget - S.worldScale) * (1 - Math.exp(-4 * dt));
  const wdt = dt * S.worldScale;
  renderer.toneMappingExposure += (S.exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-3 * dt));

  if (S.phase === 'title') {
    look.fYaw = yawTo(P.start, P.walk1) - 0.35 + Math.sin(simT * 0.11) * 0.55;
    look.fPitch = -0.02;
  }

  updatePlayer(dt);
  fl.update(wdt);
  bgTruck.update(wdt);
  parked.update(wdt);
  marco.update(wdt);
  sandra.update(wdt);
  npc.update(wdt);
  npc2.update(wdt);
  npc3.update(wdt);
  worldGroup?.userData.update?.(dt, simT);
  for (const { p, b } of blobs) {
    const show = p.root.visible && p.root.parent === scene && p.seat < 0.5;
    b.visible = show;
    if (show) b.position.set(p.root.position.x, 0.006, p.root.position.z);
  }
  updateCamera(dt);
  updateAudio(dt);
  vrui.update(dt);
  tickHud();
  tickKaraoke();
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------
// Opstarten
// ------------------------------------------------------------------
async function boot() {
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
  LIPSYNC = await fetch('models/lipsync.json')
    .then((r) => r.json())
    .catch(() => ({}));
  await makeCast();
  resetScene('start');
  setPhase('title');
  renderer.setAnimationLoop(loop);
  checkVR();

  audioPrefetch = Promise.all(VOICE_IDS.map((id) => audio.prefetch(id, `audio/${id}.mp3`)));
  await audioPrefetch;
  const btn = $('#btn-start');
  btn.disabled = false;
  btn.classList.remove('is-loading');
  document.body.classList.add('ready');
}

boot();

// Voor geautomatiseerde tests.
window.__sim = { S, pick, skipIntro, restart, retry, stepCard, previewChoice, rig, camera, look, get fl() { return fl; }, get marco() { return marco; }, get simT() { return simT; } };
