// 我妻善逸 (Zenitsu) — a character model built from code alone, after a four-view reference sheet.
// No mesh files, no textures on disk: every surface is a parametric sweep / lathe / primitive and every
// pattern (the uroko-triangle haori, the gaiters, the face, the sword grip) is painted on a canvas at build time.
//
//   import { createZenitsu } from './character/zenitsu.js';
//   const z = createZenitsu({ outline: true });   // z.group (feet on y = 0, faces +z, ~1.6 m tall)
//   scene.add(z.group);  z.setPose('relaxed');  z.update(dt);
//
// Joint tree (plain Groups; rotate them to pose, rest = the sheet's standing A-pose):
//   root → hips → spine → neck → head
//               ↳ upperArm.L/R → lowerArm.L/R → hand.L/R
//               ↳ upperLeg.L/R → lowerLeg.L/R → foot.L/R
// Cel look: MeshToonMaterial with a 3-step ramp + an inverted-hull ink outline (optional). Colours are sRGB.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const D = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------------------------------------------
// palette (display sRGB, from the sheet)
// ---------------------------------------------------------------------------------------------------------------
export const ZEN = {
  skin: '#f6dcc3', skinShade: '#e9b89a', eyeWhite: '#fbf6ef', iris: '#6c3d1e', irisLight: '#b5702f', ink: '#2a1b12',
  hairTop: '#f6c832', hairTip: '#f28a2a', hairDeep: '#e2a81d',
  haoriTop: '#f9d63b', haoriBottom: '#f28a1c', tri: '#fbf8ef', lining: '#f3eee2',
  uniform: '#272019', uniformEdge: '#3a3029', white: '#f4f2ec', silver: '#d8dadf', buckle: '#c9cbd0',
  pants: '#262019', gaiterTop: '#f6cf3a', gaiterBottom: '#f0892a', diamond: '#1d1713', bow: '#f6f3ea',
  sole: '#2a2420', tabi: '#2b2520', strap: '#f1efe8', saya: '#f2efe8', sayaTip: '#e4b53a', tsuka: '#f4f1e8', tsukaDiamond: '#e8c23c', tsuba: '#d9b53b',
};

// ---------------------------------------------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------------------------------------------

/**
 * Parametric sweep: fn(s, t) → [x, y, z] for s ∈ [0,1] along the surface and t ∈ [0,1] around it.
 * Builds a quad grid (seam column duplicated so uvs stay continuous), uv = (t, 1 - s), auto-orients the winding so
 * normals point away from each ring's centroid, and can cap either end with a fan.
 */
