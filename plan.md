# Build journal

Running decision log for the Vakaros three.js exercise. Newest notes appended per stage. Started 2026-08-29, ~1 hour budget for the build itself (setup and planning tracked separately below).

## Stage sequence

- [x] **S0 Adopt repo.** Private mirror `ryanportfolio/threejs-interview-test` of `vakaros/threejs-interview-test`, upstream history preserved, harness overlay committed as `[ai]`.
- [x] **S1 Baseline.** `npm install` clean (0 vulnerabilities), `npm run build` passes, dev server renders the starter cube, browser console clean (0 errors / 0 warnings).
- [x] **S2 Plan.** /dare pass over the requirements before writing scene code.
- [x] **S3 Scene statics.** Rotating circular platform, lights, orbit camera.
- [x] **S4 Drone path.** Smooth closed loop, above and around the platform, fast enough to outrun the turret cap at some point.
- [x] **S5 Turret.** Two-part yaw base + pitch head on the platform edge; world-space tracking that stays correct while the parent platform rotates.
- [x] **S6 Constraints.** Pitch floor at horizontal, 90 deg/s slew cap, lag-and-catch-up with no snap or jitter (watch the yaw wrap-around case).
- [x] **S7 Verify + polish.** Full checklist below, tune speeds so the lag is visibly observable.
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

- [x] `npm run build`: zero TypeScript errors (tsc clean at every stage).
- [x] Browser console on dev server: zero warnings/errors after several full drone loops.
- [x] Platform rotates slowly and continuously (screenshots across time; rim markers move).
- [x] Drone loop is smooth and closed (arc-length sampling, 1000-division table; watched multiple laps).
- [x] Orbit camera: orbit/pan/zoom, middle-mouse pan added, legend top right.
- [x] Turret base yaws, head pitches, visibly distinct parts, platform edge mount, 1.5x scale per user.
- [x] Head never pitches below horizontal: drone demands -5.3 deg at the low pass, commanded pitch floors at exactly 0 (instrumented).
- [x] Lag engages: peak aim error 89.9 deg with smooth recovery; max joint rate exactly 90.0 deg/s, never exceeded; 170-deg direction latch guards the 180 seam.
- [x] Tracking correct under platform rotation: structural (turret parented to platform, worldToLocal per frame); mean aim error 8.3 deg, 75% of samples under 10 deg.
- [x] Commit history annotated `[ai]`/`[hand]`/`[ai+edit]`; DECISIONS.md and prompt log ready.

## Decision log

- **S0:** Adopted via private mirror (not a fork) so the repo can stay private until submission. Template README-showpiece assets stripped from the overlay; they're template-repo content and would be noise for reviewers.
- **S0:** Prose mode set to normal instead of the template's caveman-ultra default: reviewers read the exported transcript, compressed replies would cost readability.
- **S1:** Kept the starter Vite/TS config untouched; only additions so far are harness files and this journal.

- **S2:** DARE ran full chain (artifacts in `.tmp/dare/turret-exhibit/`). Three distinct shapes surfaced; chose joint-space pursuit with the turret parented to the platform: "correct while rotating" becomes structural (worldToLocal each frame), the rate cap doubles as the smoothing mechanism, and the S2-quaternion shape's lesson (clamp pitch target BEFORE the rate step, never after) is folded in. Cap read as turret-local per-axis servo limit; stated assumption for DECISIONS.md.
- **S2:** E-step's 20-min math harness skipped for budget; replaced with visual smoke checks (seam, lag engage, horizon dip, multi-lap wrap, console). Risk stated in the plan file.
- **S2:** Plan sent to codex-review (gpt-5.6-sol, high reasoning, background) and a 5-agent Opus workflow (4 lenses + synthesis, background). Build proceeds without waiting; findings get a /why stress-test before changing course.
- **Trap (recall-worthy):** three r185 `Object3D.worldToLocal` does NOT refresh matrixWorld; call `updateWorldMatrix(true,false)` on the turret mount (or rely on `getWorldPosition`, which does) before converting, or tracking uses last frame's platform pose.

