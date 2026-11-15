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
