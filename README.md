# Shadow Chess

A lightweight local two-player chess game with original SVG medieval warriors. Authentic chess, distinct warrior movement, and short on-board capture battles in a quiet monochrome battlefield. Computer-mode integration is included; it requires the optional Stockfish engine assets described below. No account, backend, external fonts, images, or runtime CDN requests.

## Run locally

Use Node.js 20 or newer. From this folder:

```sh
npm install
npm start
```

Open **http://127.0.0.1:5173**. The install step copies the chess.js browser module and its BSD license into `vendor/`. Once that module is present, serving and playing need no internet. Use a local HTTP server rather than opening `index.html` directly.

```sh
npm test            # rules, animation, AI transport/scheduling and installer tests
npx playwright install chromium firefox webkit  # one-time browser test setup
npm run test:browser # Chromium, Firefox, and mobile WebKit flows
npm run test:mobile  # viewport, touch, orientation and promotion-dialog checks
npm run build      # portable static site in dist/; warns if Stockfish is absent
npm run build:ai   # require engine assets before building computer mode
node scripts/serve.js --dist  # preview built files
```

## Mobile layout and static deployment

The layout gives phones and tablets a full-width board (up to 680 px) below the 1,000 px breakpoint. Undo, flip, restart, and skip sit directly below the board; a compact turn/check indicator stays above it. Settings stack on small phones and use two columns on tablets. Controls have 44 px minimum heights; chess squares fill the available board width. Native select controls use 16 px text on mobile, promotion/restart dialogs scroll on short screens, and safe-area padding keeps content clear of display cutouts. Browser zoom stays available. Landscape screens can scroll vertically without hiding controls or forcing an excessively small board.

The responsive browser suite targets 320, 360, 390, 430, 768, 820, 844 (landscape), 1,024, and 1,280 px widths. It checks square geometry, page overflow, game-control placement, touch play, orientation changes during animation, and phone promotion dialogs. Chromium, Firefox, and mobile WebKit projects are configured. These browser checks still need to run outside the restricted implementation sandbox.

For a static host, configure:

| Setting | Value |
| --- | --- |
| Install | `npm ci` |
| Build (local chess) | `npm run build` |
| Build (with computer mode) | `npm run setup:ai && npm run build:ai` |
| Publish/output directory | `dist` |

Deploy the **contents of `dist/`**, including `css/`, `js/`, `vendor/`, and `.nojekyll`. No backend, SPA rewrite, or environment variables are required. Relative assets and worker URLs support a project subdirectory such as `/battlechess/`. The build includes `.nojekyll` for hosts using Jekyll processing. Serve JavaScript normally and WebAssembly with `application/wasm`. The AI build deliberately fails if the engine download has not succeeded; the ordinary build warns and remains playable locally.

Preview the production files with `node scripts/serve.js --dist`. When pushing source, include the new `css/responsive.css` and current project files; `dist/` remains generated and git-ignored, so a Git-based host should run the build command above.

## Computer opponent (Phase 5)

Install the engine once from a terminal with network access:

```sh
npm run setup:ai
npm run test:stockfish
npm start
```

The setup command downloads the pinned Stockfish.js **19.0.1 lite single-threaded** worker, its matching WebAssembly file, and GPL license to `vendor/stockfish/`. The browser loads those local files only when a computer turn starts; local two-player creates no worker and needs no Stockfish assets. After setup, computer play needs no backend or internet connection. Engine errors offer **Try again** and **Local play**; there is no substitute or random-move opponent.

Select **Player vs computer**, choose your Light or Dark army, and set Easy, Medium, or Hard. The computer opens if you choose Dark. Mode/army/settings changes preserve the current position and cancel pending analysis. Thinking time is an upper search budget (0.25–5 seconds); depth limits can make a move finish sooner. First-time engine startup is additional to the search budget. Difficulty uses skill levels 0/8/20 and depth limits 4/10/18; these are relative levels, not calibrated Elo ratings.

**Undo turn** takes back your move plus the computer reply, or just your move if the engine is still thinking. The computer's initial opening cannot be undone before you have played. Restart, changing mode/settings, and leaving the page terminate pending workers; stale replies cannot alter the board. Computer moves use the same chess.js validation, promotion, and combat pipeline as human moves. Full move history is sent to the engine so repetition context is preserved.