function sweep(fn, nS, nT, { capStart = false, capEnd = false, closed = true } = {}) {
  const cols = closed ? nT + 1 : nT;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= nS; i++) {
    const s = i / nS;
    for (let j = 0; j < cols; j++) {
      const t = closed ? j / nT : j / (nT - 1);
      const p = fn(s, t);
      pos.push(p[0], p[1], p[2]);
      uv.push(t, 1 - s);
    }
  }
  // orientation test on the middle ring: does (ds × dt) point outward from the ring centroid?
  const ring = Math.floor(nS / 2);
  const c = [0, 0, 0];
  for (let j = 0; j < cols; j++) { const k = (ring * cols + j) * 3; c[0] += pos[k]; c[1] += pos[k + 1]; c[2] += pos[k + 2]; }
  c[0] /= cols; c[1] /= cols; c[2] /= cols;
  const P = (i, j) => { const k = (i * cols + j) * 3; return [pos[k], pos[k + 1], pos[k + 2]]; };
  const a = P(ring, 0), b = P(ring + 1, 0), d = P(ring, 1);
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = (n[0] * (a[0] - c[0]) + n[1] * (a[1] - c[1]) + n[2] * (a[2] - c[2])) < 0;
  const tri = (p, q, r) => flip ? idx.push(p, r, q) : idx.push(p, q, r);
  for (let i = 0; i < nS; i++) for (let j = 0; j < cols - 1; j++) {
    const p = i * cols + j, q = p + 1, r = p + cols, s2 = r + 1;
    tri(p, r, q); tri(q, r, s2);
  }
  const cap = (i, towardS) => {
    const cx = [0, 0, 0];
    for (let j = 0; j < cols; j++) { const k = (i * cols + j) * 3; cx[0] += pos[k]; cx[1] += pos[k + 1]; cx[2] += pos[k + 2]; }
    const ci = pos.length / 3; pos.push(cx[0] / cols, cx[1] / cols, cx[2] / cols); uv.push(0.5, 0.5);
    for (let j = 0; j < cols - 1; j++) { const p = i * cols + j, q = p + 1; if (towardS) tri(ci, q, p); else tri(ci, p, q); }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(nS, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Point on a superellipse (n = 2 ellipse … large n rounded box) for angle a. Returns [x, y] in (hw, hh) half-extents. */
function superPt(a, hw, hh, n = 2) {
  const c = Math.cos(a), s = Math.sin(a);
  return [hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

/** Piecewise-linear profile: keys [[s, value], …] sorted by s. */
function profile(keys) {
  return (s) => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) { const [s0, v0] = keys[i - 1], [s1, v1] = keys[i]; return mix(v0, v1, (s - s0) / (s1 - s0)); }
    return keys[keys.length - 1][1];
  };
}

function lathe(points, segs = 32) { return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs); }

// ---------------------------------------------------------------------------------------------------------------
// painted textures (canvas → CanvasTexture; all sRGB)
// ---------------------------------------------------------------------------------------------------------------
function canvasTex(w, h, paint, { repeat = [1, 1], wrap = THREE.RepeatWrapping } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

/** Vertical gradient top→bottom with white uroko triangles in staggered rows. metersU/V = physical size the uv square spans. */
function urokoTexture({ w = 1024, h = 1024, top = ZEN.haoriTop, bottom = ZEN.haoriBottom, metersU = 1.2, metersV = 0.7, tri = 0.075, gapX = 2.1, gapY = 1.6, gradFrom = 0.25, gradTo = 0.95, extra = null }) {
  return canvasTex(w, h, (ctx, W, H) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(gradFrom, top); g.addColorStop(gradTo, bottom); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const tw = tri / metersU * W, th = tri * 0.9 / metersV * H;       // one triangle in pixels
    const sx = tw * gapX, sy = th * gapY;
    ctx.fillStyle = ZEN.tri;
    let row = 0;
    for (let y = sy * 0.5; y < H + th; y += sy, row++) {
      const off = (row % 2) * sx * 0.5;
      for (let x = -sx + off; x < W + sx; x += sx) {
        ctx.beginPath(); ctx.moveTo(x, y - th * 0.5); ctx.lineTo(x + tw * 0.5, y + th * 0.5); ctx.lineTo(x - tw * 0.5, y + th * 0.5); ctx.closePath(); ctx.fill();
      }
    }
    extra?.(ctx, W, H);
  });
}

/** Face: eyes, brows, nose, the small worried mouth — mapped onto the head sphere (front at u = 0.25, equator v = 0.5). */
function faceTexture() {
  return canvasTex(1024, 512, (ctx, W, H) => {
    ctx.fillStyle = ZEN.skin; ctx.fillRect(0, 0, W, H);
    const cx = W * 0.25, ey = H * 0.535;
    // soft cheek blush
    for (const sgn of [-1, 1]) {
      const r = ctx.createRadialGradient(cx + sgn * W * 0.062, ey + H * 0.075, 0, cx + sgn * W * 0.062, ey + H * 0.075, W * 0.035);
      r.addColorStop(0, 'rgba(240,150,130,0.28)'); r.addColorStop(1, 'rgba(240,150,130,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    }
    for (const sgn of [-1, 1]) {
      const x = cx + sgn * W * 0.05, w = W * 0.034, hgt = H * 0.10;
      // white
      ctx.fillStyle = ZEN.eyeWhite;
      ctx.beginPath(); ctx.ellipse(x, ey, w, hgt, 0, 0, TAU); ctx.fill();
      // iris: dark top, warm bottom
      const ig = ctx.createLinearGradient(0, ey - hgt, 0, ey + hgt);
      ig.addColorStop(0, ZEN.iris); ig.addColorStop(0.55, ZEN.iris); ig.addColorStop(1, ZEN.irisLight);
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.ellipse(x, ey + hgt * 0.08, w * 0.72, hgt * 0.78, 0, 0, TAU); ctx.fill();
      // pupil + highlights
      ctx.fillStyle = '#1a0f08'; ctx.beginPath(); ctx.ellipse(x, ey + hgt * 0.1, w * 0.3, hgt * 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x - sgn * w * 0.28, ey - hgt * 0.32, w * 0.2, hgt * 0.17, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + sgn * w * 0.25, ey + hgt * 0.35, w * 0.1, hgt * 0.08, 0, 0, TAU); ctx.fill();
      // upper lash line + lid
      ctx.strokeStyle = ZEN.ink; ctx.lineCap = 'round'; ctx.lineWidth = H * 0.016;
      ctx.beginPath(); ctx.ellipse(x, ey, w * 1.02, hgt, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.lineWidth = H * 0.006; ctx.strokeStyle = 'rgba(80,40,20,0.8)';
      ctx.beginPath(); ctx.ellipse(x, ey, w * 1.02, hgt * 1.02, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      // worried brow: inner end raised
      ctx.strokeStyle = '#b8862a'; ctx.lineWidth = H * 0.013;
      ctx.beginPath(); ctx.moveTo(x + sgn * w * 1.25, ey - hgt * 1.5); ctx.quadraticCurveTo(x + sgn * w * 0.2, ey - hgt * 1.95, x - sgn * w * 0.75, ey - hgt * 1.62); ctx.stroke();
    }
    // nose tick
    ctx.strokeStyle = 'rgba(150,90,60,0.7)'; ctx.lineWidth = H * 0.006;
    ctx.beginPath(); ctx.moveTo(cx + W * 0.004, ey + H * 0.10); ctx.lineTo(cx - W * 0.003, ey + H * 0.14); ctx.stroke();
    // small open mouth (slightly worried)
    ctx.fillStyle = '#7a3a33'; ctx.beginPath(); ctx.ellipse(cx, ey + H * 0.215, W * 0.012, H * 0.022, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fbf6ef'; ctx.fillRect(cx - W * 0.009, ey + H * 0.195, W * 0.018, H * 0.012);
    ctx.strokeStyle = ZEN.ink; ctx.lineWidth = H * 0.007; ctx.beginPath(); ctx.moveTo(cx - W * 0.013, ey + H * 0.198); ctx.quadraticCurveTo(cx, ey + H * 0.19, cx + W * 0.013, ey + H * 0.198); ctx.stroke();
  }, { wrap: THREE.ClampToEdgeWrapping });
}

/** Sword grip: pale wrap with a column of gold diamonds (the tsuka-ito pattern). */
function tsukaTexture() {
  return canvasTex(256, 512, (ctx, W, H) => {
    ctx.fillStyle = ZEN.tsuka; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ZEN.tsukaDiamond;
    for (let y = H * 0.08; y < H; y += H * 0.16) for (const x of [W * 0.25, W * 0.75]) {
      ctx.beginPath(); ctx.moveTo(x, y - H * 0.06); ctx.lineTo(x + W * 0.17, y); ctx.lineTo(x, y + H * 0.06); ctx.lineTo(x - W * 0.17, y); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,100,60,0.35)'; ctx.lineWidth = 3;
    for (let y = 0; y < H; y += H * 0.08) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + H * 0.08); ctx.stroke(); }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------------------------------------------
function makeRamp() {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 218, 218, 218, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

export function createZenitsu({ outline = true, outlineWidth = 0.0045, scale = 1 } = {}) {
  const ramp = makeRamp();
  const mats = [];
  const toon = (o) => { const m = new THREE.MeshToonMaterial({ gradientMap: ramp, ...o }); mats.push(m); return m; };
  const M = {
    skin: toon({ color: ZEN.skin }),
    face: toon({ map: faceTexture() }),
    hair: toon({ color: 0xffffff, vertexColors: true }),
    uniform: toon({ color: ZEN.uniform }),
    white: toon({ color: ZEN.white }),
    silver: toon({ color: ZEN.silver }),
    haori: toon({ map: urokoTexture({ metersU: 1.25, metersV: 0.72 }) }),
    sleeve: toon({ map: urokoTexture({ metersU: 0.95, metersV: 0.56, gradFrom: 0.15, gradTo: 1.0 }) }),
    lining: toon({ color: ZEN.lining, side: THREE.BackSide }),
    liningCap: toon({ color: ZEN.lining, side: THREE.DoubleSide }),
    pants: toon({ color: ZEN.pants }),
    gaiter: toon({ map: urokoTexture({ w: 512, h: 512, top: ZEN.gaiterTop, bottom: ZEN.gaiterBottom, metersU: 0.5, metersV: 0.3, tri: 0.05, gapX: 2.2, gapY: 1.5, gradFrom: 0.2, gradTo: 0.9,
      extra: (ctx, W, H) => { // the black diamond down the shin (front = u 0.5 after the lathe is turned 180°)
        ctx.fillStyle = ZEN.diamond; const x = W * 0.5;
        ctx.beginPath(); ctx.moveTo(x, H * 0.12); ctx.lineTo(x + W * 0.055, H * 0.42); ctx.lineTo(x, H * 0.72); ctx.lineTo(x - W * 0.055, H * 0.42); ctx.closePath(); ctx.fill();
      } }) }),
    bow: toon({ color: ZEN.bow }),
    sole: toon({ color: ZEN.sole }),
    tabi: toon({ color: ZEN.tabi }),
    strap: toon({ color: ZEN.strap }),
    saya: toon({ color: ZEN.saya }),
    gold: toon({ color: ZEN.sayaTip }),
    tsuka: toon({ map: tsukaTexture() }),
  };

  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1c1410, side: THREE.BackSide });
  outlineMat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: outlineWidth };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uOutline;');
  };

  const group = new THREE.Group();
  group.name = 'zenitsu';
  const meshes = [];
  /** add a mesh (+ its ink hull) under a parent */
  const add = (parent, geo, mat, { pos, rot, scl, ink = true, name } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (name) m.name = name;
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scl) m.scale.set(...scl);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    meshes.push(m);
    if (outline && ink) { const h = new THREE.Mesh(geo, outlineMat); h.name = 'ink'; m.add(h); }
    return m;
  };
  const joint = (parent, name, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); return g; };

  // ---- skeleton of groups (world-space rest positions, feet on the ground) -----------------------------------
  const J = {};
  J.root = group;
  J.hips = joint(group, 'hips', [0, 0.9, 0]);
  J.spine = joint(J.hips, 'spine', [0, 0.06, 0]);              // y 0.96
  J.neck = joint(J.spine, 'neck', [0, 0.30, 0]);               // y 1.26
  J.head = joint(J.neck, 'head', [0, 0.10, 0]);                // y 1.36 (skull base)
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    J[`upperArm.${side}`] = joint(J.spine, `upperArm.${side}`, [sg * 0.19, 0.25, 0]);   // y 1.21 shoulder
    J[`lowerArm.${side}`] = joint(J[`upperArm.${side}`], `lowerArm.${side}`, [sg * 0.065, -0.27, 0]);
    J[`hand.${side}`] = joint(J[`lowerArm.${side}`], `hand.${side}`, [sg * 0.045, -0.25, 0]);
    J[`upperLeg.${side}`] = joint(J.hips, `upperLeg.${side}`, [sg * 0.10, -0.05, 0]);  // y 0.85
    J[`lowerLeg.${side}`] = joint(J[`upperLeg.${side}`], `lowerLeg.${side}`, [0, -0.40, 0]); // y 0.45 knee
    J[`foot.${side}`] = joint(J[`lowerLeg.${side}`], `foot.${side}`, [0, -0.38, 0]);      // y 0.07 ankle
  }

  // ---- torso: the corps uniform (stand collar, five buttons, chest tag) --------------------------------------
  {
    const T = J.spine; // local origin at y 0.96 world
    const hw = profile([[0, 0.085], [0.08, 0.17], [0.3, 0.17], [0.62, 0.15], [1, 0.175]]);
    const hd = profile([[0, 0.075], [0.08, 0.115], [0.3, 0.115], [0.62, 0.105], [1, 0.125]]);
    const yT = (s) => mix(0.32, -0.20, s);                                  // world 1.28 → 0.76
    const torso = sweep((s, t) => { const [x, z] = superPt(t * TAU, hw(s), hd(s), 2.4); return [x, yT(s), z]; }, 24, 40, { capStart: true, capEnd: true });
    add(T, torso, M.uniform, { name: 'uniform' });
    // collar (black) with a pale rim at its top edge
    add(T, sweep((s, t) => { const [x, z] = superPt(t * TAU, 0.082 - s * 0.004, 0.072 - s * 0.004, 2.2); return [x, mix(0.355, 0.30, s), z]; }, 2, 32), M.uniform);
    add(T, sweep((s, t) => { const [x, z] = superPt(t * TAU, 0.084, 0.074, 2.2); return [x, mix(0.362, 0.35, s), z]; }, 1, 32), M.white, { ink: false });
    // buttons
    for (let i = 0; i < 5; i++) add(T, new THREE.SphereGeometry(0.011, 10, 8), M.silver, { pos: [0, 0.255 - i * 0.07, hd(0.1 + i * 0.13) + 0.004], ink: false });
    // chest tag (on the right breast) — the blank white plate of the sheet
    add(T, new THREE.BoxGeometry(0.052, 0.024, 0.006), M.white, { pos: [-0.075, 0.195, 0.112], rot: [0, -0.35, 0], ink: false });
    // belt + buckle
    add(J.hips, sweep((s, t) => { const [x, z] = superPt(t * TAU, 0.165, 0.118, 2.4); return [x, mix(0.03, -0.025, s), z]; }, 1, 40), M.white, { name: 'belt' });
    add(J.hips, new THREE.BoxGeometry(0.055, 0.045, 0.012), M.silver, { pos: [0, 0.003, 0.118], ink: false });
    add(J.hips, new THREE.BoxGeometry(0.036, 0.028, 0.006), M.white, { pos: [0, 0.003, 0.126], ink: false });
  }

  // ---- neck + head ------------------------------------------------------------------------------------------
  add(J.neck, new THREE.CylinderGeometry(0.042, 0.05, 0.14, 20), M.skin, { pos: [0, 0.03, 0] });
  {
    const H = J.head; const R = 0.118, cy = 0.12;                      // skull centre world 1.48
    const headGeo = new THREE.SphereGeometry(R, 48, 32);
    headGeo.scale(1, 1.08, 0.97);
    { // taper the lower half into a soft chin (anime egg), keep the uvs
      const p = headGeo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) { const k = 1 - 0.30 * Math.pow(-y / (R * 1.08), 2.2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k + 0.004 * (1 - k) * 4); } }
      headGeo.computeVertexNormals();
    }
    add(H, headGeo, M.face, { pos: [0, cy, 0], name: 'head' });
    for (const sg of [-1, 1]) add(H, new THREE.SphereGeometry(0.02, 12, 10), M.skin, { pos: [sg * R * 0.96, cy - 0.005, -0.01], scl: [0.5, 1, 0.8] });

    // hair: an ellipsoid shell from the crown down to a jagged bottom edge (bangs at the brow, longer at the sides
    // and nape), with the tips painted orange through vertex colour
    const Rx = 0.142, Ry = 0.15, Rz = 0.142;
    const edge = (phi) => { // polar angle (rad) of the bottom edge by azimuth phi (0 = front)
      const c = Math.cos(phi);
      const base = mix(mix(126, 112, 0.5 + 0.5 * c) * D, 58 * D, sstep(0.35, 0.95, c));   // front 58°, sides ~119°, back 126°
      const spikes = 17, w = ((phi * spikes / TAU + 0.5) % 1 + 1) % 1;
      const jag = (1 - Math.abs(w * 2 - 1));                                            // triangle wave 0..1..0
      return base + (4 + 24 * jag) * D;
    };
    const nS = 18, nT = 90;
    const hair = sweep((s, t) => {
      const phi = t * TAU, psi = mix(0.03, 1, s) * edge(phi);
      const flare = 1 + 0.16 * Math.pow(s, 2);
      const sp = Math.sin(psi);
      return [Rx * sp * Math.sin(phi) * flare, cy + 0.012 + Ry * Math.cos(psi), Rz * sp * Math.cos(phi) * flare + 0.004];
    }, nS, nT);
    { // vertex colours: gold crown → orange tips
      const p = hair.attributes.position, col = new Float32Array(p.count * 3);
      const top = new THREE.Color(ZEN.hairTop), deep = new THREE.Color(ZEN.hairDeep), tip = new THREE.Color(ZEN.hairTip);
      for (let i = 0; i < p.count; i++) {
        const s = 1 - hair.attributes.uv.getY(i);
        const c = top.clone().lerp(deep, sstep(0.4, 0.72, s)).lerp(tip, sstep(0.68, 0.9, s));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      hair.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    add(H, hair, M.hair, { name: 'hair' });
    // inner hair shell so the open jagged edge does not show the skull through gaps
    const inner = hair.clone(); inner.scale(0.985, 0.985, 0.985);
    add(H, inner, toon({ color: ZEN.hairTip, side: THREE.BackSide }), { pos: [0, 0.002, 0], ink: false });
  }

  // ---- haori: open-front body shell + lining, square hanging sleeves --------------------------------------------
  {
    const T = J.spine;
    const hw = profile([[0, 0.14], [0.08, 0.215], [0.25, 0.228], [0.6, 0.245], [1, 0.272]]);
    const hd = profile([[0, 0.10], [0.08, 0.135], [0.25, 0.146], [0.6, 0.158], [1, 0.178]]);
    const gap = profile([[0, 0.05], [0.2, 0.08], [1, 0.11]]);                    // half-width of the front opening
    const yH = (s) => mix(0.30, -0.42, s);                                       // world 1.26 → 0.54 (hem above the knee)
    const body = (inset) => sweep((s, t) => {
      const a = hw(s) - inset, b = hd(s) - inset;
      const open = Math.asin(clamp(gap(s) / a, 0, 1));
      const phi = open + t * (TAU - 2 * open);
      const [x, z] = superPt(Math.PI / 2 - phi, a, b, 2.3);                  // phi = 0 at the front (+z)
      return [x, yH(s) + 0.01 * Math.cos(phi) * sstep(0, 0.2, s), z];        // hem dips a touch at the back
    }, 28, 64, { closed: false });
    add(T, body(0), M.haori, { name: 'haori' });
    add(T, body(0.006), M.lining, { ink: false });

    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const A = J[`upperArm.${side}`];
      // sleeve frame: along the hanging arm (dir), outward (o) and forward (z)
      const dir = V3(sg * 0.22, -1, 0).normalize(), o = V3(sg, 0, 0).sub(dir.clone().multiplyScalar(dir.x * sg)).normalize(), fw = V3(0, 0, 1);
      const len = 0.5;
      const ho = profile([[0, 0.10], [0.25, 0.135], [1, 0.19]]), hz = profile([[0, 0.085], [1, 0.08]]), co = profile([[0, 0.02], [1, 0.045]]);
      const sleeve = sweep((s, t) => {
        const [u, v] = superPt(t * TAU, ho(s), hz(s), 3.2);
        const p = dir.clone().multiplyScalar(s * len - 0.045).addScaledVector(o, co(s) + u).addScaledVector(fw, v);   // starts above the shoulder, inside the haori's shoulder line
        return [p.x, p.y, p.z];
      }, 12, 48, { capStart: true });
      add(A, sleeve, M.sleeve, { name: `sleeve.${side}` });
      const lining = sleeve.clone(); lining.scale(0.99, 0.99, 0.99);
      add(A, lining, M.lining, { ink: false });
      // cuff cap: the pale underside you see at the open bottom
      const cap = sweep((s, t) => {
        const [u, v] = superPt(t * TAU, ho(1) * (1 - s * 0.999), hz(1) * (1 - s * 0.999), 3.2);
        const p = dir.clone().multiplyScalar(len - 0.048).addScaledVector(o, co(1) + u).addScaledVector(fw, v);
        return [p.x, p.y, p.z];
      }, 1, 48);
      add(A, cap, M.liningCap, { ink: false });
    }
  }

  // ---- arms: black uniform sleeves, white cuffs, hands ---------------------------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const U = J[`upperArm.${side}`], Lw = J[`lowerArm.${side}`], Hd = J[`hand.${side}`];
    const upDir = V3(sg * 0.065, -0.27, 0), loDir = V3(sg * 0.045, -0.25, 0);
    const seg = (parent, dirV, r0, r1, mat, extra = 0) => {
      const L = dirV.length() + extra;
      const g = new THREE.CylinderGeometry(r0, r1, L, 18);
      const m = add(parent, g, mat);
      m.position.copy(dirV).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V3(0, 1, 0), dirV.clone().normalize().negate());
      return m;
    };
    seg(U, upDir, 0.052, 0.046, M.uniform, 0.04);
    seg(Lw, loDir, 0.046, 0.042, M.uniform, 0.02);
    // white cuff
    const cuff = add(Lw, new THREE.CylinderGeometry(0.046, 0.047, 0.045, 18), M.white, { ink: false });
    cuff.position.copy(loDir).multiplyScalar(0.92);
    cuff.quaternion.setFromUnitVectors(V3(0, 1, 0), loDir.clone().normalize().negate());
    // hand: palm + thumb + a hint of fingers
    const palm = add(Hd, new THREE.SphereGeometry(0.038, 18, 12), M.skin, { pos: [0, -0.035, 0.004], scl: [0.8, 1.25, 0.5] });
    palm.name = `hand.${side}`;
    for (let i = 0; i < 4; i++) add(Hd, new THREE.CapsuleGeometry(0.0085, 0.045, 3, 8), M.skin, { pos: [sg * (-0.022 + i * 0.0145), -0.095, 0.004 + Math.abs(i - 1.5) * -0.002], rot: [0.05, 0, sg * (i - 1.5) * 0.08], ink: false });
    add(Hd, new THREE.CapsuleGeometry(0.009, 0.03, 3, 8), M.skin, { pos: [sg * -0.028, -0.045, 0.02], rot: [0.5, 0, sg * -0.6], ink: false });
  }

  // ---- legs: balloon trousers gathered below the knee, gaiters, bows, zōri ------------------------------------
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? 1 : -1;
    const UL = J[`upperLeg.${side}`], LL = J[`lowerLeg.${side}`], F = J[`foot.${side}`];
    // trousers: lathe around the thigh axis; world y 0.95 (under the belt) → gathered at 0.33
    const pants = lathe([[0.072, -0.545], [0.08, -0.53], [0.095, -0.50], [0.115, -0.46], [0.136, -0.38], [0.142, -0.26], [0.136, -0.12], [0.122, 0.0], [0.108, 0.03], [0.06, 0.06], [0.03, 0.10]], 36);
    add(UL, pants, M.pants, { name: `pants.${side}` });
    // gather band
    add(LL, new THREE.CylinderGeometry(0.098, 0.1, 0.03, 24), M.pants, { pos: [0, -0.115, 0], ink: false });
    // gaiter: world y 0.34 → 0.06, turned 180° so the texture's centre (the diamond) faces forward
    const gaiter = lathe([[0.075, -0.39], [0.078, -0.33], [0.081, -0.25], [0.083, -0.17], [0.084, -0.11]], 32);
    add(LL, gaiter, M.gaiter, { rot: [0, Math.PI, 0], name: `gaiter.${side}` });
    add(LL, new THREE.CylinderGeometry(0.0755, 0.077, 0.012, 24), M.white, { pos: [0, -0.395, 0], ink: false });
    // two white bows on the outer side
    for (const y of [-0.15, -0.30]) {
      const B = new THREE.Group(); B.position.set(sg * 0.08, y, -0.025); B.rotation.y = sg * Math.PI / 2; LL.add(B);
      for (const k of [-1, 1]) add(B, new THREE.SphereGeometry(0.02, 12, 8), M.bow, { pos: [k * 0.02, 0.004, 0.004], scl: [1, 0.6, 0.45], ink: false });
      add(B, new THREE.SphereGeometry(0.01, 10, 8), M.bow, { pos: [0, 0, 0.009], ink: false });
      for (const k of [-1, 1]) add(B, new THREE.BoxGeometry(0.011, 0.05, 0.004), M.bow, { pos: [k * 0.011, -0.03, 0.003], rot: [0, 0, k * 0.18], ink: false });
    }
    // foot: zōri sole, dark tabi foot, pale thong strap
    add(F, new THREE.BoxGeometry(0.1, 0.022, 0.27), M.sole, { pos: [0, -0.06, 0.075], name: `foot.${side}` });
    const foot = add(F, new THREE.SphereGeometry(0.05, 18, 12), M.tabi, { pos: [0, -0.03, 0.06], scl: [0.9, 0.7, 2.5] });
    foot.name = `tabi.${side}`;
    add(F, new THREE.CylinderGeometry(0.042, 0.05, 0.07, 16), M.tabi, { pos: [0, -0.02, 0.005] });
    for (const k of [-1, 1]) {
      const st = add(F, new THREE.CylinderGeometry(0.005, 0.005, 0.11, 8), M.strap, { ink: false });
      st.position.set(k * 0.024, -0.016, 0.12); st.rotation.set(1.25, 0, k * -0.45);
    }
  }

  // ---- katana, sheathed through the belt on the left hip ---------------------------------------------------------
  {
    const S = new THREE.Group(); S.name = 'katana';
    S.position.set(0.17, -0.01, 0.07); J.hips.add(S);
    const axis = V3(-0.25, 0.8, 0.55).normalize();          // grip forward-up across the chest, scabbard back-down
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), axis);
    S.quaternion.copy(q);
    const sayaL = 0.64, tsukaL = 0.26;
    add(S, new THREE.CylinderGeometry(0.019, 0.016, sayaL, 16), M.saya, { pos: [0, -sayaL / 2, 0], scl: [1, 1, 0.6], name: 'saya' });
    add(S, new THREE.CylinderGeometry(0.016, 0.012, 0.06, 16), M.gold, { pos: [0, -sayaL - 0.025, 0], scl: [1, 1, 0.6], ink: false });
    add(S, new THREE.CylinderGeometry(0.021, 0.021, 0.025, 16), M.gold, { pos: [0, -0.012, 0], scl: [1, 1, 0.6], ink: false }); // koiguchi collar
    add(S, new THREE.CylinderGeometry(0.044, 0.044, 0.008, 24), M.gold, { pos: [0, 0.006, 0], name: 'tsuba' });
    add(S, new THREE.CylinderGeometry(0.019, 0.017, tsukaL, 16), M.tsuka, { pos: [0, 0.012 + tsukaL / 2, 0], scl: [1, 1, 0.65], name: 'tsuka' });
    add(S, new THREE.CylinderGeometry(0.02, 0.019, 0.02, 16), M.gold, { pos: [0, 0.012 + tsukaL + 0.008, 0], scl: [1, 1, 0.65], ink: false });
  }

  // ---- poses -------------------------------------------------------------------------------------------------
  const POSES = {
    rest: {},
    relaxed: { 'upperArm.L': [0, 0, -4], 'upperArm.R': [0, 0, 4], head: [2, 0, 0] },
    guard: { 'upperArm.R': [-55, 0, 20], 'lowerArm.R': [-70, 0, 0], 'upperArm.L': [-40, 0, -25], 'lowerArm.L': [-80, 0, 0], spine: [0, -15, 0], 'upperLeg.L': [-20, 0, 0], 'lowerLeg.L': [25, 0, 0], 'upperLeg.R': [15, 0, 0], 'lowerLeg.R': [20, 0, 0], hips: { y: -0.05 } },
    crouch: { 'upperLeg.L': [-70, 0, -8], 'lowerLeg.L': [95, 0, 0], 'upperLeg.R': [-60, 0, 8], 'lowerLeg.R': [95, 0, 0], spine: [20, 0, 0], head: [-12, 0, 0], 'upperArm.L': [-30, 0, -20], 'upperArm.R': [-30, 0, 20], 'lowerArm.L': [-60, 0, 0], 'lowerArm.R': [-60, 0, 0], hips: { y: -0.3 } },
    wave: { 'upperArm.R': [0, 0, 150], 'lowerArm.R': [0, 0, 20], head: [0, -10, 12] },
  };
  const E = new THREE.Euler();
  const setPose = (name) => {
    const p = POSES[name] || POSES.rest;
    for (const k in J) { if (k !== 'root') J[k].quaternion.identity(); }
    J.hips.position.set(0, 0.9, 0);
    for (const k in p) {
      if (k === 'hips') { J.hips.position.y += p.hips.y || 0; J.hips.position.z += p.hips.z || 0; continue; }
      const [x, y, z] = p[k];
      J[k]?.quaternion.setFromEuler(E.set(x * D, y * D, z * D, 'XYZ'));
    }
  };
  setPose('relaxed');
  group.scale.setScalar(scale);

  let t = 0;
  return {
    group, joints: J, materials: mats, meshes, POSES, setPose,
    /** gentle idle: breathing + a tiny sway so the turntable does not look frozen */
    update(dt) { t += dt; J.spine.rotation.x = Math.sin(t * 1.6) * 0.012; J.head.rotation.z = Math.sin(t * 0.7) * 0.02; },
    setOutline(on) { for (const m of meshes) for (const c of m.children) if (c.name === 'ink') c.visible = on; },
    dispose() { for (const m of mats) { m.map?.dispose(); m.dispose(); } ramp.dispose(); outlineMat.dispose(); for (const m of meshes) m.geometry.dispose(); },
  };
}
