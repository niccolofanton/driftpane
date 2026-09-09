# Spec — URL config sharing ("a preset in a link")

- **Status:** Implemented (specs frozen after grilling; shipped in `src/url-share.ts` + facade wiring, with tests)
- **Owner:** @niccolofanton
- **Origin:** Tweet — _"highly advocate for creating prototypes that store config state in their url… makes it easy to collab and iterate, just share a url! we spin up prototypes and ping them around as quick links."_

---

## 1. One-line model

The URL carries **a preset with an identity**, kept in sync with the live state in realtime. Opening a link reconciles that preset against the local preset store (**import** / **overwrite**), with a key-path merge that tolerates **added/removed bindings** so collaborators iterating on a prototype can keep exchanging links (folder renames remain a known weak spot — see §6).

This feature is a **new sharing/persistence channel layered on top of the existing preset + persistence stack**. It reuses the existing scoping, structure-signature guard, and serialization wherever possible.

## 2. Goals / non-goals

**Goals**
- Make the current config shareable as a plain URL, with no extra UI step ("just copy the address bar", plus a convenience "Copy link" button).
- Treat a shared config as a first-class **preset** with stable identity, so re-sharing updates the same thing on the other side (the collaboration loop).
- Stay **dependency-free** and consistent with the all-blades UI.
- Degrade gracefully when the sender's and receiver's panes have drifted in structure.

**Non-goals**
- Real-time multi-user co-editing (no live presence/CRDT; sharing is link-based, pull-on-open).
- Sharing view chrome (theme, panel position/size, folder open/closed state). Only **config values** travel.
- Encryption / access control of shared links (see §10 privacy).

## 3. Resolved decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | URL role | A preset with identity, **live-synced** (not pure on-demand). |
| 2 | Identity | **Custom** preset → its **UUID**. **Built-in/default** preset (`custom: false`) → its **name as a marker** (not a UUID). While editing, the URL carries the **active preset's identity + the current live values** (even with unsaved edits). |
| 3 | Open behavior | UUID present in store → **overwrite** prompt. UUID absent → **import** prompt. Name-marker → **always** create a new `"<name> (imported)"` preset; **never** overwrite a default. |
| 4 | Payload | **Values only** — the preset state (scoped: without the preset folder; `expanded` stripped). No theme / position / folds. |
| 5 | Location | **Namespaced query param** `?dp:<namespace>=<payload>`, preserving all other query params and the hash. |
| 6 | Encoding | Native **`CompressionStream`** (deflate) + base64url, **zero-dependency**, with an uncompressed fallback for unsupported browsers. Versioned envelope. |
| 7 | Prompt UX | **Inline blade** at the top of the preset folder (folder auto-expands): `[Import] [Overwrite] [Discard]`. |
| 8 | Structure mismatch | **Exact structure match first** (`structureSignature`); if signatures differ → **merge by key**, where the key identity is the **folder-title path + `binding.key`** (with a fallback to the leaf key when it is globally unique). |
| 9 | What gets stored after a merge | **Re-snapshot the local pane** after applying the merged values, and store that (a first-class native preset), keeping the shared identity. |
| 10 | Sync timing | **Lazy** — starts at the first change. `history.replaceState`. Reuses the existing **debounced save** (default 300 ms). Suspended while an incoming link is awaiting the prompt. |
| 11 | API & default | **On by default**, disableable (`urlSync`, default `true`); optional `urlParamKey`; a **"Copy link"** button in the preset folder. |
| 12 | Preset dependency | `urlSync` **forces presets on** (overrides `presetsEnabled: false`). To get a pane with no preset folder, the consumer must disable **both** `presetsEnabled` and `urlSync`. |
| 13 | Open = live preview | Opening a link **applies the shared config immediately** (reversible). A `preApply` snapshot is captured first; **both URL sync and persistence writes are paused** until the user resolves the prompt, so the preview stays in-memory. `Discard` restores `preApply`. |

## 4. Data formats

### 4.1 Query parameter

```
?dp:<storageNamespace>=<encoded-envelope>
```

- One param per pane namespace, so multiple panes on one origin coexist (`dp:default`, `dp:editor`, …).
- All other query params and the URL hash are preserved on every write.
- The param key prefix is configurable via `urlParamKey` (default `dp`).

