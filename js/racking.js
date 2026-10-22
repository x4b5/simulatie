import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, std, softShadow, mulberry32 } from './world.js';

// Orderpickgang voorin de hal (z 10 … 18), voor "Hoog en droog". Coördinaten in meters.
// Twee rijen lage stellingen voor dozen en bakken, met liggers op vier hoogtes:
//  - rij N (z 15–16) met de voorkant naar de gang (-z); hier staat Henk in vak 12-04,
//  - rij S (z 11–12) met de voorkant naar de gang (+z); in rij S zit een opening naar de
//    hoofdgang van de heftrucks (x -5.0 … 5.8), zodat je de rest van de hal ziet.
// Verder: de voorgevel (z = 18), lampen boven de gang, de rolsteiger, Henks orderkar en de doos
// bovenin waar het om draait.

export const AISLE = {
  z: 13.5, // middellijn van de gang
  faceN: 15.0, // voorkant van rij N
  faceS: 12.0, // voorkant van rij S
  depth: 1.0, // diepte van een stelling
  x0: -10.4, // eerste staander
  bay: 2.7, // breedte van een vak
  bays: 10,
  gapS: [-5.0, 5.8], // opening in rij S naar de hoofdgang
  levels: [0.5, 0.95, 2.15, 3.3], // bovenkant van de liggers (1e, 2e, 3e, 4e ligger)
  top: 4.1, // hoogte van de staanders
  wallZ: 18,
};
const BEAM_H = 0.11;
// Henk staat in rij N in het vak links van de staander op x = 0.4 (gezien vanuit de gang).
export const HENK_BAY = { x0: -2.3, x1: 0.4 };
// Waar de rolsteiger staat (midden van het platform, tegen rij N).
export const STEIGER_PARK = new THREE.Vector3(7.15, 0, AISLE.faceN);

const rand = mulberry32(23);
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

