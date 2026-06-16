# Extension Modularization Playbook

This playbook captures the reusable architecture discipline learned from Defense against Distractions. It is written so Codex can apply the same structure to other browser extensions without needing the full DaD product context.

The goal is not prettier folders. The goal is to keep an extension maintainable as it grows: small reviewable modules, explicit ownership, testable core logic, bounded browser permissions, and safe migration around user data.

## Core Principle

Use feature-first modules with thin runtime entry points.

Runtime entry points should bootstrap and wire. They should not own business logic.

Feature modules should own product behavior and nearby UI assets. Shared core modules should be pure and testable. Platform modules should own browser APIs and permission-specific behavior.

The best default is:

1. group by feature or product responsibility;
2. split by runtime surface inside that feature when needed;
3. keep runtime entry files thin when manifest, CSP, or browser-extension loading rules require them.

## Why This Matters For Codex

Codex tends to follow the shape it finds. If a project has broad files, broad folders, and no ownership map, new work will keep landing in those broad places. A modularization playbook gives Codex an architectural gravity field:

- new behavior goes to the narrowest existing owner;
- broad files become compatibility barrels or controllers;
- HTML, CSS, tests, and UI helpers stay near the feature they serve where the toolchain allows it;
- storage and browser APIs stay behind explicit boundaries;
- tests are placed by feature instead of in omnibus files;
- file-size and folder-density audits detect structural decay early.

## Recommended Source Shape

A mature extension can use this shape as a target, even if it migrates gradually. This is intentionally more feature-co-located than the current DaD tree.

```text
src/
  app/
    background/
      index.js
      messageRouter.js
    content/
      index.js
      manifestScripts.js
    popup/
      popup.html
      index.js
      popup.css
    options/
      options.html
      index.js
      options.css
    blocked/
      blocked.html
      index.js
      blocked.css

  features/
    feature-name/
      README.md
      core/
        model.js
        storageModel.js
        validation.js
        validation.test.js
      background/
        runtime.js
        messages.js
      content/
        adapter.js
        effects.js
        effects.css
      ui/
        FeaturePanel.js
        FeaturePanel.css
        FeaturePanel.test.js
      popup/
        FeatureCard.js
        FeatureCard.css
      options/
        FeatureSettings.js
        FeatureSettings.css
      i18n/
        messages.js

  platform/
    chrome/
      storage.js
      runtimeMessages.js
      tabs.js
      alarms.js
      idle.js
    dom/
      createElement.js
      formControls.js
      theme.js
    time/
      clock.js
      duration.js
    diagnostics/
      logger.js

  shared/
    compatibility-barrels.js

  legacy/
    migration/
      oldStorageKeys.js
      oldSettings.js

dist/
  chrome/
    manifest.json
    background.js
    content.js
    popup.html
    options.html
```

This is a target shape, not a required first commit. Existing projects can keep their current paths while moving closer to the boundaries.

## Module And Build Target

Author source as ES modules by default.

Best-practice target:

- `src` is human-authored source.
- `dist` is generated extension output.
- Feature code uses static ES imports and exports.
- Runtime entries import feature modules and wire them.
- Content-script source is still modular; the build emits manifest-loadable content bundles.
- Extension pages use module scripts.
- The background service worker uses `"type": "module"` and static imports.
- Build output is audited before release.

The build step is not the architecture. The architecture is feature ownership and explicit boundaries. The build step exists to preserve that architecture while satisfying browser-extension loading rules.

Tooling should support:

- ES module source;
- local-only bundled executable code;
- manifest path generation or validation;
- source maps for debugging;
- import resolution checks;
- package audit for remote-code risks;
- deterministic release artifacts.

Avoid dynamic import in MV3 extension service workers. Use static imports or have the build step compile the dependency graph into valid extension output.

Avoid remote executable code. Dependencies may be bundled, but executable JavaScript and WebAssembly used by the extension must be included in the extension package.

TypeScript is a strong candidate when the extension has growing schemas, runtime messages, storage records, and cross-surface contracts. It is not required for the architecture, but the best mature design should either use TypeScript or maintain equivalent schema validation and tests.

## Runtime Entry Rules

Runtime entry files include:

- background service worker entry;
- content-script bootstrap;
- popup entry;
- options-page entry;
- blocked-page or extension-page entry.

Rules:

- Entry files should target under 150 lines.
- Entry files should initialize modules, register listeners, and wire refresh loops.
- Entry files should not contain scoring, validation, parsing, storage migration, or complex UI rendering.
- If an entry file grows, extract the new responsibility into a feature module and keep the entry as the caller.

## Feature Ownership Rules

Every meaningful behavior should have one owning feature folder.

Good feature ownership examples:

- `plans/core/model.js` owns plan normalization and validation.
- `schedules/core/time.js` owns schedule recurrence and active-window logic.
- `ui-blocking/content/matcher.js` owns page element matching.
- `intent/core/scoring.js` owns coherence scoring.
- `pomodoro/background/runtime.js` owns alarm/runtime reconciliation.
- `plans/options/PlanSchedule.css` owns plan-schedule styling if that styling changes with the plan-schedule UI.
- `ui-blocking/content/picker.css` owns picker styling if the picker is feature-owned and bundled/imported from there.

Avoid:

- putting unrelated helpers into a broad `utils.js`;
- placing new behavior in a root `content.js`, `popup.js`, or `options.js`;
- sending all tests to a broad `test/` tree without feature ownership;
- duplicating the same rule in UI and background code;
- hiding storage migrations inside UI rendering files.

## Pure Core Rule

Pure core modules are the safest place for logic.

They may:

- import other pure modules;
- normalize data;
- score or validate;
- produce display-ready summaries;
- expose deterministic functions for tests.

They must not:

- access `chrome`;
- access `window` or `document`;
- read/write `localStorage` or `sessionStorage`;
- mutate DOM nodes;
- depend on timers except through injected timestamps;
- depend on real browser tabs.

If a function can be pure, make it pure. Pure logic is portable between extensions and testable without a browser.

## Platform Boundary

Platform modules own browser APIs and side effects.

Examples:

- `platform/chrome/storage.js`
- `platform/chrome/tabs.js`
- `platform/chrome/runtimeMessages.js`
- `platform/chrome/alarms.js`
- `platform/dom/createElement.js`

Rules:

- Promise-wrap callback APIs.
- Normalize errors in one place.
- Keep permission-specific behavior visible.
- Do not scatter raw `chrome.tabs`, `chrome.storage`, or `chrome.runtime.sendMessage` calls through feature modules unless the project is still in early migration.

## Content Script Boundary

Browser extension content scripts have special constraints:

- they run in page context boundaries;
- they can read and change page DOM;
- they have limited extension API access;
- they often load through manifest order;
- manifest-loaded content-script output may need to be bundled from modular source.

Rules:

- Treat content scripts as adapters.
- Keep content-script public APIs small and named.
- Put pure logic outside content scripts when possible.
- Preserve manifest load order during moves.
- Document any global namespace used for classic scripts, such as `window.ProjectName`.
- Do not let content scripts trigger privileged background actions without validation.

Useful naming:

- `.entry.js` for source files that compile into manifest-loaded output.
- `controller.js` for thin content controllers.
- `effects.js`, `style.js`, `theme.js`, `messages.js`, `dom.js`, `matcher.js` for focused sub-responsibilities.

## Background Service Worker Rule

Manifest V3 service workers can be terminated. Background code must be restart-safe.

Rules:

- Treat memory as cache only.
- Persist state needed after restart.
- Make initialization idempotent.
- Use static imports in extension service workers.
- Keep alarm registration, listener registration, and storage reconciliation in focused modules.

Test target:

- The feature should be able to reconstruct runtime state from storage after restart.

## Message Router Rule

Messages from content scripts should be treated as untrusted input.

Every privileged message should validate:

- action name;
- sender tab/frame context;
- payload shape;
- feature policy;
- whether the requested action is allowed from that sender.

Use a message router once message handling grows. Avoid ad hoc `if (message.action === ...)` checks spread across several runtime files.

## Storage Ownership Rule

Every storage key needs an owner.

Document for each key:

- storage area: sync, local, session, managed, or in-memory;
- owner feature;
- data shape/version;
- migration path;
- retention or pruning;
- quota risk;
- whether it contains user configuration, runtime state, diagnostics, or cache data.

