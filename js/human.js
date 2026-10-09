import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Realistisch personage op basis van een Microsoft Rocketbox-avatar (MIT-licentie).
// - Motion-capture-animaties (gebakken naar models/anim_*.bin) met zachte overgangen
// - Hoofd en ogen kijken naar een doel, arm kan naar een punt wijzen (IK bovenop de animatie)
// - Gezichtsuitdrukking via blendshapes (ARKit/FACS): boosheid, knipperen
// - Lipsync via visemen, gestuurd door volume en klankkleur van de stem

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);

const animCache = new Map();

async function loadAnimSet(base) {
  if (animCache.has(base)) return animCache.get(base);
  const p = (async () => {
    const [header, bin] = await Promise.all([
      fetch(`${base}.json`).then((r) => r.json()),
      fetch(`${base}.bin`).then((r) => r.arrayBuffer()),
    ]);
    const q16 = new Int16Array(bin, 0, header.qLen);
    const p32 = new Float32Array(bin, header.pByteOffset, header.pLen);
    const clips = {};
    const nb = header.bones.length;
    for (const c of header.clips) {
      const times = new Float32Array(c.frames);
      for (let f = 0; f < c.frames; f++) times[f] = f / header.fps;
      const tracks = [];
      header.bones.forEach((bone, bi) => {
        if (!c.has[bi]) return;
        const vals = new Float32Array(c.frames * 4);
        for (let f = 0; f < c.frames; f++) {
          const o = c.qOff + (f * nb + bi) * 4;
          vals[f * 4] = q16[o] / 32767;
          vals[f * 4 + 1] = q16[o + 1] / 32767;
          vals[f * 4 + 2] = q16[o + 2] / 32767;
          vals[f * 4 + 3] = q16[o + 3] / 32767;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
      });
      const np = c.posBones.length;
      c.posBones.forEach((bone, pi) => {
        const vals = new Float32Array(c.frames * 3);
        const x0 = p32[c.pOff + pi * 3];
        const z0 = p32[c.pOff + pi * 3 + 2];
        for (let f = 0; f < c.frames; f++) {
          const o = c.pOff + (f * np + pi) * 3;
          // Op de plek houden: horizontale verschuiving van de wortel eruit.
          vals[f * 3] = bone === 'Bip01' ? x0 : p32[o];
          vals[f * 3 + 1] = p32[o + 1];
          vals[f * 3 + 2] = bone === 'Bip01' ? z0 : p32[o + 2];
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, times, vals));
      });
      clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
    }
    return clips;
  })();
  animCache.set(base, p);
  return p;
}

// Welke blendshapes we bewaren (de rest wordt weggegooid om geheugen te sparen).
const KEEP = {
  sil: 'AA_VI_00_Sil',
  PP: 'AA_VI_01_PP',
  FF: 'AA_VI_02_FF',
  DD: 'AA_VI_04_DD',
  CH: 'AA_VI_06_CH',
  SS: 'AA_VI_07_SS',
  aa: 'AA_VI_10_aa',
  E: 'AA_VI_11_E',
  I: 'AA_VI_12_I',
  O: 'AA_VI_13_O',
  U: 'AA_VI_14_U',
  browDownL: 'AK_01_BrowDownLeft',
  browDownR: 'AK_02_BrowDownRight',
  browInnerUp: 'AK_03_BrowInnerUp',
  blinkL: 'AK_09_EyeBlinkLeft',
  blinkR: 'AK_10_EyeBlinkRight',
  squintL: 'AK_19_EyeSquintLeft',
  squintR: 'AK_20_EyeSquintRight',
  wideL: 'AK_21_EyeWideLeft',
  wideR: 'AK_22_EyeWideRight',
  jawOpen: 'AK_25_JawOpen',
  frownL: 'AK_30_MouthFrownLeft',
  frownR: 'AK_31_MouthFrownRight',
  pressL: 'AK_36_MouthPressLeft',
  pressR: 'AK_37_MouthPressRight',
  smileL: 'AK_44_MouthSmileLeft',
  smileR: 'AK_45_MouthSmileRight',
  upperUpL: 'AK_48_MouthUpperUpLeft',
  upperUpR: 'AK_49_MouthUpperUpRight',
  sneerL: 'AK_50_NoseSneerLeft',
  sneerR: 'AK_51_NoseSneerRight',
  browLower: 'AU_04_BrowLowerer',
  lidTight: 'AU_07_LidTightener',
};

