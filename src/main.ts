// Interactive exhibit: rotating platform, looping drone, tracking turret.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// VSM gives blurred-edge shadows; PCFSoft is deprecated in r185 and warns.
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // tames the white deck under the 3.8-intensity sun
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaeffe4);
scene.fog = new THREE.Fog(0xaeffe4, 15, 30);

const camera = new THREE.PerspectiveCamera(
  59,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(9, 6, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.maxDistance = 40;
// Middle-drag pans like right-drag (zoom stays on the wheel).
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.PAN,
};

const legend = document.createElement('div');
legend.style.cssText = [
  'position:fixed', 'top:12px', 'right:12px', 'padding:8px 12px',
  'background:rgba(20, 26, 34, 0.72)', 'color:#e8edf4',
  'font:12px/1.7 system-ui, sans-serif', 'border-radius:6px',
  'pointer-events:none', 'white-space:pre',
].join(';');
legend.textContent = [
  'Left drag: orbit',
  'Right / middle drag: pan',
  'Scroll: zoom',
  'D: debug overlay',
].join('\n');
document.body.appendChild(legend);

window.addEventListener('resize', () => {
  // Zero-height windows would put Infinity into the projection matrix.
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ---------------------------------------------------------------------------
// Lights and ground
// ---------------------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0x9db4ff, 0x2f2a24, 0.6));

const sun = new THREE.DirectionalLight(0xfff2df, 3.0);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -9;
sun.shadow.camera.right = 9;
sun.shadow.camera.top = 9;
sun.shadow.camera.bottom = -9;
sun.shadow.radius = 4;
sun.shadow.blurSamples = 8;
sun.shadow.bias = 0;
sun.shadow.normalBias = 0.02;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x6c7891, roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);

// Black-hole vortex under the platform (lab-tuned): event-horizon core, six
// rotating spokes, wide soft glow. Values dialed in by hand via the look lab.
// Fog chunks are included so the disc fogs like the ground under it; tone
// mapping / colorspace chunks are deliberately NOT included, so the effect
// renders exactly as it looked in the lab where the values were tuned.
const BH_DISC_RADIUS = 9;
const BH_SPEED = -0.7; // rad/s spoke rotation; phase accumulates CPU-side, wrapped
const bhUniforms = THREE.UniformsUtils.merge([
  THREE.UniformsLib['fog'],
  {
    uPhase: { value: 0 },
    uDiscR: { value: BH_DISC_RADIUS },
    uHoleR: { value: 5.1 },
    uTwist: { value: 0 },
    uArms: { value: 6 },
    uArmC: { value: 0.95 },
    uGlowW: { value: 2.9 },
    uGlowI: { value: 0.4 },
    uGlow: { value: new THREE.Color(0x8be8ff) },
    uInner: { value: new THREE.Color(0x10131c) },
    uBase: { value: new THREE.Color(0x6c7891) },
  },
]);
const vortex = new THREE.Mesh(
  new THREE.CircleGeometry(BH_DISC_RADIUS, 96).rotateX(-Math.PI / 2),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: bhUniforms,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec2 vPos;
      void main() {
        vPos = position.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uPhase, uDiscR, uHoleR, uTwist, uArms, uArmC, uGlowW, uGlowI;
      uniform vec3 uGlow, uInner, uBase;
      varying vec2 vPos;
      void main() {
        float discR = max(uDiscR, 1e-3);
        float holeR = max(uHoleR, 1e-3);
        float glowW = max(uGlowW, 1e-3);
        float r = length(vPos);
        if (r >= discR) discard;
        float t = r / discR;
        // atan(0,0) is undefined in GLSL; the exact center needs a guard.
        float ang = r > 1e-4 ? atan(vPos.y, vPos.x) : 0.0;
        float swirl = ang + uTwist / (0.18 + t) + uPhase;
        float arm = 0.5 + 0.5 * sin(swirl * uArms + t * 16.0);
        float armFade = 1.0 - smoothstep(0.15, 0.95, t);
        vec3 col = mix(uInner, uBase, smoothstep(0.12, 0.85, t));
        col *= 1.0 - uArmC * arm * armFade;
        float core = 1.0 - smoothstep(holeR * 0.55, holeR, r);
        col = mix(col, vec3(0.0), core);
        // pow() with a negative base is undefined in GLSL; square by hand.
        float ringOffset = (r - holeR) / glowW;
        float ring = exp(-(ringOffset * ringOffset)) * uGlowI;
        col += uGlow * ring;
        float alpha = 1.0 - smoothstep(discR * 0.75, discR, r);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
  }),
);
vortex.position.y = 0.02;
vortex.renderOrder = 1;
scene.add(vortex);
// Transparent catcher so drone and turret shadows still land over the vortex.
// depthWrite off: an invisible depth wall here can reject the vortex behind it
// when transparent sorting flips at grazing camera angles.
const shadowCatcher = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false }),
);
shadowCatcher.position.y = 0.03;
shadowCatcher.renderOrder = 2;
shadowCatcher.receiveShadow = true;
scene.add(shadowCatcher);

