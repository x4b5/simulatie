import * as THREE from 'three';
import { Human } from './human.js';
import { softShadow } from './world.js';
import { buildCanteen, canteenLights, makeTray, SEATS, SPOTS, seatPoint, TABLE_H } from './canteen.js';
import { UI, LINES, CHOICES, OUTCOMES } from './i18n-kantine.js';
import { CANTEEN_CHOICE_ICON } from './icons.js';
import {
  V, renderer, scene, rig, audio, S, simT, later, waitReal, wait, until, tween, guard, detach, ease, shortAngle,
  look, lookAtFn, lookDir, snapLook, flinch, playerHead, playerChest, say, playerSays,
  stopVoice, hideSub, setPhase, goChoice, start,
} from './sim.js';

// Scenario "Grap in de kantine": lunchpauze, Dennis maakt een grap over de uitspraak van
// Tomasz en zoekt bijval bij de speler. Het gedeelde raamwerk (camera, ondertitels, keuze,
// nabespreking, VR) staat in js/sim.js, de kantine zelf in js/canteen.js.

const EYE = 1.2; // ooghoogte van de speler als hij zit
// Kleine ruimte met harde wanden: korte, droge galm (de hal in "Bijna geraakt" galmt 2,8 s).
audio.room = { seconds: 1.1, decay: 3.8, wet: 0.2 };
canteenLights(scene);

const ANIMS = ['models/anim_m', 'models/anim_k'];
const PLAYER = seatPoint(SEATS.player, 0, 0.07); // ogen iets voor het bekken
const STAND = V(1.18, -1.02); // hier staat Tomasz met zijn dienblad bij de tafel

// ------------------------------------------------------------------
// Wereld en personages
// ------------------------------------------------------------------
let canteen;
let marco;
let dennis;
let tomasz;
let bg1;
let bg2;
let bg3;
let sandra;
let cast = [];
let tray;
const blobs = [];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

async function makeCast() {
  canteen = buildCanteen(scene, renderer);
  const load = (model, code, anims = ANIMS) => Human.load({ model, code, anims });
  // Realistische personages (Microsoft Rocketbox, MIT-licentie).
  [marco, dennis, tomasz, bg1, bg2, bg3, sandra] = await Promise.all([
    load('models/marco.fbx', 'm108'),
    load('models/dennis.fbx', 'm107'),
    load('models/tomasz.fbx', 'm105'),
    load('models/collega2.fbx', 'm102'),
    load('models/collega4.fbx', 'm103'),
    load('models/collega5.fbx', 'm104'),
    load('models/sandra.fbx', 'f101', 'models/anim_f'),
  ]);
  cast = [marco, dennis, tomasz, bg1, bg2, bg3, sandra];
  // Tomasz heeft in de pauze geen gereedschap bij zich: de duimstok in zijn gordel prikte door het tafelblad.
  tomasz.root.traverse((n) => {
    if (n.isMesh) for (const m of [].concat(n.material)) if (/tools/i.test(m.name)) m.visible = false;
  });
  for (const p of cast) {
    scene.add(p.root);
    p.seatOffset = 0;
    p.upright = true;
    // Zachte contactschaduw onder wie staat of loopt.
    const b = softShadow(0.9, 0.9, 0.5, true);
    scene.add(b);
    blobs.push({ p, b });
  }
  tray = makeTray({ food: 'soup', cup: true });
  scene.add(tray);

  // Achtergrond: twee collega's in gesprek, één alleen met koffie, Sandra bij de koffieautomaat.
  sitAt(bg1, 'bg1', 'sitTableRelaxed');
  sitAt(bg2, 'bg2', 'sitTable');
  sitAt(bg3, 'bg3', 'sitTableThink');
  sandra.root.position.copy(SPOTS.coffee);
  sandra.root.rotation.y = Math.PI;
  sandra.setHands('relaxed');
  bgChat();
  bgAlone();
  sandraLoop();
}

// Zet iemand direct op een zitplaats (met de stoel goed aangeschoven).
function sitAt(p, name, clip = 'sitTable') {
  const s = SEATS[name];
  p.cancelWalk();
  p.clearForced();
  p.root.position.copy(s.pos);
  p.root.rotation.y = s.yaw;
  p.faceYaw = null;
  p.lockYaw = false;
  p.seat = 1;
  p.sitClip = clip;
  placeChair(name, 0);
}

