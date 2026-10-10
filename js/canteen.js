import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, std, softShadow, mulberry32, pedestrianIcon } from './world.js';

// De kantine van het distributiecentrum. Coördinaten in meters.
// Ramen in de linkermuur (x = -6), toonbank, koelkast en koffieautomaat achterin (z = -6.5),
// deur naar de hal in de rechtermuur. De speler zit aan de middelste tafel (aan de kant
// z > 0) en kijkt naar -z: tegenover hem zitten Marco, Dennis en de lege stoel voor Tomasz.

export const ROOM = { x0: -6, x1: 6, z0: -6.5, z1: 2.5, h: 3.0 };
export const TABLE_H = 0.75;
const SEAT_GAP = 0.62; // van het midden van de tafel tot het bekken van wie zit

// Tafels met de namen van de zitplaatsen (van links naar rechts gezien vanaf de speler).
const TABLES = [
  { x: 0, z: 0, len: 2.0, far: ['marco', 'dennis', 'tomasz'], near: ['nearL', 'player', 'nearR'] },
  { x: -3.5, z: -0.6, len: 1.6, far: ['bg1', 'e1'], near: ['e2', 'bg2'] },
  { x: -3.5, z: -3.7, len: 1.6, far: ['e3', 'e4'], near: ['e5', 'e6'] },
  { x: 3.5, z: -3.7, len: 1.6, far: ['alone', 'e7'], near: ['e8', 'e9'] },
  { x: 3.5, z: -0.6, len: 1.6, far: ['e10', 'bg3'], near: ['e11', 'e12'] },
];

// Zitplaats: plek van het bekken en kijkrichting (0 = naar +z), plus de tafel.
export const SEATS = {};
for (const t of TABLES) {
  const xs = t.len > 1.8 ? [-0.75, 0, 0.75] : [-0.4, 0.4];
  t.far.forEach((n, i) => (SEATS[n] = { pos: new THREE.Vector3(t.x + xs[i], 0, t.z - SEAT_GAP), yaw: 0, table: t }));
  t.near.forEach((n, i) => (SEATS[n] = { pos: new THREE.Vector3(t.x + xs[i], 0, t.z + SEAT_GAP), yaw: Math.PI, table: t }));
}

// Punt rond een zitplaats: lx naar links van wie daar zit, lz naar voren (naar de tafel).
export function seatPoint(seat, lx, lz, y = 0) {
  const c = Math.cos(seat.yaw);
  const s = Math.sin(seat.yaw);
  return new THREE.Vector3(seat.pos.x + lx * c + lz * s, y, seat.pos.z - lx * s + lz * c);
}

// Belangrijke plekken voor het scenario.
export const SPOTS = {
  counter: new THREE.Vector3(1.2, 0, -5.55), // voor de toonbank, waar Tomasz zijn eten pakt
  coffee: new THREE.Vector3(4.55, 0, -5.75), // voor de koffieautomaat
  door: new THREE.Vector3(5.6, 0, -2.2), // binnenkant van de deur naar de hal
  hall: new THREE.Vector3(7.6, 0, -2.2), // achter de deur
};

const rand = mulberry32(11);

// ------------------------------------------------------------------
// Materialen en texturen
// ------------------------------------------------------------------
function noiseFill(g, w, h, base, amp) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amp;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function floorTexture() {
  // Grijsbeige vinyltegels (60 cm) met spikkels en zachte slijtplekken.
  const t = canvas(1024, 1024, (g, w, h) => {
    noiseFill(g, w, h, '#a8a196', 10);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rand() > 0.5 ? 'rgba(90,84,76,0.35)' : 'rgba(240,236,228,0.35)';
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
    }
    for (let i = 0; i < 30; i++) {
      const r = 40 + rand() * 120;
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, `rgba(70,64,58,${0.03 + rand() * 0.04})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(rand() * w, rand() * h);
      g.fillStyle = grd;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
    g.strokeStyle = 'rgba(80,74,66,0.35)';
    g.lineWidth = 2;
    for (let k = 0; k <= 4; k++) {
      g.beginPath();
      g.moveTo((k * w) / 4, 0);
      g.lineTo((k * w) / 4, h);
      g.moveTo(0, (k * h) / 4);
      g.lineTo(w, (k * h) / 4);
      g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function wallTexture() {
  // Licht geschilderde muur met een fijne structuur.
  const t = canvas(256, 256, (g, w, h) => noiseFill(g, w, h, '#ddd6c9', 7));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ceilingTexture() {
  // Systeemplafond: tegels van 60 cm met een dun profiel.
  const t = canvas(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#efeeea', 9);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(120,118,112,0.25)';
      g.fillRect(rand() * w, rand() * h, 1, 1);
    }
    g.fillStyle = '#c9c7c1';
    g.fillRect(0, 0, w, 5);
    g.fillRect(0, 0, 5, h);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function tableTexture() {
  // Licht eiken HPL-blad met nerf.
  const t = canvas(512, 256, (g, w, h) => {
    noiseFill(g, w, h, '#cfae84', 8);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${120 + rand() * 30},${85 + rand() * 20},${50 + rand() * 15},${0.12 + rand() * 0.14})`;
      g.lineWidth = 1 + rand() * 2.5;
      g.beginPath();
      const y = rand() * h;
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (rand() - 0.5) * 3);
      g.stroke();
    }
  });
  return t;
}

