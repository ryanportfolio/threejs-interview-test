# Architecture

> System flow, auth strategy, state management, cross-cutting structure. Keep it terse: pointers into code, not essays.

Single-page three.js scene, one entry file `src/main.ts`, sectioned top to bottom: renderer/camera/controls -> lights + ground + black-hole shader -> platform -> drone (quadcopter + CatmullRom path) -> turret meshes -> tracking controller -> debug overlay -> render loop.

- Scene graph carries the core requirement: turret is a child of the rotating platform, so the controller works in the mount's local frame (`worldToLocal` per frame) and stays correct while the platform spins.
- One clamped dt per frame, accumulated into `simTime`; platform, drone, turret, and shader phase all consume the same step.
- Controller: damp-then-cap pursuit; the 90 deg/s cap bounds the combined yaw+pitch step vector; pitch target clamps to [0, PI/2] before the rate step; shortest-arc yaw with a 170-deg direction latch.
- Verification surface: `window.turretStats` (rates, aim error, pitch demand vs commanded, saturation) and the D-key debug overlay (aim ray, true-bearing line, path, HUD).
- No state outside module scope; no backend.