// Stoel op zijn plek, of `back` meter naar achteren geschoven.
function placeChair(name, back) {
  const s = SEATS[name];
  canteen.chairs[name].position.copy(seatPoint(s, 0, -0.05 - back));
  canteen.chairs[name].rotation.y = s.yaw;
}

const headOf = (p) => (v) => p.headWorld(v);
// Camerarichting: iets onder het hoofd, zodat het gezicht in het bovenste deel van het beeld staat
// (bij iemand die staat nog iets lager: anders kijk je vooral naar het plafond).
const faceOf = (p) => (v) => {
  p.headWorld(v).y -= p.seat > 0.5 ? 0.12 : 0.3;
  return v;
};

// Punt op tafel voor iemand die zit (lx naar links, lz naar voren).
const tablePoint = (name, lx = 0, lz = 0.45) => seatPoint(SEATS[name], lx, lz, TABLE_H);

// Kijkdoel tussen de hoofden van een paar personen, `dy` lager.
function groupLook(people, dy) {
  return (v) => {
    v.set(0, 0, 0);
    for (const p of people) v.add(p.headWorld(_c));
    return v.multiplyScalar(1 / people.length).add(_c.set(0, -dy, 0));
  };
}

// Na een clip die één keer speelt weer terug naar de gewone houding.
function fidget(p, clip, ts = 1) {
  const d = p.playForced(clip, ts, false, 0.6);
  return waitReal(d * 0.92).then(() => {
    if (p.forced?.name === clip) p.clearForced();
  });
}

let bgStare = false; // in de ruzie kijkt iedereen om
async function bgChat() {
  // Twee collega's aan de raamtafel praten met elkaar: kijken, knikken, grinniken.
  bg1.lookTarget = headOf(bg2);
  bg2.lookTarget = headOf(bg1);
  bg1.torsoFollow = 0.15;
  bg2.torsoFollow = 0.15;
  for (let i = 0; ; i++) {
    await waitReal(2.5 + Math.random() * 3);
    if (bgStare) continue;
    const r = Math.random();
    if (r < 0.3) bg2.nod();
    else if (r < 0.5) bg1.chuckle(1.4, 0.45);
    else if (r < 0.65) await fidget(bg1, 'sitTableShrug');
    else if (r < 0.8) {
      bg2.lookTarget = tablePoint('bg2', 0, 0.5);
      await waitReal(2);
      if (!bgStare) bg2.lookTarget = headOf(bg1);
    } else await fidget(bg2, i % 2 ? 'sitTableTouchFace' : 'sitTableLook');
  }
}

async function bgAlone() {
  // Collega alleen aan tafel: kijkt naar zijn koffie en af en toe rond.
  bg3.lookTarget = tablePoint('bg3', 0.1, 0.3);
  for (;;) {
    await waitReal(4 + Math.random() * 5);
    if (bgStare) continue;
    bg3.lookTarget = V(-1 + Math.random() * 2, 1.3, -2 + Math.random() * 2);
    await waitReal(1.6);
    if (bgStare) continue;
    bg3.lookTarget = tablePoint('bg3', 0.1, 0.3);
    if (Math.random() < 0.4) await fidget(bg3, 'sitTableTouchFace');
  }
}

let coffeePanner = null;
async function sandraLoop() {
  // Sandra (teamleider) haalt koffie: knop indrukken, wachten, kopje pakken, rondkijken.
  const machine = V(SPOTS.coffee.x - 0.08, 1.38, -6.0);
  const nook = V(SPOTS.coffee.x - 0.08, 0.98, -5.95);
  sandra.lookTarget = machine;
  for (;;) {
    await waitReal(3 + Math.random() * 4);
    if (bgStare) continue;
    sandra.jab('r', machine, 0.8);
    if (audio.ready && coffeePanner) audio.coffee(coffeePanner);
    await waitReal(5.5);
    if (bgStare) continue;
    sandra.lookTarget = nook;
    sandra.jab('r', nook, 1.0);
    await waitReal(1.6);
    if (bgStare) continue;
    // Even de kantine in kijken.
    sandra.lookTarget = V(-1 + Math.random() * 2, 1.2, -1);
    await waitReal(3.5);
    if (!bgStare) sandra.lookTarget = machine;
    await waitReal(8 + Math.random() * 8);
  }
}

