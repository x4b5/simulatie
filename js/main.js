import * as THREE from 'three';
import { buildWorld, LAYOUT, softShadow } from './world.js';
import { Human } from './human.js';
import { Forklift, FORK_TIP } from './forklift.js';
import { UI, LINES, CHOICES, OUTCOMES } from './i18n.js';
import { CHOICE_ICON } from './icons.js';
import {
  $, V, renderer, scene, rig, audio, S, runId, simT, later, wait, until, tween, guard, ease, shortAngle,
  look, player, tmp, tmp2, yawTo, lookAtFn, lookDir, snapLook, playerWalk, playerStop, pathRemaining,
  flinch, shake, playerHead, playerChest, say, playerSays, stopVoice, hideSub, setPhase, goChoice, start,
} from './sim.js';

// Scenario "Bijna geraakt": de hal, de heftruck en Marco. Het gedeelde raamwerk
// (camera, ondertitels, keuze, nabespreking, VR) staat in js/sim.js.

// ------------------------------------------------------------------
// Licht
// ------------------------------------------------------------------
scene.background = new THREE.Color(0x2b3036);
scene.fog = new THREE.Fog(0x2b3036, 24, 62);
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

// ------------------------------------------------------------------
// Plattegrond
// ------------------------------------------------------------------
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
// Wereld en personages
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
    showHud(false);
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
// Spreken
// ------------------------------------------------------------------
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

// Punt vlak voor iemand op heuphoogte: doel voor een hakgebaar.
function chopPoint(p) {
  const f = new THREE.Vector3(Math.sin(p.root.rotation.y), 0, Math.cos(p.root.rotation.y));
  return p.root.position.clone().addScaledVector(f, 0.7).setY(0.75);
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

function onChoice() {
  marco.lookTarget = playerHead;
  marco.setHands('angry');
  // Iets lager kijken, zodat Marco's gezicht boven het keuzepaneel blijft.
  lookAtFn((v) => marco.headWorld(v).add(tmp2.set(0, -0.62, 0)), 2);
}

async function runBranch(id, key) {
  lookAtFn(marcoHead, 4);
  marco.lookTarget = playerHead;
  if (key === 'A') await branchA(id);
  else if (key === 'B') await branchB(id);
  else await branchC(id);
}

async function branchA(id) {
  later(id, 0.9, () => marco.react('soften'));
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
  later(id, 1.3, () => marco.react('scoff'));
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
  later(id, 0.7, () => marco.react('startle'));
  await playerSays(id, 'C');
  marco.angerTarget = 1;
  marco.walkTo([[P.standClose.x, P.standClose.z]], 1.0).then(() => marco.faceTowards(P.stop.x, P.stop.z));
  later(id, 0.55, () => flinch(V(-0.22, -0.12), 0.6, false));
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
// Geluid
// ------------------------------------------------------------------
function setupAudio() {
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
  sandra.breathSnd = audio.breather(sandra.panner);
  sandra.onStep = () => audio.step(0.25, sandra.panner);
  distantPanner = audio.spatial({ ref: 3, rolloff: 1 });
}
let distantPanner = null;
let nextDistant = 6;

function updateAudio(dt, camPos) {
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

// ------------------------------------------------------------------
// Per beeld
// ------------------------------------------------------------------
function update(dt, wdt) {
  if (S.phase === 'title') {
    look.fYaw = yawTo(P.start, P.walk1) - 0.35 + Math.sin(simT * 0.11) * 0.55;
    look.fPitch = -0.02;
  }
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
  tickHud();
}

start({
  texts: { UI, LINES, CHOICES, OUTCOMES },
  choiceIcon: CHOICE_ICON,
  subColors: { marco: '#f2c500', sandra: '#ff8a3d', you: '#5fd48b' },
  lineEmo: LINE_EMO,
  lipsync: 'models/lipsync.json',
  audioDir: 'audio/',
  person: (who) => (who === 'sandra' ? sandra : marco),
  build: makeCast,
  reset: resetScene,
  intro: runIntro,
  onChoice,
  branch: runBranch,
  update,
  setupAudio,
  updateAudio,
  debug: { get fl() { return fl; }, get marco() { return marco; } },
});