// ---------------------------------------------------------------------------
// Rotating platform
// ---------------------------------------------------------------------------

const PLATFORM_RADIUS = 4;
const PLATFORM_SPIN = 0.25; // rad/s, slow and continuous

const platform = new THREE.Group();
scene.add(platform);

const deck = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 1.05, 0.35, 64),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
);
deck.position.y = 0.175;
deck.castShadow = true;
deck.receiveShadow = true;
platform.add(deck);

const hub = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.9, 0.5, 32),
  new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.7 }),
);
hub.position.y = 0.55;
hub.castShadow = true;
platform.add(hub);

// Rim markers make the platform's rotation readable from any angle.
const markerGeo = new THREE.BoxGeometry(0.25, 0.15, 0.5);
const markerMat = new THREE.MeshStandardMaterial({ color: 0xd8a657, roughness: 0.6 });
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.set(Math.cos(a) * 3.6, 0.42, Math.sin(a) * 3.6);
  marker.rotation.y = -a;
  marker.castShadow = true;
  platform.add(marker);
}

// ---------------------------------------------------------------------------
// Drone on a closed loop
// ---------------------------------------------------------------------------

const DRONE_PERIOD = 7; // seconds per lap; fast enough to outrun the turret on close passes

const dronePath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(6.5, 2.2, 0),
    new THREE.Vector3(3.5, 4.2, 4.5),
    new THREE.Vector3(-3.0, 3.0, 6.0),
    new THREE.Vector3(-6.5, 0.7, 0.5), // dips below the turret head's horizon: exercises the pitch floor
    new THREE.Vector3(-3.5, 2.6, -5.5),
    new THREE.Vector3(2.0, 4.6, -6.0),
    new THREE.Vector3(5.5, 1.6, -3.0),
  ],
  true,
  'centripetal',
);
dronePath.arcLengthDivisions = 1000; // fine-grained arc-length table: no speed hitch at the seam

// Quadcopter: shell + canopy body, four arms with motor pods, spinning
// two-blade props under blur discs, prop guards, gimbal camera, nav lights.
const drone = new THREE.Group();
scene.add(drone);

const droneShellMat = new THREE.MeshStandardMaterial({ color: 0xbf616a, roughness: 0.35, metalness: 0.15 });
const droneDarkMat = new THREE.MeshStandardMaterial({ color: 0x2f3440, roughness: 0.45, metalness: 0.35 });
const droneTrimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.3, metalness: 0.5 });

const droneBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.5), droneShellMat);
droneBody.castShadow = true;
drone.add(droneBody);

const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), droneDarkMat);
canopy.scale.set(0.9, 0.65, 1.6);
canopy.position.set(0, 0.08, 0.06);
canopy.castShadow = true;
drone.add(canopy);

const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), droneDarkMat);
gimbal.position.set(0, -0.08, 0.2);
drone.add(gimbal);
const lens = new THREE.Mesh(
  new THREE.CircleGeometry(0.025, 12),
  new THREE.MeshStandardMaterial({ color: 0x0b0d11, emissive: 0x3355ff, emissiveIntensity: 0.8 }),
);
lens.position.set(0, -0.08, 0.256);
drone.add(lens);

