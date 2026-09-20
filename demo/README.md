# Driftpane playground

Minimal interactive showcase of all eight custom features, plus full backups,
`onStateApplied`, independent namespaces and runtime controls. It builds on the
original wave preview and Tweakpane control gallery. The page uses the package's
public API and the same `theme.css` shipped to consumers.

```sh
npm install
PATH="$PWD/node_modules/.bin:$PATH" bash demo/build.sh
python3 -m http.server 8080
# http://localhost:8080/demo/
```

Compiled files are included. Tweakpane 4.0.5 is loaded through the existing CDN
import map; Geist uses Google Fonts, with system-font fallbacks.

| Demo area | What to try |
|---|---|
| Signal studio + persistence | Shuffle or edit bindings, reload, compare the saved speed. Clear saved values while retaining presets/layout. |
| Drag & resize | Drag the live title bar; use right, bottom or corner handles. Set width/height, reset position, disable/re-enable dragging. |
| Folders & tabs | Open nested folders and switch gallery pages. Reload or apply a preset; navigation stays local. |
| Presets | Save as new, edit, Restore; use the panel menu for Save changes, Rename, Delete, Export and Import. Default is protected. |
| Theme | Switch Auto / Light / Dark on the page or panel. Page and main panel follow the resolved main theme; the independent panel keeps its own. |
| Scroll & popups | Open color or Point2D with a compact height cap. Restore the default cap. |
| URL sharing | Build a URL without changing the address bar, Copy link, Clear URL, or Open receiver. Edits and preset identity synchronize automatically. |
| Sidepanel | Choose floating, hover or push; switch left/right, width, open/close and mobile fallback. |
| Full backup | Export all, change values/layout/theme, then import the file. The custom collection is replaced; local Default remains. |
| Apply hook | Watch real restore/preset/share/share-discard callbacks in the event feed. |
| Independent panel | Edit the secondary signal in a separate namespace. Add runtime controls, fold them, reload. This instance disables drag, resize, presets and URL sync. |

The sender uses namespace `showcase`; the receiver uses `showcase-receiver`.
Each has a separate `-independent` namespace for its embedded secondary panel.
Runtime folder presence uses a small demo-only metadata key so the demo can
recreate the same control structure before restoring its values.

To exercise sharing: save a custom preset, change a value, Open receiver and
Import. Change it again in the sender and reopen the receiver to try Overwrite
or Discard. Identical values correctly need no preview prompt. While a preview
is pending, accept or discard it before importing a full backup.

The top toolbar selects Floating, Sidepanel hover or Sidepanel push. Other feature
controls sit in compact disclosure sections below the preview. On mobile the
panel starts closed; Toggle controls opens it.
Previously saved navigation still wins. Reduced-motion preferences stop the
wave animation; changing parameters still updates the preview.

`window.driftpane` exposes the main instance; `window.driftpaneDemo` exposes the
pane and bound objects for manual inspection. They are demo conveniences, not
additional package APIs.
