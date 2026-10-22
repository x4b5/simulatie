import * as THREE from 'three';
import { buildWorld, hallLights, softShadow } from './world.js';
import { buildAisle, AISLE, HENK_BAY, STEIGER, STEIGER_PARK } from './racking.js';
import { Human } from './human.js';
import { Forklift } from './forklift.js';
import { UI, LINES, CHOICES, OUTCOMES } from './i18n-henk.js';
import { HENK_CHOICE_ICON } from './icons.js';
import {
  $, V, scene, renderer, rig, audio, S, simT, runId, later, waitReal, wait, until, tween, guard, detach, ease, shortAngle,
  look, tmp, yawTo, lookAtFn, lookDir, snapLook, playerWalk, playerStop, flinch, shake, playerHead, playerChest, say,
  playerSays, stopVoice, hideSub, setPhase, goChoice, start,
} from './sim.js';

// Scenario "Hoog en droog": in een orderpickgang staat Henk (60, al 25 jaar in dienst) zonder
// trap op de tweede ligger van een stelling en vraagt de speler om een doos aan te pakken. De
// speler oefent een collega aan te spreken op onveilig gedrag. Het gedeelde raamwerk (camera,
// ondertitels, keuze, nabespreking, VR) staat in js/sim.js, de gang en de rolsteiger in
// js/racking.js.

// Licht: de lampen boven de gang, schuin van links (vanaf de speler gezien), zodat de gang zelf
// niet in de schaduw van de stellingen ligt en Henks gezicht licht vangt als hij omkijkt.
hallLights(scene, { pos: new THREE.Vector3(-9, 22, 12.5), target: new THREE.Vector3(3, 0, 13.5), size: 17 });

// ------------------------------------------------------------------
// Plattegrond
// ------------------------------------------------------------------
const RACK = AISLE.faceN; // voorkant van de stelling waar Henk in staat (z)
const LV = AISLE.levels; // bovenkant van de liggers
const POST_X = HENK_BAY.x1; // staander links van Henk
const HX = 0.1; // midden tussen Henks voeten (x) als hij in de stelling staat
const ANK = 0.1; // enkel boven de zool
const P = {
  start: V(-10.0, 13.3),
  walk1: V(-6.2, 13.3),
  walk2: V(-3.4, 13.5), // langs Henks orderkar
  stop: V(-1.7, 14.12), // ~2,1 m van Henks gezicht, schuin achter hem: hij kan omkijken
  under: V(-1.05, 14.42), // B: de speler stapt onder de stelling
  // Midden in de gang, bijna achter Henk: als hij afdaalt staat de staander naast hem in beeld
  // (vanaf de stop staat die precies achter zijn hoofd).
  watch: V(-0.45, 13.25),
  henkMeet: V(3.0, 12.55), // A: hier wacht Henk de speler met de steiger op
  henkWait: V(-0.9, 12.75), // A: hier staat Henk als de steiger tegen de stelling staat
  talkA2: V(0.7, 13.0), // A: hier staat de speler bij "Vorig jaar is Ahmed zo gevallen" (~1,6 m)
  steigerWatch: V(1.3, 12.9), // A: hier kijkt de speler als Henk de steiger op klimt
  flStart: V(0.6, -5.5),
  flStop: V(0.6, 10.6), // vorken net tot in de gang, Marco ~4 m van de speler
  sandraStart: V(1.6, 3.0),
  sandraStop: V(0.9, 13.0),
};
const STEIGER_X = HENK_BAY.x1 - 0.66; // A: steiger onder de doos
const STEIGER_TRAVEL_Z = RACK - 0.12; // tijdens het rijden niet langs de aanrijdbeveiliging schuren

// ------------------------------------------------------------------
// Wereld en personages
// ------------------------------------------------------------------
let worldGroup;
let aisle;
let henk;
let marco;
let sandra;
let picker;
let walker;
let fl;
let cast = [];
const blobs = [];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

async function makeCast() {
  worldGroup = buildWorld(scene, renderer);
  aisle = buildAisle(scene);

  fl = new Forklift({ number: '07' });
  scene.add(fl.root);
  const flShadow = softShadow(1.7, 2.9, 0.55, false);
  flShadow.position.set(0, 0.006, -0.05);
  flShadow.rotation.x = -Math.PI / 2;
  fl.root.add(flShadow);

  // Realistische personages (Microsoft Rocketbox, MIT-licentie). Henk: Male_Adult_05 met
  // grijzend haar en een geel hesje (texturen m009 in models/tex).
  [henk, marco, sandra, picker, walker] = await Promise.all([
    Human.load({ model: 'models/henk.fbx', code: 'm009', anims: 'models/anim_m' }),
    Human.load({ model: 'models/marco.fbx', code: 'm108', anims: 'models/anim_m' }),
    Human.load({ model: 'models/sandra.fbx', code: 'f101', anims: 'models/anim_f' }),
    Human.load({ model: 'models/collega2.fbx', code: 'm102', anims: 'models/anim_m' }),
    Human.load({ model: 'models/collega3.fbx', code: 'm105', anims: 'models/anim_m' }),
  ]);
  cast = [henk, marco, sandra, picker, walker];
  for (const p of cast) {
    scene.add(p.root);
    const b = softShadow(0.95, 0.95, 0.5, true);
    scene.add(b);
    blobs.push({ p, b });
  }
  // Achtergrond: een orderpicker achter in de gang en een collega in de hoofdgang.
  picker.root.position.set(13.2, 0, 12.75);
  picker.root.rotation.y = Math.PI;
  picker.playForced('lookAround', 0.7, true);
  walker.root.position.set(-2.6, 0, -6);
  walkerLoop();
}

async function walkerLoop() {
  // Collega die in de hoofdgang heen en weer loopt (zichtbaar door de opening in rij S).
  for (;;) {
    await walker.walkTo([[-2.4, 6.5]], 1.2);
    await waitReal(2.5);
    await walker.walkTo([[-2.6, -8]], 1.2);
    await waitReal(4);
  }
}

function seatMarco() {
  fl.seatAnchor.add(marco.root);
  marco.cancelWalk();
  marco.root.position.set(0, 0, 0);
  marco.root.rotation.set(0, 0, 0);
  marco.seat = 1;
  marco.fidgetOK = false;
  marco.setHands('wheel');
  marco.lookTarget = null;
  marco.faceYaw = null;
}