function tileTexture() {
  // Witte wandtegels achter de toonbank.
  const t = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#c8ccc9';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 4; x++) {
        const off = y % 2 ? 32 : 0;
        g.fillStyle = `rgb(${236 + rand() * 10},${238 + rand() * 10},${236 + rand() * 8})`;
        g.fillRect(x * 64 + off + 2, y * 32 + 2, 60, 28);
        g.fillRect(x * 64 + off - 64 + 2, y * 32 + 2, 60, 28);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function outsideTexture() {
  // Uitzicht door de ramen: lucht, bomenrij, parkeerplaats en een buurhal.
  return canvas(2048, 512, (g, w, h) => {
    const hz = h * 0.62;
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#8fb9de');
    sky.addColorStop(0.7, '#cfe2ef');
    sky.addColorStop(1, '#eef3f2');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, hz);
    // Wolken.
    for (let i = 0; i < 26; i++) {
      const x = rand() * w;
      const y = rand() * hz * 0.6;
      const r = 30 + rand() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Buurhal.
    g.fillStyle = '#b8bec4';
    g.fillRect(w * 0.55, hz - 70, w * 0.3, 70);
    g.fillStyle = '#9aa2a9';
    for (let x = w * 0.56; x < w * 0.84; x += 26) g.fillRect(x, hz - 64, 3, 64);
    // Bomenrij.
    for (let i = 0; i < 90; i++) {
      const x = rand() * w;
      if (x > w * 0.55 && x < w * 0.85 && rand() < 0.7) continue;
      const r = 18 + rand() * 30;
      g.fillStyle = `rgb(${60 + rand() * 30},${95 + rand() * 35},${55 + rand() * 20})`;
      g.beginPath();
      g.ellipse(x, hz - r * 0.6, r, r * 1.1, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Grasstrook en parkeerplaats.
    g.fillStyle = '#7d9a5a';
    g.fillRect(0, hz, w, 18);
    const lot = g.createLinearGradient(0, hz + 18, 0, h);
    lot.addColorStop(0, '#8d9094');
    lot.addColorStop(1, '#6f7276');
    g.fillStyle = lot;
    g.fillRect(0, hz + 18, w, h - hz - 18);
    g.strokeStyle = 'rgba(245,245,240,0.8)';
    g.lineWidth = 3;
    for (let x = 0; x < w; x += 90) {
      g.beginPath();
      g.moveTo(x, hz + 40);
      g.lineTo(x - 30, h);
      g.stroke();
    }
    // Geparkeerde auto's.
    const cols = ['#d8dadc', '#2c3440', '#8a1f24', '#5c6670', '#e8e6df', '#1f4a7a'];
    for (let x = 30; x < w; x += 90) {
      if (rand() < 0.35) continue;
      g.fillStyle = cols[Math.floor(rand() * cols.length)];
      g.beginPath();
      g.roundRect(x + 8, hz + 30, 62, 26, 8);
      g.fill();
      g.fillStyle = 'rgba(30,40,50,0.6)';
      g.fillRect(x + 20, hz + 33, 38, 9);
    }
  });
}

// ------------------------------------------------------------------
// Meubels
// ------------------------------------------------------------------
const M = {};
function materials() {
  if (M.top) return M;
  M.top = std(0xffffff, 0.5, { map: tableTexture(), envMapIntensity: 0.6 });
  M.edge = std(0x3a3632, 0.5);
  M.steel = std(0x2a2c30, 0.45, { metalness: 0.6, envMapIntensity: 0.8 });
  M.chrome = std(0xc9ccd0, 0.25, { metalness: 0.9, envMapIntensity: 1.0 });
  M.shell = std(0x2f6f78, 0.42, { envMapIntensity: 0.7 });
  M.white = std(0xf4f2ee, 0.35, { envMapIntensity: 0.8 });
  M.tray = std(0x5b4a3e, 0.55);
  M.trayGrey = std(0x6c7378, 0.5);
  return M;
}

function tableMesh(len) {
  const m = materials();
  const g = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(len, 0.03, 0.8, 2, 0.012), [m.top, m.top, m.top, m.top, m.top, m.top]);
  top.position.y = TABLE_H - 0.015;
  const edge = new THREE.Mesh(new RoundedBoxGeometry(len + 0.004, 0.012, 0.804, 1, 0.005), m.edge);
  edge.position.y = TABLE_H - 0.03;
  // Frame en vier poten in één geometrie.
  const parts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.022, 0.022, TABLE_H - 0.05, 10);
      leg.translate(sx * (len / 2 - 0.09), (TABLE_H - 0.05) / 2, sz * 0.31);
      parts.push(leg);
      const foot = new THREE.CylinderGeometry(0.028, 0.03, 0.012, 10);
      foot.translate(sx * (len / 2 - 0.09), 0.006, sz * 0.31);
      parts.push(foot);
    }
    const rail = new THREE.BoxGeometry(0.03, 0.05, 0.62);
    rail.translate(sx * (len / 2 - 0.09), TABLE_H - 0.06, 0);
    parts.push(rail);
  }
  const beam = new THREE.BoxGeometry(len - 0.18, 0.05, 0.03);
  beam.translate(0, TABLE_H - 0.06, 0);
  parts.push(beam);
  const legs = new THREE.Mesh(mergeGeometries(parts), m.steel);
  for (const o of [top, legs]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  g.add(top, edge, legs);
  return g;
}