### 4.2 Share envelope (before encoding)

```jsonc
{
  "f": "driftpane-share", // format tag
  "v": 1,                 // envelope version
  "id": "<uuid>",         // present for CUSTOM presets
  "n": "<name>",          // human name (used for the marker case and prompt text)
  "d": false,             // true => default/built-in marker case (identity is the name, not id)
  "s": { /* scoped, expanded-stripped BladeState (values only) */ }
}
```

- For a **custom** preset: `id` set, `d: false`. Identity = `id`.
- For a **default** preset: `id` omitted, `d: true`. Identity = `n` (name marker).

### 4.3 Encoding pipeline

1. `JSON.stringify(envelope)`
2. `CompressionStream('deflate')` → bytes (async). On unsupported browsers, skip.
3. base64url of the bytes; prefix a 1-char codec tag (`c` = compressed, `u` = uncompressed) so decode is unambiguous.
4. Place as the param value.

Decode is the inverse, keyed off the codec tag.

## 5. Flows

### 5.1 Write (live-sync, sender side)

Triggered on the **first** change and every debounced save thereafter (reuses the persistence debounce):

1. `pane.exportState()` → `stripManagerChild` (drop preset folder) → `stripExpanded` (values only). _(Same as `PresetController.snapshot()`.)_
2. Resolve the **active preset's identity**: custom → `{id}`; default → `{name marker}`; build the envelope (§4.2).
3. Encode (§4.3) — **async, latest-wins**: tag each encode with a sequence number and drop stale results so a slow compression cannot clobber a newer one.
4. `history.replaceState` the param onto the current URL, preserving everything else.

The **"Copy link"** button is an explicit trigger: it serializes the current state into the URL **even at defaults / before any change** (bypasses lazy), **awaits the async encode**, then copies the resulting URL to the clipboard. The param remains in the address bar afterward.

### 5.2 Read (open a link, receiver side)

On load:

1. URL sync starts **suspended** (the controller is constructed paused); programmatic restores/applies must never count as the "first change" that arms lazy sync.
2. Persistence restores local state as usual (`PersistenceController.restore()`), pane refreshes — **no URL write happens** because sync is suspended.
3. Read the `dp:<ns>` param; if absent, resume sync and stop.
4. Decode the envelope (async); on failure apply the §10 versioning rules (silent ignore, or a one-time warn for a too-new `v`), resume sync, and stop.
5. Reconcile by identity → resolved action:
   - `d: true` (name marker) → **import** as `"<name> (imported)"` (idempotent by content, §10).
   - `id` present and **in store** → **overwrite** that preset.
   - `id` present and **absent** → **import** (preserving `id`).
6. Capture `preApply = pane.exportState()` (full live state) for reverting.
7. **Apply the shared config immediately as a preview** — positional if `structureSignature` matches (re-insert preset folder via `mergeManagerChild`, overlay current `expanded` via `overlayExpanded`, then `importState`), otherwise **merge-by-path** (§6); then `refresh()`. **Pause both URL sync and persistence writes** for the whole prompt window, so the preview stays in-memory only.
8. Render the inline blade prompt (§7) with `[Import]`/`[Overwrite]` (as resolved) and `[Discard]`.
9. On **Import/Overwrite**: keep the preview, store the preset (re-snapshot the local scoped state if it came through merge-by-path), set it active, persist the store; resume persistence + sync (which rewrites the URL with the now-active identity).
10. On **Discard**: re-import `preApply`, `refresh()`, resume persistence + sync; the store is untouched (next change writes the local config to the URL).

## 6. Merge-by-path algorithm (structure-mismatch path)

Used only when `structureSignature` differs.