The single-threaded engine needs no special cross-origin isolation headers. Static hosts must serve `.js` as JavaScript and `.wasm` as `application/wasm`; the included server does so. The engine's `Copying.txt` and `SOURCE.md` travel with the static build. See the [Stockfish.js documentation](https://github.com/nmrugg/stockfish.js/tree/v19.0.1) and [Stockfish difficulty explanation](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html).

To verify the actual browser worker after setup and installing Playwright Chromium:

```sh
SHADOW_CHESS_REAL_AI=1 npm run test:browser -- --grep "actual downloaded"
```

The other AI browser tests use a simulated worker to exercise controls and cancellation. The real-engine test is explicitly skipped unless the environment flag is set.

## Play

Select one of the active army's warriors, then select a highlighted square. Dots mark legal moves; rings mark captures, including en passant. Select the warrior again or an invalid square to clear selection. Use Tab to focus a square, arrow keys to navigate, and Enter or Space to select. Touch uses the same selection flow.

Promotion opens a modal with Queen, Rook, Bishop, and Knight choices; Cancel or Escape returns to the unchanged position. In local play, Undo reverses one half-move, including after checkmate or a draw; computer mode uses the full-turn behavior described above. New battle confirms before clearing a played game. Flip board changes only the view. The move chronicle uses standard algebraic notation.

Warriors physically travel between squares in 320–520 ms with a class-specific gait: infantry march, mounted knights leap, mages glide, guardians step heavily, commanders dash, and kings walk deliberately. Castling moves both warriors simultaneously; a promoting pawn travels as infantry before changing into the selected class. Captures trigger a deterministic 1.2-second battle: approach (0–300 ms), weapon strike (300–720 ms), slash/impact flash (720–960 ms), and defender collapse (960–1,200 ms). Each class now has its own attack: infantry sword slash, mounted knight charge, mage arcane bolt, guardian hammer smash, commander flurry with an energy burst, and royal cleave. Mages cast from their starting square and glide into place after impact; knights leap before charging. All attacks use the same deterministic 1.2-second lifecycle. En passant battles the pawn on its actual square, then the attacker settles on the legal destination. A capture-promotion changes class only after the sequence settles. Selected warriors have a subtle idle pose; the other pieces remain still to limit rendering work.

Uncheck **Warrior movement** to disable ordinary travel and idle motion, or use **Skip movement** during a move. **Capture battles** is independent: uncheck it to use ordinary travel for captures; turn off both options for immediate moves. Use **Skip battle** to settle a capture instantly. System reduced-motion preferences bypass both travel and combat. Input stays locked during either sequence. Undo/restart, board flipping, resizing, and leaving the tab safely finish or cancel the presentation and remove all transient pieces. Browsers without the Web Animations API fall back to immediate moves. Movement settings are held in memory.

The interface displays check, checkmate, stalemate, threefold repetition, fifty-move rule, and insufficient material. Following chess.js, supported draw conditions automatically end the game; there is no separate draw-claim negotiation. Kings remain on the board at checkmate. Games are held in memory; refreshing starts a new game.

## Battlefield audio

Click **Enable audio** or **Test sound** immediately above the board. Both start audio directly from the click; Test sound plays two clear tones and a heavy guardian footfall. The expanded **Battlefield audio** panel also has an Enable sound checkbox. Audio never autoplays. Default master/ambience/effects levels are now 65%/60%/85% for better audibility. A wordless Gregorian-style melody, unison choir-like voices, a low drone, distant drums, chapel reflections, weapon swishes/clangs, magical impacts, and piece-specific capture cries and attack shouts are synthesized entirely with the Web Audio API. These are original procedural approximations, not recorded monks or human scream samples. No additional files, downloads, voices, or audio libraries are needed. Guardians have deep armored stomps, kings have weighty boots, infantry march, commanders step lightly, and knights have hoofbeats. Mages glide silently. Castling schedules both king and guardian footsteps; turning off visual movement keeps one short footfall per moving warrior.