const henkHead = (v) => henk.headWorld(v);
const marcoHead = (v) => marco.headWorld(v);
const sandraHead = (v) => sandra.headWorld(v);
// Camerarichting iets onder het hoofd: het gezicht in het bovenste deel van het beeld.
const faceOf = (p, dy = 0.22) => (v) => {
  p.headWorld(v).y -= dy;
  return v;
};

// ------------------------------------------------------------------
// Klimmen (procedureel: voeten en handen met IK op liggers, staander en leuning)
// ------------------------------------------------------------------
// climb.goal is waar het scenario Henks wortel (de grond onder zijn bekken) wil hebben. Per beeld
// zakt die zo ver als nodig, zodat elk vastgezet been zijn voet echt haalt: nooit een voet die
// boven de ligger zweeft. Zakken = door de knie van het steunbeen gaan.
const climb = {
  on: false,
  goal: new THREE.Vector3(),
  foot: { l: new THREE.Vector3(), r: new THREE.Vector3() },
  hand: { l: new THREE.Vector3(), r: new THREE.Vector3() },
};
const _hip = new THREE.Vector3();

function holdRoot() {
  if (!climb.on) return;
  const r = henk.root.position;
  const reach = (henk.thighLen + henk.calfLen) * 0.97;
  let y = climb.goal.y;
  for (const s of ['l', 'r']) {
    if (!henk.feet[s].on) continue;
    const a = henk.feet[s].p;
    // Heup t.o.v. de wortel (uit het vorige beeld), op de gewenste plek.
    henk.bones.leg[s].up.getWorldPosition(_hip).sub(r).add(climb.goal);
    const dh = Math.hypot(_hip.x - a.x, _hip.z - a.z);
    const up = _hip.y - climb.goal.y;
    if (dh < reach) y = Math.min(y, a.y + Math.sqrt(reach * reach - dh * dh) - up);
  }
  r.set(climb.goal.x, y, climb.goal.z);
}

// Plekken op de stelling.
const onBeam = (x, lv) => new THREE.Vector3(x, lv + ANK, RACK - 0.06); // bal van de voet op de ligger
const onFloor = (x, z) => new THREE.Vector3(x, ANK, z);
const postGrip = (y) => new THREE.Vector3(POST_X - 0.075, y, RACK - 0.015); // om de staander
const beamGrip = (x, lv) => new THREE.Vector3(x, lv + 0.045, RACK - 0.05); // over de ligger
// Waar de rechterhand de doos vasthoudt (vingers onder de voorrand).
function boxGrip(v, deeper = 0) {
  const b = aisle.box.position;
  return v.set(b.x + 0.04, b.y - 0.12 + deeper * 0.5, b.z - 0.25 + deeper);
}

// Punt v soepel naar `to` bewegen (minimum-jerk), met een boogje: omhoog (lift) en weg van de
// stelling (out). Voor voeten: tenen iets omlaag tijdens de zwaai.
function glide(v, to, dur, { lift = 0, out = 0, foot = null } = {}) {
  const from = v.clone();
  const end = to.clone();
  return tween(dur, (k) => {
    const e = ease(k);
    const a = Math.sin(Math.PI * k);
    v.lerpVectors(from, end, e);
    v.y += a * lift;
    v.z -= a * out;
    if (foot) henk.feet[foot].pitch = a * 0.35;
  });
}

// Handstand per greep, in de assen van Henks lichaam (x = links, y = omhoog, z = vooruit):
// [richting van de vingers, richting van de duimkant].
const HOLD = {
  post: { l: [[1, 0, 0.35], [0, 1, 0]], r: [[0.3, 0, 1], [0, 1, 0]] }, // om de staander links van hem
  beam: { l: [[0, -0.7, 1], [-1, 0, 0]], r: [[0, -0.7, 1], [1, 0, 0]] }, // over de ligger, handpalm omlaag
  rail: { l: [[1, -0.6, 0.2], [0, 0, 1]], r: [[-1, -0.6, 0.2], [0, 0, 1]] }, // om de leuning
  box: { l: [[0, 0, 1], [0, 1, 0]], r: [[0, 0.5, 1], [-1, 0, 0]] }, // vingers onder de voorrand van de doos
  carry: { l: [[0, 0, 1], [0, 1, 0]], r: [[0, 0, 1], [0, 1, 0]] }, // doos aan de zijkanten vast
};

// Hand naar een nieuwe greep: vastpakken met de juiste handstand en er met een boogje heen.
function moveHand(side, to, dur, kind, opts = {}) {
  henk.grip(side, climb.hand[side], { ori: HOLD[kind][side] });
  return glide(climb.hand[side], to, dur, opts);
}

function turnHenk(yaw, dur) {
  const y0 = henk.root.rotation.y;
  return tween(dur, (k) => (henk.root.rotation.y = y0 + shortAngle(yaw - y0) * ease(k)));
}

// Metalen tik als een voet op een ligger of trede komt.
function clink(gain = 0.22) {
  if (audio.ready) audio.clank(henk.panner, 0, 620 + Math.random() * 180, gain);
}

// Henk in de stelling: voeten op de tweede ligger, linkerhand aan de staander, rechterhand bij
// de doos. yaw: iets naar rechts gedraaid (naar de doos en de gang).
function placeOnBeam(yaw) {
  henk.cancelWalk();
  henk.lockYaw = true;
  henk.fidgetOK = false;
  henk.faceYaw = null;
  henk.torsoFollow = 0.5;
  henk.root.rotation.set(0, yaw, 0);
  climb.on = true;
  climb.goal.set(HX, LV[1] - 0.025, RACK - 0.14);
  henk.root.position.copy(climb.goal);
  climb.foot.l.copy(onBeam(HX + 0.13, LV[1]));
  climb.foot.r.copy(onBeam(HX - 0.1, LV[1]));
  climb.hand.l.copy(postGrip(1.98));
  boxGrip(climb.hand.r);
  for (const s of ['l', 'r']) {
    henk.pinFoot(s, climb.foot[s], { instant: true });
    henk.grip(s, climb.hand[s], { instant: true, ori: HOLD[s === 'l' ? 'post' : 'box'][s] });
  }
}

