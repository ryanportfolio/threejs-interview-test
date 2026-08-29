// Interactive exhibit: rotating platform, looping drone, tracking turret.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft is deprecated in r185 and warns
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1e26);
scene.fog = new THREE.Fog(0x1a1e26, 25, 60);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
camera.position.set(9, 6, 11);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.maxDistance = 40;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Lights and ground
// ---------------------------------------------------------------------------

scene.add(new THREE.HemisphereLight(0x9db4ff, 0x2f2a24, 0.6));

const sun = new THREE.DirectionalLight(0xfff2df, 2.4);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 1 }),
);
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// Rotating platform
// ---------------------------------------------------------------------------

const PLATFORM_RADIUS = 4;
const PLATFORM_SPIN = 0.25; // rad/s, slow and continuous

const platform = new THREE.Group();
scene.add(platform);

const deck = new THREE.Mesh(
  new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 1.05, 0.35, 64),
  new THREE.MeshStandardMaterial({ color: 0x4c566a, roughness: 0.8 }),
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

const DRONE_PERIOD = 8; // seconds per lap; fast enough to outrun the turret on close passes

const dronePath = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(6.5, 2.2, 0),
    new THREE.Vector3(3.5, 4.2, 4.5),
    new THREE.Vector3(-3.0, 3.0, 6.0),
    new THREE.Vector3(-6.5, 1.4, 0.5),
    new THREE.Vector3(-3.5, 2.6, -5.5),
    new THREE.Vector3(2.0, 4.6, -6.0),
    new THREE.Vector3(5.5, 1.6, -3.0),
  ],
  true,
  'centripetal',
);
dronePath.arcLengthDivisions = 1000; // fine-grained arc-length table: no speed hitch at the seam

const drone = new THREE.Group();
scene.add(drone);

const droneBody = new THREE.Mesh(
  new THREE.ConeGeometry(0.22, 0.65, 12).rotateX(Math.PI / 2),
  new THREE.MeshStandardMaterial({
    color: 0xbf616a,
    emissive: 0x5c1f24,
    roughness: 0.5,
  }),
);
droneBody.castShadow = true;
drone.add(droneBody);

const droneRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.32, 0.05, 8, 24).rotateX(Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x81a1c1, roughness: 0.4 }),
);
droneRing.castShadow = true;
drone.add(droneRing);

const dronePos = new THREE.Vector3();
const droneAhead = new THREE.Vector3();

function updateDrone(elapsed: number): void {
  // getPointAt is arc-length parameterized: constant travel speed around the loop.
  const u = (elapsed / DRONE_PERIOD) % 1;
  dronePath.getPointAt(u, dronePos);
  drone.position.copy(dronePos);
  // Face along the direction of travel (+Z forward).
  dronePath.getPointAt((u + 0.01) % 1, droneAhead);
  drone.lookAt(droneAhead);
}

// ---------------------------------------------------------------------------
// Turret: yaw base + pitch head, mounted on the platform edge
// ---------------------------------------------------------------------------

// Parented to the platform, so "tracking stays correct while the platform
// rotates" is structural: the controller always works in the mount's frame.
const turretMount = new THREE.Group();
turretMount.position.set(3.4, 0.35, 0);
platform.add(turretMount);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.4, 0.2, 24),
  new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.7 }),
);
pedestal.position.y = 0.1;
pedestal.castShadow = true;
turretMount.add(pedestal);

const yawBase = new THREE.Group();
yawBase.position.y = 0.2;
turretMount.add(yawBase);

const baseHousing = new THREE.Mesh(
  new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24),
  new THREE.MeshStandardMaterial({ color: 0x5e81ac, roughness: 0.55 }),
);
baseHousing.position.y = 0.15;
baseHousing.castShadow = true;
yawBase.add(baseHousing);

const HEAD_PIVOT_Y = 0.45; // above the yaw base origin
const head = new THREE.Group();
head.position.y = HEAD_PIVOT_Y;
yawBase.add(head);

const headHousing = new THREE.Mesh(
  new THREE.BoxGeometry(0.36, 0.3, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x81a1c1, roughness: 0.5 }),
);
headHousing.castShadow = true;
head.add(headHousing);

const barrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.055, 1.1, 12).rotateX(Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.35 }),
);
barrel.position.z = 0.7; // extends along the head's +Z (its aim direction)
barrel.castShadow = true;
head.add(barrel);

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
export const turretStats = { maxYawRate: 0, maxPitchRate: 0, saturatedFrames: 0 };
declare global {
  interface Window {
    turretStats: typeof turretStats;
  }
}
window.turretStats = turretStats;

function stepJoint(err: number, dt: number): number {
  // Exponential approach clamped by the hard 90 deg/s cap: saturated when
  // far behind (pure lag), easing in as the error closes (smooth catch-up).
  const eased = err * (1 - Math.exp(-APPROACH_DAMP * dt));
  return THREE.MathUtils.clamp(eased, -MAX_TURN_RATE * dt, MAX_TURN_RATE * dt);
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
  const desiredPitch = THREE.MathUtils.clamp(
    Math.atan2(targetLocal.y, horizontal),
    0,
    Math.PI / 2,
  );

  // Shortest-arc yaw error, with hysteresis: once the error passes ~170 deg
  // the turn direction is latched until the error shrinks, so a target
  // hovering near the 180 deg seam can't flip the chase direction per frame.
  let yawErr = wrapAngle(desiredYaw - yawAngle);
  if (yawLatchDir !== 0 && Math.sign(yawErr) !== yawLatchDir && Math.abs(yawErr) > YAW_LATCH_ENTER) {
    yawErr += yawLatchDir * Math.PI * 2;
  }
  yawLatchDir = Math.abs(yawErr) > YAW_LATCH_ENTER ? Math.sign(yawErr) : 0;

  const yawStep = stepJoint(yawErr, dt);
  const pitchStep = stepJoint(desiredPitch - pitchAngle, dt);
  yawAngle = wrapAngle(yawAngle + yawStep);
  pitchAngle += pitchStep;

  if (dt > 0) {
    turretStats.maxYawRate = Math.max(turretStats.maxYawRate, Math.abs(yawStep) / dt);
    turretStats.maxPitchRate = Math.max(turretStats.maxPitchRate, Math.abs(pitchStep) / dt);
    if (Math.abs(yawStep) >= MAX_TURN_RATE * dt * 0.999) turretStats.saturatedFrames++;
  }

  yawBase.rotation.y = yawAngle;
  head.rotation.x = -pitchAngle; // rotating -X raises the +Z barrel
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

// THREE.Clock is deprecated in r185 (its constructor warns to the console,
// which alone would fail the zero-warnings bar); Timer is its replacement.
const timer = new THREE.Timer();

// One clamped dt drives platform, drone, and turret alike, accumulated into
// a shared sim time: after a background-tab stall everything resumes in
// lockstep instead of the drone teleporting ahead of the turret's slew budget.
let simTime = 0;

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  simTime += dt;

  platform.rotation.y = wrapAngle(PLATFORM_SPIN * simTime);
  updateDrone(simTime);
  updateTurret(dt);

  controls.update();
  renderer.render(scene, camera);
});