const props: { spinner: THREE.Group; dir: number }[] = [];
const armGeo = new THREE.BoxGeometry(0.05, 0.028, 0.34);
const podGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12);
const guardGeo = new THREE.TorusGeometry(0.17, 0.012, 8, 28).rotateX(Math.PI / 2);
const bladeGeo = new THREE.BoxGeometry(0.028, 0.008, 0.3);
const discGeo = new THREE.CircleGeometry(0.155, 24).rotateX(-Math.PI / 2);
const discMat = new THREE.MeshBasicMaterial({
  color: 0x2f3440, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
});
discMat.forceSinglePass = true; // flat disc: the two-pass transparent path buys nothing
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const px = sx * 0.27;
    const pz = sz * 0.27;
    const arm = new THREE.Mesh(armGeo, droneDarkMat);
    arm.position.set(px * 0.55, 0, pz * 0.55);
    arm.rotation.y = Math.atan2(px, pz);
    arm.castShadow = true;
    drone.add(arm);
    const pod = new THREE.Mesh(podGeo, droneTrimMat);
    pod.position.set(px, 0.02, pz);
    pod.castShadow = true;
    drone.add(pod);
    const guard = new THREE.Mesh(guardGeo, droneDarkMat);
    guard.position.set(px, 0.03, pz);
    guard.castShadow = true;
    drone.add(guard);
    const spinner = new THREE.Group();
    spinner.position.set(px, 0.062, pz);
    const bladeA = new THREE.Mesh(bladeGeo, droneDarkMat);
    const bladeB = new THREE.Mesh(bladeGeo, droneDarkMat);
    bladeB.rotation.y = Math.PI / 2;
    spinner.add(bladeA, bladeB, new THREE.Mesh(discGeo, discMat));
    drone.add(spinner);
    props.push({ spinner, dir: sx * sz }); // adjacent rotors counter-rotate
  }
}

// Nav lights: port red, starboard green, white tail strobe.
const navGeo = new THREE.SphereGeometry(0.022, 8, 8);
const portMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff3b30, emissiveIntensity: 2 });
const stbdMat = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x2fd27d, emissiveIntensity: 2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffffff, emissiveIntensity: 2 });
const portLight = new THREE.Mesh(navGeo, portMat);
portLight.position.set(-0.27, -0.02, 0.27);
const stbdLight = new THREE.Mesh(navGeo, stbdMat);
stbdLight.position.set(0.27, -0.02, 0.27);
const tailLight = new THREE.Mesh(navGeo, tailMat);
tailLight.position.set(0, 0.03, -0.27);
drone.add(portLight, stbdLight, tailLight);

const dronePos = new THREE.Vector3();
const droneAhead = new THREE.Vector3();
const tangentNow = new THREE.Vector3();
const tangentPrev = new THREE.Vector3(0, 0, 1);
let bankAngle = 0;

function updateDrone(elapsed: number, dt: number): void {
  // getPointAt is arc-length parameterized: constant travel speed around the loop.
  const u = (elapsed / DRONE_PERIOD) % 1;
  dronePath.getPointAt(u, dronePos);
  drone.position.copy(dronePos);
  // Face along the direction of travel (+Z forward).
  dronePath.getPointAt((u + 0.01) % 1, droneAhead);
  drone.lookAt(droneAhead);

  // Bank into turns: roll from the tangent's signed yaw rate, smoothed.
  dronePath.getTangentAt(u, tangentNow);
  if (dt > 0) {
    const turnRate = tangentPrev.cross(tangentNow).y / dt; // rad/s, signed
    const targetBank = THREE.MathUtils.clamp(-turnRate * 0.5, -0.7, 0.7);
    bankAngle += (targetBank - bankAngle) * Math.min(1, 8 * dt);
  }
  tangentPrev.copy(tangentNow);
  drone.rotateZ(bankAngle);

  for (const p of props) p.spinner.rotation.y = wrapAngle(p.spinner.rotation.y + p.dir * 45 * dt);
  tailMat.emissiveIntensity = elapsed % 1 < 0.12 ? 3 : 0.15; // strobe
}

// ---------------------------------------------------------------------------
// Turret: yaw base + pitch head, mounted on the platform edge
// ---------------------------------------------------------------------------

