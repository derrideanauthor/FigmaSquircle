# Squircle Frame – Figma Plugin

A Figma plugin that applies persistent, intelligent squircle corner behaviour to frames using native corner radius and corner smoothing.

## What It Does

Figma has corner smoothing, but lacks a system for:
- maintaining consistent squircle character across resizing
- adapting corners to changing width/height
- storing reusable squircle behaviour on frames
- refreshing those behaviours after the plugin is closed

Squircle Frame solves this by storing compute models and parameters on each managed frame as plugin data, then applying and recalculating corner radius + smoothing automatically.

## V1 Scope and Limitations

- **Supported nodes:** FrameNode only
- **No vector conversion** – uses Figma's native `cornerRadius` and `cornerSmoothing`
- **No per-corner smoothing** – Figma supports one smoothing value per node
- **No background automation** – recalculation requires the plugin to be open
- **No design token integration**
- **No team preset sync**

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
```

### Build

```bash
npm run build        # production build
npm run build:dev    # development build (with source maps)
npm run watch        # watch mode
```

### Run Tests

```bash
npm test
```

### Type Check

```bash
npm run typecheck
```

## Loading in Figma

1. Run `npm run build` (or `npm run build:dev`)
2. Open Figma Desktop
3. Go to **Plugins → Development → Import plugin from manifest**
4. Select `manifest.json` from this directory

## Architecture

```
src/
├── types.ts           # All TypeScript interfaces and types
├── models.ts          # Default settings and preset definitions
├── constraints.ts     # Shared constraint layer (pure function)
├── compute.ts         # Squircle compute engine (pure functions)
├── storage.ts         # Plugin data read/write/clear helpers
├── selection.ts       # Node filtering and selection utilities
├── watcher.ts         # Live frame change detection + apply
├── ui-message-handler.ts  # Handles messages from UI in plugin context
├── main.ts            # Plugin entry point (Figma sandbox)
├── ui.html            # HTML template for the plugin UI
└── ui.ts              # UI logic (browser context)
```

**Build output** goes to `dist/` (two bundles: `main.js` and `ui.html`).

### Module Responsibilities

| Module | Context | Purpose |
|--------|---------|---------|
| `types.ts` | shared | Type definitions only |
| `models.ts` | shared | Defaults and presets |
| `compute.ts` | shared | Pure compute algorithms |
| `constraints.ts` | shared | Pure constraint application |
| `storage.ts` | plugin | Plugin data persistence |
| `selection.ts` | plugin | Node filtering |
| `watcher.ts` | plugin | Document change listener |
| `ui-message-handler.ts` | plugin | Message dispatch |
| `main.ts` | plugin | Plugin lifecycle |
| `ui.ts` | browser | UI event handling |

## Squircle Models

### Fixed

Applies a designer-specified radius, either as an absolute value or proportional to the short side of the frame. Best for cards and components where you want deliberate control.

```
radius = clamp(baseRadius OR S * radiusFactor, minRadius, min(maxRadius, S/2))
smoothing = clamp(baseSmoothing, minSmoothing, maxSmoothing)
```

### Adaptive

Derives corner treatment purely from frame dimensions. Best for responsive elements like chips, buttons, and auto-layout containers.

```
sizeBasisValue = depends on chosen basis (shortSide, mean, width, height)
base = sizeBasisValue * radiusScale
radius_i = clamp(base * weight_i, minRadius, min(maxRadius, S/2))
aspectPenalty = max(0, (AR - 1) * aspectSensitivity)
smoothing = clamp(targetSmoothing - aspectPenalty, minSmoothing, maxSmoothing)
```

### Smart Adaptive (default)

Blends a designer-specified radius at a reference size with adaptive scaling based on the actual frame size. The default general-purpose mode.

```
sizeFactor = (S / referenceSize) ^ responseStrength
aspectComp = 1 / AR ^ aspectSensitivity
radius_i = clamp(designRadius_i * sizeFactor * aspectComp, minRadius, min(maxRadius, S/2))
aspectPenalty = max(0, (AR - 1) * aspectSensitivity * 0.2)
smoothing = clamp(designSmoothing - aspectPenalty, minSmoothing, maxSmoothing)
```

## Presets

| Preset | Model | Character |
|--------|-------|-----------|
| Subtle | smartAdaptive | Conservative radius/smoothing |
| Balanced | smartAdaptive | Default general-purpose |
| Bold | smartAdaptive | Strong radius/smoothing |
| Pill Adaptive | adaptive | Short-side driven, pill-like |

## Plugin Data Format

Each managed frame stores data under the plugin data key `squircleFrame`:

```json
{
  "version": 1,
  "managed": true,
  "model": "smartAdaptive",
  "preset": "Balanced",
  "settings": { "...model-specific fields..." },
  "constraints": { "minRadius": 2, "maxRadius": 999, "..." },
  "lastComputed": {
    "width": 320,
    "height": 180,
    "radii": [24, 24, 24, 24],
    "smoothing": 0.6,
    "timestamp": 1710000000000
  }
}
```

Data is validated on read. Invalid or missing data is treated as unmanaged.

## User Workflows

### First Apply
1. Select one or more frames
2. Open the plugin
3. Choose a model or preset, adjust settings
4. Click **Apply to Selection**

### Live Editing
- While the plugin is open, managed frames are watched for dimension changes
- Corners are recalculated automatically with a ~100ms debounce

### Reopen / Catch-up
- On reopen, click **Refresh Managed in Selection** or **Refresh Managed on Page**
- This recalculates all managed frames based on their current dimensions

### Edit a Managed Frame
- Select the managed frame – settings load automatically into the UI
- Adjust and click **Apply to Selection**

### Remove Management
- Select managed frames and click **Remove Management**
- Corner values are left as-is; only the plugin data is removed

## Known Limitations and V2 Ideas

### Known Limitations
- Background recalculation is not possible (Figma plugin API constraint)
- Smoothing is per-node, not per-corner
- ComponentNode / InstanceNode not supported in V1

### V2 Ideas
- ComponentNode / InstanceNode support
- Team preset sync via plugin storage
- Design token integration
- Import/export preset files
- Per-frame override UI in properties panel