// In de ruzie kijken de anderen in de kantine om naar Dennis.
function everyoneLooks() {
  bgStare = true;
  for (const p of [bg1, bg2, bg3, sandra]) {
    p.lookTarget = headOf(dennis);
    p.torsoFollow = 0.35;
  }
  sandra.faceTowards(dennis.root.position.x, dennis.root.position.z);
  bg1.react('startle');
}

function resetBackground() {
  bgStare = false;
  bg1.lookTarget = headOf(bg2);
  bg2.lookTarget = headOf(bg1);
  bg3.lookTarget = tablePoint('bg3', 0.1, 0.3);
  for (const p of [bg1, bg2, bg3]) p.torsoFollow = 0.15;
  sandra.torsoFollow = 0;
  sandra.root.position.copy(SPOTS.coffee);
  sandra.root.rotation.y = Math.PI;
  sandra.faceYaw = Math.PI;
  sandra.lookTarget = V(SPOTS.coffee.x, 1.38, -6.0);
}

// ------------------------------------------------------------------
// Het dienblad van Tomasz
// ------------------------------------------------------------------
function carryTray(p) {
  tray.userData.carrier = p;
  p.armPose = 'tray';
}

// Houdt het dienblad tussen de handen van wie het draagt.
function updateTray() {
  const p = tray.userData.carrier;
  if (!p) return;
  p.handWorld('l', _a);
  p.handWorld('r', _b);
  const yaw = p.root.rotation.y;
  tray.position.addVectors(_a, _b).multiplyScalar(0.5);
  tray.position.x += Math.sin(yaw) * 0.07;
  tray.position.z += Math.cos(yaw) * 0.07;
  tray.position.y -= 0.045;
  tray.rotation.set(0, yaw, 0);
}

// Dienblad neerzetten op `spot` (met beide handen, iets voorover).
async function placeTray(id, p, spot, yaw) {
  tray.userData.carrier = null;
  p.armPose = null;
  const side = _a.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.19);
  p.setAim('l', spot.clone().add(side).setY(spot.y + 0.05));
  p.setAim('r', spot.clone().sub(side).setY(spot.y + 0.05));
  p.lean = -0.2;
  const from = tray.position.clone();
  const r0 = tray.rotation.y;
  await tween(0.85, (k) => {
    const e = ease(k);
    tray.position.lerpVectors(from, spot, e);
    tray.position.y += Math.sin(k * Math.PI) * 0.03;
    tray.rotation.y = r0 + shortAngle(yaw - r0) * e;
  });
  guard(id);
  if (audio.ready) audio.clink(p.panner, 0.05);
  p.setAim('l', null);
  p.setAim('r', null);
  p.lean = 0;
}

// ------------------------------------------------------------------
// Gaan zitten en opstaan
// ------------------------------------------------------------------
// Naar een punt toe draaien en wachten tot dat (ongeveer) gelukt is.
async function turnTo(id, p, pt) {
  p.faceTowards(pt.x, pt.z);
  const t0 = simT;
  await until(() => Math.abs(shortAngle(p.root.rotation.y - p.faceYaw)) < 0.2 || simT - t0 > 1.5);
  guard(id);
}

// Aan tafel gaan zitten: naast de tafelhoek staan, dienblad neerzetten, stoel naar achteren
// trekken, voor de stoel gaan staan, gaan zitten (motion capture: het lichaam zakt 46 cm naar
// achteren op de stoel) en de stoel aanschuiven. side: aan welke kant (1 = links van de stoel).
async function sitDown(id, p, name, side) {
  const s = SEATS[name];
  const chair = canteen.chairs[name];
  const at = (lx, lz, y = 0) => seatPoint(s, lx, lz, y);
  const corner = at(side * 0.46, 0.06);
  p.clearForced();
  await p.walkTo([[corner.x, corner.z]], 0.95);
  guard(id);
  const spot = at(0, 0.55, TABLE_H);
  await turnTo(id, p, spot);
  await wait(0.2);
  guard(id);
  await placeTray(id, p, spot, s.yaw);

  // Stoel naar achteren trekken: eerst omdraaien en naar de stoel kijken.
  const back = at(side * 0.16, -0.27, 0.82);
  const gaze = p.lookTarget;
  p.lookTarget = back.clone().setY(0.6);
  await turnTo(id, p, back);
  p.jab(side > 0 ? 'l' : 'r', back, 0.9);
  await wait(0.35);
  guard(id);
  if (audio.ready) audio.scrape(p.panner, 0.45);
  const c0 = chair.position.clone();
  const c1 = at(0, -0.47);
  await tween(0.5, (k) => chair.position.lerpVectors(c0, c1, ease(k)));
  guard(id);
  p.lookTarget = gaze;

  // Tussen stoel en tafel gaan staan, met de rug naar de stoel.
  const front = at(0, 0.04);
  await p.walkTo([[front.x, front.z]], 0.6);
  guard(id);
  p.faceYaw = s.yaw;
  await wait(0.75);
  guard(id);
  p.lockYaw = true;
  p.root.rotation.y = s.yaw;

  // Gaan zitten.
  const dur = p.playForced('sitDownChair', 1, false, 0.35);
  await wait(dur * 0.96);
  guard(id);

  // Stoel aanschuiven, ondertussen de handen op tafel.
  p.clearForced();
  p.seat = 1;
  p.sitClip = 'sitTable';
  if (audio.ready) audio.scrape(p.panner, 0.3, 0.12);
  const r0 = p.root.position.clone();
  const cc0 = chair.position.clone();
  const cc1 = at(0, -0.05);
  await tween(1.0, (k) => {
    const e = ease(k);
    p.root.position.lerpVectors(r0, s.pos, e);
    chair.position.lerpVectors(cc0, cc1, e);
  });
  guard(id);
  p.lockYaw = false;
}