// Van de tweede ligger naar beneden, zoals het hoort: naar de stelling toe, steeds drie
// steunpunten (twee handen en een voet, of twee voeten en een hand), via de eerste ligger, en
// het laatste stuk niet springen. De handen gaan na elke stap omlaag mee, zodat ze niet boven
// zijn hoofd blijven hangen. Duurt ~8 s.
async function climbDown(id) {
  const h = henk;
  h.settle(30);
  h.lookTarget = V(HX - 0.1, RACK - 0.05, LV[0]);
  h.torsoFollow = 0.15;
  // Recht voor de stelling gaan staan (iets naar de staander toe), rechterhand over de derde
  // ligger, ruim naast zijn hoofd.
  await Promise.all([turnHenk(0.25, 0.8), moveHand('r', beamGrip(HX - 0.32, LV[2]), 0.9, 'beam', { out: 0.1 })]);
  guard(id);
  // 1. Rechtervoet naar de eerste ligger (het linkerbeen zakt mee door de knie).
  h.lean = -0.08;
  glide(climb.goal, V(HX, RACK - 0.2, LV[0] - 0.03), 1.5);
  await glide(climb.foot.r, onBeam(HX - 0.1, LV[0]), 1.5, { lift: 0.04, out: 0.16, foot: 'r' });
  guard(id);
  clink();
  // 2. Handen omlaag: eerst links lager aan de staander, dan rechts van de ligger naar de
  // staander, net onder de linker (borsthoogte).
  await moveHand('l', postGrip(1.62), 0.6, 'post', { out: 0.06 });
  guard(id);
  await moveHand('r', postGrip(1.56), 0.7, 'post', { out: 0.1 });
  guard(id);
  // 3. Linkervoet erbij op de eerste ligger.
  h.lookTarget = V(HX + 0.1, RACK - 0.05, LV[0]);
  await glide(climb.foot.l, onBeam(HX + 0.13, LV[0]), 1.1, { lift: 0.05, out: 0.14, foot: 'l' });
  guard(id);
  clink(0.18);
  // 4. Rechtervoet naar de vloer.
  h.lookTarget = V(HX - 0.1, RACK - 0.4, 0);
  glide(climb.goal, V(HX, RACK - 0.3, 0), 1.5);
  await glide(climb.foot.r, onFloor(HX - 0.1, RACK - 0.3), 1.5, { lift: 0.03, out: 0.1, foot: 'r' });
  guard(id);
  if (audio.ready) audio.step(0.3, h.panner);
  // 4. Linkervoet naar de vloer, rustig opstaan.
  await glide(climb.foot.l, onFloor(HX + 0.13, RACK - 0.28), 1.1, { lift: 0.03, out: 0.1, foot: 'l' });
  guard(id);
  if (audio.ready) audio.step(0.26, h.panner);
  h.lean = 0;
  await wait(0.3);
  guard(id);
  standFree();
}

// Klimmen klaar: handen los, voeten weer van de animatie, gewoon staan. De wortel komt zacht
// terug op de vloer (holdRoot kan hem een paar centimeter hebben laten zakken), net zo snel als
// de voeten van hun punt naar de animatie gaan.
function standFree() {
  const h = henk;
  climb.on = false;
  for (const s of ['l', 'r']) {
    h.grip(s, null);
    h.pinFoot(s, null);
  }
  const y0 = h.root.position.y;
  tween(0.45, (k) => (h.root.position.y = y0 * (1 - ease(k))));
  h.lockYaw = false;
  h.lean = 0;
  h.torsoFollow = 0;
  h.fidgetOK = true;
}

// Rolsteiger op: drie treden en het platform, handen langs de leuning. Duurt ~4 s.
async function climbSteiger(id) {
  const h = henk;
  const st = aisle.steiger;
  const sx = st.position.x;
  const tread = (i) => st.localToWorld(st.userData.tread(i));
  // Leuning (y op afstand z langs de treden), links en rechts.
  const z0 = st.position.z - STEIGER.platformDepth - STEIGER.steps * STEIGER.step - 0.1;
  const run = st.position.z - STEIGER.platformDepth - z0;
  const railAt = (side, z) => {
    const zz = Math.min(z, st.position.z - STEIGER.platformDepth - 0.05);
    return new THREE.Vector3(sx + (side === 'l' ? 1 : -1) * (STEIGER.width / 2 + 0.02), ((zz - z0) / run) * STEIGER.platform + 0.95, zz);
  };
  h.lockYaw = true;
  h.fidgetOK = false;
  h.root.rotation.y = 0;
  climb.on = true;
  climb.goal.copy(h.root.position);
  // Handen en voeten meteen vast op waar ze nu zijn (geen overvloeien vanuit de animatie) en dan
  // rustig naar de leuning en hun plek op de vloer.
  const z = h.root.position.z;
  for (const s of ['l', 'r']) {
    h.bones.leg[s].foot.getWorldPosition(climb.foot[s]);
    h.handWorld(s, climb.hand[s]);
    h.pinFoot(s, climb.foot[s], { instant: true });
    h.grip(s, climb.hand[s], { instant: true, ori: HOLD.rail[s] });
  }
  h.lookTarget = tread(2).add(_a.set(0, 0, 0.2));
  await Promise.all([
    glide(climb.foot.l, onFloor(sx + 0.12, z + 0.03), 0.4),
    glide(climb.foot.r, onFloor(sx - 0.1, z + 0.03), 0.4),
    glide(climb.hand.l, railAt('l', z + 0.35), 0.5),
    glide(climb.hand.r, railAt('r', z + 0.35), 0.5),
  ]);
  guard(id);
  for (let i = 1; i <= STEIGER.steps + 1; i++) {
    const s = i % 2 ? 'r' : 'l';
    const t = tread(i);
    const top = i === STEIGER.steps + 1;
    const to = V(sx + (s === 'l' ? 0.12 : -0.1), t.z + (top ? 0.1 : 0.02), t.y + ANK);
    h.lookTarget = tread(Math.min(i + 1, STEIGER.steps + 1));
    const body = V(sx, t.z - (top ? 0.05 : 0.16), Math.max(0, t.y - STEIGER.step * 0.6));
    glide(climb.goal, body, 0.85);
    glide(climb.hand[s === 'l' ? 'r' : 'l'], railAt(s === 'l' ? 'r' : 'l', body.z + 0.4), 0.85);
    await glide(climb.foot[s], to, 0.85, { lift: 0.12, out: 0.06, foot: s });
    guard(id);
    clink(0.16);
  }
  // Laatste voet erbij op het platform en rechtop staan.
  const pf = tread(STEIGER.steps + 1);
  glide(climb.goal, V(sx, pf.z + 0.08, STEIGER.platform - 0.02), 0.8);
  await glide(climb.foot.r, V(sx - 0.11, pf.z + 0.12, STEIGER.platform + ANK), 0.8, { lift: 0.1, out: 0.05, foot: 'r' });
  guard(id);
  clink(0.14);
}