// Parented to the platform, so "tracking stays correct while the platform
// rotates" is structural: the controller always works in the mount's frame.
const turretMount = new THREE.Group();
turretMount.position.set(3.4, 0.35, 0);
turretMount.scale.setScalar(1.5); // uniform scale: local-frame angles are unaffected
platform.add(turretMount);

const turretDarkMat = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.6, metalness: 0.3 });
const turretBodyMat = new THREE.MeshStandardMaterial({
  color: 0x5e81ac, roughness: 0.45, metalness: 0.35, flatShading: true,
});
const turretHeadMat = new THREE.MeshStandardMaterial({
  color: 0x81a1c1, roughness: 0.4, metalness: 0.35, flatShading: true,
});
const turretSteelMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.3, metalness: 0.7 });

// Static pedestal: turntable ring the yaw base visibly rotates on.
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.14, 24), turretDarkMat);
pedestal.position.y = 0.07;
pedestal.castShadow = true;
turretMount.add(pedestal);
const turntable = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 24), turretSteelMat);
turntable.position.y = 0.165;
turretMount.add(turntable);

const yawBase = new THREE.Group();
yawBase.position.y = 0.19;
turretMount.add(yawBase);

// Octagonal housing with shoulder plates carrying the pitch trunnions.
const baseHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.33, 0.3, 8), turretBodyMat);
baseHousing.position.y = 0.15;
baseHousing.castShadow = true;
yawBase.add(baseHousing);
const shoulderGeo = new THREE.BoxGeometry(0.07, 0.3, 0.26);
for (const sx of [-1, 1]) {
  const shoulder = new THREE.Mesh(shoulderGeo, turretBodyMat);
  shoulder.position.set(sx * 0.2, 0.36, 0);
  shoulder.castShadow = true;
  yawBase.add(shoulder);
}

const HEAD_PIVOT_Y = 0.45; // above the yaw base origin
const head = new THREE.Group();
head.position.y = HEAD_PIVOT_Y;
yawBase.add(head);

const headHousing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.46), turretHeadMat);
headHousing.castShadow = true;
head.add(headHousing);
const cheekGeo = new THREE.BoxGeometry(0.04, 0.18, 0.34);
for (const sx of [-1, 1]) {
  const cheek = new THREE.Mesh(cheekGeo, turretDarkMat);
  cheek.position.set(sx * 0.19, 0, 0.02);
  cheek.castShadow = true;
  head.add(cheek);
  // Trunnion caps where the head meets the shoulder plates.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12).rotateZ(Math.PI / 2),
    turretSteelMat,
  );
  cap.position.set(sx * 0.225, 0, 0);
  head.add(cap);
}

// Twin barrels with muzzle collars, extending along the head's +Z aim axis.
const barrelGeo = new THREE.CylinderGeometry(0.032, 0.036, 1.05, 12).rotateX(Math.PI / 2);
const muzzleGeo = new THREE.CylinderGeometry(0.046, 0.046, 0.12, 12).rotateX(Math.PI / 2);
for (const sx of [-1, 1]) {
  const barrel = new THREE.Mesh(barrelGeo, turretSteelMat);
  barrel.position.set(sx * 0.09, 0, 0.72);
  barrel.castShadow = true;
  head.add(barrel);
  const muzzle = new THREE.Mesh(muzzleGeo, turretDarkMat);
  muzzle.position.set(sx * 0.09, 0, 1.2);
  head.add(muzzle);
}

// Sensor optic between the barrels, plus a status lamp the controller drives:
// green when locked, through amber to red as tracking lag grows.
const optic = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), turretDarkMat);
optic.position.set(0, 0.16, 0.16);
head.add(optic);
const opticLens = new THREE.Mesh(
  new THREE.CircleGeometry(0.032, 12),
  new THREE.MeshStandardMaterial({ color: 0x0b0d11, emissive: 0x3355ff, emissiveIntensity: 1 }),
);
opticLens.position.set(0, 0.16, 0.211);
head.add(opticLens);
const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2fd27d, emissiveIntensity: 2 });
const statusLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), lampMat);
statusLamp.position.set(0, 0.16, -0.18);
head.add(statusLamp);
const lampLocked = new THREE.Color(0x2fd27d);
const lampLagging = new THREE.Color(0xff4d4d);