// Opstaan van de stoel en hem met de benen naar achteren duwen.
async function standUp(id, p, name) {
  const chair = canteen.chairs[name];
  p.lockYaw = true;
  p.seat = 0;
  const dur = p.playForced('standUp', 1.25, false, 0.25);
  if (audio.ready) audio.scrape(p.panner, 0.4, 0.3);
  const c0 = chair.position.clone();
  const c1 = seatPoint(SEATS[name], 0, -0.52);
  tween(0.5, (k) => chair.position.lerpVectors(c0, c1, ease(k)));
  await wait(dur * 0.92);
  guard(id);
  p.clearForced();
  p.lockYaw = false;
}

// Deur naar de hal open of dicht.
function swingDoor(open) {
  const d = canteen.door;
  const r0 = d.rotation.y;
  const r1 = open ? -1.35 : 0;
  return tween(0.7, (k) => (d.rotation.y = r0 + (r1 - r0) * ease(k)));
}

// ------------------------------------------------------------------
// Begintoestand
// ------------------------------------------------------------------
function resetScene(state) {
  stopVoice();
  hideSub();
  look.uYaw = 0;
  look.uPitch = 0;
  rig.position.copy(PLAYER);
  S.outcome = null;
  for (const p of [marco, dennis, tomasz]) {
    p.clearForced();
    p.cancelWalk();
    p.lockYaw = false;
    p.talk = null;
    p.stopSpeaking();
    p.pant = 0;
    p.setAim('l', null);
    p.setAim('r', null);
    p.armPose = null;
    p.lean = 0;
    p.mood = {};
    p.anger = p.angerTarget = 0;
    p.surprise = 0;
    p.lookTarget = null;
    p.torsoFollow = 0.2;
    p.setHands('relaxed');
  }
  sitAt(marco, 'marco', 'sitTable');
  sitAt(dennis, 'dennis', 'sitTable2');
  placeChair('tomasz', 0);
  placeChair('alone', 0);
  canteen.door.rotation.y = 0;
  resetBackground();
  tomasz.seat = 0;
  tomasz.faceYaw = null;
  carryTray(tomasz);

  if (state === 'start') {
    tomasz.root.position.copy(SPOTS.counter);
    tomasz.root.rotation.y = Math.PI;
    tomasz.lookTarget = V(SPOTS.counter.x, 1.0, -6.2);
    dennis.lookTarget = headOf(marco);
    marco.lookTarget = headOf(dennis);
    lookDir(0.75, -0.1);
    snapLook();
  } else if (state === 'choice') {
    tomasz.root.position.copy(STAND);
    tomasz.root.rotation.y = Math.atan2(0.1 - STAND.x, 0.1 - STAND.z);
    tomasz.mood = { sad: 0.45 };
    tomasz.playForced('listenSad', 1, true, 0.6);
    dennis.mood = { smile: 0.4 };
    onChoice();
    snapLook();
  }
  updateTray();
}