// ------------------------------------------------------------------
// De doos
// ------------------------------------------------------------------
// Vrije val met stuiteren en tollen (bij B), anders ligt hij stil of in Henks handen.
const fall = { on: false, v: new THREE.Vector3(), w: new THREE.Vector3(), landed: false };
let boxCarried = false; // Henk houdt de doos met twee handen vast

function resetBox() {
  const b = aisle.box;
  b.position.copy(b.userData.home.pos);
  b.quaternion.copy(b.userData.home.quat);
  fall.on = false;
  boxCarried = false;
}

// Henk trekt de doos een stukje naar zich toe.
function tugBox(dz = 0.04, dur = 0.35) {
  const b = aisle.box;
  const z0 = b.position.z;
  if (audio.ready) audio.scrape(henk.panner, dur * 0.8, 0.06);
  return tween(dur, (k) => (b.position.z = z0 - dz * ease(k)));
}

const _q = new THREE.Quaternion();
const _m3 = new THREE.Matrix4();
const BOX_HALF = [0.21, 0.15, 0.23];
// Halve hoogte van de doos in stand q (hoe ver de onderkant onder het midden ligt).
function halfHeight(q) {
  const e = _m3.makeRotationFromQuaternion(q).elements;
  return Math.abs(e[1]) * BOX_HALF[0] + Math.abs(e[5]) * BOX_HALF[1] + Math.abs(e[9]) * BOX_HALF[2];
}

function updateBox(dt) {
  const b = aisle.box;
  if (boxCarried) {
    henk.handWorld('l', _a);
    henk.handWorld('r', _b);
    b.position.addVectors(_a, _b).multiplyScalar(0.5);
    b.position.y -= 0.02;
    b.rotation.set(0, henk.root.rotation.y, 0);
    return;
  }
  if (!fall.on || !(dt > 0)) return;
  fall.v.y -= 9.81 * dt;
  b.position.addScaledVector(fall.v, dt);
  _q.setFromAxisAngle(_a.copy(fall.w).normalize(), fall.w.length() * dt);
  if (fall.w.lengthSq() > 1e-6) b.quaternion.premultiply(_q);
  const hh = halfHeight(b.quaternion);
  if (b.position.y < hh && fall.v.y < 0) {
    b.position.y = hh;
    if (!fall.landed && audio.ready) audio.boxDrop(boxPanner, 0.9);
    if (!fall.landed) onBoxLanded();
    fall.landed = true;
    fall.v.y = Math.abs(fall.v.y) < 1.2 ? 0 : -fall.v.y * 0.22;
    fall.v.x *= 0.5;
    fall.v.z *= 0.5;
    fall.w.multiplyScalar(0.35);
    // Op de vloer: plat neerleggen (dichtstbijzijnde zijde onder).
    if (fall.v.y === 0) {
      const e = new THREE.Euler().setFromQuaternion(b.quaternion, 'YXZ');
      const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
      e.x = snap(e.x);
      e.z = snap(e.z);
      const target = new THREE.Quaternion().setFromEuler(e);
      const q0 = b.quaternion.clone();
      const p0 = b.position.clone();
      fall.on = false;
      const p1 = new THREE.Vector3(p0.x + fall.v.x * 0.15, halfHeight(target), p0.z + fall.v.z * 0.15);
      tween(0.25, (k) => {
        b.quaternion.slerpQuaternions(q0, target, ease(k));
        b.position.lerpVectors(p0, p1, ease(k));
      });
    }
  }
}
let onBoxLanded = () => {};

// ------------------------------------------------------------------
// De rolsteiger duwen
// ------------------------------------------------------------------
const push = { on: false, offset: new THREE.Vector3(), prev: new THREE.Vector3(), speed: 0 };
function updatePush(dt) {
  const st = aisle.steiger;
  if (push.on) {
    const k = 1 - Math.exp(-10 * dt);
    st.position.x += (rig.position.x + push.offset.x - st.position.x) * k;
    st.position.z += (rig.position.z + push.offset.z - st.position.z) * k;
  }
  if (dt > 0) {
    const v = st.position.distanceTo(push.prev) / dt;
    push.speed += (v - push.speed) * (1 - Math.exp(-8 * dt));
    // Een beetje wiebelen als hij rijdt.
    st.rotation.z = Math.sin(simT * 13) * 0.004 * Math.min(1, push.speed);
  }
  push.prev.copy(st.position);
}

function resetSteiger() {
  const st = aisle.steiger;
  push.on = false;
  st.position.copy(STEIGER_PARK).setZ(RACK - 0.03);
  st.rotation.set(0, 0, 0);
  push.prev.copy(st.position);
}

// ------------------------------------------------------------------
// Begintoestand
// ------------------------------------------------------------------
function resetScene(state) {
  stopVoice();
  hideSub();
  playerStop();
  look.uYaw = 0;
  look.uPitch = 0;
  S.outcome = null;
  showHud(false);
  for (const p of [henk, marco, sandra]) {
    p.resetLife();
    p.clearForced();
    p.cancelWalk();
    p.lockYaw = false;
    p.talk = null;
    p.stopSpeaking();
    p.pant = 0;
    p.setAim('l', null);
    p.setAim('r', null);
    p.mood = {};
    p.anger = p.angerTarget = 0;
    p.surprise = 0;
    p.lean = 0;
    p.lookTarget = null;
    p.setHands('relaxed');
  }
  picker.lookTarget = walker.lookTarget = null;
  resetBox();
  resetSteiger();
  tugging = false;
  onBoxLanded = () => {};
  // Henk in de stelling, Marco op de heftruck verderop in de hoofdgang, Sandra nog niet in beeld.
  henk.mood = { worry: 0.15 };
  placeOnBeam(-0.38);
  fl.cancelDrive();
  fl.setSpeedInstant(0);
  fl.root.position.copy(P.flStart);
  fl.root.rotation.y = 0;
  fl.on = false;
  seatMarco();
  sandra.root.visible = false;
  sandra.root.position.copy(P.sandraStart);
  sandra.setHands('clipboard');

  if (state === 'start') {
    rig.position.copy(P.start);
    henk.lookTarget = boxLook;
    aisle.box.position.z += 0.1; // Henk heeft hem nog niet naar voren getrokken
    lookDir(yawTo(P.start, P.walk1), -0.06);
    snapLook();
  } else if (state === 'choice') {
    rig.position.copy(P.stop);
    climb.hand.r.copy(beamGrip(HX - 0.3, LV[2]));
    henk.grip('r', climb.hand.r, { instant: true, ori: HOLD.beam.r });
    henk.lookTarget = playerHead;
    onChoice();
    snapLook();
  }
}

