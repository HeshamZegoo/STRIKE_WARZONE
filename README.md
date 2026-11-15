# STRIKE WARZON

© 2026 Hesham.Zego. All Rights Reserved.

A Windows desktop FPS prototype built with Tauri 2, Rust, TypeScript and Three.js.

## Current playable prototype

- First-person WASD movement and mouse look
- Sprint, pointer-lock aiming and automatic rifle fire
- Procedural urban combat arena
- Wave-based enemy spawning and basic enemy pursuit/attack AI
- Health, ammunition, reload, hit marker, pause and restart UI
- Tauri 2 desktop shell and Windows bundle configuration

This is a starting playable prototype, not a finished AAA game. Models, animation, audio assets, advanced enemy tactics, weapon selection, save/settings menus and extensive QA remain future work.

## Requirements

- Windows 10/11
- Node.js LTS
- Rust stable with MSVC toolchain
- Microsoft C++ Build Tools 2022 (Desktop development with C++)
- Windows SDK
- WebView2 Runtime

## Setup

Open PowerShell in this folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\SETUP_WINDOWS.ps1
```

## Run desktop game

```powershell
.\RUN_GAME.ps1
```

Click DEPLOY, then use:
- WASD: move
- Shift: sprint
- Mouse: aim
- Left mouse: fire
- R: reload
- Esc: pause/resume

## Build Windows installer

```powershell
.\BUILD_WINDOWS.ps1
```

Tauri output is placed under:

`src-tauri\target\release\bundle\`

## Notes

The arena and combatants are procedural placeholders. The project intentionally starts with a small dependency set. It does not require Unreal Engine.


## Visual upgrade pass
This build now includes locally generated PBR-style surface textures, a dusk atmosphere,
facade window treatments, street debris, road markings, a more detailed tactical rifle
silhouette, and improved enemy silhouettes. These are procedural prototype assets and
are not a substitute for licensed AAA character, weapon, animation, and environment packs.

## Gameplay systems added in this pass

- Five selectable weapon classes: assault rifle, DMR, pistol, pump-action shotgun, and SMG.
- Weapon-specific magazine sizes, reserve ammo, reload times, damage, spread, fire cadence, and shotgun pellet simulation.
- Aim-down-sights using right mouse button, with dynamic FOV and tighter weapon spread.
- Headshot multipliers and hit feedback.
- Frag grenade with projectile arc, bounce, timed detonation, area damage, and visual blast feedback (G).
- Combat score, kill streak rewards, and a temporary UAV-style enemy reveal after a kill streak.
- Jump, sprint, crouch, and weapon switching (1–5).
- Enemies advance, flank/strafe, engage at close range, and fire ranged attacks with tracer feedback.
- Procedural shot audio, muzzle flash, recoil, damage vignette, and wave-based survival escalation.

## Verification status

The TypeScript compiler was run in the authoring environment. The only reported diagnostic was the unavailable `three` package/type declaration because npm dependency installation could not complete in this environment. Therefore a full frontend build, Tauri build, and in-game runtime test have **not** been verified here. Run `npm install` and then `npm run build` on the Windows PC before packaging.

This remains an actively developed 3D FPS prototype inspired by modern military shooters. It is not a complete Call of Duty-scale production: the environment, weapons, and soldiers are still procedural geometry, and there is no authored campaign, motion-captured animation, multiplayer backend, cinematic cutscenes, or professional recorded sound library. Those require substantial original/appropriately licensed art and audio assets plus extensive engineering and QA.


## Operation Blackout campaign slice

- A three-wave single-player operation with escalating enemy counts.
- Mission objectives update between waves.
- A glowing extraction beacon appears after the final wave; reach it to complete the operation.
- Best combat score is saved locally in the desktop/webview storage.
- Mission report and extraction completion flow.

This is a more complete playable campaign slice, but still a prototype. It does not yet contain authored cinematic sequences, mocap animation, professional character/weapon assets, voice acting, multiplayer, or the scale and polish of a commercial AAA release.


## Tactical radar and session safety pass

- Added a live tactical radar showing the player's heading, nearby hostiles, and the extraction beacon. Hostiles outside local radar range are revealed while the UAV streak is active.
- Added a mission-session generation guard so delayed reload callbacks from an earlier run cannot refill a weapon after a restart.
- Delayed wave transitions are now tied to the active mission session, preventing stale callbacks from a previous run from spawning enemies into a restarted mission.

Verification note: dependency installation timed out in this environment, so TypeScript/Tauri compilation and runtime behavior still need verification on the Windows machine.


## Cinematic HDR-inspired visual pass

- Added Three.js EffectComposer with UnrealBloomPass and OutputPass.
- Tuned ACES exposure, highlight threshold, bloom strength, ambient fill, and warm key light for a higher dynamic-range cinematic presentation.
- Added restrained contrast/saturation and interface glow accents.
- This is an HDR-inspired SDR rendering pipeline; true HDR10 display output is not claimed or verified.
- Bloom has a GPU cost. If performance is poor, reduce bloom strength to `0.25` or disable the UnrealBloomPass.


## Tactical combat & collision update

- Added player collision against the main building shells and street cover, with axis-separated movement so the player can slide along edges instead of sticking.
- Enemy attacks now require a clear line of sight through the registered building/cover collision meshes; solid cover can block incoming fire.
- Added a short damage-invulnerability window to prevent multiple overlapping hits from draining health in a single burst.
- Mission report now includes kills, final score, and best score.

These changes are source-level implementation; a browser/Windows build still needs to be run with dependencies installed.


## Tactical character, weapon and combat polish pass

- Reworked the procedural enemy silhouette with a plate carrier, pouches, radio, helmet band, optic, articulated arms and legs.
- Added procedural gait animation for infantry movement and obstacle-aware local steering so enemies do not deliberately walk through registered cover.
- Added hit feedback (brief material flash and impact spark) and richer first-person weapon geometry (rail, optic details, magazine ribs, foregrip and controls).
- Cached static collision bounds to avoid rebuilding Box3 objects for every collision check.
- Reduced render pixel-ratio cap slightly to protect frame rate on mid-range GPUs.

### Quality note
This remains a procedural Three.js/Tauri indie prototype, not a finished AAA production. Character meshes, animations, weapon models, environment assets, authored audio, QA and real HDR display output still require dedicated production work. The HDR-inspired ACES + bloom pass is not a claim of HDR10 output.


## Upgrade pass: enemies, boss, audio, effects

**Gameplay**
- Three enemy types: grunts (ranged), rushers (fast melee, low HP) and a Heavy Unit boss in wave 3 with a boss health bar.
- Enemies drop health, ammo and frag pickups. A resupply is granted between waves.
- Bullets are now blocked by buildings and cover. Shotgun damage falls off with distance.
- Grenades can hurt you if you stand too close.
- Waves spawn on the street (far end, plus rear flanks from wave 2) instead of inside buildings.

**Bug fixes**
- Enemies were facing away from the player; they now face you.
- Hits on arms, legs and gear never registered; every enemy part now counts.
- The grenade kill path skipped streak and score logic; both paths now share one kill function.
- Removed the duplicate root main.ts and style.css (Vite uses src/). Added src/vite-env.d.ts.

**Feel and visuals**
- Particle system (blood, sparks, dust, casings, explosions), death animation, screen shake, fireball and blast light.
- Gradient dusk sky, drifting dust, flickering street lamps with glowing bulbs, sprint FOV and head bob, low-health warning.

**Audio (all synthesised, no asset files)**
- Per-weapon gunshots, explosions, enemy fire, hit ticks, reload clicks, pickup chimes, wind ambience and a tension drone.

Verification: the code was type-checked against a stub of Three.js only, because npm install was unavailable here.
Run npm install && npm run build on your PC before packaging.


## Upgrade pass 2: cinema FX, 5-wave campaign, combat feel

- 4x MSAA render target (the post-processing chain was bypassing canvas antialiasing), plus a lens pass with chromatic aberration (kicks on damage and explosions) and film grain.
- Campaign is now 5 waves: a Heavy Unit in wave 3 and two Heavies in wave 5, with rushers scaling up each wave.
- Damage direction arc shows where hits come from. Kill combo multiplier with a headshot/kill readout.
- Weapon sway from mouse movement, reload animation, recoil that climbs the view.
- Fixed: resizing the window reset the pixel ratio and ignored the graphics quality setting.

For real AAA visuals the next step is authored assets (rigged soldier and weapon models as .glb, animations, recorded audio). Free CC0 sources: Quaternius, Kenney, Mixamo, Freesound.


## Upgrade pass 3: environment and materials (all procedural, no downloads)

- Procedural normal maps on every surface (concrete, asphalt, sand, metal); asphalt is now wet and catches the lamp light.
- Rain that follows the player, with rain audio. Scales with graphics quality (off on LOW, half on MEDIUM).
- Setting sun on the horizon and a warm rim light so enemies read against the dusk.
- Battlefield cover: 3 wrecked cars, 5 crate stacks, 3 sandbag walls and 2 burning barrels with flickering firelight. All block movement and bullets.


## Deployment modes added
- Story Campaign: the authored five-wave Operation Blackout sequence with extraction.
- Endless Survival: escalating enemy waves with periodic Heavy Units.
- Time Attack: five-minute score challenge with escalating enemy waves.

The Arctic/Desert map packs and rigged character/weapon downloads are not bundled in this source archive. The current playable arena remains the procedural urban environment; do not treat visual presets or external asset links as imported playable maps/models.


## Long campaign + real GLB asset integration (2026-11)

- Story Campaign is now a 12-chapter operation. Chapters 1–4 deploy in the Urban Hill Town, 5–8 in Arctic Station, and 9–12 in the Desert Canyon. Heavy-unit boss encounters are placed at chapters 3, 6 and 9, with three heavies in the final chapter.
- Added three selectable GLB environment packs, loaded on demand with Three.js GLTFLoader:
  - Urban: `https://cdn.3dassets.dev/assets/27595/v1/model.glb` — Tactical Shooter Hill Town.
  - Arctic: `https://cdn.3dassets.dev/assets/19851/v1/model.glb` — Frozen Lake Retreat (Alpine Snow Village, 54.2k triangles).
  - Desert: `https://cdn.3dassets.dev/assets/21034/v1/model.glb` — Desert Canyons and Oases.
