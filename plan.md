# Build journal

Running decision log for the Vakaros three.js exercise. Newest notes appended per stage. Started 2026-08-29, ~1 hour budget for the build itself (setup and planning tracked separately below).

## Stage sequence

- [x] **S0 Adopt repo.** Private mirror `ryanportfolio/threejs-interview-test` of `vakaros/threejs-interview-test`, upstream history preserved, harness overlay committed as `[ai]`.
- [x] **S1 Baseline.** `npm install` clean (0 vulnerabilities), `npm run build` passes, dev server renders the starter cube, browser console clean (0 errors / 0 warnings).
- [ ] **S2 Plan.** /dare pass over the requirements before writing scene code.
- [ ] **S3 Scene statics.** Rotating circular platform, lights, orbit camera.
- [ ] **S4 Drone path.** Smooth closed loop, above and around the platform, fast enough to outrun the turret cap at some point.
- [ ] **S5 Turret.** Two-part yaw base + pitch head on the platform edge; world-space tracking that stays correct while the parent platform rotates.
- [ ] **S6 Constraints.** Pitch floor at horizontal, 90 deg/s slew cap, lag-and-catch-up with no snap or jitter (watch the yaw wrap-around case).
- [ ] **S7 Verify + polish.** Full checklist below, tune speeds so the lag is visibly observable.
- [ ] **S8 Submit.** DECISIONS.md, prompt log, final commit with time spent.

Per project rule: after every significant build stage, the diff goes to /codex-review (high reasoning, fast mode) before moving on.

## Assumptions

- "Any simple shape" for the drone means a primitive or small primitive group; no models or assets.
- The turret tracks the drone's current position (no lead/prediction); "smoothly track" = rate-limited pursuit, which the 90 deg/s cap already implies.
- The 90 deg/s cap applies to each turret axis (yaw and pitch) in the turret's own frame; the platform's rotation underneath is allowed to add apparent world-frame speed. Will note this reading in DECISIONS.md.
- Keeping the starter's renderer/camera scaffold and replacing the cube; README allows keep/modify/delete.
- Starter cube may be repurposed or deleted at S3.

## Challenges to watch

- **Rotating parent frame:** turret is a child of a spinning platform, so tracking math must convert the drone's world position into the turret's local frame every frame (`worldToLocal` on fresh world matrices), or the aim drifts as the platform turns.
- **Angle wrap-around:** yaw error must be computed on the shortest arc (wrap to [-180, 180]) before applying the slew cap, or the turret spins the long way / snaps at the 180 boundary.
- **Cap + smoothness together:** a pure `min(error, cap*dt)` step is C0 but can look robotic; the requirement is no snap/jitter, so clamp per-frame delta by `cap * dt` with dt from the render clock, not a fixed step.
- **Pitch floor:** clamp after computing desired pitch; when the drone passes below the turret's horizon the head should sit at 0 deg, not oscillate.
- **Observable lag:** drone angular speed as seen from the turret must exceed 90 deg/s during part of the loop; closest-approach passes do this naturally (angular rate spikes when the drone passes near/over the turret).

## Build/config traps (hit or confirmed)

- tsconfig has `erasableSyntaxOnly`: no enums, no namespaces, no constructor parameter properties. Also `verbatimModuleSyntax` (use `import type`) and `noUnusedLocals/Parameters` (dead vars fail the build).
- three.js pinned 0.185.1; do not touch. OrbitControls imports from `three/addons/controls/OrbitControls.js`, no extra install.
- `npm run build` emits a >500 kB chunk-size warning from bundling three; build-time advisory, not a console error, and changing build config isn't worth it here.
- This machine: bare `python` hits the Windows Store alias stub; use `py`.
- Playwright MCP saves screenshots to its own output dir, not the repo cwd; find them under the session temp path.

## Verification checklist (run at S7, spot-check each stage)

- [ ] `npm run build`: zero TypeScript errors.
- [ ] Browser console on dev server: zero warnings/errors after several full drone loops.
- [ ] Platform rotates slowly and continuously.
- [ ] Drone loop is smooth and closed (no teleport at the seam).
- [ ] Orbit camera: rotate/zoom/pan works from any angle.
- [ ] Turret base yaws, head pitches, both parts visibly distinct, mounted on platform edge.
- [ ] Head never pitches below horizontal (watch a low drone pass).
- [ ] Turret visibly lags on fast passes, then catches up smoothly; no snap at the yaw 180 boundary.
- [ ] Tracking stays locked while the platform rotates under the turret (pause drone motion mentally: aim shouldn't drift).
- [ ] Commit history annotated `[ai]`/`[hand]`/`[ai+edit]`; DECISIONS.md and prompt log ready.

## Decision log

- **S0:** Adopted via private mirror (not a fork) so the repo can stay private until submission. Template README-showpiece assets stripped from the overlay; they're template-repo content and would be noise for reviewers.
- **S0:** Prose mode set to normal instead of the template's caveman-ultra default: reviewers read the exported transcript, compressed replies would cost readability.
- **S1:** Kept the starter Vite/TS config untouched; only additions so far are harness files and this journal.