- Build, for both the incoming state and the live pane, a map: **key = path of folder/tab titles from root + `binding.key`** → value.
- For each path present in **both**, write the incoming value onto the live binding.
- Paths only in the incoming state (binding the receiver doesn't have) are **dropped**.
- Paths only in the live pane keep their current value.
- **Fallback:** if a path has no exact match but the leaf `binding.key` is **globally unique** in the live pane, match on that key alone. If ambiguous, skip.
- **Known limitation:** the path includes folder titles, so a **renamed folder** defeats both exact match and path match for its bindings; only the unique-leaf-key fallback recovers them. Renaming a folder is therefore the main thing that silently breaks a shared link.
- Non-binding blades (buttons, monitors, separators) carry no value and are ignored.
- After applying, **re-snapshot** the live scoped state (`snapshot()`) and store it under the shared identity → the imported preset becomes structurally native for future positional applies.

## 7. UI

Inside the existing preset folder (which `urlSync` guarantees is mounted):

- **Incoming-link prompt** — a temporary section pinned to the top, shown when a valid `dp:` param is detected on load. By then the shared config is **already applied as a live preview** (§5.2). Text: `Shared preset "<name>"` plus context (`already in your presets — overwrite?` / `import as new?` / `from a different pane — values merged` / `overwriting with possibly-unsaved values`). Buttons: `[Import]`/`[Overwrite]` (as resolved) to keep + save, and `[Discard]` to revert to your previous state. The folder auto-expands so it cannot be missed. The section is removed after the user acts.
- **"Copy link" button** — always present when `urlSync` is on. Serializes current state into the URL and copies it.

## 8. Public API (additions to `DriftpaneOptions`)

```ts
/** Enable URL config sharing (live-synced shareable link). Default: true.
 *  Forces the preset menu on (the share UI lives in the preset folder). */
urlSync?: boolean;

/** Prefix for the namespaced query param (`<prefix>:<storageNamespace>`).
 *  Default: 'dp'. */
urlParamKey?: string;
```

Programmatic surface (tentative, to confirm in PRD):
- `driftpane.copyShareLink(): Promise<string>` — build + copy + return the URL.
- `driftpane.shareUrl(): string` — build the URL without copying.
- `driftpane.clearShareUrl(): void` — remove our param via `replaceState`, preserving the rest (the v1 "stop sharing").

## 9. Implementation map (existing modules)

- **New `src/url-share.ts`** (`UrlShareController`): envelope build/parse, encode/decode (CompressionStream + fallback), read/write the namespaced query param with preserve-everything-else, async latest-wins sequencing, suspend/resume.
- **`src/state-scope.ts`**: add a **merge-by-path** function next to `structureSignature` / `mergeManagerChild` / `overlayExpanded`.
- **`src/presets.ts`**: identity-based reconcile (uuid / name marker), import/overwrite, re-snapshot-after-merge, `"<name> (imported)"` naming.
- **`src/preset-menu.ts`**: inline prompt section + "Copy link" button + auto-expand.
- **`src/driftpane.ts`**: orchestration — wire sync to the persistence debounced save + active-preset identity; load-time decode + prompt; force presets on when `urlSync`.
- **`src/types.ts`**: `urlSync`, `urlParamKey`.
- **`src/persistence.ts`**: add `pause()`/`resume()` (a `paused` flag short-circuiting `scheduleSave`/`saveNow`, symmetric to the existing `disposed`) so the load-time preview window writes nothing to localStorage.
- **`src/storage.ts`**: unchanged (URL is a separate channel from localStorage).

## 10. Edge cases & handling

- **Privacy:** the param lands in **referer headers and server logs** (query, not hash). Document as a caveat: fine for prototype config, not for sensitive values. The payload is **not encrypted**.
- **Over-long URLs:** soft threshold **2000 chars on the encoded param value**; beyond it → `console.warn` **once per session** and **write anyway** (never truncate — it would corrupt the payload). A realistic ~40-binding pane lands near this after compression, so it is a real case. A configurable `urlMaxLength?` is deferred.
- **Duplicate `"<name> (imported)"`:** import is **idempotent by content** — if a preset with the same base name **and** identical `state` (`JSON.stringify`, as `isModified()`) already exists, activate it instead of duplicating. Otherwise create a numbered name: `"<name> (imported)"`, then `"(imported 2)"`, `"(imported 3)"`, … (presets currently have no name dedup, so this is the first such rule).
- **Overwrite with unsaved edits:** because the URL carries live (possibly unsaved) values under the active preset's identity, an `Overwrite` replaces the receiver's saved preset with the sender's current (maybe unsaved) state. This is intended (the iteration loop) but should be surfaced in the prompt copy.
- **Stop sharing:** v1 ships **only** a programmatic `driftpane.clearShareUrl()` (removes our param via `replaceState`, preserving the rest). No UI button — a "pause for the session" toggle is ambiguous under the live+lazy model (the next change rewrites the URL) and is deferred.
- **Envelope versioning (defensive, mirrors `storage.ts`):** `f !== "driftpane-share"` → ignore silently (could be another tool's param). Decode/parse failure or invalid `s` → ignore silently (optional `console.debug`). `v` **higher** than supported → ignore + **one-time `console.warn`** ("this link was created with a newer driftpane — update to open it"). The URL path **never throws to the user**. Future lower `v` → migrate when defined, else best-effort of known fields.
- **`importState` requires `expanded`:** the payload strips it, so the apply path must overlay the current `expanded` (`overlayExpanded`) before `importState`, exactly as the preset-apply path already does.
- **No active preset (`activeId === null`):** define a fallback identity — treat as the Default name-marker, or skip writing — so live-sync always has something to stamp the URL with.
- **Clipboard:** `navigator.clipboard` needs a secure context (https/localhost). Provide a fallback (select-and-copy) or disable "Copy link" gracefully on insecure origins.
- **Multi-namespace "Copy link":** the copied URL is the whole address, including any sibling pane's `dp:` params — sharing one pane also shares the others' state. Acceptable, but note it.
- **Host router interaction:** an SPA host that rewrites its own URL on navigation may drop our param (re-added on the next save); our `replaceState` and the host router can race.
- **Readonly monitors (continuous `change` noise):** readonly bindings (graphs, fps, ...) emit a root `change` event on (almost) every frame. A plain trailing-edge debounce would be perpetually reset and never write, so the URL would never update during animation. The fix: the shared snapshot is run through `stripReadonly` (readonly values → `null`, structure kept) and the change handler **dedupes** against the last snapshot — monitor noise leaves the normalized snapshot identical, so only real user edits arm the write. This also keeps monitor readouts out of the shared link. (The same noise blocks persistence's debounce too, which still saves via its `pagehide`/`visibilitychange` flush.)
- **Self-skip:** opening a link whose (readonly-stripped) state equals the current local state — e.g. your OWN live-synced URL on reload — does not prompt; sync just resumes. So the live URL never re-prompts you to import your own config.
- **Testing note:** `CompressionStream` is present in the project's Node (v24) and jsdom does not strip Node globals, so it is very likely available under vitest+jsdom — confirm with one test; otherwise exercise the uncompressed fallback. Not a blocker.

## 11. Acceptance criteria

1. With `urlSync` on, changing a value updates `?dp:<ns>=` via `replaceState` (after the debounce window; encode is async), preserving other query params and the hash.
2. No param is written until the first change (lazy); "Copy link" writes/copies on demand even at defaults.
3. Opening any valid link **applies the shared config immediately as a preview**, with URL sync **and persistence paused**; closing the tab without choosing persists nothing.
4. Opening a link whose UUID is **not** in the store shows an **Import** prompt; accepting adds + activates the preset and persists it.
5. Opening a link whose UUID **is** in the store shows an **Overwrite** prompt; accepting replaces that preset's state.
6. Opening a default-marker link always offers **Import** as `"<name> (imported)"` and never overwrites a default.
7. Re-opening the **same** link is idempotent: an identical (name + state) preset is **activated, not duplicated**; otherwise the new one gets a numbered `"(imported N)"` name.
8. Opening a link from a structurally **different** pane applies matching values by folder-path+key, drops non-matching ones, and stores a re-snapshotted native preset.
9. `Discard` reverts to the pre-open state (re-imports the `preApply` snapshot), leaves the store untouched, and resumes sync + persistence.
10. An encoded value over the soft threshold (2000 chars) logs a one-time `console.warn` and is still written.
11. A link with an unsupported envelope `v` leaves the store untouched and logs a one-time warning; a wrong `f` or corrupt payload is ignored silently.
12. With an unsupported `CompressionStream`, links still encode/decode via the uncompressed fallback.
13. Setting `presetsEnabled: false` while `urlSync` is on still mounts the preset folder (forced on); setting both to false removes it.
14. Disabling `urlSync` writes nothing to the URL and reads nothing from it.

## 12. Release note

Default-on behavior that **mutates the host app's URL** and **forces the preset folder on**. This is a behavior change on upgrade → ship as a **major version** with a prominent CHANGELOG entry and a migration note (`urlSync: false` to opt out).
