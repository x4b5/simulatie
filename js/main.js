import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld, LAYOUT } from './world.js';
import { Human } from './human.js';
import { Forklift, FORK_TIP } from './forklift.js';
import { AudioEngine } from './audio.js';
import { VRUI } from './vrui.js';
import { LANGS, UI, LINES, CHOICES, OUTCOMES, pair, langDir } from './i18n.js';

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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b3036);
scene.fog = new THREE.Fog(0x2b3036, 24, 62);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xe6edf5, 0x4a463f, 0.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 1.8);
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

async function makeCast() {
  buildWorld(scene, renderer);

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
  a1: { worry: 0.45 },
  a2: { smile: 0.3 },
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

async function playerSays(id, key) {
  showSub({ who: 'you', choice: key });
  const words = CHOICES[key].nl.split(/\s+/).length;
  await wait(Math.max(2.4, words * 0.42 + 0.6));
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
  subEl.querySelector('.nl').textContent = nl;
  const tr = subEl.querySelector('.tr');
  tr.textContent = other || '';
  tr.hidden = !other;
  tr.dir = langDir(S.lang);
  subEl.hidden = false;
  const colors = { marco: '#f2c500', sandra: '#ff8a3d', you: '#5fd48b' };
  vrui.showSubtitle(whoNl, colors[sub.who], nl, other, langDir(S.lang));
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
  await playerSays(id, 'A');
  marco.angerTarget = 0.4;
  marco.setHands('relaxed');
  await wait(0.6);
  guard(id);
  await say(id, 'a1', [
    [0.0, () => marco.setHands('calm')],
    [3.3, () => {
      marco.setHands('relaxed');
      marco.angerTarget = 0.12;
    }],
  ]);
  await say(id, 'a2', [
    [0.0, () => marco.setHands('calm')],
    [0.9, () => marco.setAim('l', WALKWAY)],
    [1.65, () => {
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
  await playerSays(id, 'C');
  marco.angerTarget = 1;
  marco.walkTo([[P.standClose.x, P.standClose.z]], 1.0).then(() => marco.faceTowards(P.stop.x, P.stop.z));
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
  const [sub, subTr] = pair(UI.promptSub, S.lang);
  choiceEl.querySelector('.c-title').textContent = title;
  setTr(choiceEl.querySelector('.c-title-tr'), titleTr);
  choiceEl.querySelector('.c-sub').textContent = sub;
  setTr(choiceEl.querySelector('.c-sub-tr'), subTr);
  const list = choiceEl.querySelector('.c-list');
  list.replaceChildren();
  const items = [];
  for (const key of ['A', 'B', 'C']) {
    const [nl, other] = pair(CHOICES[key], S.lang);
    const b = document.createElement('button');
    b.className = 'opt';
    b.type = 'button';
    b.id = `opt-${key}`;
    b.innerHTML = `<span class="opt-key" aria-hidden="true">${key}</span><span class="opt-body"><span class="opt-nl"></span><span class="opt-tr"></span></span>`;
    b.querySelector('.opt-nl').textContent = nl;
    setTr(b.querySelector('.opt-tr'), other);
    if (S.tried.has(key)) {
      const t = document.createElement('span');
      t.className = 'opt-tried';
      t.textContent = pair(UI.tried, S.lang)[0];
      b.querySelector('.opt-body').appendChild(t);
    }
    b.addEventListener('click', () => pick(key));
    list.appendChild(b);
    items.push({ letter: key, nl, other, tried: S.tried.has(key), onSelect: () => pick(key) });
  }
  choiceEl.hidden = false;
  vrui.showChoices(title, sub, pair(UI.vrHint, S.lang)[0], items, langDir(S.lang), pair(UI.tried, S.lang)[0]);
}

function hideChoice() {
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
  setPhase('reflect');
  hideSub();
  renderReflection();
}

function renderReflection() {
  const key = S.outcome;
  if (!key) return;
  const o = OUTCOMES[key];
  reflEl.dataset.mood = o.mood;
  const set = (sel, entry) => {
    const [nl, other] = pair(entry, S.lang);
    reflEl.querySelector(sel).textContent = nl;
    setTr(reflEl.querySelector(sel + '-tr'), other);
  };
  reflEl.querySelector('.r-choice').textContent = `${key} · “${CHOICES[key].nl}”`;
  set('.r-mood', o.moodLabel);
  set('.r-title', o.title);
  set('.r-what-h', UI.what);
  set('.r-what', o.what);
  set('.r-why-h', UI.why);
  set('.r-why', o.why);
  set('.r-tip-h', UI.tip);
  set('.r-tip', o.tip);
  set('.r-q-h', UI.q);
  set('.r-q', o.q);
  const all = S.tried.size === 3;
  const allEl = reflEl.querySelector('.r-all');
  allEl.hidden = !all;
  if (all) {
    const [nl, other] = pair(UI.allTried, S.lang);
    allEl.querySelector('.r-all-nl').textContent = nl;
    setTr(allEl.querySelector('.r-all-tr'), other);
  }
  $('#btn-retry .b-nl').textContent = pair(UI.retry, S.lang)[0];
  setTr($('#btn-retry .b-tr'), pair(UI.retry, S.lang)[1]);
  $('#btn-restart .b-nl').textContent = pair(UI.restart, S.lang)[0];
  setTr($('#btn-restart .b-tr'), pair(UI.restart, S.lang)[1]);
  reflEl.hidden = false;
  reflEl.scrollTop = 0;

  const dir = langDir(S.lang);
  const tr = (e) => pair(e, S.lang)[1];
  const moodColor = { calm: '#3fbf73', tense: '#f2a900', escalated: '#e5483a' }[o.mood];
  const sec = [
    { text: pair(o.moodLabel, S.lang)[0].toUpperCase(), size: 28, weight: 700, head: true, color: moodColor, gap: 0 },
    { text: pair(o.title, S.lang)[0], size: 60, weight: 800, head: true, color: '#ffffff', gap: 4 },
  ];
  for (const [h, b] of [[UI.what, o.what], [UI.why, o.why], [UI.tip, o.tip], [UI.q, o.q]]) {
    sec.push({ text: pair(h, S.lang)[0], size: 30, weight: 700, head: true, color: '#f2c500', gap: 22 });
    sec.push({ text: b.nl, size: 32, gap: 4 });
    if (tr(b)) sec.push({ text: tr(b), size: 26, color: '#aab3ae', gap: 6, dir });
  }
  vrui.showReflection(sec, [
    { label: pair(UI.retry, S.lang)[0], primary: true, onSelect: retry },
    { label: pair(UI.restart, S.lang)[0], onSelect: restart },
  ], moodColor, dir);
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
const VOICE_IDS = Object.keys(LINES);
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
  camera.position.set(0, EYE + bobY, 0);
  camera.rotation.set(
    look.pitch + look.uPitch + (Math.random() - 0.5) * sh,
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
  audio.place(marco.panner, marco.headWorld(tmp));
  audio.place(sandra.panner, sandra.headWorld(tmp));
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

function loop() {
  const now = performance.now();
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
  updateCamera(dt);
  updateAudio(dt);
  vrui.update(dt);
  tickHud();
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
window.__sim = { S, pick, skipIntro, restart, retry, rig, camera, look, get fl() { return fl; }, get marco() { return marco; }, get simT() { return simT; } };
