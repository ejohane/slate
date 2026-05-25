# Slate

Slate is a minimal, native-feeling Markdown editor built with Electron, Vite, React, Markdown-It, and DOMPurify.

## What works

- Document mode: clean rendered Markdown, with raw Markdown syntax exposed only in the active block.
- Native macOS-style window chrome with a hidden title bar.
- Native File menu actions for Open, Save, and Save As.
- Open and save real `.md` files directly from disk.
- Open multiple workspace folders at once, with each selected folder in its own window.
- Browser file API fallback when running the web build alone.
- Plugin-shaped renderer extension point in `src/core/editorPlugins.ts`.

## Run

```sh
npm install
npm run dev
```

This starts Vite and launches the Electron desktop app.

## Build

```sh
npm run lint
npm run build
npm run start
```

## Core shape

- `src/components/HybridMarkdownEditor.tsx` provides the clean hybrid document surface.
- `src/core/renderMarkdown.ts` owns Markdown rendering, sanitization, and small HTML caches for responsiveness.
- `src/core/fileAccess.ts` chooses Electron native file APIs first, then browser fallbacks.
- `electron/main.cjs` owns the native window, menus, dialogs, and disk I/O.
- `electron/preload.cjs` exposes a narrow, context-isolated bridge to the renderer.
