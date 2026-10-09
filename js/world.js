import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Het magazijn. Coördinaten in meters.
// Hoofdgang (heftrucks) loopt langs z, tussen x = -4.8 en x = 7.4.
// Groen voetpad links (x -7.3 … -5.0) met hekwerk; dwarsgang rechts bij z ≈ -8.2.
// Docks tegen de achterwand (z = -22). Dock 3 staat open.

export const LAYOUT = {
  walkwayX: [-7.3, -5.0],
  railX: -4.85,
  railGap: [-5.0, -3.6],
  crossAisleZ: [-10.0, -6.4],
  backWallZ: -22,
  docks: [-7, -2.5, 2, 6.5],
  office: new THREE.Vector3(14, 1.6, -19),
  walkwayPoint: new THREE.Vector3(-6.1, 1.0, -4),
};

const rand = mulberry32(7);

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function std(color, rough = 0.8, extra = {}) {
  // Minder omgevingsreflectie: anders oogt de hal vlak en uitgebleekt.
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, envMapIntensity: 0.4, ...extra });
}

function decalMat(map, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map,
    transparent: true,
    roughness: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
    ...extra,
  });
}

function floorPlane(w, d, mat, x, z, y = 0.004) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

function signTexture({ w = 512, h = 256, bg = '#f2b705', fg = '#121212', text, sub, size = 150, border = null }) {
  return canvas(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = border;
      g.lineWidth = 16;
      g.strokeRect(8, 8, w - 16, h - 16);
    }
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 ${size}px ${FONT}`;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + size * 0.04);
    if (sub) {
      g.font = `600 ${Math.round(size * 0.36)}px ${FONT}`;
      g.fillText(sub, w / 2, h * 0.8);
    }
  });
}

function pedestrianIcon(g, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.scale(s, s);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.arc(4, -40, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 11;
  g.beginPath();
  g.moveTo(2, -27);
  g.lineTo(-3, 5);
  g.stroke();
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(-3, 5);
  g.lineTo(-17, 38);
  g.moveTo(-3, 5);
  g.lineTo(9, 20);
  g.lineTo(6, 40);
  g.moveTo(1, -20);
  g.lineTo(-16, -4);
  g.moveTo(1, -20);
  g.lineTo(17, -6);
  g.stroke();
  g.restore();
}

export function buildWorld(scene, renderer) {
  const world = new THREE.Group();
  scene.add(world);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---------- Vloer ----------
  const concrete = canvas(1024, 1024, (g, w, h) => {
    g.fillStyle = '#7f8487';
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() - 0.5) * 16;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n + 1;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 70; i++) {
      const r = 30 + rand() * 160;
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      const a = 0.03 + rand() * 0.05;
      const dark = rand() > 0.35;
      grd.addColorStop(0, dark ? `rgba(40,42,44,${a})` : `rgba(210,212,214,${a})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.translate(rand() * w, rand() * h);
      g.scale(1, 0.4 + rand());
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // Bandensporen.
    g.strokeStyle = 'rgba(30,30,32,0.08)';
    for (let i = 0; i < 18; i++) {
      g.lineWidth = 6 + rand() * 8;
      g.beginPath();
      const x = rand() * w;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 300, h * 0.3, x + (rand() - 0.5) * 300, h * 0.7, x + (rand() - 0.5) * 200, h);
      g.stroke();
    }
    // Dilatatievoegen.
    g.strokeStyle = 'rgba(50,52,55,0.45)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  });
  concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
  concrete.repeat.set(9, 9);
  concrete.anisotropy = maxAniso;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(0xffffff, 0.62, { map: concrete, metalness: 0.02 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(4, 0, -6);
  floor.receiveShadow = true;
  world.add(floor);

  // ---------- Vloermarkering ----------
  const [wx0, wx1] = LAYOUT.walkwayX;
  const walkW = wx1 - wx0;
  const walkCx = (wx0 + wx1) / 2;
  const walkTex = canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#2f8a4c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 400; i++) g.fillRect(rand() * w, rand() * h, 2, 2);
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, 14, h);
    g.fillRect(w - 14, 0, 14, h);
    pedestrianIcon(g, w / 2, h * 0.5, 2.0, 'rgba(244,244,239,0.95)');
  });
  walkTex.wrapS = THREE.ClampToEdgeWrapping;
  walkTex.wrapT = THREE.RepeatWrapping;
  walkTex.repeat.set(1, 26 / 4.5);
  walkTex.anisotropy = maxAniso;
  world.add(floorPlane(walkW, 26, decalMat(walkTex, { transparent: false }), walkCx, -3));

  // Voetpad langs de docks en zebrapad.
  const zebra = canvas(512, 128, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#2f8a4c' : '#f2f2ec';
      g.fillRect((i * w) / 16, 0, w / 16 + 1, h);
    }
  });
  world.add(floorPlane(12.4, 2.3, decalMat(zebra, { transparent: false }), 1.2, -16.9));
  const dockWalk = canvas(512, 64, (g, w, h) => {
    g.fillStyle = '#2f8a4c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2ec';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
  });
  world.add(floorPlane(22, 1.6, decalMat(dockWalk, { transparent: false }), 0.5, -20.9));

  // Gele lijnen langs de gang.
  const yellow = std(0xf0b400, 0.55, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const x of [-4.72, 7.45, 10.15, 13.45]) world.add(floorPlane(0.12, 28, yellow, x, -2.5, 0.005));
  // Gearceerd vak bij de docks.
  const hatch = canvas(512, 256, (g, w, h) => {
    g.strokeStyle = '#f0b400';
    g.lineWidth = 22;
    g.strokeRect(11, 11, w - 22, h - 22);
    g.lineWidth = 16;
    for (let x = -h; x < w; x += 60) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + h, 0);
      g.stroke();
    }
  });
  for (const x of LAYOUT.docks) world.add(floorPlane(3.6, 2.2, decalMat(hatch), x, -18.6));

  // Pijlen in de rijbaan.
  const arrow = canvas(128, 256, (g, w, h) => {
    g.fillStyle = 'rgba(245,245,240,0.92)';
    g.beginPath();
    g.moveTo(w / 2, 10);
    g.lineTo(w - 10, 100);
    g.lineTo(w * 0.66, 100);
    g.lineTo(w * 0.66, h - 10);
    g.lineTo(w * 0.34, h - 10);
    g.lineTo(w * 0.34, 100);
    g.lineTo(10, 100);
    g.closePath();
    g.fill();
  });
  for (const [x, z, r] of [[-1.5, 2, 0], [3.8, 4, Math.PI], [-1.5, -12.5, 0], [3.8, -1.5, Math.PI]]) {
    const a = floorPlane(0.8, 1.6, decalMat(arrow), x, z);
    a.rotation.z = r;
    world.add(a);
  }
  // Stopstreep bij de dwarsgang (voor heftrucks).
  const stop = canvas(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(245,245,240,0.9)';
    g.fillRect(0, 0, w, 18);
    g.font = `800 92px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('STOP', w / 2, 76);
  });
  const stopM = floorPlane(3.0, 0.75, decalMat(stop), 7.9, -8.2);
  stopM.rotation.z = -Math.PI / 2;
  world.add(stopM);

  // ---------- Stellingen ----------
  buildRacks(world);

  // ---------- Hekwerk langs het voetpad ----------
  const mRail = std(0xf0b400, 0.45, { metalness: 0.25 });
  const mRailDark = std(0x1d1e20, 0.6);
  const railSegs = [
    [10, LAYOUT.railGap[1]],
    [LAYOUT.railGap[0], -15.6],
  ];
  const postGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 10);
  for (const [z0, z1] of railSegs) {
    const len = z0 - z1;
    const n = Math.max(1, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(postGeo, mRail);
      p.position.set(LAYOUT.railX, 0.55, z0 - (i * len) / n);
      p.castShadow = true;
      world.add(p);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), mRailDark);
      foot.position.set(LAYOUT.railX, 0.01, z0 - (i * len) / n);
      world.add(foot);
    }
    for (const y of [1.05, 0.55]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), mRail);
      r.position.set(LAYOUT.railX, y, (z0 + z1) / 2);
      r.castShadow = true;
      world.add(r);
    }
    // Stootrand onderaan, zwart-geel.
    const kick = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.18, len),
      new THREE.MeshStandardMaterial({ map: stripeTex(len), roughness: 0.6 }),
    );
    kick.position.set(LAYOUT.railX, 0.12, (z0 + z1) / 2);
    world.add(kick);
  }

  // ---------- Gebouw ----------
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
  const plinth = std(0x3b3f45, 0.8);
  const BZ = LAYOUT.backWallZ;
  const walls = [
    { w: 34, h: 10, x: 4, z: BZ, ry: 0 },
    { w: 40, h: 10, x: -12.5, z: -2, ry: Math.PI / 2 },
    { w: 40, h: 10, x: 20.5, z: -2, ry: -Math.PI / 2 },
  ];
  for (const wd of walls) {
    const t = wallTex.clone();
    t.needsUpdate = true;
    t.repeat.set(wd.w / 4, wd.h / 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wd.w, wd.h), std(0xffffff, 0.85, { map: t }));
    m.position.set(wd.x, wd.h / 2, wd.z);
    m.rotation.y = wd.ry;
    m.receiveShadow = true;
    world.add(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(wd.w, 1.0), plinth);
    p.position.set(wd.x, 0.5, wd.z);
    p.rotation.y = wd.ry;
    p.position.add(new THREE.Vector3(Math.sin(wd.ry), 0, Math.cos(wd.ry)).multiplyScalar(0.01));
    world.add(p);
  }

  // Dak met lichtstraten.
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(34, 40), std(0x2c3036, 0.95));
  roof.rotation.x = Math.PI / 2;
  roof.position.set(4, 10, -2);
  world.add(roof);
  const mTruss = std(0x4c535b, 0.6, { metalness: 0.4 });
  for (let z = 8; z >= -20; z -= 6) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(34, 0.35, 0.18), mTruss);
    t.position.set(4, 9.6, z);
    world.add(t);
  }
  const mLamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 3.2 });
  const lampGeo = new THREE.BoxGeometry(0.5, 0.06, 1.4);
  for (let x = -8; x <= 18; x += 6.5) {
    for (let z = 6; z >= -19; z -= 5) {
      const l = new THREE.Mesh(lampGeo, mLamp);
      l.position.set(x, 9.0, z);
      world.add(l);
    }
  }

  // ---------- Docks ----------
  const doorTex = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#dfe3e6';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, y, w, 4);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(0, y + 5, w, 2);
    }
    g.fillStyle = 'rgba(40,60,80,0.55)';
    g.fillRect(30, 90, 60, 26);
    g.fillRect(166, 90, 60, 26);
  });
  const mDoor = std(0xffffff, 0.5, { map: doorTex, metalness: 0.2 });
  const mBumper = std(0x151516, 0.9);
  const mFrame = std(0xf0b400, 0.5);
  LAYOUT.docks.forEach((x, i) => {
    const open = i === 2;
    const n = i + 1;
    // Kozijn.
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.2), mFrame);
      f.position.set(x + s * 1.62, 1.7, BZ + 0.1);
      world.add(f);
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.42, 0.18, 2, 0.04), mBumper);
      b.position.set(x + s * 1.35, 0.3, BZ + 0.12);
      b.castShadow = true;
      world.add(b);
    }
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.75),
      std(0xffffff, 0.6, { map: signTexture({ w: 512, h: 176, text: `DOCK ${n}`, size: 132 }) }),
    );
    sign.position.set(x, 4.1, BZ + 0.03);
    world.add(sign);
    // Dockverkeerslicht.
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 0.1), std(0x1b1c1f, 0.6));
    box.position.set(x + 2.0, 2.4, BZ + 0.06);
    world.add(box);
    const red = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 16),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: open ? 0.05 : 2.8 }),
    );
    red.position.set(x + 2.0, 2.52, BZ + 0.115);
    const green = new THREE.Mesh(
      new THREE.CircleGeometry(0.07, 16),
      new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x2dff6a, emissiveIntensity: open ? 2.8 : 0.05 }),
    );
    green.position.set(x + 2.0, 2.28, BZ + 0.115);
    world.add(red, green);

    if (!open) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.3), mDoor);
      d.position.set(x, 1.65, BZ + 0.02);
      world.add(d);
    } else {
      // Opgerolde deur, open laadruimte van een trailer en daglicht.
      const d = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.6), mDoor);
      d.position.set(x, 3.05, BZ + 0.02);
      world.add(d);
      const trailer = new THREE.Group();
      trailer.position.set(x, 0, BZ - 0.05);
      world.add(trailer);
      const mTr = std(0x9aa1a8, 0.7, { side: THREE.BackSide });
      const box2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.7, 9), mTr);
      box2.position.set(0, 1.35, -4.5);
      trailer.add(box2);
      // Pallets in de trailer.
      const pm = std(0xb7834f, 0.85);
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.15), std(0xb98b5c, 0.9));
        p.position.set(k % 2 ? 0.55 : -0.55, 0.75, -2.5 - k * 1.3);
        p.castShadow = true;
        trailer.add(p);
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.15), pm);
        base.position.set(p.position.x, 0.07, p.position.z);
        trailer.add(base);
      }
      const day = new THREE.PointLight(0xfff0d8, 25, 14, 1.6);
      day.position.set(x, 2.4, BZ + 1.2);
      world.add(day);
      // Dockleveler.
      const lev = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 1.2), std(0x55595f, 0.6, { metalness: 0.6 }));
      lev.position.set(x, 0.02, BZ + 0.55);
      lev.receiveShadow = true;
      world.add(lev);
    }
  });

  // Spandoek en borden.
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.5),
    std(0xffffff, 0.7, {
      map: canvas(1536, 256, (g, w, h) => {
        g.fillStyle = '#1f6e3f';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#f4f4ef';
        g.font = `800 120px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText('VEILIGHEID VOOROP', 210, 100);
        g.font = `600 58px ${FONT}`;
        g.fillText('Voetgangers: loop altijd over het groene pad', 214, 198);
        pedestrianIcon(g, 110, 130, 1.9, '#f4f4ef');
      }),
    }),
  );
  banner.position.set(-12.45, 6.2, -6);
  banner.rotation.y = Math.PI / 2;
  world.add(banner);

  // Rond blauw voetgangersbord aan paal bij begin voetpad.
  const pedSign = canvas(256, 256, (g, w) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b5fb4';
    g.beginPath();
    g.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2);
    g.fill();
    pedestrianIcon(g, w / 2, w / 2 + 8, 2.0, '#ffffff');
  });
  const pole = (x, z, h) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 8), std(0x8a9096, 0.4, { metalness: 0.6 }));
    p.position.set(x, h / 2, z);
    p.castShadow = true;
    world.add(p);
  };
  pole(-5.15, 4.2, 2.4);
  const ps = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ map: pedSign, roughness: 0.5, side: THREE.DoubleSide }));
  ps.position.set(-5.15, 2.25, 4.17);
  world.add(ps);

  // Waarschuwingsdriehoek bij de dwarsgang.
  const warn = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d42a1e';
    tri(g, w / 2, 20, w - 30, 380, 30, 380);
    g.fillStyle = '#f2c500';
    tri(g, w / 2, 78, w - 82, 350, 82, 350);
    g.fillStyle = '#111';
    g.font = `800 64px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('LET OP', w / 2, 448);
    g.font = `700 50px ${FONT}`;
    g.fillText('HEFTRUCKS', w / 2, 500);
    // Pictogram heftruck.
    g.fillRect(170, 240, 120, 60);
    g.fillRect(260, 190, 14, 110);
    g.fillRect(290, 180, 12, 120);
    g.fillRect(302, 286, 60, 12);
    g.beginPath();
    g.arc(200, 310, 22, 0, Math.PI * 2);
    g.arc(270, 310, 22, 0, Math.PI * 2);
    g.fill();
    g.fillRect(180, 190, 70, 10);
    g.fillRect(180, 190, 10, 50);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshStandardMaterial({ map: warn, roughness: 0.5 }));
  ws.position.set(7.55, 2.6, -6.3);
  ws.rotation.y = -Math.PI / 2;
  world.add(ws);

  // Kantoor in de hoek met ramen.
  const office = new THREE.Group();
  office.position.set(14.5, 0, -18.8);
  world.add(office);
  const offBox = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5.6), std(0xe4e6e8, 0.8));
  offBox.position.y = 1.5;
  offBox.castShadow = true;
  offBox.receiveShadow = true;
  office.add(offBox);
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x9fc7e6, emissive: 0xb9dcff, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.3 }),
  );
  win.position.set(-3.01, 1.8, 0);
  win.rotation.y = -Math.PI / 2;
  office.add(win);
  const offDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), std(0x5b6670, 0.6));
  offDoor.position.set(-1.6, 1.1, 2.81);
  office.add(offDoor);
  const offSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    std(0xffffff, 0.6, { map: signTexture({ w: 512, h: 128, bg: '#1f2a36', fg: '#ffffff', text: 'KANTOOR', size: 96 }) }),
  );
  offSign.position.set(-3.02, 2.75, 0);
  offSign.rotation.y = -Math.PI / 2;
  office.add(offSign);

  // Losse rekwisieten: lege pallets, rolcontainers, palletwagen, brandblusser.
  props(world);

  // Daglicht door dock 3: lichtbundel, warme vlek op de vloer en zwevend stof.
  const updates = [];
  updates.push(daylightShaft(world, LAYOUT.docks[2], BZ));

  world.userData.update = (dt, t) => updates.forEach((u) => u(dt, t));
  return world;
}

// Zachte schaduwvlek (contactschaduw/omgevingsocclusie) als vloerdecal.
export function softShadow(w, d, opacity = 0.55, round = true) {
  const tex = canvas(128, 128, (g, cw, ch) => {
    if (round) {
      const grd = g.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(0.45, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, cw, ch);
    } else {
      // Rechthoek met zachte randen.
      g.filter = 'blur(14px)';
      g.fillStyle = '#000';
      g.fillRect(22, 22, cw - 44, ch - 44);
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: 0x000000 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

function daylightShaft(world, x, bz) {
  const group = new THREE.Group();
  world.add(group);
  // Bundel: drie gekruiste vlakken met een verloop, additief gemengd.
  const tex = canvas(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,240,215,0.55)');
    grd.addColorStop(0.5, 'rgba(255,236,205,0.18)');
    grd.addColorStop(1, 'rgba(255,230,200,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.2, 'rgba(0,0,0,0)');
    side.addColorStop(0.8, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = side;
    g.fillRect(0, 0, w, h);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, toneMapped: false, opacity: 0.32 });
  const len = 9;
  const tilt = 0.32; // bundel valt schuin naar beneden de hal in
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.0 + i * 0.4, len), mat);
    p.position.set(x, 1.7, bz + len / 2);
    p.rotation.set(-Math.PI / 2 + tilt, 0, (i - 1) * 0.35);
    p.renderOrder = 5;
    group.add(p);
  }
  // Warme lichtvlek op de vloer.
  const spot = new THREE.SpotLight(0xffd9a8, 90, 16, 0.55, 0.8, 1.4);
  spot.position.set(x, 3.0, bz + 0.3);
  spot.target.position.set(x, 0, bz + 6);
  group.add(spot, spot.target);
  // Stof dat in het licht zweeft.
  const N = 260;
  const pos = new Float32Array(N * 3);
  const seed = [];
  for (let i = 0; i < N; i++) {
    const k = rand();
    const z = bz + 0.4 + k * 7.5;
    pos[i * 3] = x + (rand() - 0.5) * (2.6 + k * 1.4);
    pos[i * 3 + 1] = 0.3 + rand() * (3.0 - k * 1.6);
    pos[i * 3 + 2] = z;
    seed.push(rand() * 10);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = canvas(32, 32, (g) => {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,245,225,1)');
    grd.addColorStop(1, 'rgba(255,245,225,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  });
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: dot, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  group.add(pts);
  const base = pos.slice();
  return (dt, t) => {
    for (let i = 0; i < N; i++) {
      const s = seed[i];
      pos[i * 3] = base[i * 3] + Math.sin(t * 0.13 + s) * 0.25;
      pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.09 + s * 1.7) * 0.2;
      pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.11 + s) * 0.2;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

function tri(g, x1, y1, x2, y2, x3, y3) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.fill();
}

function stripeTex(len) {
  const t = canvas(512, 32, (g, w, h) => {
    g.fillStyle = '#f0b400';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#151515';
    for (let x = -32; x < w + 32; x += 32) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 16, h);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(len / 2, 1);
  return t;
}

function palletTexture() {
  return canvas(256, 64, (g, w, h) => {
    g.fillStyle = '#b8895a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(60,40,20,0.85)';
    g.fillRect(28, 22, 78, 30);
    g.fillRect(150, 22, 78, 30);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 30; i++) g.fillRect(rand() * w, rand() * h, rand() * 40, 1);
  });
}

function boxTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#c99a63';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 0; i < 3; i++) g.fillRect(0, (h / 3) * i, w, 3);
    for (let i = 0; i < 3; i++) g.fillRect((w / 3) * i, 0, 3, h);
    g.fillStyle = 'rgba(205,175,130,0.9)';
    g.fillRect(w * 0.47, 0, 12, h);
    g.fillStyle = '#f6f4ee';
    g.fillRect(20, 30, 50, 34);
    g.fillStyle = 'rgba(30,30,30,0.7)';
    for (let i = 0; i < 4; i++) g.fillRect(24, 34 + i * 7, 30 + rand() * 12, 3);
  });
}

function buildRacks(world) {
  const mUp = std(0x1d4f9a, 0.5, { metalness: 0.35 });
  const mBeam = std(0xe25a1c, 0.45, { metalness: 0.3 });
  const mPallet = std(0xffffff, 0.9, { map: palletTexture() });
  const mBox = std(0xffffff, 0.85, { map: boxTexture() });
  const mWrap = std(0xe8edf2, 0.35, { transparent: true, opacity: 0.35 });

  const BAY = 2.8;
  const LEVELS = [0, 1.75, 3.5, 5.25];
  const H = 6.6;
  // Rijen: [xFront, xBack] (diepte 2.4, dubbele rij).
  const rows = [
    { x0: -10.0, x1: -7.6, gap: null },
    { x0: 7.6, x1: 10.0, gap: LAYOUT.crossAisleZ },
    { x0: 13.6, x1: 16.0, gap: LAYOUT.crossAisleZ },
    { x0: 17.4, x1: 19.8, gap: LAYOUT.crossAisleZ },
  ];
  const zStart = 10;
  const zEnd = -15.2;

  const ups = [];
  const beams = [];
  const pallets = [];
  const loads = [];
  const wraps = [];

  for (const row of rows) {
    for (let z = zStart; z - BAY >= zEnd - 0.01; z -= BAY) {
      const za = z;
      const zb = z - BAY;
      if (row.gap && zb < row.gap[1] && za > row.gap[0]) continue;
      // Staanders op de hoeken van de bay (vooraan en achteraan elke rij-helft).
      for (const x of [row.x0 + 0.05, row.x0 + 1.15, row.x1 - 1.15, row.x1 - 0.05]) {
        ups.push([x, H / 2, za, 0.09, H, 0.08]);
        ups.push([x, H / 2, zb, 0.09, H, 0.08]);
      }
      for (const lv of LEVELS) {
        if (lv > 0) {
          for (const x of [row.x0 + 0.05, row.x0 + 1.15, row.x1 - 1.15, row.x1 - 0.05]) {
            beams.push([x, lv - 0.07, (za + zb) / 2, 0.06, 0.13, BAY]);
          }
        }
        // Pallets: 3 per bay per halve rij.
        for (const half of [0, 1]) {
          const xc = half === 0 ? row.x0 + 0.6 : row.x1 - 0.6;
          for (let k = 0; k < 3; k++) {
            if (rand() < 0.14) continue;
            const zc = za - 0.47 - k * 0.93;
            const y = lv + 0.002;
            pallets.push([xc, y + 0.072, zc, 1.15, 0.144, 0.8]);
            const maxH = lv === LEVELS[LEVELS.length - 1] ? 1.0 : 1.5;
            const hgt = 0.55 + rand() * (maxH - 0.55);
            loads.push([xc, y + 0.144 + hgt / 2, zc, 1.08, hgt, 0.76, rand()]);
            if (rand() < 0.45) wraps.push([xc, y + 0.144 + hgt / 2, zc, 1.12, hgt + 0.02, 0.8]);
          }
        }
      }
    }
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  const inst = (list, mat, colorize) => {
    const m = new THREE.InstancedMesh(box, mat, list.length);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    list.forEach((it, i) => {
      o.position.set(it[0], it[1], it[2]);
      o.scale.set(it[3], it[4], it[5]);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (colorize) {
        const r = it[6];
        if (r < 0.12) col.setHex(0x3f6fb0);
        else if (r < 0.2) col.setHex(0xe9e6df);
        else if (r < 0.26) col.setHex(0x6f8f4a);
        else col.setHSL(0.08 + (r - 0.5) * 0.02, 0.25 + r * 0.15, 0.82 + (r - 0.5) * 0.12);
        m.setColorAt(i, col);
      }
    });
    m.castShadow = true;
    m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    world.add(m);
    return m;
  };
  inst(ups, mUp);
  inst(beams, mBeam);
  inst(pallets, mPallet);
  inst(loads, mBox, true);
  const w = inst(wraps, mWrap);
  w.castShadow = false;

  // Aanrijdbeveiliging (geel) voor de staanders aan de gangkant.
  const guards = [];
  for (const row of rows) {
    for (let z = zStart; z >= zEnd; z -= BAY) {
      if (row.gap && z < row.gap[1] + 0.01 && z > row.gap[0] - 0.01) {
        // rand van de dwarsgang krijgt ook een beschermer
      }
      for (const x of [row.x0 + 0.05, row.x1 - 0.05]) guards.push([x, 0.2, z, 0.2, 0.4, 0.16]);
    }
  }
  inst(guards, std(0xf0b400, 0.5));

  // Donkere randen op de vloer onder elke stellingrij (zachte omgevingsocclusie).
  const len = zStart - zEnd;
  for (const row of rows) {
    const segs = row.gap ? [[zStart, row.gap[1]], [row.gap[0], zEnd]] : [[zStart, zEnd]];
    for (const [a, b] of segs) {
      const l = a - b;
      const ao = softShadow(row.x1 - row.x0 + 1.2, l + 1.0, 0.5, false);
      ao.position.set((row.x0 + row.x1) / 2, 0.006, (a + b) / 2);
      world.add(ao);
    }
  }
  void len;
}

function props(world) {
  const mPal = std(0xffffff, 0.9, { map: palletTexture() });
  const geo = new THREE.BoxGeometry(1.2, 0.144, 0.8);
  // Stapels lege pallets bij de docks.
  for (const [x, z, n] of [[-9.5, -19.6, 9], [-8.4, -19.6, 6], [10.2, -20.6, 7]]) {
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(geo, mPal);
      p.position.set(x + (rand() - 0.5) * 0.04, 0.072 + i * 0.146, z + (rand() - 0.5) * 0.04);
      p.castShadow = true;
      p.receiveShadow = true;
      world.add(p);
    }
  }
  // Rolcontainers.
  const mCage = std(0x9aa3ab, 0.35, { metalness: 0.7, wireframe: false });
  for (const [x, z] of [[-3.8, -19.8], [-3.0, -19.9], [4.1, -19.7]]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.8), mCage);
    base.position.y = 0.15;
    g.add(base);
    for (const sx of [-0.34, 0.34]) {
      for (let k = 0; k < 6; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 0.02), mCage);
        bar.position.set(sx, 1.0, -0.38 + k * 0.15);
        g.add(bar);
      }
    }
    for (let y = 0.4; y <= 1.8; y += 0.35) {
      for (const sx of [-0.34, 0.34]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.8), mCage);
        r.position.set(sx, y, 0);
        g.add(r);
      }
    }
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.7), std(0xc99a63, 0.9));
    cargo.position.y = 0.55;
    cargo.castShadow = true;
    g.add(cargo);
    g.traverse((n) => n.isMesh && (n.castShadow = true));
    world.add(g);
  }
  // Brandblusser aan de muur.
  const ext = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 4, 12), std(0xc81e1e, 0.35, { metalness: 0.2 }));
  ext.position.set(-12.3, 1.0, -12);
  ext.castShadow = true;
  world.add(ext);
  const extSign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    std(0xffffff, 0.6, { map: signTexture({ w: 256, h: 256, bg: '#c81e1e', fg: '#ffffff', text: 'BLUSSER', size: 64 }) }),
  );
  extSign.position.set(-12.4, 2.0, -12);
  extSign.rotation.y = Math.PI / 2;
  world.add(extSign);
}