- Added the CC0 static Veteran Running Pose operator (`https://cdn.3dassets.dev/assets/27593/v1/model.glb`) as the enemy visual when available. If the asset cannot load, the procedural soldier remains as fallback.
- These operator meshes are static poses (not rigged or animated). The gameplay still moves the root transform and keeps the existing hit/AI logic; this is not a substitute for a skinned animated soldier.
- 4x MSAA is applied to the EffectComposer render targets when WebGL2 supports multisampled render targets, preserving edge smoothing through post-processing.
- The imported map packs are visual GLB scenes; the project still uses its own gameplay collision and navigation logic. The map packs do not provide ready-made navmeshes or collision scripts.
- CDN loading needs an internet connection. For offline builds, download each GLB into `public/assets/` and replace the CDN URLs with local paths.
- All three environment packs and the operator are listed as CC0 1.0 on their 3DAssets.dev pages.

Sources:
- https://3dassets.dev/packs/tactical-shooter-hill-town
- https://3dassets.dev/assets/alpine-snow-village-frozen-lake-retreat-0a32c8c3
- https://3dassets.dev/assets/desert-canyons-and-oases-canyon-narrows--d32cadc7-starter-scene
- https://3dassets.dev/assets/tactical-shooter-hill-town-veteran-running-1660b930