// ------------------------------------------------------------------
// Spreken
// ------------------------------------------------------------------
// Emotie per regel. laugh: stukken (s) waarin de opname lacht; daarop schokken borst en schouders.
const LINE_EMO = {
  t1: { smile: 0.3 },
  d1: { smile: 0.45, sarcasm: 0.5 },
  t2: { worry: 0.6, smile: 0.1 },
  d2: { smile: 0.55, laugh: [[0, 0.98], [2.22, 3.3]] },
  ml: { smile: 0.3, laugh: [[0.1, 1.76]] },
  d3: { smile: 0.5, laugh: [[0.2, 0.86]] },
  a1: { sarcasm: 0.6 },
  a2: { worry: 0.35 },
  a4: { smile: 0.15, worry: 0.25 },
  a3: { smile: 0.4, worry: 0.15 },
  b1: { smile: 0.6, laugh: [[0, 1.04]] },
  b2: { sad: 0.8 },
  b3: { worry: 0.55 },
  c1: { shout: 1 },
  c2: { shout: 0.4 },
  c3: { sad: 0.5, worry: 0.3 },
};

const PEOPLE = { marco: () => marco, dennis: () => dennis, tomasz: () => tomasz };

// ------------------------------------------------------------------
// Het scenario
// ------------------------------------------------------------------
async function runIntro(id) {
  resetScene('start');
  setPhase('intro');
  // Even rondkijken: de ramen, de collega's verderop, dan de eigen tafel.
  lookDir(0.75, -0.1, 0.8);
  dennis.chuckle(1.2, 0.35);
  later(id, 1.6, () => marco.nod());
  await wait(2.2);
  guard(id);
  lookAtFn(groupLook([dennis, marco], 0.15), 1.1);
  later(id, 1.2, () => dennis.chuckle(1.6, 0.5));
  later(id, 2.6, () => fidget(marco, 'sitTableShrug'));

  // Tomasz komt met zijn dienblad van de toonbank.
  await wait(1.6);
  guard(id);
  tomasz.lookTarget = headOf(dennis);
  const walk = tomasz.walkTo([[1.35, -4.3], [1.45, -2.3], [STAND.x, STAND.z]], 1.0);
  await wait(1.4);
  guard(id);
  lookAtFn(faceOf(tomasz), 1.5);
  later(id, 2.0, () => (dennis.lookTarget = headOf(tomasz)));
  later(id, 2.6, () => (marco.lookTarget = headOf(tomasz)));
  await walk;
  guard(id);
  tomasz.faceTowards(0.1, 0.1);
  await wait(0.5);
  guard(id);

  // "Hoi jongens. Is hier nog plek?"
  tomasz.lookTarget = headOf(dennis);
  await say(id, 't1', [[1.1, () => (tomasz.lookTarget = playerHead)]]);
  tomasz.lookTarget = headOf(dennis);

  // Dennis leunt achterover en daagt hem uit.
  lookAtFn(faceOf(dennis), 2.2);
  dennis.lean = 0.12;
  dennis.mood = { smile: 0.35 };
  await say(id, 'd1', [
    [1.6, () => dennis.jab('l', headOf(tomasz)(new THREE.Vector3()).setY(1.0), 0.7)],
    [3.4, () => (dennis.lookTarget = headOf(tomasz))],
  ]);

  // Tomasz probeert het, beschaamd.
  lookAtFn(faceOf(tomasz), 2.2);
  tomasz.mood = { worry: 0.4 };
  tomasz.playForced('listenNervous', 1, true, 0.8);
  await say(id, 't2', [
    [0.1, () => (tomasz.lookTarget = tablePoint('tomasz', 0, 0.3))],
    [1.0, () => (tomasz.lookTarget = headOf(dennis))],
  ]);

  // Dennis lacht hard en doet hem na; Marco grinnikt mee. Tomasz' glimlach bevriest.
  lookAtFn(groupLook([dennis, tomasz], 0.1), 1.8);
  dennis.lean = 0.2;
  await say(id, 'd2', [
    [0.9, () => {
      tomasz.mood = { sad: 0.55 };
      tomasz.playForced('listenSad', 1, true, 0.8);
    }],
    [1.7, () => dennis.jab('r', tablePoint('dennis', -0.12, 0.42), 0.35)],
    [2.4, () => marco.chuckle(1.2, 0.4)],
    [3.0, () => (tomasz.lookTarget = tablePoint('tomasz', 0.1, 0.25))],
    [4.4, () => (dennis.lookTarget = headOf(tomasz))],
  ]);
  dennis.lean = 0.1;
  // Marco grinnikt mee: de blik volgt de spreker.
  lookAtFn(faceOf(marco), 3);
  await say(id, 'ml', [[0.0, () => (marco.lookTarget = tablePoint('marco', 0, 0.4))]]);

  // Dennis draait zich naar de speler en zoekt bijval.
  dennis.lookTarget = playerHead;
  lookAtFn(faceOf(dennis), 2.6);
  await wait(0.3);
  guard(id);
  await say(id, 'd3', [
    [0.95, () => fidget(dennis, 'sitTableShrug', 1.15)],
    [1.6, () => (marco.lookTarget = playerHead)],
  ]);
  await wait(0.4);
  guard(id);
  goChoice();
}