// Aim ray: makes the rate cap observable. The gap between this ray and the
// drone is the turret's lag; watching it close is the catch-up.
const aimRay = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 1.3),
    new THREE.Vector3(0, 0, 16),
  ]),
  new THREE.LineBasicMaterial({ color: 0xbf616a, transparent: true, opacity: 0.45 }),
);
head.add(aimRay);

// ---------------------------------------------------------------------------
// Debug overlay (off by default; button or D key): visual + numeric evidence
// that the constraints hold. Green line = true bearing to the drone; red ray =
// where the turret actually points; the angle between them is the lag.
// ---------------------------------------------------------------------------

const bearingGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
]);
const bearingLine = new THREE.Line(
  bearingGeo,
  new THREE.LineBasicMaterial({ color: 0x2fd27d, transparent: true, opacity: 0.7 }),
);
bearingLine.frustumCulled = false;
scene.add(bearingLine);

const pathLine = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(dronePath.getPoints(240)),
  new THREE.LineBasicMaterial({ color: 0xd8a657, transparent: true, opacity: 0.5 }),
);
scene.add(pathLine);

const hud = document.createElement('div');
hud.style.cssText = [
  'position:fixed', 'bottom:12px', 'left:12px', 'padding:10px 14px',
  'background:rgba(20, 26, 34, 0.8)', 'color:#d9e2ec',
  'font:12px/1.75 ui-monospace, Consolas, monospace', 'border-radius:6px',
  'pointer-events:none', 'white-space:pre',
].join(';');
document.body.appendChild(hud);

let debugOn = false;
const debugButton = document.createElement('button');
debugButton.style.cssText = [
  'position:fixed', 'top:122px', 'right:12px', 'padding:5px 12px',
  'background:rgba(20, 26, 34, 0.72)', 'color:#e8edf4', 'border:1px solid #4a5568',
  'font:12px system-ui, sans-serif', 'border-radius:6px', 'cursor:pointer',
].join(';');
document.body.appendChild(debugButton);

function setDebug(on: boolean): void {
  debugOn = on;
  aimRay.visible = on;
  bearingLine.visible = on;
  pathLine.visible = on;
  hud.style.display = on ? 'block' : 'none';
  debugButton.textContent = on ? 'Debug: on' : 'Debug: off';
}
setDebug(false);
debugButton.addEventListener('click', () => setDebug(!debugOn));
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') setDebug(!debugOn);
});

// ---------------------------------------------------------------------------
// Tracking controller: rate-limited joint-space pursuit
// ---------------------------------------------------------------------------

const MAX_TURN_RATE = Math.PI / 2; // 90 deg/s, per axis (read as a servo limit)

let yawAngle = 0;
let pitchAngle = 0;

const targetWorld = new THREE.Vector3();
const targetLocal = new THREE.Vector3();

/** Wrap an angle to (-PI, PI] so errors always take the shortest arc. */
function wrapAngle(a: number): number {
  return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}

// Pursuit shaping: the hard cap is the requirement; the damp constant eases
// the approach so leaving saturation doesn't stop on a velocity step.
const APPROACH_DAMP = 12; // 1/s
const YAW_LATCH_ENTER = THREE.MathUtils.degToRad(170);
const ZENITH_EPS = 0.25; // horizontal distance under which yaw is held

let yawLatchDir = 0; // -1 | 0 | 1; latched turn direction near the 180 deg seam
let lastDesiredYaw = 0;

// Verification instrumentation (read from the console/devtools; renders nothing).
export const turretStats = {
  maxYawRate: 0,
  maxPitchRate: 0,
  maxCombinedRate: 0, // magnitude of the joint step vector: the capped quantity
  saturatedFrames: 0,
  aimErrorDeg: 0, // current angle between barrel aim and true drone bearing
  maxAimErrorDeg: 0, // peak lag over the run
  rateDeg: 0, // live combined joint rate this frame
  rawPitchDeg: 0, // live pitch demand before the floor clamp
  pitchDeg: 0, // live commanded pitch
  frames: 0,
  minUnclampedPitchDeg: 0, // most negative pitch the drone ever demanded
  minCommandedPitchDeg: 0, // must stay >= 0: the pitch floor holding
};
const aimDir = new THREE.Vector3();
const headWorld = new THREE.Vector3();
declare global {
  interface Window {
    turretStats: typeof turretStats;
  }
}
window.turretStats = turretStats;
// Camera handle for scripted visual checks (screenshot positioning).
Object.assign(window, { exhibit: { camera, controls, drone } });