General rule:

- Sync storage: compact user configuration and mission-critical settings.
- Local storage: diagnostics, history, usage aggregates, and larger local-only state.
- Session/in-memory: cache data that can be lost safely.

Never rename a storage key without a migration and tests.

## Compatibility Barrels

During migration, keep old import paths alive with barrel files.

Example:

```js
export {
  normalizeSettings,
  createRuntimeState,
  summarizeStatus
} from './feature-name/core/index.js';
```

Rules:

- A barrel should export, not implement.
- Keep imports pointed to the barrel until a caller has a narrow reason to import a submodule.
- Do not add new behavior to a compatibility barrel.
- Delete or shrink barrels only after callers are migrated and tests pass.

This lets refactors happen without giant path-change commits.

## File Size Budgets

These are maintainability budgets, not browser requirements.

Suggested targets:

- Runtime entry file: under 150 lines.
- Pure core module: 100 to 300 lines.
- UI module/component: 150 to 450 lines.
- Content-script adapter: 100 to 350 lines.
- CSS file per feature/surface/component: under 500 lines.
- Test file per feature: under 500 lines.

Escalation:

- Over 600 lines: create a follow-up split unless there is a clear reason.
- Over 900 lines: treat as architecture debt.

Audits should report soft and hard thresholds separately. Soft notices guide future edits; hard failures prevent unreviewable growth.

## Folder Density Budgets

Flat folders become hard to scan even when every file is small.

Suggested targets:

- Root runtime folders such as `src/app/options`, `src/app/content`, `src/app/background`, `src/features`, and `src/platform`: 12 files or fewer at each flat level before splitting by feature or surface.
- Feature subfolders: 15 files or fewer.
- If a folder crosses the target, split by surface or responsibility:
  - `core`;
  - `content`;
  - `background`;
  - `options`;
  - `popup`;
  - `styles`;
  - `tests`.

Folder-density audits are valuable because they catch the "everything goes here" failure before individual files become huge.

## Co-Location Rule

The strongest design is to put files near the thing they serve.

Prefer:

```text
features/
  plans/
    options/
      PlanSchedule.js
      PlanSchedule.css
      PlanSchedule.test.js
    core/
      scheduleStrictness.js
      scheduleStrictness.test.js
```

## CSS And HTML Structure

Use feature-owned styles with thin entry stylesheets.

Example:

```text
src/
  app/
    popup/
      popup.html
      index.js
      popup.css
  features/
    popup-shell/
      ui/
        PopupShell.js
        PopupShell.css
    pomodoro/
      popup/
        PomodoroCard.js
        PomodoroCard.css
    intent/
      popup/
        IntentRecoveryCard.js
        IntentRecoveryCard.css
  styles/
    tokens.css
```

Rules:

- Entry stylesheets should mostly import feature styles or define surface-level layout.
- Put styles in the narrowest feature/surface/component file.
- Keep design tokens separate from feature styles.
- HTML entry files belong to runtime surfaces such as popup/options/blocked pages.
- HTML templates that belong to one feature should live with that feature if the toolchain supports it.
- Content-script CSS may stay injected by content modules when page isolation or manifest compatibility requires it.

## Test Structure

Best target: tests live next to the feature logic they verify, or in a mirrored feature test folder when packaging constraints require tests outside `src`.

Example:

```text
features/
  schedules/
    core/
      time.js
      time.test.js
  intent/
    core/
      scoring.js
      scoring.test.js

test/
  extension-e2e/
    popup.test.js
    options.test.js
```

Rules:

- Do not create one broad `shared.test.js`.
- Add tests to the smallest matching feature folder or mirrored test folder.
- If a feature grows, create a test subfolder before the test file becomes hard to scan.
- Keep most behavioral rules in pure modules so Node tests can cover them.
- Add browser E2E tests for extension-page, popup, content-script, and service-worker behavior when a change depends on real Chrome behavior.

## Migration Strategy

Do not do a giant rename-only refactor.

Preferred migration:

1. Add guardrail docs and audits.
2. Add tests around the current behavior.
3. Extract one responsibility into a new module.
4. Keep a compatibility barrel or old entry wrapper.
5. Update imports only where necessary.
6. Run narrow checks.
7. Commit and push a small checkpoint.
8. Repeat.