// Bij de keuze kijken ze alle drie naar de speler.
function onChoice() {
  for (const p of [dennis, marco, tomasz]) p.lookTarget = playerHead;
  dennis.lean = 0.06;
  // Iets lager kijken, zodat de gezichten boven het keuzepaneel blijven.
  lookAtFn(groupLook([dennis, marco, tomasz], 0.55), 2);
}

async function runBranch(id, key) {
  for (const p of [dennis, marco, tomasz]) p.lookTarget = playerHead;
  lookAtFn(faceOf(dennis), 3);
  if (key === 'A') await branchA(id);
  else if (key === 'B') await branchB(id);
  else await branchC(id);
}

async function branchA(id) {
  // De speler zegt rustig: stop. Dennis is even uit het veld geslagen, Tomasz kijkt op.
  later(id, 0.8, () => {
    dennis.mood = {};
    dennis.surprise = 0.35;
    tomasz.mood = { worry: 0.3 };
  });
  later(id, 1.6, () => (marco.lookTarget = tablePoint('marco', 0, 0.4)));
  await playerSays(id, 'A');

  // "Pff. Het is maar een grapje, joh." (armen over elkaar)
  dennis.angerTarget = 0.3;
  dennis.armPose = 'crossed';
  dennis.lean = 0.1;
  await say(id, 'a1', [[1.2, () => (dennis.lookTarget = headOf(marco))]]);

  // Marco kiest partij.
  lookAtFn(faceOf(marco), 2.4);
  marco.lookTarget = headOf(dennis);
  await say(id, 'a2', [
    [1.0, () => marco.nod()],
    [2.2, () => (marco.lookTarget = headOf(tomasz))],
  ]);

  // Dennis zucht en geeft toe.
  lookAtFn(faceOf(dennis), 2.4);
  dennis.inhale(0.6);
  dennis.armPose = null;
  dennis.angerTarget = 0;
  dennis.lean = 0;
  await say(id, 'a4', [
    [1.9, () => (dennis.lookTarget = headOf(tomasz))],
    [3.1, () => dennis.jab('l', tablePoint('tomasz', 0, 0.2).setY(0.95), 0.9)],
  ]);

  // Tomasz gaat erbij zitten.
  tomasz.mood = { smile: 0.25 };
  tomasz.lookTarget = tablePoint('tomasz', 0, 0.4);
  marco.lookTarget = headOf(tomasz);
  lookAtFn(faceOf(tomasz), 2);
  await sitDown(id, tomasz, 'tomasz', 1);
  tomasz.lookTarget = playerHead;
  dennis.lookTarget = headOf(tomasz);
  lookAtFn(faceOf(tomasz), 2.5);
  await wait(0.4);
  guard(id);

  // "Dank je. Ik hoor dat bijna elke dag."
  await say(id, 'a3', [
    [1.1, () => (tomasz.lookTarget = tablePoint('tomasz', 0, 0.35))],
    [2.3, () => (tomasz.lookTarget = headOf(dennis))],
  ]);
  tomasz.mood = { smile: 0.35 };
  tomasz.lookTarget = playerHead;
  marco.nod();
  lookAtFn(groupLook([dennis, marco, tomasz], 0.2), 1.5);
  await wait(2.4);
  guard(id);
}

