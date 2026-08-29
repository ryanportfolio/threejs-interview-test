// Interactive exhibit: rotating platform, looping drone, tracking turret.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
// Render loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  // Clamp dt so a backgrounded tab can't teleport the simulation on return.
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  platform.rotation.y += PLATFORM_SPIN * dt;
  updateDrone(elapsed);

  controls.update();
  renderer.render(scene, camera);
});
