# Spec — URL config sharing ("a preset in a link")

- **Status:** Implemented in `src/url-share.ts`, preset controllers and the facade; this document describes the current working tree.
- **Owner:** @niccolofanton

## 1. Model and scope

The URL carries the **active preset's identity and current live values**, including
unsaved edits. Opening a link previews its configuration and offers Import,
Overwrite or Discard. This is link-based sharing, not simultaneous collaboration.

Theme, panel position/size, folder expansion and selected tab pages stay local.
The payload is not encrypted; query parameters can appear in server logs and,
depending on referrer policy, referrer headers. Avoid sensitive configuration.

## 2. Defaults and timing

| Setting | Behavior |
|---|---|
| `urlSync` | `true` by default; forces the preset menu on. |
| `urlParamKey` | `'dp'`; full query key is `<prefix>:<storageNamespace>`. |
| `debounceMs` | `300` by default; URL sync and localStorage use separate debounces with this delay. |
| First write | Lazy: a value or preset-identity change schedules it; startup restore alone does not. |
| Explicit copy | Copy link encodes and writes immediately, even before any edits. |
| No menu | Set both `presetsEnabled: false` and `urlSync: false`. |

Preset saves, renames, overwrites and active-preset changes notify URL sync even
when no binding value changes. Deduplication compares identity plus normalized
state, so changing a preset's name or ID is significant.

## 3. Query and envelope formats

One parameter per pane namespace permits multiple panels on one page:

```text
?dp:<storageNamespace>=<encoded-envelope>
```

Writes use `history.replaceState` and preserve other query parameters and the
hash. Building a copied URL preserves sibling panels' share parameters too.

```jsonc
{
  "f": "driftpane-share",
  "v": 1,
  "id": "<uuid>", // custom presets only
  "n": "<name>",
  "d": false,     // true means built-in/default name-marker identity
  "s": { /* scoped state without local navigation */ }
}
```

- Custom presets carry their UUID and `d: false`.
- Default/built-in presets carry a name marker with `d: true`; no UUID is needed.
- State excludes the manager folder, `expanded` flags, tab-page `selected` and
  derived `hidden` flags. Ordinary controls retain their own visibility fields.
- Readonly binding values are normalized to `null`, retaining the tree shape.
  They do not become shared editable values.

## 4. Encoding

1. Serialize the envelope with `JSON.stringify`.
2. Compress asynchronously with `CompressionStream('deflate')` when available;
   otherwise use uncompressed bytes.
3. Encode with base64url and prepend a codec tag: `c` compressed, `u` uncompressed.
4. Store as the namespaced parameter value.

Decode uses the tag to reverse this process. A compressed payload requires
`DecompressionStream` on the receiving browser; unsupported or malformed input
is ignored. An uncompressed payload does not require compression support.

Each write has a sequence token. Stale encodes cannot replace a newer write;
clear, suspend and disposal also prevent outdated writes from updating the URL.

## 5. Sender flow

A value change or preset-store notification reaches `UrlShareController`:

1. Export the live state and remove the actual manager folder by its current index.
2. Strip local navigation and normalize readonly monitor values.
3. Compare the normalized state **and active identity** to the last snapshot.
4. If changed, schedule the independent URL debounce.
5. Build and encode the envelope, then replace the parameter if this is still
   the latest permitted write.

Readonly-monitor changes alone do not repeatedly reset the timer. Persistence
uses equivalent monitor-noise deduplication for scheduling, while saving the
full scoped live state at flush time.

`copyShareLink()` bypasses the debounce, writes the parameter, awaits encoding
and copies the resulting URL. `shareUrl()` builds a URL without changing the
address bar. Without an active identity, these paths return the current URL
without adding a payload.

While an incoming preview is pending, both methods return the incoming URL;
they do not publish preview values under the recipient's local preset identity.

## 6. Receiver flow

1. Restore local persistence and refresh the pane before attaching URL sync.
2. If an incoming parameter exists, suspend URL sync and decode asynchronously.
   If the Driftpane instance is disposed during decode, stop without applying it.
3. Ignore invalid input, resuming sync. If the incoming normalized state and
   active preset identity already match the local ones, skip the prompt and
   resume sync. For a matching custom UUID, restamp a stale URL name from the
   local preset.
4. Resolve the identity: a matching **custom** UUID offers Overwrite; an unknown
   UUID or default marker offers Import. A default baseline is never overwritten.
5. Pause persistence, capture the full `preApply` snapshot, and apply the preview:
   positional import for matching structures, otherwise the value merge below.
   Preserve local navigation and synchronize the tab selection model after import.