## Integrated campaign and world-collision pass

- The single-player campaign now runs for 12 chapters across Urban, Arctic and Desert deployments, with named chapter objectives and escalating enemy compositions.
- Authored GLB maps replace the procedural fallback when they load successfully; the fallback remains visible if a map request fails. This avoids drawing the imported map on top of the placeholder arena.
- Active GLB map meshes are now included in bullet and enemy line-of-sight raycasts. Per-mesh world bounds are also added to player/enemy movement collision where the mesh represents a bounded obstacle; broad terrain and floor sheets are intentionally excluded.
- The imported soldier is cloned with Three.js `SkeletonUtils` so skinned meshes can be cloned safely. It is normalized to the game soldier height, and the first animation clip is played when the source GLB actually contains animation data. Heavy and rusher silhouettes keep their purpose-built procedural forms.
- Ammo pickups and between-wave resupply now have reserve caps to prevent unlimited reserve-ammo growth.
- These changes are source-level integration. The GLB URLs require internet access, and their actual asset contents, map-specific collision quality, browser performance, and Windows/Tauri build still require in-game verification. When a GLB fails to load, the game falls back to the procedural arena.


## Movement, map-loading and performance fixes (2026-11)

- Corrected the first-person strafe basis: W/S move forward/back and A/D move left/right.
- Movement collision is axis-separated, allows wall sliding, and can recover if an imported collider overlaps the spawn point.
- Player world limits now come from the active GLB map bounds instead of the old fixed urban-arena limits.
- Map loading is on-demand rather than downloading all three large scenes at startup; successful maps are cached and loading progress/fallback status is reported.
- Replaced the oversized Arctic Station starter scene (45.2 MB / 2.1M triangles) with Frozen Lake Retreat (1.2 MB / 54.2k triangles) to reduce load time and GPU pressure.
- Post-processing now uses a WebGL2-aware multisample target with an unsigned-byte fallback, and graphics presets have more balanced pixel-ratio/bloom costs.
- Runtime movement and browser interaction still need a final hands-on test in the target browser/Windows build.