const boxLook = (v) => v.copy(aisle.box.position).add(_b.set(0, -0.05, -0.2));

// ------------------------------------------------------------------
// Spreken
// ------------------------------------------------------------------
// Emotie per regel (mond, kaak, gezicht). laugh: stukken waarin de opname lacht.
const LINE_EMO = {
  h1: { shout: 0.35, smile: 0.15 },
  a1: { sarcasm: 0.35, worry: 0.1 },
  a2: { worry: 0.55, sad: 0.3 },
  b1: { worry: 0.4, shout: 0.3 },
  b2: { smile: 0.3, worry: 0.6, laugh: [[0.16, 0.88]] },
  b3: { shout: 0.55, worry: 0.3 },
  c1: { shout: 0.85 },
  c2: { shout: 0.2, worry: 0.2 },
  c3: { sarcasm: 0.3, sad: 0.15 },
};

const PEOPLE = { henk: () => henk, marco: () => marco, sandra: () => sandra };

// ------------------------------------------------------------------
// Het scenario
// ------------------------------------------------------------------
async function runIntro(id) {
  resetScene('start');
  setPhase('intro');
  if (audio.ready) audio.ambience();
  showHud(true);
  // Eerst op de scanner kijken: welk vak?
  lookDir(yawTo(P.start, P.walk1), -0.5, 2.2);
  // Henk trekt intussen aan de doos.
  detach(tugLoop(id));
  await wait(2.8);
  guard(id);
  const walk = playerWalk([P.walk1, P.walk2, P.stop], 0.95);
  lookDir(yawTo(P.start, P.walk1), -0.12, 1.4);
  // Een metalen tik verderop: de speler kijkt op en ziet Henk in de stelling staan.
  await until(() => rig.position.x > -7.4);
  guard(id);
  clink(0.35);
  lookAtFn(faceOf(henk, 0.35), 1.2);
  later(id, 1.2, () => showHud(false));
  await walk;
  guard(id);
  // Even kijken: hij staat daar echt, zonder trap, en rekt zich uit naar de doos.
  lookAtFn(faceOf(henk, 0.25), 1.6);
  await wait(2.2);
  guard(id);
  // Henk merkt de speler op en kijkt om; zijn rechterhand gaat naar de ligger.
  tugging = false;
  henk.lookTarget = playerHead;
  henk.surprise = 0.2;
  henk.torsoFollow = 0.55;
  moveHand('r', beamGrip(HX - 0.3, LV[2]), 0.7, 'beam', { out: 0.06 });
  await wait(0.9);
  guard(id);
  await say(id, 'h1', [
    [2.75, () => (henk.lookTarget = boxLook)],
    [3.35, () => (henk.lookTarget = playerHead)],
  ]);
  await wait(0.4);
  guard(id);
  goChoice();
}

let tugging = false;
async function tugLoop(id) {
  // Reiken en trekken: hand naar de doos, kort trekken, even uitrusten, opnieuw.
  tugging = true;
  for (let i = 0; tugging && id === runId; i++) {
    await moveHand('r', boxGrip(_a, 0.02), 0.5, 'box');
    guard(id);
    henk.inhale(0.4);
    await wait(0.3);
    guard(id);
    if (!tugging) break;
    if (i < 3) {
      tugBox(0.03, 0.35);
      henk.lean = 0.04;
    }
    await wait(0.6);
    guard(id);
    henk.lean = 0;
    if (!tugging) break;
    await glide(climb.hand.r, boxGrip(_a, -0.06).add(_b.set(0, -0.08, 0)), 0.5);
    guard(id);
    await wait(0.7 + Math.random() * 0.5);
    guard(id);
  }
}

// Bij de keuze kijkt Henk naar de speler (de tijd staat stil).
function onChoice() {
  henk.lookTarget = playerHead;
  henk.torsoFollow = 0.55;
  // Iets lager kijken, zodat Henks gezicht boven het keuzepaneel blijft.
  lookAtFn(faceOf(henk, 1.05), 2);
}

async function runBranch(id, key) {
  henk.lookTarget = playerHead;
  lookAtFn(faceOf(henk), 3);
  if (key === 'A') await branchA(id);
  else if (key === 'B') await branchB(id);
  else await branchC(id);
}

