# Tech stack

- three.js **0.185.1**, pinned by the exercise; do not change. `@types/three` 0.185.1 matches.
- TypeScript ~6.0.2, `strict` plus `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly` (so: no enums, no namespaces, no constructor parameter properties; type-only imports must use `import type`).
- Vite ^8.2.2, entry `index.html` -> `src/main.ts`. `tsc --noEmit` does type-checking; Vite does the bundling.
- OrbitControls comes from `three/addons/controls/OrbitControls.js` (the `addons` export alias in the three package; no extra install).
- Single entry file `src/main.ts`; starter renders one placeholder cube we may keep, modify, or delete.