// ------------------------------------------------------------------
// Texturen
// ------------------------------------------------------------------
function cartonTexture(variant) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = variant === 1 ? '#d8cfbf' : '#c69a64';
    g.fillRect(0, 0, w, h);
    // Golfkarton: fijne verticale strepen en vlekjes.
    g.fillStyle = 'rgba(0,0,0,0.035)';
    for (let x = 0; x < w; x += 5) g.fillRect(x, 0, 2, h);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(${rand() > 0.5 ? '60,40,20' : '255,240,220'},${0.04 + rand() * 0.05})`;
      g.fillRect(rand() * w, rand() * h, 2 + rand() * 10, 1 + rand() * 4);
    }
    // Plakband over het midden en de randen van de flappen.
    g.fillStyle = variant === 1 ? 'rgba(200,190,170,0.9)' : 'rgba(214,180,128,0.95)';
    g.fillRect(w * 0.44, 0, w * 0.12, h);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(0, h * 0.06, w, 3);
    g.fillRect(0, h * 0.94, w, 3);
    // Verzendetiket met streepjescode (niet op elke doos).
    if (variant !== 2) {
      g.fillStyle = '#f6f4ee';
      g.fillRect(w * 0.08, h * 0.56, w * 0.3, h * 0.26);
      g.fillStyle = 'rgba(25,25,25,0.85)';
      for (let i = 0; i < 4; i++) g.fillRect(w * 0.1, h * (0.59 + i * 0.035), w * (0.12 + rand() * 0.12), 3);
      for (let x = 0; x < 60; x += 3) if (rand() > 0.35) g.fillRect(w * 0.1 + x, h * 0.74, rand() > 0.5 ? 2 : 1, h * 0.06);
    }
    // Pijltjes "deze kant boven".
    if (variant === 0) {
      g.strokeStyle = 'rgba(30,30,30,0.6)';
      g.lineWidth = 3;
      for (const x of [w * 0.72, w * 0.8]) {
        g.beginPath();
        g.moveTo(x, h * 0.32);
        g.lineTo(x, h * 0.16);
        g.moveTo(x - 7, h * 0.22);
        g.lineTo(x, h * 0.15);
        g.lineTo(x + 7, h * 0.22);
        g.stroke();
      }
    }
  });
}

function binTexture() {
  // Blauwe stapelbak van voren: ribbels en een kaarthouder.
  return canvas(256, 128, (g, w, h) => {
    g.fillStyle = '#2f5f9e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 0, w, 10);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 18; x < w; x += 36) g.fillRect(x, 16, 6, h - 22);
    g.fillStyle = '#e9edf0';
    g.fillRect(w * 0.32, h * 0.35, w * 0.36, h * 0.32);
    g.fillStyle = 'rgba(20,20,20,0.75)';
    g.fillRect(w * 0.36, h * 0.43, w * 0.2, 4);
    g.fillRect(w * 0.36, h * 0.53, w * 0.26, 4);
  });
}

function deckTexture() {
  // Draadrooster op de liggers.
  const t = canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#9aa2a8';
    g.lineWidth = 3;
    for (let x = 4; x < w; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.lineWidth = 2;
    for (let y = 8; y < h; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 4);
  return t;
}

function treadTexture() {
  // Traanplaat/geperforeerde trede: stroef.
  const t = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#8d959b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#5e666c';
    for (let y = 6; y < h; y += 16) for (let x = (y / 16) % 2 ? 6 : 14; x < w; x += 16) g.fillRect(x, y, 6, 6);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

// Etiketten op de liggers: locatiecode met streepjescode, allemaal in één textuur.
const LABEL_COLS = 8;
const LABEL_ROWS = 16;
function labelAtlas(codes) {
  return canvas(1024, 1024, (g, w, h) => {
    const cw = w / LABEL_COLS;
    const ch = h / LABEL_ROWS;
    codes.forEach((code, i) => {
      const x = (i % LABEL_COLS) * cw;
      const y = Math.floor(i / LABEL_COLS) * ch;
      g.fillStyle = '#f5f3ea';
      g.fillRect(x + 2, y + 2, cw - 4, ch - 4);
      g.fillStyle = '#151515';
      g.font = `800 ${Math.round(ch * 0.5)}px ${FONT}`;
      g.textBaseline = 'middle';
      g.fillText(code, x + 8, y + ch * 0.36);
      for (let k = 0; k < 34; k++) if (((k * 7 + i * 3) % 5) > 1) g.fillRect(x + 8 + k * 3.4, y + ch * 0.68, (k % 3) + 1, ch * 0.22);
    });
  });
}

function signTexture(text, sub) {
  return canvas(512, 256, (g, w, h) => {
    g.fillStyle = '#1f2a36';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2b705';
    g.fillRect(0, 0, w, 18);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 140px ${FONT}`;
    g.fillText(text, w / 2, h * 0.5);
    g.font = `600 44px ${FONT}`;
    g.fillText(sub, w / 2, h * 0.86);
  });
}

// ------------------------------------------------------------------
// Opbouw
// ------------------------------------------------------------------
const unitBox = new THREE.BoxGeometry(1, 1, 1);

function instanced(group, list, mat, { colorize = null, shadow = true } = {}) {
  const m = new THREE.InstancedMesh(unitBox, mat, list.length);
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  list.forEach((it, i) => {
    o.position.set(it[0], it[1], it[2]);
    o.rotation.set(it[6] || 0, it[7] || 0, it[8] || 0);
    o.scale.set(it[3], it[4], it[5]);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (colorize) m.setColorAt(i, colorize(it, col));
  });
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.instanceMatrix.needsUpdate = true;
  group.add(m);
  return m;
}