async function branchA(id) {
  // De speler zegt rustig wat hij ziet en voelt. Henk is even verbaasd, daarna wat mopperig.
  later(id, 1.2, () => (henk.surprise = 0.3));
  later(id, 3.2, () => (henk.mood = { worry: 0.25, sarcasm: 0.15 }));
  await playerSays(id, 'A');
  henk.sigh(0.9);
  await wait(0.7);
  guard(id);
  // "Ach, joh. Ik doe dit al vijfentwintig jaar." Hij schudt zijn hoofd en kijkt even naar de doos.
  await say(id, 'a1', [
    [0.7, () => henk.shake(0.7)],
    [1.7, () => (henk.lookTarget = boxLook)],
    [3.0, () => (henk.lookTarget = playerHead)],
  ]);
  henk.mood = { worry: 0.2 };
  // Toch komt hij naar beneden. De speler stapt het midden van de gang in (zo staat de staander
  // naast Henk in beeld), kijkt even en loopt dan naar de rolsteiger. Henk loopt na het afdalen
  // de speler tegemoet, wacht aan de gangkant en loopt naast de steiger mee terug.
  const st = aisle.steiger;
  const along = detach((async () => {
    await climbDown(id);
    guard(id);
    henk.lookTarget = playerHead;
    await henk.walkTo([[P.henkMeet.x, P.henkMeet.z]], 1.0);
    guard(id);
    henk.faceTowards(rig.position.x, rig.position.z);
    await until(() => push.on && rig.position.x < P.henkMeet.x + 0.25);
    guard(id);
    // Naast de speler (aan de gangkant, niet voor de camera langs), ogen op de steiger.
    henk.lookTarget = (v) => v.set(st.position.x, 1.1, st.position.z - 0.5);
    await henk.walkTo([[P.henkWait.x + 0.5, P.henkMeet.z], [P.henkWait.x, P.henkWait.z]], 1.15);
    guard(id);
    henk.lookTarget = playerHead;
    henk.faceTowards(P.talkA2.x, P.talkA2.z);
  })());
  await wait(0.6);
  guard(id);
  lookAtFn(faceOf(henk, 0.45), 2);
  await playerWalk([P.watch], 1.0);
  guard(id);
  await wait(1.4);
  guard(id);
  // Naast de treden gaan staan en de leuning pakken: de steiger rijdt links voor de speler uit.
  const grabAt = V(st.position.x + 0.55, 13.45);
  lookAtFn(() => _b.set(st.position.x, 1.0, st.position.z - 0.7), 1.6);
  await playerWalk([V(grabAt.x + 0.4, 13.3), grabAt], 1.55);
  guard(id);
  // De steiger een stukje van de stelling af trekken en dan naar Henks vak duwen. Eerst kijkt de
  // speler naar Henk die eraan komt, daarna vooruit naar de stelling.
  push.offset.set(st.position.x - rig.position.x, 0, STEIGER_TRAVEL_Z - rig.position.z);
  push.on = true;
  if (audio.ready) audio.clank(steigerPanner, 0, 380, 0.25);
  lookAtFn(faceOf(henk, 0.4), 1.6);
  detach((async () => {
    await until(() => rig.position.x < P.henkMeet.x + 1.5);
    guard(id);
    lookAtFn(() => _b.set(STEIGER_X - 0.4, 1.0, RACK - 0.3), 1.4);
  })());
  await playerWalk([V(STEIGER_X - push.offset.x, rig.position.z)], 1.1);
  guard(id);
  // Tegen de stelling aan schuiven.
  const z0 = st.position.z;
  await tween(0.5, (k) => (st.position.z = z0 + (RACK - 0.03 - z0) * ease(k)));
  guard(id);
  push.on = false;
  if (audio.ready) audio.clank(steigerPanner, 0, 300, 0.3);
  // Een stap terug: ruimte voor Henk.
  await along;
  guard(id);
  playerWalk([P.talkA2], 0.8);
  lookAtFn(faceOf(henk, 0.15), 2.4);
  await wait(0.8);
  guard(id);
  // "Je hebt gelijk. Vorig jaar is Ahmed zo gevallen." Zachter, eerlijk; bij Ahmed kijkt hij weg.
  henk.mood = { worry: 0.4 };
  await say(id, 'a2', [
    [0.9, () => henk.nod(0.7)],
    [2.9, () => (henk.lookTarget = V(STEIGER_X - 0.6, RACK - 0.5, 0.2))],
    [4.0, () => (henk.lookTarget = playerHead)],
  ]);
  henk.nod(0.6);
  henk.mood = { smile: 0.1 };
  await wait(0.5);
  guard(id);
  // Henk loopt naar de treden en klimt de steiger op, pakt de doos met twee handen. De speler
  // doet een stap opzij om hem de ruimte te geven.
  henk.lookTarget = null;
  playerWalk([P.steigerWatch], 0.8);
  const foot = st.localToWorld(st.userData.tread(1)).z - 0.5;
  await henk.walkTo([[STEIGER_X, foot]], 0.9);
  guard(id);
  henk.faceYaw = 0;
  await until(() => Math.abs(shortAngle(henk.root.rotation.y)) < 0.1);
  guard(id);
  lookAtFn(faceOf(henk, 0.1), 1.6);
  await climbSteiger(id);
  guard(id);
  henk.lookTarget = boxLook;
  const bx = aisle.box.position;
  await Promise.all([
    moveHand('l', _a.copy(bx).add(_b.set(0.25, -0.04, -0.06)), 0.9, 'carry', { out: 0.08 }),
    moveHand('r', _a.copy(bx).add(_b.set(-0.25, -0.04, -0.06)), 0.9, 'carry', { out: 0.08 }),
  ]);
  guard(id);
  // Doos naar zich toe tillen.
  boxCarried = true;
  const from = { l: climb.hand.l.clone(), r: climb.hand.r.clone() };
  const hold = V(STEIGER_X, RACK - 0.2, STEIGER.platform + 1.15);
  await tween(1.0, (k) => {
    const e = ease(k);
    climb.hand.l.lerpVectors(from.l, _a.copy(hold).add(_b.set(0.2, 0, 0)), e);
    climb.hand.r.lerpVectors(from.r, _a.copy(hold).add(_b.set(-0.2, 0, 0)), e);
  });
  guard(id);
  // Met de doos naar de speler draaien (twee kleine stapjes op het platform), knikken.
  henk.lookTarget = playerHead;
  henk.torsoFollow = 0.4;
  await pivotOnPlatform(id, 1.25);
  guard(id);
  henk.mood = { smile: 0.3 };
  later(id, 0.3, () => henk.nod(0.8));
  await wait(2.6);
  guard(id);
}

// Op het platform een kwartslag draaien met twee kleine stapjes (voeten blijven op het platform).
async function pivotOnPlatform(id, yaw) {
  const c = henk.root.position;
  const y0 = henk.root.rotation.y;
  const footAt = (side, a) => {
    const lx = side === 'l' ? 0.12 : -0.12;
    return V(c.x + lx * Math.cos(a) + 0.04 * Math.sin(a), c.z - lx * Math.sin(a) + 0.04 * Math.cos(a), climb.foot[side].y);
  };
  turnHenk(yaw, 1.2);
  await glide(climb.foot.l, footAt('l', y0 + (yaw - y0) * 0.6), 0.55, { lift: 0.06 });
  guard(id);
  clink(0.1);
  await glide(climb.foot.r, footAt('r', yaw), 0.55, { lift: 0.06 });
  guard(id);
  await glide(climb.foot.l, footAt('l', yaw), 0.4, { lift: 0.04 });
  guard(id);
  clink(0.1);
}

