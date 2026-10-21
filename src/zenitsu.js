// Standalone viewer for the code-built Zenitsu (zenitsu.html). Deliberately outside the game's HDR pipeline: flat
// cel lighting on a grey sheet, like the reference turnaround.
//   ?mode=sheet (default)  four orthographic panels: front · left side · back · a slowly turning 3/4 view
//   ?mode=orbit            one perspective view with OrbitControls
//   ?pose=relaxed|rest|guard|crouch|wave   ?outline=0   ?spin=0   ?harness=1 (preserveDrawingBuffer, window.__ready)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createZenitsu } from './character/zenitsu.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'sheet';
const harness = params.has('harness');

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: harness });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(harness ? 1 : Math.min(devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a7a7a7');

// lighting: a bright hemisphere fill so colours stay flat and true, a key from the front-left for the cel step
scene.add(new THREE.HemisphereLight(0xffffff, 0xb0a8a0, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.3);
key.position.set(-1.6, 3.2, 2.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -1.2; key.shadow.camera.right = key.shadow.camera.top = 1.2;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 10; key.shadow.bias = -0.0015; key.shadow.radius = 3;
scene.add(key);

// soft contact shadow disc under the feet (painted radial gradient), plus a shadow-catching ground in orbit mode
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, 'rgba(40,36,32,0.42)'); r.addColorStop(0.6, 'rgba(40,36,32,0.14)'); r.addColorStop(1, 'rgba(40,36,32,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002;
  scene.add(disc);
  if (mode === 'orbit') {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  }
}

const zen = createZenitsu({ outline: params.get('outline') !== '0' });
zen.setPose(params.get('pose') || 'relaxed');
scene.add(zen.group);

// ---- cameras ----------------------------------------------------------------------------------------------------
const FOCUS = new THREE.Vector3(0, 0.82, 0), SHEET_H = 1.85;
const ortho = (dir) => {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  cam.position.copy(FOCUS).addScaledVector(dir, 6); cam.lookAt(FOCUS);
  return cam;
};
const turn = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
const panels = [
  { cam: ortho(new THREE.Vector3(0, 0, 1)) },    // front
  { cam: ortho(new THREE.Vector3(1, 0, 0)) },    // left side (sword side)
  { cam: ortho(new THREE.Vector3(0, 0, -1)) },   // back
  { cam: turn },                                 // turntable
];
const orbitCam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 50);
orbitCam.position.set(1.9, 1.5, 3.1); orbitCam.lookAt(FOCUS);
let controls = null;
if (mode === 'orbit') { controls = new OrbitControls(orbitCam, canvas); controls.target.copy(FOCUS); controls.update(); document.getElementById('labels').classList.add('hidden'); }

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const pw = w / 4, aspect = pw / h;
  for (const p of panels) {
    const cam = p.cam;
    if (cam.isOrthographicCamera) { cam.top = SHEET_H / 2; cam.bottom = -SHEET_H / 2; cam.left = -SHEET_H / 2 * aspect; cam.right = SHEET_H / 2 * aspect; }
    else cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
  orbitCam.aspect = w / h; orbitCam.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- loop -------------------------------------------------------------------------------------------------------
let spin = params.get('spin') !== '0', yaw = 0.6, t = 0, frames = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
  zen.update(dt);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  if (mode === 'orbit') {
    controls.update();
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    renderer.render(scene, orbitCam);
  } else {
    if (spin) yaw += dt * 0.5;
    turn.position.set(Math.sin(yaw) * 3.4, 1.35, Math.cos(yaw) * 3.4); turn.lookAt(FOCUS);
    renderer.setScissorTest(true);
    const pw = Math.floor(w / 4);
    for (let i = 0; i < 4; i++) {
      renderer.setViewport(i * pw, 0, pw, h); renderer.setScissor(i * pw, 0, pw, h);
      renderer.render(scene, panels[i].cam);
    }
  }
  if (++frames === 2) window.__ready = true;
});

window.__zen = {
  model: zen, scene, renderer,
  setPose: (n) => zen.setPose(n),
  spin: (v) => { spin = !!v; },
  yaw: (v) => { yaw = v; },
  view: (pos, target) => { orbitCam.position.set(...pos); controls?.target.set(...target); orbitCam.lookAt(...target); controls?.update(); },
  stats: () => ({ meshes: zen.meshes.length, tris: zen.meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3), 0) }),
};