// Exponential approach clamped by the hard 90 deg/s cap: saturated when far
// behind (pure lag), easing in as the error closes (smooth catch-up). The cap
// applies to the COMBINED yaw+pitch step vector, so total turret rotation
// relative to its mount never exceeds 90 deg/s under any reading of the rule
// (which also bounds each individual axis).
function stepJoints(yawErr: number, pitchErr: number, dt: number): [number, number] {
  const ease = 1 - Math.exp(-APPROACH_DAMP * dt);
  let yawStep = yawErr * ease;
  let pitchStep = pitchErr * ease;
  const maxStep = MAX_TURN_RATE * dt;
  const stepLen = Math.hypot(yawStep, pitchStep);
  if (stepLen > maxStep) {
    const scale = maxStep / stepLen;
    yawStep *= scale;
    pitchStep *= scale;
  }
  return [yawStep, pitchStep];
}

function updateTurret(dt: number): void {
  // worldToLocal refreshes the mount's ancestor matrices itself (r185), so
  // this sees the platform rotation applied earlier in the same frame.
  drone.getWorldPosition(targetWorld);
  targetLocal.copy(targetWorld);
  turretMount.worldToLocal(targetLocal);
  targetLocal.y -= yawBase.position.y + HEAD_PIVOT_Y; // aim from the head pivot

  // Desired joint angles. Pitch is clamped BEFORE the rate step, so the
  // commanded target never dips below horizontal and the head never has to
  // "catch up" from an illegal pose. Directly-overhead targets leave yaw
  // undefined; hold the last heading and let pitch do the work.
  const horizontal = Math.hypot(targetLocal.x, targetLocal.z);
  const desiredYaw =
    horizontal < ZENITH_EPS ? lastDesiredYaw : Math.atan2(targetLocal.x, targetLocal.z);
  lastDesiredYaw = desiredYaw;
  const rawPitch = Math.atan2(targetLocal.y, horizontal);
  const desiredPitch = THREE.MathUtils.clamp(rawPitch, 0, Math.PI / 2);
  turretStats.minUnclampedPitchDeg = Math.min(
    turretStats.minUnclampedPitchDeg,
    THREE.MathUtils.radToDeg(rawPitch),
  );

  // Shortest-arc yaw error, with hysteresis: once the error passes ~170 deg
  // the turn direction is latched until the error shrinks, so a target
  // hovering near the 180 deg seam can't flip the chase direction per frame.
  let yawErr = wrapAngle(desiredYaw - yawAngle);
  if (yawLatchDir !== 0 && Math.sign(yawErr) !== yawLatchDir && Math.abs(yawErr) > YAW_LATCH_ENTER) {
    yawErr += yawLatchDir * Math.PI * 2;
  }
  yawLatchDir = Math.abs(yawErr) > YAW_LATCH_ENTER ? Math.sign(yawErr) : 0;

  const [yawStep, pitchStep] = stepJoints(yawErr, desiredPitch - pitchAngle, dt);
  yawAngle = wrapAngle(yawAngle + yawStep);
  pitchAngle += pitchStep;
  turretStats.minCommandedPitchDeg = Math.min(
    turretStats.minCommandedPitchDeg,
    THREE.MathUtils.radToDeg(pitchAngle),
  );

  if (dt > 0) {
    turretStats.maxYawRate = Math.max(turretStats.maxYawRate, Math.abs(yawStep) / dt);
    turretStats.maxPitchRate = Math.max(turretStats.maxPitchRate, Math.abs(pitchStep) / dt);
    const combined = Math.hypot(yawStep, pitchStep);
    turretStats.rateDeg = THREE.MathUtils.radToDeg(combined / dt);
    turretStats.maxCombinedRate = Math.max(turretStats.maxCombinedRate, combined / dt);
    if (combined >= MAX_TURN_RATE * dt * 0.999) turretStats.saturatedFrames++;
    turretStats.frames++;
  }
  turretStats.rawPitchDeg = THREE.MathUtils.radToDeg(rawPitch);
  turretStats.pitchDeg = THREE.MathUtils.radToDeg(pitchAngle);

  yawBase.rotation.y = yawAngle;
  head.rotation.x = -pitchAngle; // rotating -X raises the +Z barrel

  head.getWorldDirection(aimDir);
  head.getWorldPosition(headWorld);
  turretStats.aimErrorDeg = THREE.MathUtils.radToDeg(
    aimDir.angleTo(targetWorld.sub(headWorld)),
  );
  turretStats.maxAimErrorDeg = Math.max(turretStats.maxAimErrorDeg, turretStats.aimErrorDeg);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

// THREE.Clock is deprecated in r185 (its constructor warns to the console,
// which alone would fail the zero-warnings bar); Timer is its replacement.
const timer = new THREE.Timer();
timer.connect(document); // hidden tabs report zero delta instead of a stale one

// One clamped dt drives platform, drone, and turret alike, accumulated into
// a shared sim time: after a background-tab stall everything resumes in
// lockstep instead of the drone teleporting ahead of the turret's slew budget.
let simTime = 0;
let bhPhase = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  simTime += dt;

  // Refresh the pixel ratio if the window moved to a monitor with another DPR.
  const dpr = Math.min(window.devicePixelRatio, 2);
  if (dpr !== renderer.getPixelRatio()) renderer.setPixelRatio(dpr);

  platform.rotation.y = wrapAngle(PLATFORM_SPIN * simTime);
  bhPhase = THREE.MathUtils.euclideanModulo(bhPhase + BH_SPEED * dt, Math.PI * 2);
  bhUniforms['uPhase'].value = bhPhase;
  updateDrone(simTime, dt);
  updateTurret(dt);

  if (debugOn) {
    const pos = bearingGeo.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, headWorld.x, headWorld.y, headWorld.z);
    pos.setXYZ(1, drone.position.x, drone.position.y, drone.position.z);
    pos.needsUpdate = true;
    const st = turretStats;
    const floor = st.rawPitchDeg < 0 ? '  FLOOR' : '';
    const sat = st.rateDeg >= 89.9 ? '  SATURATED' : '';
    const satPct = st.frames > 0 ? Math.round((st.saturatedFrames / st.frames) * 100) : 0;
    hud.textContent = [
      `aim error   ${st.aimErrorDeg.toFixed(1).padStart(5)} deg  (max ${st.maxAimErrorDeg.toFixed(1)})`,
      `joint rate  ${st.rateDeg.toFixed(1).padStart(5)} deg/s of 90 cap${sat}`,
      `max rate    ${THREE.MathUtils.radToDeg(st.maxCombinedRate).toFixed(1).padStart(5)} deg/s`,
      `pitch       ${st.pitchDeg.toFixed(1).padStart(5)} deg  (demand ${st.rawPitchDeg.toFixed(1)})${floor}`,
      `saturated   ${satPct}% of frames`,
    ].join('\n');
  }

  // Status lamp: green locked, red at 45+ degrees of lag.
  const lag = THREE.MathUtils.clamp(turretStats.aimErrorDeg / 45, 0, 1);
  lampMat.emissive.copy(lampLocked).lerp(lampLagging, lag);

  // Keep camera inertia identical across 60/144 Hz monitors.
  controls.dampingFactor = 1 - Math.pow(0.95, dt * 60);
  controls.update();
  renderer.render(scene, camera);
});

// Dismiss the loading splash only on a loop boundary, at least one full pass:
// the shot-and-tumble choreography never gets cut mid-animation. The splash
// timeline starts with the page, so performance.now() tracks its clock.
const loaderEl = document.getElementById('loader');
if (loaderEl) {
  const LOOP_MS = 2400; // matches the SMIL dur in index.html
  const elapsed = performance.now();
  const holdMs = Math.max(LOOP_MS, Math.ceil(elapsed / LOOP_MS) * LOOP_MS) - elapsed;
  window.setTimeout(() => {
    loaderEl.classList.add('done');
    window.setTimeout(() => loaderEl.remove(), 450);
  }, holdMs);
}