// Kantinestoel: kunststof kuip op een stalen frame. Oorsprong: vloer onder het midden van de zitting.
const chairGeo = {};
function chairMesh() {
  const m = materials();
  if (!chairGeo.shell) {
    const seat = new RoundedBoxGeometry(0.44, 0.03, 0.42, 3, 0.012);
    seat.translate(0, 0.455, 0.01);
    const back = new RoundedBoxGeometry(0.42, 0.3, 0.025, 3, 0.012);
    back.rotateX(-0.12);
    back.translate(0, 0.72, -0.2);
    chairGeo.shell = mergeGeometries([seat, back]);
    const parts = [];
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of [[0.18, 0.2], [-0.18, -0.22]]) {
        const leg = new THREE.CylinderGeometry(0.011, 0.011, 0.45, 8);
        leg.translate(0, 0.225, 0);
        leg.rotateX((z1 - z0) * 0.6);
        leg.translate(sx * 0.19, 0, z0);
        parts.push(leg);
      }
      const post = new THREE.CylinderGeometry(0.01, 0.01, 0.34, 8);
      post.rotateX(-0.12);
      post.translate(sx * 0.17, 0.6, -0.19);
      parts.push(post);
    }
    chairGeo.frame = mergeGeometries(parts);
  }
  const g = new THREE.Group();
  const shell = new THREE.Mesh(chairGeo.shell, m.shell);
  const frame = new THREE.Mesh(chairGeo.frame, m.chrome);
  for (const o of [shell, frame]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  g.add(shell, frame);
  // Zachte schaduw onder de stoel (beweegt mee als de stoel verschuift).
  const ao = softShadow(0.62, 0.62, 0.35, false);
  ao.position.y = 0.004;
  g.add(ao);
  return g;
}

// ------------------------------------------------------------------
// Eten en drinken
// ------------------------------------------------------------------
function cupMesh(color = 0xf4f2ee) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.09, 20, 1, true), std(color, 0.3, { side: THREE.DoubleSide }));
  body.position.y = 0.045;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.034, 20), body.material);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.002;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.037, 20), std(0x3b2414, 0.15));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.075;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16, Math.PI), body.material);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.04, 0.048, 0);
  g.add(body, bottom, coffee, handle);
  g.traverse((n) => n.isMesh && (n.castShadow = true));
  return g;
}

function plateMesh(food) {
  const m = materials();
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.018, 28), m.white);
  plate.position.y = 0.009;
  plate.castShadow = true;
  plate.receiveShadow = true;
  g.add(plate);
  if (food === 'stew') {
    // Stamppot met een rookworst.
    const mash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xd8c99a, 0.8));
    mash.scale.set(1, 0.45, 0.8);
    mash.position.set(-0.02, 0.018, 0);
    const sausage = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 16, Math.PI * 0.9), std(0x7a3a24, 0.45));
    sausage.rotation.x = -Math.PI / 2;
    sausage.position.set(0.03, 0.03, 0.02);
    g.add(mash, sausage);
  } else if (food === 'bread') {
    // Boterhammen met kaas.
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.022, 0.1, 2, 0.008), std(0xc58f52, 0.85));
      b.position.set(-0.03 + i * 0.05, 0.03 + i * 0.022, i * 0.02);
      b.rotation.y = i * 0.4;
      const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.085), std(0xf1c64a, 0.6));
      cheese.position.set(b.position.x, b.position.y + 0.013, b.position.z);
      cheese.rotation.y = b.rotation.y + 0.1;
      g.add(b, cheese);
    }
  } else if (food === 'soup') {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.055, 24, 1, true), std(0xf4f2ee, 0.3, { side: THREE.DoubleSide }));
    bowl.position.y = 0.045;
    const soup = new THREE.Mesh(new THREE.CircleGeometry(0.066, 24), std(0xc0612f, 0.3));
    soup.rotation.x = -Math.PI / 2;
    soup.position.y = 0.06;
    g.add(bowl, soup);
  }
  g.traverse((n) => n.isMesh && (n.castShadow = true));
  return g;
}

function cutleryMesh() {
  const g = new THREE.Group();
  const mat = materials().chrome;
  for (const dx of [-0.018, 0.018]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.17), mat);
    c.position.set(dx, 0.003, 0);
    g.add(c);
  }
  return g;
}

function bottleMesh() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.2, 18),
    new THREE.MeshPhysicalMaterial({ color: 0xbfdff2, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.45, envMapIntensity: 1.2 }),
  );
  glass.position.y = 0.1;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.05, 14), glass.material);
  neck.position.y = 0.225;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 12), std(0x1f5fb4, 0.4));
  cap.position.y = 0.26;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.06, 18, 1, true), std(0x2f8fd0, 0.5));
  label.position.y = 0.1;
  g.add(glass, neck, cap, label);
  return g;
}

// Dienblad met eten. Oorsprong: midden van de onderkant.
export function makeTray({ food = 'stew', cup = true, bottle = false, color = 'brown' } = {}) {
  const m = materials();
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.016, 0.34, 2, 0.006), color === 'grey' ? m.trayGrey : m.tray);
  tray.position.y = 0.008;
  tray.castShadow = true;
  tray.receiveShadow = true;
  g.add(tray);
  const plate = plateMesh(food);
  plate.position.set(-0.06, 0.016, 0.0);
  g.add(plate);
  const cut = cutleryMesh();
  cut.position.set(0.13, 0.016, 0.0);
  g.add(cut);
  if (cup) {
    const c = cupMesh();
    c.position.set(0.15, 0.016, -0.1);
    g.add(c);
  }
  if (bottle) {
    const b = bottleMesh();
    b.position.set(0.15, 0.016, 0.1);
    g.add(b);
  }
  return g;
}