// Eén stellingrij. face: z van de voorkant, dir: +1 als de voorkant naar +z kijkt, -1 naar -z.
// skip(i): vak i overslaan (opening). fill(i, level, xa, xb, z0, z1): dozen per vak en ligger.
function buildRow(parts, { face, dir, skip = () => false, label }) {
  const { x0, bay, bays, depth, levels, top } = AISLE;
  const zf = face;
  const zb = face - dir * depth;
  const zc = (zf + zb) / 2;
  const frames = new Set();
  for (let i = 0; i < bays; i++) {
    if (skip(i)) continue;
    frames.add(i);
    frames.add(i + 1);
    const xa = x0 + i * bay;
    const xb = xa + bay;
    const xm = (xa + xb) / 2;
    for (const [li, lv] of levels.entries()) {
      // Liggers voor en achter, met het draadrooster ertussen.
      for (const z of [zf - dir * 0.025, zb + dir * 0.025]) parts.beams.push([xm, lv - BEAM_H / 2, z, bay - 0.08, BEAM_H, 0.05]);
      parts.decks.push([xm, lv + 0.004, zc, bay - 0.08, 0.006, depth - 0.05]);
      // Etiket met locatiecode op de voorste ligger.
      parts.labels.push({ x: xm - bay * 0.32, y: lv - BEAM_H / 2, z: zf + dir * 0.002, dir, code: `${label}-${String(i + 1).padStart(2, '0')}-${'ABCD'[li]}` });
    }
  }
  for (const i of frames) {
    const x = x0 + i * bay;
    // Staanderframe: twee staanders met schoren ertussen en voetplaten.
    for (const z of [zf - dir * 0.035, zb + dir * 0.035]) {
      parts.posts.push([x, top / 2, z, 0.08, top, 0.07]);
      parts.feet.push([x, 0.006, z, 0.16, 0.012, 0.14]);
    }
    const span = depth - 0.07;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const y0 = 0.15 + (k * (top - 0.3)) / n;
      const y1 = 0.15 + ((k + 1) * (top - 0.3)) / n;
      const len = Math.hypot(span, y1 - y0);
      const ang = Math.atan2(y1 - y0, span) * (k % 2 ? 1 : -1) * dir;
      parts.braces.push([x, (y0 + y1) / 2, zc, 0.03, 0.03, len, ang, 0, 0]);
    }
    parts.braces.push([x, 0.15, zc, 0.03, 0.04, span]);
    parts.braces.push([x, top - 0.15, zc, 0.03, 0.04, span]);
    // Aanrijdbeveiliging aan de gangkant.
    parts.guards.push([x, 0.2, zf + dir * 0.06, 0.14, 0.4, 0.08]);
  }
  return { zf, zb, dir };
}

// Dozen en bakken in een vak: van links naar rechts gevuld, met hier en daar een gat. Dozen
// staan vanaf `front` m achter de voorkant (naar binnen = -dir), soms twee of drie hoog.
function fillBay(parts, { xa, xb, lv, h, zf, dir, front = 0.04, back = 0.92, kind }) {
  let x = xa + 0.06;
  while (x < xb - 0.2) {
    const w = kind === 'bin' ? 0.4 : 0.3 + rand() * 0.3;
    if (x + w > xb - 0.05) break;
    if (rand() < 0.16) {
      x += w * 0.7;
      continue;
    }
    const d = kind === 'bin' ? 0.6 : Math.min(back - front, 0.32 + rand() * 0.3);
    const z0 = zf - dir * (front + rand() * 0.05);
    const zc = z0 - dir * (d / 2);
    let y = lv + 0.006;
    for (let k = 0; k < 3; k++) {
      const hh = kind === 'bin' ? 0.28 : 0.2 + rand() * 0.24;
      if (y + hh > lv + h) break;
      const item = [x + w / 2 + (k ? (rand() - 0.5) * 0.04 : 0), y + hh / 2, zc + (k ? (rand() - 0.5) * 0.04 : 0), w - 0.02 - k * 0.03, hh, d - k * 0.04, 0, (rand() - 0.5) * (k ? 0.12 : 0.05), 0, rand()];
      (kind === 'bin' ? parts.bins : parts.cartons).push(item);
      y += hh;
      if (kind === 'bin' || rand() < 0.45) break;
    }
    // Soms nog een rij erachter.
    if (kind !== 'bin' && back - front - d > 0.3 && rand() < 0.6) {
      const d2 = Math.min(back - front - d - 0.02, 0.3 + rand() * 0.2);
      const h2 = Math.min(h - 0.02, 0.25 + rand() * 0.25);
      parts.cartons.push([x + w / 2, lv + 0.006 + h2 / 2, zc - dir * (d / 2 + d2 / 2 + 0.01), w - 0.04, h2, d2, 0, (rand() - 0.5) * 0.06, 0, rand()]);
    }
    x += w;
  }
}