async function branchB(id) {
  // De speler lacht mee. Dennis glundert, Tomasz is gekwetst, Marco kijkt weg.
  later(id, 0.5, () => {
    dennis.mood = { smile: 0.6 };
    dennis.chuckle(1.6, 0.6);
    tomasz.mood = { sad: 0.7 };
  });
  later(id, 1.2, () => {
    marco.lookTarget = tablePoint('marco', 0, 0.4);
    marco.sitClip = 'sitTableNervous'; // Marco zit er ongemakkelijk bij
  });
  await playerSays(id, 'B');

  // "Zie je wel! Hij snapt het."
  dennis.lean = 0.18;
  await say(id, 'b1', [
    [0.0, () => (dennis.lookTarget = headOf(tomasz))],
    [1.8, () => {
      dennis.lookTarget = playerHead;
      dennis.jab('r', playerChest(new THREE.Vector3()), 0.6);
    }],
  ]);
  dennis.lean = 0.05;

  // Tomasz geeft het op en gaat ergens anders zitten.
  lookAtFn(faceOf(tomasz), 2.2);
  tomasz.lookTarget = tablePoint('tomasz', 0, 0.2);
  await say(id, 'b2', [[1.3, () => (tomasz.lookTarget = playerHead)]]);
  tomasz.clearForced();
  tomasz.lookTarget = null;
  const leave = detach((async () => {
    await tomasz.walkTo([[1.7, -1.9], [2.25, -3.1]], 0.95);
    guard(id);
    await sitDown(id, tomasz, 'alone', -1);
    tomasz.mood = { sad: 0.6 };
    tomasz.lookTarget = tablePoint('alone', 0, 0.4);
  })());
  dennis.lookTarget = headOf(tomasz);
  later(id, 1.0, () => fidget(dennis, 'sitTableShrug'));
  later(id, 1.6, () => dennis.chuckle(1.0, 0.4));
  await wait(3.2);
  guard(id);

  // Marco, zacht tegen de speler. Dennis eet verder.
  dennis.lookTarget = tablePoint('dennis', 0, 0.85);
  dennis.mood = { smile: 0.2 };
  marco.lookTarget = headOf(tomasz);
  lookAtFn(faceOf(marco), 2.2);
  await say(id, 'b3', [[1.1, () => (marco.lookTarget = playerHead)]]);
  await leave;
  guard(id);
  // Tot slot: Tomasz zit alleen aan een andere tafel.
  lookAtFn(faceOf(tomasz), 1.6);
  await wait(2.6);
  guard(id);
}

async function branchC(id) {
  // De speler scheldt terug. Dennis schrikt en wordt boos; hij staat op.
  later(id, 0.5, () => {
    dennis.react('startle');
    dennis.mood = {};
    marco.surprise = 0.6;
    tomasz.surprise = 0.5;
  });
  await playerSays(id, 'C');
  dennis.angerTarget = 0.95;
  dennis.lean = 0;
  lookAtFn(faceOf(dennis), 3);
  later(id, 0.9, () => flinch(V(0, 0.07), 0.6, false));
  await standUp(id, dennis, 'dennis');
  dennis.setHands('angry');

  // "Wat zeg jij? Het was een GRAPJE!" Marco en Tomasz kijken naar Dennis, die opeens staat.
  marco.lookTarget = headOf(dennis);
  tomasz.lookTarget = headOf(dennis);
  // Prikgebaar: echt naar de speler wijzen, niet losjes omhoog.
  await say(id, 'c1', [
    [0.0, () => dennis.setHands('firm')],
    [0.4, () => dennis.jab('r', playerChest(new THREE.Vector3()), 0.95, 0.85)],
    [1.8, () => dennis.jab('r', playerChest(new THREE.Vector3()), 0.85, 0.85)],
  ]);
  dennis.setHands('angry');

  // Marco sust: handen omhoog. De anderen in de kantine kijken om.
  lookAtFn(faceOf(marco), 2.6);
  marco.armPose = 'calm';
  marco.lookTarget = headOf(dennis);
  await say(id, 'c2', [
    [1.4, () => (marco.lookTarget = playerHead)],
    [2.3, () => everyoneLooks()],
  ]);
  lookAtFn(faceOf(bg1), 1.6);
  await wait(1.2);
  guard(id);
  marco.armPose = null;

  // Tomasz heeft er genoeg van.
  lookAtFn(faceOf(tomasz), 2.4);
  tomasz.angerTarget = 0.3;
  tomasz.lookTarget = headOf(dennis);
  await say(id, 'c3', [[1.4, () => (tomasz.lookTarget = playerHead)]]);
  tomasz.clearForced();
  tomasz.lookTarget = null;
  dennis.lookTarget = headOf(tomasz);
  dennis.setHands('crossed');
  later(id, 1.5, () => marco.shake());
  await tomasz.walkTo([[1.7, -1.9], [4.9, -2.2], [SPOTS.door.x, SPOTS.door.z]], 1.15);
  guard(id);
  await swingDoor(true);
  guard(id);
  await tomasz.walkTo([[SPOTS.hall.x, SPOTS.hall.z]], 1.15);
  guard(id);
  swingDoor(false);
  dennis.lookTarget = playerHead;
  lookAtFn(faceOf(dennis), 1.4);
  await wait(2.2);
  guard(id);
}