// Gebaren (oude API-namen) → animatieclips.
const POSE_CLIPS = {
  relaxed: ['idle', 'breathe'],
  angry: ['listenAngry', 'idleAngry'],
  armsOut: ['talkAngry', 'talkExcited'],
  shout: ['talkAngry2', 'talkAngry'],
  headHand: ['touchFace'],
  calm: ['talkRelaxed', 'talkNeutral', 'talkFirm'],
  hips: ['talkNeutral', 'idle'],
  crossed: ['idleAngry2', 'idleAngry'],
  wheel: ['sit'],
  clipboard: ['documents', 'idle'],
  firm: ['talkFirm', 'talkAngry'],
};

const texLoader = new THREE.TextureLoader();
function tex(url, srgb) {
  const t = texLoader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Human {
  static async load({ model, code, anims, facial = true, badge = null }) {
    const manager = new THREE.LoadingManager();
    // Texturen uit het FBX-bestand negeren: we zetten zelf PBR-materialen.
    manager.setURLModifier((u) => (/\.tga$/i.test(u) ? 'data:,' : u));
    const [obj, clips] = await Promise.all([new FBXLoader(manager).loadAsync(model), loadAnimSet(anims)]);
    return new Human(obj, clips, { code, facial, badge });
  }

  constructor(obj, clips, { code, facial }) {
    this.root = new THREE.Group();
    this.model = obj;
    obj.scale.setScalar(0.01);
    this.root.add(obj);
    this.clips = clips;

    const dir = 'models/tex/';
    this.mesh = null;
    obj.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
        n.frustumCulled = false;
        const mats = [].concat(n.material).map((m) => {
          const part = /head/i.test(m.name) ? 'head' : /helmet/i.test(m.name) ? 'helmet' : 'body';
          if (part === 'helmet') return new THREE.MeshBasicMaterial({ visible: false });
          const mat = new THREE.MeshStandardMaterial({
            name: m.name,
            map: tex(`${dir}${code}_${part}_color.jpg`, true),
            normalMap: tex(`${dir}${code}_${part}_normal.jpg`, false),
            roughness: part === 'head' ? 0.62 : 0.85,
            metalness: 0,
          });
          mat.normalScale.set(1, -1);
          return mat;
        });
        n.material = Array.isArray(n.material) ? mats : mats[0];
        if (n.morphTargetDictionary) this._pruneMorphs(n);
        if (!this.mesh || n.morphTargetInfluences) this.mesh = n;
      }
    });

    // Botten.
    const B = (name) => obj.getObjectByName(name);
    this.bones = {
      root: B('Bip01'),
      pelvis: B('Bip01_Pelvis'),
      spine2: B('Bip01_Spine2'),
      neck: B('Bip01_Neck'),
      head: B('Bip01_Head'),
      eyeL: B('Bip01_LEye'),
      eyeR: B('Bip01_REye'),
      handL: B('Bip01_L_Hand'),
      handR: B('Bip01_R_Hand'),
      arm: {
        l: { up: B('Bip01_L_UpperArm'), fore: B('Bip01_L_Forearm'), hand: B('Bip01_L_Hand') },
        r: { up: B('Bip01_R_UpperArm'), fore: B('Bip01_R_Forearm'), hand: B('Bip01_R_Hand') },
      },
    };

    // Kijkrichting van hoofd en ogen in rustpose bepalen (model kijkt naar +z).
    this._orient();

    this.mixer = new THREE.AnimationMixer(obj);
    this.actions = {};
    for (const [name, clip] of Object.entries(clips)) {
      const a = this.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      this.actions[name] = a;
    }
    this.current = null;

    // Toestand (zelfde API als het eenvoudige personage).
    this.handPose = 'relaxed';
    this.aim = { l: null, r: null };
    this.aimW = { l: 0, r: 0 };
    this.anger = 0;
    this.angerTarget = 0;
    this.talk = null;
    this.talkSpec = null;
    this.lookTarget = null;
    this.lookW = 0;
    this.path = [];
    this.walkSpeed = 1.3;
    this.seat = 0;
    this.faceYaw = null;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.nodT = 0;
    this.shakeT = 0;
    this.time = Math.random() * 10;
    this.mouth = { open: 0, round: 0, wide: 0, close: 0 };
    this.onStep = null;
    this._stepPhase = 0;
    this._lastStepSign = 0;
    this.seatOffset = -0.5;
    this._play('idle', 0);
  }

  _pruneMorphs(mesh) {
    const dict = mesh.morphTargetDictionary;
    const geo = mesh.geometry;
    const keepIdx = [];
    const newDict = {};
    this.morph = {};
    for (const [key, suffix] of Object.entries(KEEP)) {
      const full = Object.keys(dict).find((k) => k.endsWith(suffix));
      if (full === undefined) continue;
      newDict[key] = keepIdx.length;
      keepIdx.push(dict[full]);
    }
    for (const attr of Object.keys(geo.morphAttributes)) {
      geo.morphAttributes[attr] = keepIdx.map((i) => geo.morphAttributes[attr][i]);
    }
    mesh.morphTargetDictionary = newDict;
    mesh.morphTargetInfluences = new Array(keepIdx.length).fill(0);
    this.morphMesh = mesh;
    this.morphIdx = newDict;
  }

  _orient() {
    this.root.updateMatrixWorld(true);
    const local = (bone) => {
      bone.getWorldQuaternion(_q);
      return FWD.clone().applyQuaternion(_q.invert());
    };
    this.headFwd = local(this.bones.head);
    this.eyeFwdL = this.bones.eyeL ? local(this.bones.eyeL) : null;
    this.eyeFwdR = this.bones.eyeR ? local(this.bones.eyeR) : null;
    // Lengtes van de arm (voor wijzen).
    this.bones.arm.l.fore.getWorldPosition(_v);
    this.bones.arm.l.up.getWorldPosition(_v2);
    this.upperLen = _v.distanceTo(_v2);
    // Richting van de bovenarm in de lokale ruimte van het bot (naar de onderarm).
    for (const s of ['l', 'r']) {
      const a = this.bones.arm[s];
      a.upAxis = a.fore.position.clone().normalize();
      a.foreAxis = a.hand.position.clone().normalize();
    }
  }

  _play(name, fade = 0.45, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a) {
      a.timeScale = timeScale;
      return;
    }
    a.reset();
    a.timeScale = timeScale;
    // Begin ergens willekeurig in lange clips, zodat herhaling minder opvalt.
    if (a.getClip().duration > 10) a.time = Math.random() * (a.getClip().duration - 4);
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    else a.fadeIn(fade);
    this.current = a;
  }

  setHands(name) {
    this.handPose = name;
  }

  setAim(side, worldPoint) {
    this.aim[side] = worldPoint ? worldPoint.clone() : null;
  }

  nod() {
    this.nodT = 1.0;
  }

  shake() {
    this.shakeT = 1.2;
  }

  walkTo(points, speed = 1.3) {
    this.cancelWalk();
    this.path = points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    this.walkSpeed = speed;
    return new Promise((r) => (this._arrive = r));
  }

  cancelWalk() {
    this.path = [];
    if (this._arrive) {
      const r = this._arrive;
      this._arrive = null;
      r();
    }
  }

  faceTowards(x, z) {
    const p = this.root.position;
    this.faceYaw = Math.atan2(x - p.x, z - p.z);
  }

  headWorld(v) {
    this.bones.head.updateWorldMatrix(true, false);
    return this.bones.head.getWorldPosition(v).add(_v3.set(0, 0.06, 0));
  }

  chestWorld(v) {
    return this.bones.spine2.getWorldPosition(v);
  }

  _chooseClip(moving) {
    if (this.seat > 0.5) return ['sit', 1];
    if (moving) {
      const fast = this.walkSpeed > 1.45 && this.actions.walkFast;
      const name = fast ? 'walkFast' : 'walk';
      const natural = fast ? 1.65 : 1.25;
      return [name, THREE.MathUtils.clamp(this.walkSpeed / natural, 0.6, 1.5)];
    }
    // Wijzen: presentatiegebaar als basis, arm wordt daarna met IK gericht.
    const options = POSE_CLIPS[this.handPose] || POSE_CLIPS.relaxed;
    const name = options.find((n) => this.actions[n]) || 'idle';
    return [name, 1];
  }

  update(dt) {
    this.time += dt;

    // Lopen.
    let moving = false;
    if (this.path.length) {
      const p = this.root.position;
      const target = this.path[0];
      _v.set(target.x - p.x, 0, target.z - p.z);
      const dist = _v.length();
      if (dist < 0.04) {
        this.path.shift();
        if (!this.path.length && this._arrive) {
          const r = this._arrive;
          this._arrive = null;
          r();
        }
      } else {
        _v.normalize();
        p.addScaledVector(_v, Math.min(dist, this.walkSpeed * dt));
        this.root.rotation.y = turnTowards(this.root.rotation.y, Math.atan2(_v.x, _v.z), 6 * dt);
        moving = true;
        this.faceYaw = null;
        this._stepPhase += dt * this.walkSpeed * 2.6;
        const sgn = Math.sign(Math.sin(this._stepPhase * Math.PI));
        if (sgn !== this._lastStepSign && this.onStep) this.onStep(this);
        this._lastStepSign = sgn;
      }
    }
    if (!moving && this.faceYaw !== null) this.root.rotation.y = turnTowards(this.root.rotation.y, this.faceYaw, 3.5 * dt);

    const [clip, ts] = this._chooseClip(moving);
    this._play(clip, moving ? 0.3 : 0.5, ts);
    this.model.position.y = this.seat > 0.5 ? this.seatOffset * this.seat * 100 * 0.01 : 0;
    this.mixer.update(dt);
    this.root.updateMatrixWorld(true);

    // Procedurele lagen bovenop de animatie.
    this._aimArms(dt);
    this._look(dt);
    this._face(dt);
  }

  _aimArms(dt) {
    for (const s of ['l', 'r']) {
      const want = this.aim[s] ? 1 : 0;
      this.aimW[s] += (want - this.aimW[s]) * (1 - Math.exp(-6 * dt));
      if (this.aim[s]) this._lastAim = this._lastAim || {};
      if (this.aim[s]) (this._lastAim[s] = this.aim[s]);
      const w = this.aimW[s];
      const target = this.aim[s] || this._lastAim?.[s];
      if (w < 0.01 || !target) continue;
      const a = this.bones.arm[s];
      // Bovenarm richten.
      a.up.getWorldPosition(_v);
      const desired = _v2.copy(target).sub(_v).normalize();
      // iets omhoog zodat het een duidelijk wijsgebaar is
      desired.y += 0.08;
      desired.normalize();
      this._pointBone(a.up, a.upAxis, desired, w);
      a.up.updateMatrixWorld(true);
      // Onderarm gestrekt in dezelfde richting.
      this._pointBone(a.fore, a.foreAxis, desired, w);
      a.fore.updateMatrixWorld(true);
    }
  }

  // Draait een bot zodat zijn lokale as `axis` in wereldrichting `dir` wijst (met gewicht w).
  _pointBone(bone, axis, dir, w) {
    bone.getWorldQuaternion(_q);
    const cur = _v3.copy(axis).applyQuaternion(_q).normalize();
    _q2.setFromUnitVectors(cur, dir);
    _q2.slerp(_q3.identity(), 1 - w);
    const worldNew = _q2.multiply(_q);
    bone.parent.getWorldQuaternion(_q3);
    bone.quaternion.copy(_q3.invert().multiply(worldNew));
  }

  _look(dt) {
    let target = null;
    if (this.lookTarget) target = typeof this.lookTarget === 'function' ? this.lookTarget(new THREE.Vector3()) : this.lookTarget;
    this.lookW += ((target ? 1 : 0) - this.lookW) * (1 - Math.exp(-4 * dt));
    if (target) this._lastLook = target.clone();
    const t = target || this._lastLook;
    const head = this.bones.head;
    if (t && this.lookW > 0.01) {
      // Lichaam meedraaien als het doel te ver opzij is.
      if (!this.path.length && this.seat < 0.5) {
        const p = this.root.position;
        const yaw = Math.atan2(t.x - p.x, t.z - p.z);
        let d = yaw - this.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > 0.7) this.root.rotation.y += Math.sign(d) * Math.min(Math.abs(d) - 0.65, 2.2 * dt);
      }
      for (const [bone, fwd, weight, maxAng] of [
        [this.bones.neck, this.headFwd, 0.35, 0.5],
        [head, this.headFwd, 0.75, 0.9],
      ]) {
        bone.updateMatrixWorld(true);
        head.getWorldPosition(_v);
        const desired = _v2.copy(t).sub(_v).normalize();
        head.getWorldQuaternion(_q);
        const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
        const ang = Math.min(cur.angleTo(desired), maxAng);
        if (ang < 1e-3) continue;
        const axis = _v.crossVectors(cur, desired).normalize();
        _q2.setFromAxisAngle(axis, ang * weight * this.lookW);
        bone.getWorldQuaternion(_q);
        const worldNew = _q2.multiply(_q);
        bone.parent.getWorldQuaternion(_q3);
        bone.quaternion.copy(_q3.invert().multiply(worldNew));
      }
    }
    // Knikken en nee schudden, plus kleine praatbewegingen.
    let pitch = 0;
    let yaw = 0;
    if (this.nodT > 0) {
      this.nodT -= dt;
      pitch += Math.sin((1 - this.nodT) * 13) * 0.14 * Math.min(1, this.nodT * 3);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      yaw += Math.sin((1.2 - this.shakeT) * 14) * 0.18 * Math.min(1, this.shakeT * 2.5);
    }
    pitch += this.mouth.open * 0.04 * Math.sin(this.time * 7);
    if (pitch || yaw) {
      // Rond de verticale en zijwaartse wereldas van het lichaam draaien.
      head.getWorldQuaternion(_q);
      const up = _v.set(0, 1, 0);
      const side = _v2.set(1, 0, 0).applyQuaternion(this.root.quaternion);
      _q2.setFromAxisAngle(up, yaw).multiply(_q3.setFromAxisAngle(side, pitch));
      const worldNew = _q2.multiply(_q);
      head.parent.getWorldQuaternion(_q3);
      head.quaternion.copy(_q3.invert().multiply(worldNew));
    }
    head.updateMatrixWorld(true);
    // Ogen maken oogcontact.
    if (t && this.eyeFwdL) {
      for (const [eye, fwd] of [[this.bones.eyeL, this.eyeFwdL], [this.bones.eyeR, this.eyeFwdR]]) {
        eye.updateMatrixWorld(true);
        eye.getWorldPosition(_v);
        const desired = _v2.copy(t).sub(_v).normalize();
        eye.getWorldQuaternion(_q);
        const cur = _v3.copy(fwd).applyQuaternion(_q).normalize();
        const ang = Math.min(cur.angleTo(desired), 0.45);
        if (ang < 1e-3) continue;
        const axis = _v.crossVectors(cur, desired).normalize();
        _q2.setFromAxisAngle(axis, ang * this.lookW);
        const worldNew = _q2.multiply(_q);
        eye.parent.getWorldQuaternion(_q3);
        eye.quaternion.copy(_q3.invert().multiply(worldNew));
      }
    }
  }

  _face(dt) {
    if (!this.morphMesh) return;
    const inf = this.morphMesh.morphTargetInfluences;
    const set = (k, v) => {
      const i = this.morphIdx[k];
      if (i !== undefined) inf[i] = THREE.MathUtils.clamp(v, 0, 1);
    };
    this.anger += (this.angerTarget - this.anger) * (1 - Math.exp(-2.2 * dt));
    const A = this.anger;

    // Spraak: volume + klankkleur → visemen.
    let lvl = 0;
    let spec = null;
    if (this.talk) {
      const r = this.talk();
      if (typeof r === 'number') lvl = r;
      else if (r) {
        lvl = r.level;
        spec = r;
      }
    }
    const open = THREE.MathUtils.clamp(lvl * 9, 0, 1);
    const k = 1 - Math.exp(-(open > this.mouth.open ? 28 : 14) * dt);
    this.mouth.open += (open - this.mouth.open) * k;
    const low = spec ? spec.low : 0.5;
    const high = spec ? spec.high : 0.3;
    this.mouth.round += ((low > 0.55 ? 1 : 0) - this.mouth.round) * k;
    this.mouth.wide += ((high > 0.35 ? 1 : 0) - this.mouth.wide) * k;
    const o = this.mouth.open;
    set('aa', o * (1 - this.mouth.round * 0.6) * 0.9);
    set('O', o * this.mouth.round * 0.7);
    set('E', o * this.mouth.wide * 0.6);
    set('SS', (1 - o) * this.mouth.wide * (lvl > 0.02 ? 0.5 : 0));
    set('jawOpen', o * 0.25);

    // Emotie: boos → wenkbrauwen omlaag, neus optrekken, mondhoeken omlaag, ogen knijpen.
    set('browDownL', A * 0.9);
    set('browDownR', A * 0.9);
    set('browLower', A * 0.6);
    set('sneerL', A * 0.35);
    set('sneerR', A * 0.35);
    set('frownL', A * 0.5);
    set('frownR', A * 0.5);
    set('squintL', A * 0.35);
    set('squintR', A * 0.35);
    set('pressL', A * 0.25 * (1 - o));
    set('pressR', A * 0.25 * (1 - o));
    set('upperUpL', A * 0.25 * o);
    set('upperUpR', A * 0.25 * o);
    set('wideL', this.surprise || 0);
    set('wideR', this.surprise || 0);
    const calm = Math.max(0, 0.3 - A);
    set('browInnerUp', calm * 0.6 + (this.worry || 0));
    set('smileL', this.smile || 0);
    set('smileR', this.smile || 0);

    // Knipperen.
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blink = 0.16;
      this.blinkT = 2 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const b = this.blink > 0 ? Math.sin((this.blink / 0.16) * Math.PI) : 0;
    set('blinkL', b);
    set('blinkR', b);
  }
}

function turnTowards(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}