6. Refresh and emit `onStateApplied('share')`. Show the prompt at the top of the
   preset folder and expand that folder. Preview values remain unpersisted while
   the prompt is pending.
7. **Import/Overwrite:** snapshot the preview into a native local preset, activate
   it, save accepted state, resume persistence/sync, and restamp the URL.
8. **Discard:** restore `preApply`, refresh, emit `onStateApplied('share-discard')`,
   remove the incoming parameter, and resume persistence/sync. The preset store
   is unchanged.

An unsuccessful preview import rolls back the captured pane state and resumes
the controllers without showing the acceptance prompt.

## 7. Structure mismatch and identity reconciliation

Structure signatures include folder/tab titles, child order, binding keys,
labels and readonly status. On mismatch, values are merged into the **live**
structure rather than importing an incompatible tree positionally:

- Exact identity is the folder/tab-title path plus `binding.key`.
- Values with matching paths are copied; bindings missing on either side do
  not replace unrelated controls.
- A leaf key can be used as a fallback when it is globally unique on both sides.
  Ambiguous matches are skipped.
- Readonly bindings are excluded from the editable-value merge. Non-binding
  blades retain the live structure.
- Renamed folders can use the unique-key fallback; repeated keys without an
  unambiguous path cannot be recovered this way.
- Accepting the preview stores a fresh local snapshot so future preset applies
  use the receiving pane's structure.

Unknown custom UUIDs are retained on import. Default-marker imports deduplicate
by serialized state: if an equivalent preset exists it is activated, regardless
of its name. Otherwise a new custom preset is named `<name> (imported)`, with
`(imported 2)`, `(imported 3)`, etc. on name collisions. They do not replace the
receiver's factory Default.

## 8. Public API and UI

```ts
interface DriftpaneOptions {
  urlSync?: boolean;    // default true; forces the preset menu on
  urlParamKey?: string; // default 'dp'
  debounceMs?: number;  // default 300; separate storage/URL debounces
}

// Methods on the returned Driftpane instance:
const url: string = await panel.shareUrl();
const copiedUrl: string = await panel.copyShareLink();
panel.clearShareUrl();
```

- `shareUrl(): Promise<string>` builds the current share URL without writing it.
- `copyShareLink(): Promise<string>` writes, attempts clipboard copy and returns
  the URL. A select-and-copy fallback is used when the Clipboard API is unavailable.
- `clearShareUrl(): void` removes this panel's parameter, cancels its queued
  debounce and invalidates in-flight encodes. A subsequent value or identity
  change may create another parameter; clear is not a permanent disable switch.

With `urlSync: false`, share methods return the current URL and the controller
neither reads nor synchronizes a share parameter.

The preset folder contains **Copy link** when URL sync is enabled. Incoming
preview cards offer **Import** or **Overwrite**, plus **Discard**. Folder
expansion and card insertion are local UI changes.

## 9. Validation and operational limits

- Wrong format tags, invalid state shapes, or decode/parse failures are ignored.
  A future envelope version is ignored with a once-per-controller warning.
- An encoded parameter over 2,000 characters triggers a warning once per
  controller and is still written; it is not truncated.
- Copying one panel's URL includes any sibling panels' parameters already there.
- An SPA router may remove the parameter; a later value or identity change can
  recreate it. URL writes preserve unrelated parameters at the time of writing.
- Disposing a panel cancels queued writes, rejects completed stale encodes and
  prevents late incoming-decode results from applying state.

## 10. Implementation and verification

| Module | Responsibility |
|---|---|
| `url-share.ts` | Encode/decode, parameter preservation, write sequencing, debounce, clear/suspend/resume. |
| `state-scope.ts` | Manager scoping, structure signatures, navigation overlays, tab synchronization and value merge. |
| `presets.ts` | Active identity, store notifications, reconciliation and import naming. |
| `preset-menu.ts` | Incoming card, Copy link and active selector synchronization. |
| `driftpane.ts` | Restore ordering, incoming preview, lifecycle guards and accept/discard orchestration. |
| `persistence.ts` | Separate debounced storage, preview pause/resume and monitor-noise filtering. |

Tests cover encoding, identity-only changes, stale write cancellation,
preset reconciliation, preview/accept/discard, disposal during decode,
navigation preservation and monitor-noise handling. Real Tweakpane regressions
exercise behavior the lightweight pane double cannot represent.

## 11. Migration note

URL sharing is **on by default**: it can modify the host page's query string and
forces the preset folder on. Set `urlSync: false` to opt out of sharing; also set
`presetsEnabled: false` if no preset folder is wanted. This note describes current
behavior and does not assign a new published version or release date.