// ------------------------------------------------------------------
// Geluid
// ------------------------------------------------------------------
let clinkPanners = [];
let nextClink = 2;

function setupAudio() {
  for (const p of [marco, dennis, tomasz]) {
    p.panner = audio.spatial({ ref: 1.2, rolloff: 1.3 });
    p.breathSnd = audio.breather(p.panner);
    p.onStep = () => audio.step(0.16, p.panner);
  }
  sandra.onStep = () => audio.step(0.14, coffeePanner);
  // Achtergrond: roomtoon, geroezemoes van de andere tafels, keuken en hal, bestek, koffie.
  audio.roomTone();
  for (const [x, z, y, level] of [[-3.5, -0.6, 1.2, 1], [-0.5, -6.2, 1.5, 0.55], [6.5, -2.2, 1.5, 0.35]]) {
    const pn = audio.spatial({ ref: 1.5, rolloff: 1.1 });
    audio.place(pn, V(x, z, y));
    audio.murmur(pn, level);
  }
  coffeePanner = audio.spatial({ ref: 1.5, rolloff: 1.1 });
  audio.place(coffeePanner, V(SPOTS.coffee.x, -6.1, 1.2));
  clinkPanners = ['bg1', 'bg2', 'bg3', 'marco', 'dennis'].map((n) => {
    const pn = audio.spatial({ ref: 1.2, rolloff: 1.2 });
    audio.place(pn, tablePoint(n, 0, 0.5));
    return pn;
  });
}

function updateAudio(dt, camPos) {
  for (const p of [marco, dennis, tomasz]) {
    p.headWorld(_a);
    audio.place(p.panner, _a);
    // Kleine ruimte: weinig galm dichtbij, iets meer verderop.
    audio.setWet(p.panner, THREE.MathUtils.clamp(0.12 + _a.distanceTo(camPos) * 0.05, 0.12, 0.45));
    p.breathSnd?.set(p.breath * 0.5 + p.pant * (0.55 + 0.45 * Math.sin(p.time * 7.5)), Math.sin(p.time * 7.5) > 0);
  }
  // Bestek tegen borden (niet als de tijd stilstaat).
  nextClink -= dt * S.worldScale;
  if (nextClink < 0 && S.phase !== 'loading') {
    nextClink = 1.2 + Math.random() * 3.5;
    audio.clink(clinkPanners[Math.floor(Math.random() * clinkPanners.length)], 0.025 + Math.random() * 0.02);
  }
}

// ------------------------------------------------------------------
// Per beeld
// ------------------------------------------------------------------
function update(dt, wdt) {
  if (S.phase === 'title') {
    look.fYaw = 0.25 + Math.sin(simT * 0.11) * 0.5;
    look.fPitch = -0.08;
  }
  for (const p of cast) p.update(wdt);
  updateTray();
  canteen.update(dt, simT);
  for (const { p, b } of blobs) {
    const show = p.seat < 0.5;
    b.visible = show;
    if (show) b.position.set(p.root.position.x, 0.006, p.root.position.z);
  }
}

start({
  texts: { UI, LINES, CHOICES, OUTCOMES },
  choiceIcon: CANTEEN_CHOICE_ICON,
  subColors: { marco: '#f2c500', dennis: '#ff8a3d', tomasz: '#7cc4ff', you: '#5fd48b' },
  lineEmo: LINE_EMO,
  lipsync: 'models/lipsync_kantine.json',
  audioDir: 'audio/kantine/',
  eye: EYE,
  seatedVR: true,
  person: (who) => PEOPLE[who](),
  build: makeCast,
  reset: resetScene,
  intro: runIntro,
  onChoice,
  branch: runBranch,
  update,
  setupAudio,
  updateAudio,
  debug: { get marco() { return marco; }, get dennis() { return dennis; }, get tomasz() { return tomasz; }, get canteen() { return canteen; } },
});