**Gregorian-style chant**, **Defeat screams & cries**, and **Attack shouts** can be switched independently. Turning off cries/shouts cancels only the selected vocal layer and leaves steel, footsteps, and ambience playing. The separate **Cries & shouts** slider controls voices without changing weapon volume. In **Try a capture sound**, choose an attacker and captured class, then click **Preview battle** to hear the real capture mix without moving anything on the board. Master, chant/ambience, battle effects, and voice volumes have separate controls (voice default: 80%); zero master volume is silent. Sound settings reset on refresh. Weapon impacts follow the visual capture clock at 720 ms; cries follow shortly afterward. Captures still make a short immediate sound when animation is disabled or reduced motion is requested. Skipping, undoing, restarting, changing modes, or hiding the page cancels pending battle sounds. Hidden pages stop the ambience scheduler and suspend audio; it resumes on return only if sound remains enabled. Unsupported or blocked audio never prevents chess play. Startup failures now show the actual browser error beside the board instead of only switching the checkbox back off; a suspended context is never reported as On. Optional reverb/limiter failures fall back to direct playback. Native interval/timeout functions are explicitly called with their global Window receiver, fixing Firefox's “does not implement interface Window” startup error; regression tests cover both audio and AI timers. In Firefox, first try Test sound and check that the tab and device are not muted; see [Mozilla sound troubleshooting](https://support.mozilla.org/en-US/kb/what-to-do-if-firefox-wont-play-any-sounds) if the visible error points to a browser/device restriction.

Capture sounds use both the attacking and captured class. Pawn strikes combine low body hits, several inharmonic steel resonances, and scraping noise for a heavier blade sound. Defeat voices use overlapping vowel segments, descending pitch, vibrato, and breath/noise layers; they remain stylized synthesis, not human recordings.

| Warrior | Attack | When captured |
| --- | --- | --- |
| Infantry | Heavy steel slash and grunt | Ragged scream, shield drop |
| Knight | Hooves, lance impact, charge shout | Muffled rider cry, horse distress, armor fall |
| Mage | Rising arcane surge and incantation | Spectral wail and fading magic |
| Guardian | Crushing hammer, bass impact, low roar | Guttural cry and heavy armor crash |
| Commander | Twin blade strikes and sharp shout | Gasp and falling cry |
| King | Resonant greatsword and royal war cry | Kings stay on the board; checkmate ends play |

Weapon effects and visuals keep the existing 1.2-second capture. Defeat screams sustain for **two seconds from their onset**, with ragged gasps, rougher pitch modulation, and short wet impact/splatter transients. A scream starting just after the hit can therefore continue after the animation ends and into the next turn; it does not hold the chess input lock. At most two defeat tails overlap during rapid play. Skipping an active battle, undoing, restarting, changing mode, muting, or leaving the page cancels weapon, cry, and shout sources together. Normal visual completion lets the scream finish naturally. En passant and capture-promotion use the engine's actual captured class, not the attacker's class.

## Architecture