// ------------------------------------------------------------------
// De ruimte
// ------------------------------------------------------------------
export function buildCanteen(scene, renderer) {
  const world = new THREE.Group();
  scene.add(world);
  const mats = materials();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0;
  const D = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const updates = [];

  // ---------- Vloer, plafond ----------
  const ft = floorTexture();
  ft.repeat.set(W / 2.4, D / 2.4);
  ft.anisotropy = maxAniso;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0xffffff, 0.42, { map: ft, envMapIntensity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  world.add(floor);

  const ct = ceilingTexture();
  ct.repeat.set(W / 0.6, D / 0.6);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), std(0xffffff, 0.9, { map: ct }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(cx, h, cz);
  ceil.castShadow = true;
  world.add(ceil);
  // LED-panelen.
  const mPanel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff7ec, emissiveIntensity: 2.2 });
  const panelGeo = new THREE.PlaneGeometry(0.58, 1.18);
  for (const x of [-3.6, 0, 3.6]) {
    for (const z of [-5.1, -2.1, 0.9]) {
      const p = new THREE.Mesh(panelGeo, mPanel);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, h - 0.005, z);
      world.add(p);
    }
  }

  // ---------- Muren ----------
  const wt = wallTexture();
  const mWall = std(0xffffff, 0.88, { map: wt });
  const mWainscot = std(0x2e6a70, 0.6); // lambrisering in bedrijfskleur
  const mStripe = std(0xf2c500, 0.5);
  const box = (w, hh, d, x, y, z, mat, cast = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  wt.repeat.set(3, 1);

  // Linkermuur met drie grote ramen.
  const WIN = { sill: 0.85, top: 2.55, centers: [-4.75, -2.0, 0.75], w: 2.2 };
  const wx = x0 - 0.1;
  box(0.2, WIN.sill, D, wx, WIN.sill / 2, cz, mWall);
  box(0.2, h - WIN.top, D, wx, (WIN.top + h) / 2, cz, mWall);
  let zPrev = z0;
  for (const c of [...WIN.centers, z1 + WIN.w / 2]) {
    const a = c - WIN.w / 2;
    if (a > zPrev) box(0.2, WIN.top - WIN.sill, a - zPrev, wx, (WIN.sill + WIN.top) / 2, (a + zPrev) / 2, mWall);
    zPrev = c + WIN.w / 2;
  }
  // Kozijnen, glas en vensterbanken.
  const mFrame = std(0x3c4146, 0.45, { metalness: 0.5 });
  const mGlass = new THREE.MeshStandardMaterial({ color: 0xdfeef5, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, envMapIntensity: 1.5, depthWrite: false });
  for (const c of WIN.centers) {
    const hh = WIN.top - WIN.sill;
    const ym = (WIN.sill + WIN.top) / 2;
    box(0.08, 0.05, WIN.w, x0 - 0.04, WIN.sill + 0.025, c, mFrame);
    box(0.08, 0.05, WIN.w, x0 - 0.04, WIN.top - 0.025, c, mFrame);
    for (const dz of [-WIN.w / 2 + 0.025, 0, WIN.w / 2 - 0.025]) box(0.08, hh, 0.05, x0 - 0.04, ym, c + dz, mFrame);
    box(0.06, 0.04, WIN.w, x0 - 0.04, WIN.sill + hh * 0.72, c, mFrame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, hh), mGlass);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(x0 - 0.05, ym, c);
    glass.renderOrder = 2;
    world.add(glass);
    box(0.22, 0.03, WIN.w + 0.1, x0 + 0.06, WIN.sill, c, mats.white);
  }
  // Uitzicht.
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(36, 9), new THREE.MeshBasicMaterial({ map: outsideTexture(), color: 0xf0f0f0, fog: false }));
  outside.rotation.y = Math.PI / 2;
  outside.position.set(x0 - 9, 1.2 + 9 * (0.62 - 0.5), cz);
  world.add(outside);

  // Achtermuur, rechtermuur (met deur) en voormuur.
  box(W, h, 0.2, cx, h / 2, z0 - 0.1, mWall);
  box(W, h, 0.2, cx, h / 2, z1 + 0.1, mWall);
  const DOOR = { z: SPOTS.door.z, w: 1.0, h: 2.1 };
  box(0.2, h, DOOR.z - DOOR.w / 2 - z0, x1 + 0.1, h / 2, (z0 + DOOR.z - DOOR.w / 2) / 2, mWall);
  box(0.2, h, z1 - (DOOR.z + DOOR.w / 2), x1 + 0.1, h / 2, (z1 + DOOR.z + DOOR.w / 2) / 2, mWall);
  box(0.2, h - DOOR.h, DOOR.w, x1 + 0.1, (h + DOOR.h) / 2, DOOR.z, mWall);
  // Lambrisering met een gele bies, rondom (niet onder de ramen en de deur door).
  const wain = (len, x, z, ry) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), mWainscot);
    p.position.set(x, 0.5, z);
    p.rotation.y = ry;
    p.receiveShadow = true;
    world.add(p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.05), mStripe);
    s.position.set(x, 1.025, z);
    s.rotation.y = ry;
    world.add(s);
  };
  wain(W, cx, z0 + 0.005, 0);
  wain(W, cx, z1 - 0.005, Math.PI);
  wain(DOOR.z - DOOR.w / 2 - z0, x1 - 0.005, (z0 + DOOR.z - DOOR.w / 2) / 2, -Math.PI / 2);
  wain(z1 - (DOOR.z + DOOR.w / 2), x1 - 0.005, (z1 + DOOR.z + DOOR.w / 2) / 2, -Math.PI / 2);
  // Plint langs de raamwand.
  const plinth = new THREE.Mesh(new THREE.PlaneGeometry(D, 0.1), std(0x3a3f44, 0.6));
  plinth.rotation.y = Math.PI / 2;
  plinth.position.set(x0 + 0.005, 0.05, cz);
  world.add(plinth);

  // Deur naar de hal: draait om een scharnier (wordt geopend door het scenario).
  const door = new THREE.Group();
  door.position.set(x1, 0, DOOR.z + DOOR.w / 2);
  world.add(door);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, DOOR.h - 0.02, DOOR.w - 0.04), std(0x2e6a70, 0.5));
  leaf.position.set(0, DOOR.h / 2, -DOOR.w / 2);
  leaf.castShadow = true;
  door.add(leaf);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.8), new THREE.MeshStandardMaterial({ color: 0xdfe8ee, emissive: 0xb8c6d0, emissiveIntensity: 0.6, roughness: 0.1 }));
  pane.rotation.y = -Math.PI / 2;
  pane.position.set(-0.027, 1.45, -DOOR.w / 2);
  door.add(pane);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.16), mats.chrome);
  handle.position.set(-0.05, 1.02, -DOOR.w + 0.12);
  door.add(handle);
  for (const side of [-1, 1]) box(0.12, DOOR.h + 0.06, 0.06, x1 - 0.02, (DOOR.h + 0.06) / 2, DOOR.z + side * (DOOR.w / 2 + 0.03), mFrame);
  box(0.12, 0.06, DOOR.w + 0.12, x1 - 0.02, DOOR.h + 0.03, DOOR.z, mFrame);
  // Achter de deur: een stukje hal.
  const hallBg = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.6), std(0x8e959c, 0.9));
  hallBg.rotation.y = -Math.PI / 2;
  hallBg.position.set(x1 + 2.6, 1.3, DOOR.z);
  world.add(hallBg);
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), std(0x7f8487, 0.7));
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(x1 + 1.3, 0.001, DOOR.z);
  world.add(hallFloor);
  // Groen nooduitgangbord boven de deur.
  const exit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.16),
    new THREE.MeshStandardMaterial({
      map: canvas(256, 96, (g, w, hh) => {
        g.fillStyle = '#138a3e';
        g.fillRect(0, 0, w, hh);
        pedestrianIcon(g, 52, 52, 0.75, '#ffffff');
        g.fillStyle = '#ffffff';
        g.font = '800 44px "Barlow Condensed", Arial, sans-serif';
        g.textBaseline = 'middle';
        g.fillText('UITGANG', 92, 50);
      }),
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
    }),
  );
  exit.material.emissiveMap = exit.material.map;
  exit.rotation.y = -Math.PI / 2;
  exit.position.set(x1 - 0.01, DOOR.h + 0.25, DOOR.z);
  world.add(exit);

  // ---------- Toonbank met wandtegels, koelkast, koffieautomaat ----------
  const tt = tileTexture();
  tt.repeat.set(5, 1.4);
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), std(0xffffff, 0.3, { map: tt, envMapIntensity: 0.7 }));
  tiles.position.set(-0.4, 1.55, z0 + 0.01);
  world.add(tiles);
  const counter = new THREE.Group();
  counter.position.set(-0.4, 0, z0 + 0.38);
  world.add(counter);
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.88, 0.62), std(0xf1efe9, 0.5));
  cBody.position.y = 0.44;
  const cFront = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.78), std(0xffffff, 0.55, { map: tableTexture() }));
  cFront.position.set(0, 0.47, 0.311);
  const cTop = new THREE.Mesh(new RoundedBoxGeometry(4.3, 0.04, 0.7, 2, 0.01), std(0x3f4448, 0.3, { metalness: 0.2 }));
  cTop.position.y = 0.9;
  const kick = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.08), std(0x2a2c30, 0.6));
  kick.position.set(0, 0.04, 0.312);
  // Glazen spatscherm boven de vitrine.
  const guard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 0.01), mGlass);
  guard.position.set(-0.7, 1.2, 0.15);
  guard.rotation.x = -0.25;
  for (const o of [cBody, cFront, cTop, kick]) {
    o.castShadow = true;
    o.receiveShadow = true;
    counter.add(o);
  }
  counter.add(guard);
  // Op de toonbank: stapel dienbladen, bestekbak, fruitschaal, warmhoudbakken.
  for (let i = 0; i < 9; i++) {
    const tr = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.016, 0.34, 2, 0.006), i % 2 ? mats.tray : mats.trayGrey);
    tr.position.set(1.6, 0.93 + i * 0.017, 0.05);
    tr.castShadow = true;
    counter.add(tr);
  }
  const bin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.2), std(0x9aa1a8, 0.3, { metalness: 0.6 }));
  bin.position.set(1.1, 0.98, 0.1);
  counter.add(bin);
  const fruit = new THREE.Group();
  fruit.position.set(0.55, 0.92, 0.12);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xd9d4c8, 0.4, { side: THREE.DoubleSide }));
  bowl.position.y = 0.11;
  fruit.add(bowl);
  for (let i = 0; i < 9; i++) {
    const kind = i % 3;
    const f = new THREE.Mesh(new THREE.SphereGeometry(kind === 2 ? 0.035 : 0.04, 12, 10), std([0xb8221e, 0x8db33a, 0xf0a020][kind], 0.45));
    const a = (i / 9) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.08, 0.06 + (i % 2) * 0.03, Math.sin(a) * 0.08);
    if (kind === 2) f.scale.set(1, 1, 1.8);
    f.castShadow = true;
    fruit.add(f);
  }
  counter.add(fruit);
  for (let i = 0; i < 3; i++) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.3), std(0xc5cace, 0.25, { metalness: 0.8 }));
    pan.position.set(-1.6 + i * 0.6, 0.95, -0.05);
    counter.add(pan);
    const food = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.26), std([0xd8c99a, 0x7a3a24, 0x6c8f3a][i], 0.7));
    food.position.set(-1.6 + i * 0.6, 0.985, -0.05);
    counter.add(food);
  }
  // Menubord boven de toonbank.
  const menu = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.6),
    std(0xffffff, 0.6, {
      map: canvas(640, 240, (g, w, hh) => {
        g.fillStyle = '#1f2a2c';
        g.fillRect(0, 0, w, hh);
        g.fillStyle = '#f2c500';
        g.font = '800 52px "Barlow Condensed", Arial, sans-serif';
        g.fillText('VANDAAG', 30, 64);
        g.fillStyle = '#eef1ee';
        g.font = '600 36px "Barlow Condensed", Arial, sans-serif';
        g.fillText('Stamppot met worst', 30, 120);
        g.fillText('Tomatensoep', 30, 166);
        g.fillText('Broodjes kaas / ham', 30, 212);
        g.fillStyle = '#5fd48b';
        g.fillText('€ 3,50', 470, 120);
        g.fillText('€ 1,80', 470, 166);
        g.fillText('€ 1,20', 470, 212);
      }),
    }),
  );
  menu.position.set(-0.9, 2.45, z0 + 0.02);
  world.add(menu);

  // Koelkast met glazen deur (drinken).
  const fridge = new THREE.Group();
  fridge.position.set(2.45, 0, z0 + 0.36);
  world.add(fridge);
  const fBody = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.95, 0.66), std(0xe9ebec, 0.35, { metalness: 0.3 }));
  fBody.position.y = 0.975;
  fBody.castShadow = true;
  fridge.add(fBody);
  const fIn = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.55), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 0.9 }));
  fIn.position.set(0, 1.05, 0.332);
  fridge.add(fIn);
  const drinkCols = [0xd02525, 0x2f8fd0, 0xf0a020, 0x3aa35a, 0xe8e8e8];
  for (let sh = 0; sh < 4; sh++) {
    for (let k = 0; k < 6; k++) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.15, 10), std(drinkCols[(k + sh) % 5], 0.35));
      d.position.set(-0.24 + k * 0.095, 0.42 + sh * 0.38, 0.3);
      fridge.add(d);
    }
  }
  const fGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.7), mGlass);
  fGlass.position.set(0, 1.05, 0.334);
  fridge.add(fGlass);

  // Koffieautomaat op een kastje.
  const cm = new THREE.Group();
  cm.position.set(SPOTS.coffee.x, 0, z0 + 0.34);
  world.add(cm);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.6), std(0xd9d6cf, 0.5));
  cab.position.y = 0.425;
  const mach = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.72, 0.5, 2, 0.03), std(0x1d1f22, 0.35, { metalness: 0.4 }));
  mach.position.set(-0.08, 0.85 + 0.36, 0);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.2),
    new THREE.MeshStandardMaterial({
      map: canvas(150, 100, (g, w, hh) => {
        g.fillStyle = '#0f2c3a';
        g.fillRect(0, 0, w, hh);
        g.fillStyle = '#7fe0ff';
        g.font = '700 18px Arial';
        g.fillText('KOFFIE', 12, 26);
        g.fillStyle = '#d8f6ff';
        for (let i = 0; i < 3; i++) g.fillRect(12, 40 + i * 18, 70 + i * 10, 8);
      }),
      emissive: 0xffffff,
      emissiveIntensity: 0.8,
    }),
  );
  screen.material.emissiveMap = screen.material.map;
  screen.position.set(-0.08, 1.38, 0.252);
  const nook = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe2b0, emissiveIntensity: 0.35 }));
  nook.position.set(-0.08, 1.02, 0.23);
  const cup = cupMesh(0xf6f1e6);
  cup.position.set(-0.08, 0.92, 0.22);
  const stack = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.09, 14), std(0xf6f1e6, 0.4));
    c.position.y = 0.9 + i * 0.022;
    stack.add(c);
  }
  stack.position.set(0.3, 0, 0.05);
  for (const o of [cab, mach]) {
    o.castShadow = true;
    o.receiveShadow = true;
  }
  cm.add(cab, mach, screen, nook, cup, stack);

  // ---------- Prikbord, klok, poster, prullenbakken ----------
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 0.85),
    std(0xffffff, 0.85, {
      map: canvas(520, 340, (g, w, hh) => {
        noiseFill(g, w, hh, '#b98a55', 26);
        g.strokeStyle = '#6b4a2a';
        g.lineWidth = 14;
        g.strokeRect(0, 0, w, hh);
        const notes = [
          ['#ffffff', 'ROOSTER WK 41', 30, 30, 150, 120, -0.04],
          ['#fff6a8', 'Personeelsuitje!', 200, 40, 130, 90, 0.05],
          ['#d9f0ff', 'BHV-oefening', 350, 30, 140, 100, -0.02],
          ['#ffffff', 'Te koop: fiets', 60, 180, 120, 110, 0.06],
          ['#c8f0d0', 'Samen veilig', 210, 170, 150, 130, -0.03],
          ['#ffd9d9', 'Koffie = 0,50', 380, 175, 110, 90, 0.04],
        ];
        for (const [c, txt, x, y, ww, hh2, rot] of notes) {
          g.save();
          g.translate(x + ww / 2, y + hh2 / 2);
          g.rotate(rot);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(-ww / 2 + 4, -hh2 / 2 + 5, ww, hh2);
          g.fillStyle = c;
          g.fillRect(-ww / 2, -hh2 / 2, ww, hh2);
          g.fillStyle = '#222';
          g.font = '700 17px Arial';
          g.fillText(txt, -ww / 2 + 10, -hh2 / 2 + 26);
          g.fillStyle = 'rgba(40,40,40,0.5)';
          for (let l = 0; l < 4; l++) g.fillRect(-ww / 2 + 10, -hh2 / 2 + 42 + l * 14, ww * (0.5 + rand() * 0.35), 4);
          g.fillStyle = ['#d02525', '#2f8fd0', '#3aa35a'][Math.floor(rand() * 3)];
          g.beginPath();
          g.arc(0, -hh2 / 2 + 8, 6, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }),
    }),
  );
  board.position.set(-4.3, 1.62, z0 + 0.02);
  world.add(board);

  // Klok (de wijzers lopen mee met de tijd in de simulatie).
  const clock = new THREE.Group();
  clock.position.set(-2.9, 2.35, z0 + 0.03);
  world.add(clock);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 40),
    std(0xffffff, 0.4, {
      map: canvas(256, 256, (g, w) => {
        g.fillStyle = '#fafafa';
        g.beginPath();
        g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 14;
        g.strokeStyle = '#222';
        g.stroke();
        g.fillStyle = '#222';
        for (let i = 0; i < 12; i++) {
          g.save();
          g.translate(w / 2, w / 2);
          g.rotate((i / 12) * Math.PI * 2);
          g.fillRect(-3, -w / 2 + 16, 6, i % 3 ? 14 : 26);
          g.restore();
        }
      }),
    }),
  );
  clock.add(face);
  const hand = (len, wdt, col) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, 0.004), std(col, 0.4));
    m.geometry.translate(0, len / 2 - 0.02, 0);
    m.position.z = 0.006;
    clock.add(m);
    return m;
  };
  const hourH = hand(0.11, 0.014, 0x222222);
  const minH = hand(0.16, 0.009, 0x222222);
  const secH = hand(0.17, 0.003, 0xd02525);
  updates.push((dt, t) => {
    // Pauze begint om 12:15.
    const s = 12 * 3600 + 15 * 60 + t;
    secH.rotation.z = -((s % 60) / 60) * Math.PI * 2;
    minH.rotation.z = -(((s / 60) % 60) / 60) * Math.PI * 2;
    hourH.rotation.z = -(((s / 3600) % 12) / 12) * Math.PI * 2;
  });

  // Poster op de rechtermuur: "Respect".
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.1),
    std(0xffffff, 0.6, {
      map: canvas(320, 440, (g, w, hh) => {
        g.fillStyle = '#1f6e3f';
        g.fillRect(0, 0, w, hh);
        g.fillStyle = '#f4f4ef';
        g.font = '800 64px "Barlow Condensed", Arial, sans-serif';
        g.fillText('RESPECT', 30, 90);
        g.font = '600 32px "Barlow Condensed", Arial, sans-serif';
        g.fillText('Samen één team.', 30, 140);
        g.fillText('Iedereen hoort erbij.', 30, 180);
        // Drie poppetjes naast elkaar.
        for (let i = 0; i < 3; i++) pedestrianIcon(g, 80 + i * 80, 330, 1.4, ['#f2c500', '#f4f4ef', '#5fd48b'][i]);
      }),
    }),
  );
  poster.rotation.y = -Math.PI / 2;
  poster.position.set(x1 - 0.01, 1.6, 0.4);
  world.add(poster);

  // Prullenbakken (rest, plastic, papier).
  [0x5b6066, 0xf0a020, 0x2f6fb4].forEach((c, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.72, 0.34, 2, 0.03), std(c, 0.55));
    b.position.set(-3.25 + i * 0.38, 0.36, z0 + 0.3);
    b.castShadow = true;
    world.add(b);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.06), std(0x1d1f22, 0.6));
    lid.position.set(b.position.x, 0.725, z0 + 0.36);
    world.add(lid);
  });

  // Snoepautomaat bij de deur.
  const vend = new THREE.Group();
  vend.position.set(x1 - 0.45, 0, -4.5);
  vend.rotation.y = -Math.PI / 2;
  world.add(vend);
  const vBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.85, 0.8), std(0x8a1f24, 0.4, { metalness: 0.2 }));
  vBody.position.y = 0.925;
  vBody.castShadow = true;
  vend.add(vBody);
  const vWin = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1.2),
    new THREE.MeshStandardMaterial({
      map: canvas(120, 240, (g, w, hh) => {
        g.fillStyle = '#e9edf0';
        g.fillRect(0, 0, w, hh);
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 4; c++) {
            g.fillStyle = ['#d02525', '#f0a020', '#2f8fd0', '#6b3a1e', '#3aa35a'][(r + c) % 5];
            g.fillRect(8 + c * 28, 10 + r * 38, 20, 26);
          }
          g.fillStyle = '#9aa1a8';
          g.fillRect(0, 38 + r * 38, w, 3);
        }
      }),
      emissive: 0xffffff,
      emissiveIntensity: 0.55,
    }),
  );
  vWin.material.emissiveMap = vWin.material.map;
  vWin.position.set(-0.1, 1.15, 0.401);
  vend.add(vWin);

  // Kapstok met hesjes naast de deur.
  const rack = new THREE.Group();
  rack.position.set(x1 - 0.06, 0, -0.9);
  world.add(rack);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.2), std(0x6b4a2a, 0.6));
  rail.position.y = 1.75;
  rack.add(rail);
  [0xf2e600, 0xf28a00, 0xf2e600, 0xf2e600].forEach((c, i) => {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.36), std(c, 0.6, { emissive: c, emissiveIntensity: 0.05 }));
    vest.position.set(-0.05, 1.42, -0.42 + i * 0.28);
    vest.rotation.x = (rand() - 0.5) * 0.1;
    vest.castShadow = true;
    rack.add(vest);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.04, 0.362), std(0xd8dde0, 0.3, { metalness: 0.5 }));
    band.position.set(-0.05, 1.3, -0.42 + i * 0.28);
    rack.add(band);
  });

  // Planten in de hoeken.
  const plant = (x, z, s) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.45 * s, 18), std(0x3a3f44, 0.6));
    pot.position.y = 0.225 * s;
    pot.castShadow = true;
    g.add(pot);
    const leafMat = std(0x3f7a3a, 0.65, { side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.16 * s, 0.7 * s), leafMat);
      leaf.geometry.translate(0, 0.35 * s, 0);
      leaf.position.y = 0.42 * s;
      leaf.rotation.set(0.35 + rand() * 0.5, (i / 14) * Math.PI * 2, 0, 'YXZ');
      leaf.castShadow = true;
      g.add(leaf);
    }
    world.add(g);
  };
  plant(x0 + 0.4, z0 + 0.45, 1.3);
  plant(x1 - 0.45, z1 - 0.45, 1.1);
  plant(x0 + 0.35, z1 - 0.4, 1.0);

  // Voormuur: aanrecht met magnetrons en een waterkoeler (achter de speler).
  const kit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.6), std(0xf1efe9, 0.5));
  kit.position.set(-1.2, 0.45, z1 - 0.3);
  kit.castShadow = true;
  world.add(kit);
  const kitTop = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.035, 0.64), std(0x3f4448, 0.3));
  kitTop.position.set(-1.2, 0.915, z1 - 0.31);
  world.add(kitTop);
  for (const x of [-2.0, -1.4]) {
    const mw = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.3, 0.38, 2, 0.02), std(0xdadcde, 0.35, { metalness: 0.4 }));
    mw.position.set(x, 1.085, z1 - 0.35);
    mw.castShadow = true;
    world.add(mw);
  }
  const cooler = new THREE.Mesh(new RoundedBoxGeometry(0.34, 1.05, 0.34, 2, 0.03), std(0xeeeeee, 0.4));
  cooler.position.set(1.0, 0.525, z1 - 0.3);
  world.add(cooler);
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 20), mGlass);
  jug.position.set(1.0, 1.25, z1 - 0.3);
  world.add(jug);

  // ---------- Tafels en stoelen ----------
  const chairs = {};
  for (const t of TABLES) {
    const tm = tableMesh(t.len);
    tm.position.set(t.x, 0, t.z);
    world.add(tm);
    const ao = softShadow(t.len + 0.5, 1.3, 0.42, false);
    ao.position.set(t.x, 0.005, t.z);
    world.add(ao);
    for (const n of [...t.far, ...t.near]) {
      const s = SEATS[n];
      const c = chairMesh();
      c.position.copy(seatPoint(s, 0, -0.05));
      c.rotation.y = s.yaw;
      // Lege stoelen staan niet allemaal keurig recht.
      if (n.startsWith('e')) {
        c.position.add(new THREE.Vector3((rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.1));
        c.rotation.y += (rand() - 0.5) * 0.25;
      }
      world.add(c);
      chairs[n] = c;
    }
  }

  // Wat er al op tafel staat.
  const onTable = (obj, seatName, lx, lz, ry = 0) => {
    const s = SEATS[seatName];
    obj.position.copy(seatPoint(s, lx, lz, TABLE_H));
    obj.rotation.y = s.yaw + ry;
    world.add(obj);
    return obj;
  };
  onTable(makeTray({ food: 'bread', cup: true }), 'player', 0, 0.38);
  onTable(makeTray({ food: 'stew', cup: false, bottle: true, color: 'grey' }), 'dennis', 0.02, 0.5, 0.05);
  onTable(makeTray({ food: 'soup', cup: true }), 'marco', -0.03, 0.5, -0.06);
  onTable(makeTray({ food: 'stew', cup: true, color: 'grey' }), 'bg1', 0, 0.5);
  onTable(makeTray({ food: 'bread', cup: true }), 'bg2', 0, 0.5, 0.1);
  onTable(cupMesh(), 'bg3', 0.12, 0.28);
  onTable(cupMesh(0x2f6f78), 'e4', 0.1, 0.3);
  onTable(bottleMesh(), 'e8', -0.15, 0.25);

  // ---------- Daglicht door de ramen ----------
  // Zachte lichtbundels schuin naar binnen (additief, zonder schaduwkosten).
  const beamTex = canvas(64, 256, (g, w, hh) => {
    const grd = g.createLinearGradient(0, 0, 0, hh);
    grd.addColorStop(0, 'rgba(255,244,222,0.5)');
    grd.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, hh);
  });
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, opacity: 0.06, fog: false });
  for (const c of WIN.centers) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w * 0.9, 3.6), beamMat);
    p.position.set(x0 + 1.5, 1.2, c);
    p.rotation.set(0, Math.PI / 2, 0);
    p.rotateX(-1.0);
    p.renderOrder = 5;
    world.add(p);
  }

  return { group: world, chairs, door, update: (dt, t) => updates.forEach((u) => u(dt, t)) };
}

// Licht in de kantine: zon door de ramen (links), plafondlampen en een zacht hemellicht.
export function canteenLights(scene) {
  scene.background = new THREE.Color(0xd8dde0);
  const hemi = new THREE.HemisphereLight(0xeef0f2, 0x6b6358, 0.42);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(-15, 8.5, -3.5);
  sun.target.position.set(0, 0, -1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -8;
  sc.right = 8;
  sc.top = 7;
  sc.bottom = -7;
  sc.near = 4;
  sc.far = 32;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // Plafondverlichting: warmwit, zonder schaduwkaart (die komt van de zon).
  for (const [x, z, i] of [[-3.6, -2.1, 3], [0, -2.1, 3.6], [3.6, -2.1, 3], [0, 0.9, 2.4], [0, -5.1, 3], [-3.6, -5.1, 2.4], [3.6, -5.1, 2.4]]) {
    const l = new THREE.PointLight(0xfff3e4, i, 0, 2);
    l.position.set(x, ROOM.h - 0.25, z);
    scene.add(l);
  }
  return { sun, hemi };
}