// Rolsteiger (magazijntrap): drie treden en een platform op 1 m met leuningen rondom.
// Lokaal: oorsprong op de vloer onder de voorrand van het platform, +z naar de stelling,
// de treden lopen naar -z de gang in.
export const STEIGER = {
  platform: 1.0,
  platformDepth: 0.5,
  step: 0.25, // optrede en aantrede
  steps: 3,
  width: 0.64,
};

function buildSteiger() {
  const S = STEIGER;
  const root = new THREE.Group();
  const metal = std(0xb9c0c6, 0.38, { metalness: 0.75, envMapIntensity: 0.8 });
  const yellow = std(0xf0b400, 0.5, { metalness: 0.2 });
  const dark = std(0x1d1e20, 0.7);
  const treadMat = std(0xffffff, 0.6, { map: treadTexture(), metalness: 0.5 });
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const hw = S.width / 2;
  const run = S.steps * S.step;
  const zBack = -S.platformDepth - run - 0.1; // onderkant van de treden, op de vloer
  // Platform en treden.
  add(new THREE.BoxGeometry(S.width, 0.04, S.platformDepth), treadMat, 0, S.platform - 0.02, -S.platformDepth / 2);
  for (let i = 1; i <= S.steps; i++) {
    const z = -S.platformDepth - (S.steps - i) * S.step - S.step / 2;
    add(new THREE.BoxGeometry(S.width - 0.04, 0.035, S.step - 0.03), treadMat, 0, i * S.step - 0.0175, z);
  }
  // Bomen (schuin), achterpoten en onderframe op wielen.
  const slope = Math.atan2(S.platform, -S.platformDepth - zBack);
  const len = Math.hypot(S.platform, -S.platformDepth - zBack);
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    const zMid = (zBack - S.platformDepth) / 2;
    // Boom onder de treden (de lange as van de balk langs de helling).
    add(new THREE.BoxGeometry(0.04, 0.09, len), metal, x, S.platform / 2, zMid, -slope);
    for (const z of [-0.03, -S.platformDepth + 0.03]) add(new THREE.BoxGeometry(0.04, S.platform, 0.04), metal, x, S.platform / 2, z);
    add(new THREE.BoxGeometry(0.05, 0.05, -zBack + 0.05), metal, x, 0.11, zBack / 2);
    // Leuning evenwijdig aan de treden (0,95 m hoger), met twee staanders, en om het platform.
    const xr = sx * (hw + 0.02);
    add(new THREE.CylinderGeometry(0.02, 0.02, len, 10), yellow, xr, S.platform / 2 + 0.95, zMid, Math.PI / 2 - slope);
    for (const z of [zBack + 0.15, -S.platformDepth - 0.02]) {
      const yb = ((z - zBack) / (-S.platformDepth - zBack)) * S.platform;
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8), yellow, xr, yb + 0.475, z);
    }
    add(new THREE.CylinderGeometry(0.02, 0.02, S.platformDepth + 0.04, 10), yellow, xr, S.platform + 0.95, -S.platformDepth / 2, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.016, 0.016, S.platformDepth, 8), yellow, xr, S.platform + 0.5, -S.platformDepth / 2, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8), yellow, xr, S.platform + 0.475, -0.02);
  }
  // Dwarsbalken van het onderframe.
  add(new THREE.BoxGeometry(S.width, 0.05, 0.05), metal, 0, 0.11, zBack + 0.03);
  add(new THREE.BoxGeometry(S.width, 0.05, 0.05), metal, 0, 0.11, -0.03);
  // Zwenkwielen.
  const wheel = new THREE.CylinderGeometry(0.05, 0.05, 0.035, 14);
  for (const sx of [-1, 1]) {
    for (const z of [zBack + 0.05, -0.05]) {
      const wm = add(wheel, dark, sx * (hw - 0.02), 0.05, z);
      wm.rotation.z = Math.PI / 2;
    }
  }
  // Sticker met maximale belasting.
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.1),
    std(0xffffff, 0.6, {
      map: canvas(128, 80, (g, w, h) => {
        g.fillStyle = '#f2b705';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#111';
        g.font = `800 34px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('MAX', w / 2, 34);
        g.fillText('150 KG', w / 2, 70);
      }),
    }),
  );
  sticker.position.set(hw + 0.026, 0.5, -S.platformDepth - 0.05);
  sticker.rotation.y = Math.PI / 2;
  root.add(sticker);

  // Bovenkant van trede i (1 … steps) of het platform (i = steps + 1), lokaal.
  root.userData.tread = (i, out = new THREE.Vector3()) =>
    i > S.steps ? out.set(0, S.platform, -S.platformDepth / 2) : out.set(0, i * S.step, -S.platformDepth - (S.steps - i) * S.step - S.step / 2);
  return root;
}

// Orderkar van Henk: twee legborden op wielen met dozen en een duwbeugel.
function buildCart() {
  const g = new THREE.Group();
  const metal = std(0x7d868d, 0.4, { metalness: 0.7 });
  const shelf = std(0x2c3238, 0.7);
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  for (const y of [0.25, 0.75]) add(new THREE.BoxGeometry(1.1, 0.03, 0.55), shelf, 0, y, 0);
  for (const x of [-0.53, 0.53]) for (const z of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 8), metal, x, 0.45, z);
  const handle = add(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 10), metal, -0.6, 1.05, 0);
  handle.rotation.x = Math.PI / 2;
  for (const z of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8), metal, -0.56, 0.9, z).rotation.z = 0.25;
  const wheel = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12);
  for (const x of [-0.48, 0.48]) for (const z of [-0.22, 0.22]) add(wheel, std(0x1d1e20, 0.7), x, 0.05, z).rotation.x = Math.PI / 2;
  const mats = [0, 1, 2].map((v) => std(0xffffff, 0.85, { map: cartonTexture(v) }));
  for (const [x, y, z, w, h, d, v] of [[-0.25, 0.42, 0, 0.42, 0.32, 0.4, 0], [0.22, 0.38, 0.02, 0.36, 0.25, 0.34, 1], [-0.1, 0.9, 0, 0.5, 0.27, 0.38, 2], [0.28, 0.86, -0.05, 0.3, 0.2, 0.3, 0]]) {
    add(new THREE.BoxGeometry(w, h, d), mats[v], x, y, z).rotation.y = (rand() - 0.5) * 0.15;
  }
  // Handscanner op het bovenste blad.
  const sc = add(new THREE.BoxGeometry(0.07, 0.03, 0.18), std(0x22272c, 0.5), 0.35, 0.785, 0.15);
  sc.rotation.y = 0.4;
  return g;
}

export function buildAisle(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const { x0, bay, bays, levels, faceN, faceS, wallZ } = AISLE;
  const xEnd = x0 + bays * bay;

  // ---------- Voorgevel, lampen en spanten boven de gang ----------
  const wallTex = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#aeb4ba';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(x, 0, 4, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 6, 0, 3, h);
    }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(33 / 4, 10 / 4);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(33, 10), std(0xffffff, 0.85, { map: wallTex }));
  wall.position.set(4, 5, wallZ);
  wall.rotation.y = Math.PI;
  wall.receiveShadow = true;
  group.add(wall);
  const plinth = new THREE.Mesh(new THREE.PlaneGeometry(33, 1.0), std(0x3b3f45, 0.8));
  plinth.position.set(4, 0.5, wallZ - 0.01);
  plinth.rotation.y = Math.PI;
  group.add(plinth);
  const mLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 3.2 });
  const lampGeo = new THREE.BoxGeometry(1.4, 0.06, 0.5);
  for (let x = -8; x <= 18; x += 5.2) {
    const l = new THREE.Mesh(lampGeo, mLamp);
    l.position.set(x, 9.0, AISLE.z);
    group.add(l);
  }
  const truss = new THREE.Mesh(new THREE.BoxGeometry(34, 0.35, 0.18), std(0x4c535b, 0.6, { metalness: 0.4 }));
  truss.position.set(4, 9.6, 14);
  group.add(truss);

  // ---------- Stellingen ----------
  const parts = { posts: [], feet: [], braces: [], beams: [], decks: [], guards: [], cartons: [], bins: [], labels: [] };
  const N = buildRow(parts, { face: faceN, dir: -1, label: '12' });
  const gapBay = (i) => {
    const xa = x0 + i * bay;
    return xa + bay > AISLE.gapS[0] + 0.01 && xa < AISLE.gapS[1] - 0.01;
  };
  const Srow = buildRow(parts, { face: faceS, dir: 1, skip: gapBay, label: '11' });

  // Inhoud. In rij N, vak 04 (waar Henk staat): de tweede ligger vooraan leeg (daar staat hij),
  // op de eerste ligger alles achterin (daar zet hij zijn voet), en bovenin de doos.
  const levelH = (li) => (li < levels.length - 1 ? levels[li + 1] - BEAM_H - levels[li] - 0.04 : 0.75);
  for (const [row, skip] of [[N, () => false], [Srow, gapBay]]) {
    for (let i = 0; i < bays; i++) {
      if (skip(i)) continue;
      const xa = x0 + i * bay;
      const xb = xa + bay;
      const henk = row === N && Math.abs(xa - HENK_BAY.x0) < 0.01;
      // Vloer en de vier liggers.
      const floors = [0, ...levels];
      floors.forEach((lv, k) => {
        const h = k === 0 ? levels[0] - BEAM_H - 0.04 : levelH(k - 1);
        const kind = k <= 2 && (i + k) % 3 === 0 ? 'bin' : 'carton';
        if (henk && k === 2) {
          // Tweede ligger: alleen helemaal links nog een paar bakken.
          fillBay(parts, { xa, xb: xa + 0.9, lv, h, zf: row.zf, dir: row.dir, kind: 'bin' });
          return;
        }
        if (henk && k === 1) {
          fillBay(parts, { xa, xb, lv, h, zf: row.zf, dir: row.dir, front: 0.42, kind: 'carton' });
          return;
        }
        if (henk && k === 3) {
          // Derde ligger: links dozen, rechts de stapel met de doos bovenop (apart, zie onder).
          fillBay(parts, { xa, xb: xb - 0.95, lv, h, zf: row.zf, dir: row.dir, kind: 'carton' });
          return;
        }
        fillBay(parts, { xa, xb, lv, h: Math.max(0.2, h), zf: row.zf, dir: row.dir, kind });
      });
    }
  }

  const mUp = std(0x1d4f9a, 0.5, { metalness: 0.35 });
  const mBeam = std(0xe25a1c, 0.45, { metalness: 0.3 });
  instanced(group, parts.posts, mUp);
  instanced(group, parts.braces, mUp);
  instanced(group, parts.feet, std(0x23272b, 0.6, { metalness: 0.4 }), { shadow: false });
  instanced(group, parts.beams, mBeam);
  instanced(group, parts.guards, std(0xf0b400, 0.5));
  const deck = instanced(group, parts.decks, std(0xffffff, 0.5, { map: deckTexture(), transparent: true, alphaTest: 0.3, metalness: 0.5 }), { shadow: false });
  deck.receiveShadow = true;
  const cartonMats = [0, 1, 2].map((v) => std(0xffffff, 0.85, { map: cartonTexture(v) }));
  [0, 1, 2].forEach((v) => {
    const list = parts.cartons.filter((c) => Math.floor(c[9] * 3) === v);
    instanced(group, list, cartonMats[v], {
      colorize: (it, col) => col.setHSL(0.08, 0.1 + it[9] * 0.1, 0.92 + (it[9] - 0.5) * 0.12),
    });
  });
  instanced(group, parts.bins, std(0xffffff, 0.55, { map: binTexture() }));

  // Etiketten (één geometrie, één textuur).
  const codes = parts.labels.map((l) => l.code);
  const atlas = labelAtlas(codes);
  const geos = parts.labels.map((l, i) => {
    const g = new THREE.PlaneGeometry(0.2, 0.07);
    const u0 = (i % LABEL_COLS) / LABEL_COLS;
    const v0 = 1 - (Math.floor(i / LABEL_COLS) + 1) / LABEL_ROWS;
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / LABEL_COLS, v0 + uv.getY(k) / LABEL_ROWS);
    if (l.dir < 0) g.rotateY(Math.PI);
    g.translate(l.x, l.y, l.z);
    return g;
  });
  const labels = new THREE.Mesh(mergeGeometries(geos), std(0xffffff, 0.6, { map: atlas, polygonOffset: true, polygonOffsetFactor: -1 }));
  group.add(labels);

  // Bord boven het begin van de gang en het gangnummer op de vloer.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), std(0xffffff, 0.6, { map: signTexture('GANG 12', 'VAK 01 – 10'), side: THREE.DoubleSide }));
  sign.position.set(x0 + 0.4, 4.7, AISLE.z);
  sign.rotation.y = Math.PI / 2;
  group.add(sign);
  for (const sx of [-0.6, 0.6]) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4.5, 6), std(0x888f96, 0.4, { metalness: 0.7 }));
    rod.position.set(x0 + 0.4, 7.35, AISLE.z + sx);
    group.add(rod);
  }
  const yellow = std(0xf0b400, 0.55, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const line = (x0l, x1l, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1l - x0l, 0.1), yellow);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0l + x1l) / 2, 0.005, z);
    m.receiveShadow = true;
    group.add(m);
  };
  line(x0, xEnd, faceN - 0.12);
  line(x0, AISLE.gapS[0], faceS + 0.12);
  line(AISLE.gapS[1], xEnd, faceS + 0.12);
  // Zachte schaduw onder de rijen.
  for (const [xa, xb, zc] of [[x0, xEnd, faceN + 0.5], [x0, AISLE.gapS[0], faceS - 0.5], [AISLE.gapS[1], xEnd, faceS - 0.5]]) {
    const ao = softShadow(xb - xa + 0.8, 1.6, 0.5, false);
    ao.position.set((xa + xb) / 2, 0.006, zc);
    group.add(ao);
  }

  // ---------- De doos bovenin (vak 12-04, derde ligger) ----------
  const lv3 = levels[2];
  const under = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.6), cartonMats[0]);
  under.position.set(HENK_BAY.x1 - 0.62, lv3 + 0.256, faceN + 0.33);
  under.rotation.y = 0.03;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.46), cartonMats[1]);
  box.position.set(HENK_BAY.x1 - 0.66, lv3 + 0.506 + 0.15, faceN + 0.38);
  box.rotation.y = -0.05;
  for (const m of [under, box]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  box.userData.home = { pos: box.position.clone(), quat: box.quaternion.clone() };

  // ---------- Rolsteiger en orderkar ----------
  const steiger = buildSteiger();
  group.add(steiger);
  const cart = buildCart();
  cart.position.set(-4.5, 0, 14.35);
  group.add(cart);
  for (const [obj, w, d] of [[steiger, 0.9, 1.5], [cart, 1.3, 0.7]]) {
    const b = softShadow(w, d, 0.45, false);
    b.position.set(0, 0.007, obj === steiger ? -0.7 : 0);
    b.rotation.x = -Math.PI / 2;
    obj.add(b);
  }

  return { group, box, steiger, cart };
}