async function branchB(id) {
  // De speler zegt ja en stapt onder de stelling. Henk reikt verder, de doos schuift weg, zijn
  // voet glijdt van de ligger: hij hangt even scheef aan de staander.
  later(id, 0.6, () => (henk.mood = { smile: 0.25 }));
  await playerSays(id, 'B');
  lookAtFn(faceOf(henk, 0.1), 2);
  playerWalk([P.under], 0.9);
  henk.lookTarget = boxLook;
  henk.torsoFollow = 0.2;
  henk.mood = { worry: 0.2 };
  await moveHand('r', boxGrip(_a, 0.06), 0.7, 'box');
  guard(id);
  // Marco komt intussen de hoofdgang op rijden.
  fl.on = true;
  later(id, 2.0, () => fl.driveTo(P.flStop.x, P.flStop.z, { maxSpeed: 2.6, accel: 1.2, decel: 1.6 }));
  onBoxLanded = () => {
    shake(0.06);
    flinch(V(-0.45, -0.25), 0.45);
    if (audio.ready) audio.heartbeat(6, 0.78, 0.8);
    later(id, 0.2, () => lookAtFn(faceOf(henk, 0.35), 3.2));
  };
  await say(id, 'b1', [
    // "Wacht…": verder op de tenen, dieper in de stelling.
    [0.7, () => {
      glide(climb.hand.r, boxGrip(_a, 0.16).add(_b.set(0, 0.06, 0)), 0.8);
      glide(climb.goal, V(HX - 0.03, RACK - 0.1, LV[1]), 0.8);
      tugBox(0.06, 0.6);
    }],
    // "nog een stukje…": de doos komt over de rand.
    [1.9, () => {
      tugBox(0.16, 0.8);
      henk.lean = 0.06;
    }],
    [2.75, () => tugBox(0.16, 0.5)],
    // "Ho!": doos kantelt weg, rechtervoet glijdt van de ligger.
    [3.3, () => slip(id)],
  ]);
  await wait(1.2);
  guard(id);
  // Voet terug op de ligger, overeind komen, nahijgen.
  henk.lookTarget = V(HX - 0.1, RACK - 0.05, LV[1]);
  glide(climb.goal, V(HX, RACK - 0.14, LV[1] - 0.025), 0.9);
  turnHenk(-0.2, 0.9);
  henk.lean = 0;
  tween(0.8, (k) => (henk.root.rotation.z = 0.15 * (1 - ease(k))));
  await glide(climb.foot.r, onBeam(HX - 0.1, LV[1]), 0.9, { lift: 0.08, out: 0.05, foot: 'r' });
  guard(id);
  clink(0.25);
  henk.pant = 1;
  henk.lookTarget = playerHead;
  henk.torsoFollow = 0.55;
  await wait(0.5);
  guard(id);
  lookAtFn(faceOf(henk, 0.15), 2);
  await say(id, 'b2', [[1.2, () => (henk.lookTarget = V(-0.6, 14.7, 0.1))], [2.0, () => (henk.lookTarget = playerHead)]]);
  // Marco staat stil met de heftruck en roept.
  await until(() => !fl.target);
  guard(id);
  marco.lookTarget = henkHead;
  henk.lookTarget = marcoHead;
  lookAtFn(faceOf(marco, 0.1), 2.6);
  await wait(0.3);
  guard(id);
  await say(id, 'b3', [
    [0.1, () => (marco.angerTarget = 0.35)],
    [1.6, () => marco.jab('r', V(HX, RACK, 2.0), 0.55, 0.6)],
  ]);
  // Henk klimt naar beneden, een beetje beschaamd. De speler stapt onder de stelling vandaan, het
  // midden van de gang in: ruimte voor Henk.
  henk.mood = { worry: 0.35, sad: 0.15 };
  lookAtFn(faceOf(henk, 0.45), 1.6);
  playerWalk([P.watch], 0.8);
  later(id, 1.2, () => (marco.lookTarget = playerHead));
  await climbDown(id);
  guard(id);
  henk.lookTarget = marcoHead;
  await wait(0.8);
  guard(id);
  henk.lookTarget = playerHead;
  later(id, 0.4, () => henk.nod(0.5));
  await wait(1.8);
  guard(id);
}

// Uitglijden (B): de doos kantelt over de rand en valt, de rechtervoet schiet van de ligger, Henk
// grijpt met twee handen de staander en hangt even scheef. Schrik, geen slapstick.
function slip(id) {
  const b = aisle.box;
  fall.on = true;
  fall.landed = false;
  fall.v.set(-0.55, 0.25, -1.2);
  fall.w.set(-3.2, 0.6, 1.1);
  b.position.z -= 0.05;
  henk.surprise = 1;
  henk.mood = { worry: 0.85 };
  henk.lookTarget = (v) => v.copy(b.position);
  // De speler kijkt de doos even na, maar houdt Henk in beeld (half tussen Henk en de doos).
  lookAtFn((v) => faceOf(henk, 0.35)(v).lerp(b.position, 0.45), 5);
  if (audio.ready) audio.rackRing(henk.panner, 0.55);
  shake(0.03);
  // Voet weg: naar achteren en omlaag langs de ligger. Henk zakt een stukje door zijn linkerknie
  // en draait naar de staander toe, zodat hij er met twee handen bij kan.
  glide(climb.foot.r, V(HX - 0.2, RACK - 0.32, LV[1] - 0.3 + ANK), 0.22, { foot: 'r' });
  glide(climb.goal, V(HX + 0.1, RACK - 0.14, LV[1] - 0.06), 0.3);
  turnHenk(0.2, 0.35);
  henk.lean = 0.1;
  tween(0.35, (k) => (henk.root.rotation.z = 0.15 * ease(k)));
  // Beide handen om de staander (rechts onder links, allebei op schouderhoogte: binnen bereik).
  moveHand('r', postGrip(2.1), 0.28, 'post');
  moveHand('l', postGrip(2.32), 0.2, 'post');
  later(id, 0.9, () => (henk.lookTarget = V(HX, RACK - 0.1, LV[1])));
  bystandersLook(id, 4.5);
}

// Collega's verderop kijken op van het lawaai, niet tegelijk (ieder met een eigen vertraging).
function bystandersLook(id, hold) {
  [[picker, 0.3 + Math.random() * 0.2], [walker, 0.5 + Math.random() * 0.25]].forEach(([p, t]) => {
    later(id, t, () => {
      p.lookTarget = henkHead;
      p.surprise = p === picker ? 0.3 : 0.15;
    });
    later(id, t + hold, () => (p.lookTarget = null));
  });
}