Good refactor commits say what responsibility moved:

- `Split popup diagnostics panel`
- `Move schedule time helpers into shared schedules`
- `Extract content blocking overlay style`

Weak commit messages hide risk:

- `Refactor`
- `Cleanup`
- `Move stuff`

## Codex Operating Protocol

When Codex edits a growing extension:

1. Read the local architecture docs first.
2. Identify the owning feature folder before editing.
3. If no owner exists, create a narrow feature folder rather than adding to a root runtime folder.
4. Keep behavior changes separate from broad file moves.
5. Add or update tests in the feature's test area.
6. Run the narrowest relevant checks.
7. Update code-structure docs when ownership changes.
8. Commit small checkpoints when the repo is stable.

Default decision:

- New UI behavior: feature-owned `ui`, `options`, `popup`, or `content` module.
- New scoring/validation behavior: feature `core` module.
- New Chrome API access: `platform/chrome` or a background feature adapter.
- New persistent data: feature storage model plus migration note.
- New diagnostics: feature diagnostics module plus privacy boundary.
- New CSS: colocated feature/component stylesheet.

## Required Checks By Change Type

For manifest or content-script path moves:

- manifest reference check;
- import check;
- unit tests;
- manual extension load or E2E check when available.

For storage model changes:

- unit tests;
- migration tests;
- quota/shape review;
- privacy/storage docs update.

For background behavior:

- unit tests for pure logic;
- restart/reconciliation test where possible;
- message validation review.

For options or popup UI:

- unit tests for pure helpers;
- import check;
- manual browser check when visible layout or interaction changes.

For folder/file structure:

- file-size audit;
- folder-density audit;
- code-structure docs update.

For release-facing changes:

- full unit tests;
- manifest check;
- import check;
- locale coverage check;
- release/package verification.

## Portable Audit Scripts

The DaD repository uses these script concepts, which are reusable in other extensions:

- `audit:file-sizes`: reports files over soft/hard line budgets.
- `audit:folder-density`: reports flat folders over file-count budgets.
- `verify:manifest`: checks that manifest-referenced files exist.
- `verify:imports`: checks that relative ES-module imports resolve.
- `verify:locales`: checks locale message coverage.
- `verify:package`: checks generated extension output for remote executable code, missing files, sourcemap policy, and manifest/package consistency.
- `verify:release`: runs release-specific packaging and policy checks.

When porting to another extension, copy the concept before copying exact thresholds. A small extension can use stricter budgets; a migrated legacy extension may need temporary notices before hard failures.

## Extension-Specific Constraints

Browser extensions add constraints that ordinary web apps do not have:

- Manifest paths are runtime contracts.
- Content-script load order can be behavior.
- MV3 service workers can stop and restart.
- Storage keys are user-data contracts.
- Sync storage has quota and item-size limits.
- Permissions must be current and explainable.
- Remote hosted code is prohibited in Chrome Web Store MV3 extensions.
- Content-script messages need validation because page-adjacent code is less trusted than background code.
- Extension pages, popups, and content scripts often need different UI/state boundaries.
- Build output, not only source, is what users and stores run.

Any modularization plan that ignores these constraints is cosmetic.

## Anti-Patterns

Avoid:

- one giant `background.js`;
- one giant `content.js`;
- one giant `options.js`;
- broad `utils.js` modules;
- tests collected into a single huge file;
- storage mutations hidden in render functions;
- raw `chrome.*` calls scattered everywhere;
- content scripts that own core business rules;
- background handlers that trust content-script messages;
- large path moves mixed with behavior changes;
- unreviewed generated output.

## Healthy End State

A healthy extension codebase has:

- feature-owned modules;
- colocated feature UI, styles, and tests where the toolchain allows it;
- thin runtime entries;
- pure tested core logic;
- explicit platform/browser wrappers;
- documented storage ownership;
- bounded diagnostics;
- feature-owned tests;
- import and manifest checks;
- package-output checks;
- file-size and folder-density audits;
- architecture docs that match the current tree.

This makes future Codex work cheaper: the next change has an obvious home, a local test area, and a clear set of checks.