- `js/game.js`: sole owner of chess.js state; legal moves, mutation, draw results, and snapshots. `MoveController` commits a legal move, locks input while an optional presentation adapter runs, and reconciles rendering even on failure. Undo/restart invalidate and abort stale presentations.
- `js/board.js`: persistent square buttons, cached SVG updates, selection markers, board orientation, accessible labels and keyboard navigation.
- `js/characters.js`: six original inline SVG designs with named rig groups for legs, torso, head, cloak, and weapons; contrasting cloth/armor tones distinguish the armies. No conventional chess glyphs or downloaded artwork.
- `js/animation.js`: movement plans and a cancellable Web Animations adapter; coordinated castling, knight arcs, capture/en passant cleanup, promotion travel, reduced-motion and background-tab handling.
- `js/combat.js`: shared 1.2-second capture lifecycle, class-specific travel, hit flash and defeat; all effects use tracked Web Animations and the adapter's single cleanup path.
- `js/attacks.js`: reusable weapon/body tracks, per-class impact SVGs, and mage projectile frames. Direction and distances derive from displayed squares, so flipped boards and both armies use the same profiles.
- `css/combat.css`: capture actors, weapon pivot, impact SVG styling, and overlay clipping.
- `css/responsive.css`: shared touch sizing, phone/tablet stacking, safe-area padding, compact board status, nearby game controls, and bounded dialogs.
- `tests/responsive.spec.js`: viewport/overflow matrix, touch controls, orientation-change cleanup, and phone promotion sizing.
- `css/animations.css`: class-specific gaits, selected-warrior idle poses, animation overlay, and movement controls.
- `js/ai.js`: lazy UCI worker transport, startup/search deadlines, difficulty and position commands, cancellation, and computer-turn scheduling. Worker output is validated by chess.js through `MoveController`.
- `scripts/setup-ai.js`: pinned local engine download with format/size checks; no package dependency or runtime CDN request.
- `scripts/check-ai.js`: optional smoke test against the actual downloaded engine; fails clearly when assets are absent.
- `js/sound-profiles.js`: separate per-class attack and victim sound identities; kings have attack sounds but are not capture victims.
- `js/audio.js`: original formant-based chant synthesis, drone/drums, heavy steel, class-specific defeat cries and attack shouts; cancellable source groups, volume buses, reverb, a limiter, opt-in activation, and page visibility handling.
- `tests/audio.test.js`: audio scheduling, no autoplay, muting/skipping, source cleanup, independent toggles, bounded volume, and failure isolation with AudioContext boundary fakes.
- `tests/audio-browser.spec.js`: explicit activation/preview, volume controls, mute/suspend behavior, and visible startup errors.
- `js/main.js`: selection, promotion dialogs, controls, status and history.
- `css/`: responsive interface and board/character styles; reduced-motion support.
- `tests/game.test.js`: special rules, state restoration, terminal positions, duplicate input, presentation failures and cancellation.
- `tests/animation.test.js`: move planning, castling, en passant, promotion, travel endpoints, real adapter cleanup, interruption and failure handling using a small DOM/animation boundary fake.
- `tests/combat.test.js`: capture timing/endpoints, exactly one battle, input locking, skipping, interruption, special captures, independent settings, and failure recovery.
- `tests/attacks.test.js`: legal captures by every class for both armies, track validation, per-class skip/undo cleanup, and mage projectile endpoints.
- `tests/ai.test.js`: simulated UCI handshake, settings, stale replies, failures, illegal output, full-turn undo, both armies, promotion, and presentation locking.
- `tests/setup-ai.test.js`: installer asset/license output and partial-download rejection with fixture responses, not an engine download.
- `tests/ai-browser.spec.js`: mode/settings controls, computer-turn input locks, recovery, and opt-in real-engine browser smoke test.
- `tests/helpers/animation-fixture.js`: shared DOM/Web Animations boundary fake used by the lifecycle suites.
- `tests/browser.spec.js`: browser flows including movement locks, skipping, undo/flip during travel, reduced motion, and coordinated castling on desktop/mobile viewports.

Chess rules are delegated to [chess.js](https://github.com/jhlywa/chess.js). Its license is copied to `vendor/chess.LICENSE` during installation. Original application code and SVG art are provided in this project.

## Remaining validation and Phase 6

Class-specific combat is complete. Phase 5's worker integration, controls, scheduling, and setup tooling are implemented, but the actual Stockfish binaries could not be downloaded in this environment. Computer mode is not operational here until `npm run setup:ai` succeeds and real-engine checks pass. The current default static build supports local play; `npm run build:ai` intentionally fails while engine assets are missing.

After validating Stockfish in a real browser, Phase 6 can add victory cinematics, a main menu, and further mobile/browser polish; optional battlefield audio is now implemented. Multiplayer, clocks, and persistence remain outside the current implementation.

## Verification in the implementation environment

All **74 automated tests** pass: 12 chess/controller, 8 movement, 7 combat, 3 class-specific attack, 16 AI transport/scheduling, 2 installer, and 26 audio tests. AI/installer tests use controlled worker/network fixtures; they do not establish actual Stockfish behavior. Audio tests use a controlled AudioContext boundary and establish scheduling/cleanup, not subjective sound quality. The suites were also run directly to inspect individual results because this environment's isolated Node runner reports aggregate test files.

`npm run build` succeeds with a warning that engine assets are missing. `npm run setup:ai` fails on restricted network access; `npm run test:stockfish` and `npm run build:ai` report missing assets as expected. Responsive styles parsed without syntax errors, and the build includes all linked responsive assets. Browser verification remains blocked by the sandbox's denial of localhost binding (`EPERM`); a previous Chromium startup also failed on a denied socket operation. Real-engine, visual, audible playback, physical-device, and cross-browser verification are pending. No passing actual Stockfish run is claimed.
