import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Elektrische heftruck met zwaailamp, blauwe waarschuwingsspot,
// remduik en een eenvoudige rijregeling (vooruit en achteruit).

function std(color, rough = 0.6, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.1, ...extra });
}

function add(parent, geo, mat, x, y, z, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2b705';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#141414';
  for (let x = -64; x < 300; x += 40) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 20, 64);
    g.lineTo(x + 84, 0);
    g.lineTo(x + 64, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function numberTexture(n) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8a600';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#121212';
  g.font = '800 92px "Barlow Condensed", Arial Narrow, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(n, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const FORK_TIP = 2.3;

export class Forklift {
  constructor({ color = 0xe8a600, number = '07', spot = true, beacon = true } = {}) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const mPaint = std(color, 0.42, { metalness: 0.15 });
    const mDark = std(0x2a2d33, 0.55, { metalness: 0.3 });
    const mBlack = std(0x111214, 0.85);
    const mSteel = std(0x8a9097, 0.35, { metalness: 0.75 });
    const mSeat = std(0x1b1c1f, 0.7);
    const mGlass = std(0xffffff, 0.2, { emissive: 0xfff4d6, emissiveIntensity: 2.0 });

    // Chassis en contragewicht.
    add(this.body, new RoundedBoxGeometry(1.1, 0.55, 1.9, 3, 0.07), mPaint, 0, 0.5, 0.05);
    const cw = add(this.body, new RoundedBoxGeometry(1.14, 0.78, 0.6, 4, 0.14), mDark, 0, 0.72, -0.82);
    cw.scale.set(1, 1, 1);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5 }));
    plate.position.set(0, 0.6, -1.125);
    plate.rotation.y = Math.PI;
    this.body.add(plate);
    add(this.body, new RoundedBoxGeometry(0.95, 0.38, 0.34, 3, 0.06), mPaint, 0, 0.92, 0.62);
    // Treeplank.
    add(this.body, new THREE.BoxGeometry(0.3, 0.05, 0.4), mBlack, 0.52, 0.32, 0.25);

    // Zijnummer.
    const num = numberTexture(number);
    for (const s of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshStandardMaterial({ map: num, roughness: 0.5 }));
      p.position.set(0.553 * s, 0.55, -0.25);
      p.rotation.y = (Math.PI / 2) * s;
      this.body.add(p);
    }

    // Stoel en stuur.
    add(this.body, new RoundedBoxGeometry(0.46, 0.12, 0.44, 3, 0.05), mSeat, 0, 0.84, -0.32);
    const back = add(this.body, new RoundedBoxGeometry(0.46, 0.5, 0.1, 3, 0.04), mSeat, 0, 1.12, -0.55);
    back.rotation.x = -0.12;
    const column = add(this.body, new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), mDark, 0, 1.08, 0.42);
    column.rotation.x = -0.5;
    const wheel = add(this.body, new THREE.TorusGeometry(0.16, 0.022, 8, 24), mBlack, 0, 1.28, 0.32);
    wheel.rotation.x = -1.05;
    this.seatAnchor = new THREE.Object3D();
    this.seatAnchor.position.set(0, 0.9, -0.33);
    this.body.add(this.seatAnchor);

    // Veiligheidskooi.
    const postGeo = new THREE.BoxGeometry(0.065, 1.45, 0.065);
    for (const [x, z] of [[0.5, 0.52], [-0.5, 0.52], [0.5, -0.66], [-0.5, -0.66]]) {
      const p = add(this.body, postGeo, mDark, x, 1.5, z);
      if (z > 0) p.rotation.x = -0.08;
    }
    add(this.body, new THREE.BoxGeometry(1.08, 0.06, 1.3), mDark, 0, 2.22, -0.06);
    for (let i = -2; i <= 2; i++) add(this.body, new THREE.BoxGeometry(0.035, 0.035, 1.25), mBlack, i * 0.2, 2.26, -0.06);
    // Koplampen.
    for (const s of [1, -1]) add(this.body, new THREE.BoxGeometry(0.11, 0.07, 0.05), mGlass, 0.5 * s, 2.0, 0.6, false);

    // Mast, vorkbord en vorken.
    this.mast = new THREE.Group();
    this.mast.position.set(0, 0.08, 1.02);
    this.body.add(this.mast);
    for (const s of [1, -1]) {
      add(this.mast, new THREE.BoxGeometry(0.09, 2.35, 0.13), mDark, 0.36 * s, 1.17, 0);
      add(this.mast, new THREE.BoxGeometry(0.06, 2.2, 0.1), mSteel, 0.27 * s, 1.15, 0.03);
    }
    add(this.mast, new THREE.BoxGeometry(0.82, 0.08, 0.1), mDark, 0, 2.3, 0);
    add(this.mast, new THREE.BoxGeometry(0.82, 0.06, 0.1), mDark, 0, 1.2, 0);
    const carriage = new THREE.Group();
    carriage.position.set(0, 0.12, 0.1);
    this.mast.add(carriage);
    add(carriage, new THREE.BoxGeometry(0.9, 0.42, 0.06), mDark, 0, 0.24, 0);
    for (let i = -3; i <= 3; i++) add(carriage, new THREE.BoxGeometry(0.03, 0.55, 0.03), mDark, i * 0.13, 0.7, 0);
    add(carriage, new THREE.BoxGeometry(0.9, 0.04, 0.04), mDark, 0, 0.97, 0);
    for (const s of [1, -1]) {
      add(carriage, new THREE.BoxGeometry(0.12, 0.45, 0.05), mSteel, 0.26 * s, 0.22, 0.04);
      const fork = add(carriage, new THREE.BoxGeometry(0.12, 0.045, 1.16), mSteel, 0.26 * s, 0.0, 0.62);
      fork.castShadow = true;
    }

    // Wielen.
    this.wheels = [];
    const tyre = new THREE.CylinderGeometry(1, 1, 1, 22);
    tyre.rotateZ(Math.PI / 2);
    for (const [x, z, r, w] of [[0.5, 0.62, 0.3, 0.24], [-0.5, 0.62, 0.3, 0.24], [0.47, -0.78, 0.24, 0.2], [-0.47, -0.78, 0.24, 0.2]]) {
      const wg = new THREE.Group();
      wg.position.set(x, r, z);
      const t = add(wg, tyre, mBlack, 0, 0, 0);
      t.scale.set(w, r, r);
      const hub = add(wg, tyre, mSteel, Math.sign(x) * (w / 2 + 0.002), 0, 0, false);
      hub.scale.set(0.02, r * 0.55, r * 0.55);
      this.root.add(wg);
      this.wheels.push({ g: wg, r });
    }

    // Oranje zwaailamp.
    this.beacon = null;
    if (beacon) {
      const bm = std(0xff7a00, 0.3, { emissive: 0xff6a00, emissiveIntensity: 2.5, transparent: true, opacity: 0.92 });
      this.beaconMesh = add(this.body, new THREE.CylinderGeometry(0.06, 0.07, 0.11, 14), bm, 0.3, 2.32, -0.5, false);
      this.beacon = new THREE.PointLight(0xff7a1a, 0, 7, 2);
      this.beacon.position.set(0.3, 2.45, -0.5);
      this.body.add(this.beacon);
    }

    // Blauwe spot op de vloer, vóór de heftruck.
    this.spot = null;
    if (spot) {
      this.spot = new THREE.SpotLight(0x2a7bff, 60, 10, 0.1, 0.35, 1.2);
      this.spot.position.set(0, 2.15, 0.62);
      this.spotTarget = new THREE.Object3D();
      this.spotTarget.position.set(0, 0, 4.2);
      this.body.add(this.spot, this.spotTarget);
      this.spot.target = this.spotTarget;
    }

    this.root.traverse((n) => {
      if (n.isMesh) n.userData.forklift = this;
    });

    this.speed = 0;
    this.prevSpeed = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this.on = true;
    this.target = null;
    this.maxSpeed = 3;
    this.accel = 1.6;
    this.decel = 2.5;
    this.brakeNow = false;
    this.time = Math.random() * 10;
    this.onStateChange = null;
  }

  forwardVec(v) {
    return v.set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y));
  }

  // Rijdt in een rechte lijn (vooruit of achteruit) naar een punt.
  driveTo(x, z, { maxSpeed = 3, accel = 1.6, decel = 2.5 } = {}) {
    this.cancelDrive();
    this.target = new THREE.Vector3(x, 0, z);
    this.maxSpeed = maxSpeed;
    this.accel = accel;
    this.decel = decel;
    return new Promise((r) => (this._arrive = r));
  }

  cancelDrive() {
    this.target = null;
    if (this._arrive) {
      const r = this._arrive;
      this._arrive = null;
      r();
    }
  }

  setSpeedInstant(v) {
    this.speed = v;
    this.prevSpeed = v;
  }

  update(dt) {
    this.time += dt;
    const fwd = this.forwardVec(new THREE.Vector3());
    if (this.target) {
      const to = this.target.clone().sub(this.root.position);
      to.y = 0;
      const along = to.dot(fwd);
      const dir = Math.sign(along) || 1;
      const dist = Math.abs(along);
      const v = Math.abs(this.speed);
      const stopDist = (v * v) / (2 * this.decel);
      let nv;
      if (dist <= stopDist + 0.01) nv = Math.max(0, v - this.decel * dt);
      else nv = Math.min(this.maxSpeed, v + this.accel * dt);
      // Nooit voorbij het doel schieten, ook niet bij een lage framerate.
      if (dist < 0.02 || (nv === 0 && dist < 0.3) || nv * dt >= dist) {
        this.speed = 0;
        this.root.position.x = this.target.x;
        this.root.position.z = this.target.z;
        const r = this._arrive;
        this.target = null;
        this._arrive = null;
        if (r) r();
      } else {
        this.speed = nv * dir;
      }
    }
    this.root.position.addScaledVector(fwd, this.speed * dt);
    for (const w of this.wheels) w.g.rotation.x += (this.speed * dt) / w.r;

    // Remduik en mastzwiep: veer-demper op de versnelling.
    const acc = dt > 0 ? (this.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = this.speed;
    const targetPitch = clamp(-acc * 0.012, -0.06, 0.06);
    const k = 70;
    const c = 7;
    this.pitchVel += (k * (targetPitch - this.pitch) - c * this.pitchVel) * dt;
    this.pitch += this.pitchVel * dt;
    this.body.rotation.x = this.pitch;
    this.mast.rotation.x = this.pitch * 1.4;

    if (this.beacon) {
      const f = (Math.sin(this.time * 9) + 1) / 2;
      this.beacon.intensity = this.on ? 0.5 + f * f * 5 : 0;
      this.beaconMesh.material.emissiveIntensity = this.on ? 0.6 + f * 2.5 : 0.1;
    }
    if (this.spot) {
      // Spot schijnt in de rijrichting.
      const rev = this.speed < -0.05;
      this.spotTarget.position.z = rev ? -4.2 : 4.2;
      this.spot.position.z = rev ? -0.7 : 0.62;
      this.spot.intensity = this.on ? 60 : 0;
    }
  }
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