async function branchC(id) {
  // De speler valt Henk aan en dreigt. Henk schrikt even, wordt dan boos en blijft staan.
  later(id, 0.7, () => henk.react('startle'));
  later(id, 1.6, () => (henk.angerTarget = 0.55));
  sandra.root.visible = true;
  sandra.root.position.copy(P.sandraStart);
  sandra.lookTarget = null;
  sandra.setHands('clipboard');
  const sw = sandra.walkTo([[1.2, 10.2], [P.sandraStop.x, P.sandraStop.z]], 1.5);
  await playerSays(id, 'C');
  henk.angerTarget = 0.85;
  henk.setHands('angry');
  henk.torsoFollow = 0.7;
  // Henk draait zich verder om naar de speler; rechterhand los voor het gebaar.
  turnHenk(-0.6, 0.6);
  later(id, 0.5, () => flinch(V(-0.12, -0.08), 0.5, false));
  await say(id, 'c1', [
    [0.0, () => {
      henk.grip('r', null);
      henk.setHands('shout');
    }],
    [0.6, () => bystandersLook(id, 6)],
    // "groentje": prikken naar de speler.
    [1.15, () => henk.jab('r', playerChest(new THREE.Vector3()), 0.6, 0.75)],
    // "vijfentwintig jaar": wegwuiven.
    [2.55, () => henk.jab('r', henk.root.localToWorld(new THREE.Vector3(-0.7, 1.6, 0.25)), 0.75, 0.6)],
  ]);
  henk.setHands('angry');
  climb.hand.r.copy(beamGrip(HX - 0.3, LV[2]));
  henk.grip('r', climb.hand.r, { ori: HOLD.beam.r });
  // Sandra komt eraan. De speler stapt achteruit het midden van de gang in, naar haar toe.
  sandra.lookTarget = henkHead;
  lookAtFn(faceOf(sandra, 0.1), 1.8);
  playerWalk([P.watch], 0.8);
  await sw;
  guard(id);
  sandra.faceTowards((HX + rig.position.x) / 2, (RACK + rig.position.z) / 2);
  sandra.lookTarget = playerHead;
  henk.lookTarget = sandraHead;
  await wait(0.3);
  guard(id);
  await say(id, 'c2', [
    [0.0, () => sandra.setHands('firm')],
    [1.5, () => (sandra.lookTarget = henkHead)],
    [2.4, () => sandra.jab('r', V(HX - 0.3, RACK - 0.6, 0.1), 0.8, 0.5)],
  ]);
  // "Ja, ja. Ik kom al." Hij kijkt de speler niet meer aan.
  henk.angerTarget = 0.45;
  henk.setHands('relaxed');
  sandra.setHands('relaxed');
  lookAtFn(faceOf(henk, 0.2), 2);
  await say(id, 'c3', [[0.2, () => henk.shake(0.4)], [1.4, () => (henk.lookTarget = V(HX, RACK - 0.1, LV[0]))]]);
  lookAtFn(faceOf(henk, 0.4), 1.4);
  await climbDown(id);
  guard(id);
  // Beneden: naar Sandra, niet naar de speler.
  henk.lookTarget = sandraHead;
  henk.faceTowards(sandra.root.position.x, sandra.root.position.z);
  sandra.lookTarget = henkHead;
  henk.angerTarget = 0.3;
  // Beiden in beeld: de blik tussen Henk en Sandra in.
  lookAtFn((v) => faceOf(sandra, 0.25)(v).add(faceOf(henk, 0.25)(_a)).multiplyScalar(0.5), 1.4);
  await wait(2.4);
  guard(id);
}

// Scanner-scherm tijdens de intro.
const hudEl = $('#hud');
function showHud(on) {
  hudEl.hidden = !on;
}

// ------------------------------------------------------------------
// Geluid
// ------------------------------------------------------------------
let distantPanner = null;
let boxPanner = null;
let steigerPanner = null;
let castorSnd = null;
let nextDistant = 6;

function setupAudio() {
  for (const p of [henk, marco, sandra]) {
    p.panner = audio.spatial({ ref: 1.4, rolloff: 1.2 });
    p.breathSnd = audio.breather(p.panner);
    p.onStep = () => audio.step(0.26, p.panner);
  }
  fl.panner = audio.spatial({ ref: 2.2, rolloff: 1.0 });
  fl.engineSnd = audio.engine(fl.panner);
  fl.beeperSnd = audio.beeper(fl.panner);
  distantPanner = audio.spatial({ ref: 3, rolloff: 1 });
  boxPanner = audio.spatial({ ref: 1.2, rolloff: 1.2 });
  steigerPanner = audio.spatial({ ref: 1.2, rolloff: 1.2 });
  castorSnd = audio.castors(steigerPanner);
}

function updateAudio(dt, camPos) {
  for (const p of [henk, marco, sandra]) {
    p.headWorld(tmp);
    audio.place(p.panner, tmp);
    // Hoe verder weg, hoe meer galm van de hal.
    audio.setWet(p.panner, THREE.MathUtils.clamp(0.25 + tmp.distanceTo(camPos) * 0.09, 0.25, 0.95));
    p.breathSnd?.set(p.breath * 0.5 + p.pant * (0.55 + 0.45 * Math.sin(p.time * 7.5)), Math.sin(p.time * 7.5) > 0);
  }
  audio.place(boxPanner, aisle.box.position);
  audio.place(steigerPanner, _a.copy(aisle.steiger.position).setY(0.3));
  castorSnd.set(push.speed);
  audio.place(fl.panner, fl.root.localToWorld(tmp.set(0, 1.0, 0)));
  fl.engineSnd.set(fl.speed, fl.on);
  if (fl.speed < -0.05) fl.beeperSnd.on();
  else fl.beeperSnd.off();
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
    look.fYaw = yawTo(P.start, P.stop) - 0.15 + Math.sin(simT * 0.11) * 0.35;
    look.fPitch = 0.02;
  }
  holdRoot();
  updatePush(dt);
  fl.update(wdt);
  for (const p of cast) p.update(wdt);
  updateBox(wdt);
  worldGroup?.userData.update?.(dt, simT);
  for (const { p, b } of blobs) {
    const show = p.root.visible && p.root.parent === scene && p.seat < 0.5 && p.root.position.y < 0.05;
    b.visible = show;
    if (show) b.position.set(p.root.position.x, 0.006, p.root.position.z);
  }
}

start({
  texts: { UI, LINES, CHOICES, OUTCOMES },
  choiceIcon: HENK_CHOICE_ICON,
  subColors: { henk: '#7cc4ff', marco: '#f2c500', sandra: '#ff8a3d', you: '#5fd48b' },
  lineEmo: LINE_EMO,
  lipsync: 'models/lipsync_henk.json',
  audioDir: 'audio/henk/',
  person: (who) => PEOPLE[who](),
  build: makeCast,
  reset: resetScene,
  intro: runIntro,
  onChoice,
  branch: runBranch,
  update,
  setupAudio,
  updateAudio,
  debug: {
    get henk() { return henk; },
    get marco() { return marco; },
    get sandra() { return sandra; },
    get fl() { return fl; },
    get aisle() { return aisle; },
    get climb() { return climb; },
    renderer,
  },
});