- **S3-S6:** Built in two commits (statics+drone, turret+controller). Opus workflow and Codex plan review both landed mid-build; accepted findings: shared clamped sim-time accumulator (drone and turret must consume the same dt or a tab stall teleports the drone past the turret's slew budget), damp-then-cap pursuit (pure clamp exits saturation with a velocity step), 170-deg yaw direction latch, zenith yaw hold, arcLengthDivisions=1000, pixel-ratio clamp. Rejected: cutting shadows/fog (already built and clean), vite.config dedupe (repo has exactly one three copy), separate turret module (single sectioned file reads fine at this size).
- **Trap:** r185 deprecates THREE.Clock (constructor warns) and PCFSoftShadowMap (warns at first shadow render). Either alone fails the zero-warnings bar. Timer + PCFShadowMap. Caught by Codex review (Clock) and live console (shadow map).
- **Refuted finding (kept for the record):** workflow claimed r185 worldToLocal reads a stale matrixWorld; pinned source shows it calls updateWorldMatrix(true,false) itself (Object3D.js:679). Redundant manual refresh removed.
- **Verified numerically:** window.turretStats over ~20s / 2.5 laps: maxYawRate = maxPitchRate = 90.0 deg/s exactly (cap never exceeded), 757 saturated frames (lag regime engages). Console 0 errors / 0 warnings.
- **S7 (in progress):** lab.html (gitignored, served by Vite) exposes look/feel knobs seeded at current values; user tunes, pastes JSON back, values get ported into main.ts. DECISIONS.md drafted early per workflow advice.

- **S7:** Lab values ported ([ai+edit] commit); turret scaled 1.5x uniformly (angle math unaffected). Controls legend + middle-mouse pan added on user request.
- **S7:** Codex code review vs upstream/main: zero findings in exercise code; three P2s in the harness overlay. Two confirmed and fixed (contract script ENOENT in spawned repos, skill reminders piped to stderr); third (brainstorming server auth) confirmed but template-scope, spawned as a separate task chip. GUIDE.md dead links to stripped template files also cleaned.

## Post-hour polish round (user-directed)

- **Visual overhaul:** drone rebuilt as a quadcopter (arms, pods, counter-rotating props with blur discs, guards, gimbal, nav lights, tangent-rate banking); turret rebuilt as a mech (turntable, octagonal housing, shoulder plates, trunnions, twin barrels, optic). Status lamp on the head lerps green->red from live aim error: doubles as lag observability.
- **VFX:** VSM soft shadows (bias 0 + normalBias 0.02 fixed washed-out deck contact shadows; negative bias was the culprit), Neutral tone mapping (tames the white deck, keeps the tuned mint sky), ground depth rings.
- **Lab v2:** black-hole ground shader (event-horizon core, spiral arms, glow ring) behind 10 knobs; lab re-seeded to current tuned values; ShadowMaterial catcher keeps real shadows over the effect. Awaiting user tune JSON to port.
- **Reviews in flight:** focused codex reviews on turret-constraint compliance (it runs numeric probes of wrap/latch) and zero-sacrifice performance.

- **Trap (tooling):** writing JS/TS source through a quoted Python heredoc: `\n` in the Python literal becomes a real newline inside a JS string and splits it across lines (unterminated string literal). Hit once wiring the debug HUD; caught by tsc. Keep multi-line JS edits in the Edit tool, or double-escape deliberately and re-run tsc immediately.
- **Trap (tooling):** the shell tool's cwd intermittently resets to the parent workspace; `npx tsc` then resolves a dummy package that fails with "not the tsc command you are looking for". Prefix compound commands with `cd <repo> &&`.
- **Review round outcomes (5 parallel Codex reviews):** constraints: one High accepted (cap now bounds the combined joint step vector; per-axis-only allowed 127 deg/s under the strictest reading), everything else measured compliant. Shader: fog chunks added, two GLSL UBs fixed, catcher depthWrite off, disc cropped, wrapped phase; tone-mapping chunks deliberately omitted to preserve the lab-tuned look. Robustness: zero-viewport guard, DPR refresh, timer.connect, refresh-rate-independent damping, prop wrap; simTime precision measured safe for ~100k years. Performance: powerPreference, single-pass prop discs, blurSamples 8 (A/B verified); instancing refactor deferred (in DECISIONS next-time list). Submission: DECISIONS.md rewritten (stale PCF claim fixed, shorter bullets), CLAUDE.md PR-flow contradiction removed, stale template references in reference docs annotated, architecture.md filled.
- **Debug overlay added (user request):** off by default, D key or button; aim ray, true-bearing line, flight path, HUD with live cap/floor/saturation numbers. The turret's constraint compliance is now demonstrable on screen, not just in stats.
