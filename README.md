# OSM Sound demo (MachGL)

A port of [osm-sound-demo](https://github.com/smellman/osm-sound-demo) from MapLibre GL JS to [MachGL](https://www.geolonia.com/news/2026-11-16-machgl-release/).

MachGL is loaded from cdn.geolonia.com, and builds the map from the `data-*` attributes of `#map` in `index.html` (the attributes of Geolonia Embed):

```html
<div
  id="map"
  data-style="https://tile.openstreetmap.jp/styles/maptiler-toner-ja/style.json"
  data-lat="35.680655"
  data-lng="139.767165"
  data-zoom="16"
  data-pitch="60"
  data-marker="off"
  data-hash="on"
  data-navigation-control="off"
></div>
<script src="https://cdn.geolonia.com/machgl/main/?geolonia-api-key=YOUR-API-KEY"></script>
```

`src/main.ts` gets the map with `new geolonia.Map('#map')`, and uses its MapLibre GL JS compatible API, plus `setMaxFrameRate()` of MachGL.

`YOUR-API-KEY` is Geolonia's demo key. It works on `localhost` and on [free hosting such as GitHub Pages (`*.github.io`)](https://docs.geolonia.com/explanation/free-referers/). A custom domain needs an API key of your own.

## Differences from the original

- No `maplibre-gl` or `pmtiles` packages. The style's own vector tiles are used instead of the PMTiles file.
- The style is `maptiler-toner-ja`, loaded as is; the sky is set with `map.setSky()` once the map has loaded.
- The buildings move in 16 height steps. Measured with MachGL in Chromium, a new `fill-extrusion-height` took about 3 s to show, so setting it every frame (as the original does) left the buildings flat, while a new `visibility` showed in the next frame. So each group of buildings (16 frequency bins, or 24 rings in wave mode) has one layer per height step, and each frame switches which one is visible. Each frame also moves the shown height only part of the way to the music's (`riseRate` up, `fallRate` down), so the buildings pass through the steps in between instead of jumping. `heightSteps` in `src/main.ts` sets the number of steps: 16 steps (256 layers) loaded in about 1 s, 32 steps in about 2.5 s.
- `map.setMaxFrameRate(null)` lifts MachGL's default limit of 30 frames per second. Measured in Chromium and Firefox (Apple M2 Pro), the map then drew 60 frames per second while playing, instead of 30.
- The pitch is 60° instead of 70° (the first view, Fly To and Locate Me). On a 2560x1440 screen with pixel ratio 2 in Firefox, 70° loaded 26 tiles up to the horizon and drew 44 frames per second while turning; 60° loaded 9 tiles and drew 60.
- The pixel ratio is lowered so that the map's canvas stays under 4 million pixels (`maxCanvasPixels` in `src/main.ts`), with `map.setPixelRatio()`. The 5120x2772 canvas of that screen drew 50 frames per second even without turning, and 60 at about 3.5 million pixels.
- The buildings use a source of their own (`buildings`, the same tiles as the style). Changing the filter of the wave rings then settled in about 0.2 s instead of about 3 s.

## How to run

```bash
pnpm install
pnpm run dev
```

## License of the code

MIT License

# Demo Music

All music in this demo is from the [Otherman Records](https://www.otherman-records.com/).

## License of the music

CC BY-NC 2.1 JP

# VJ mode

## For Linux

Test on Ubuntu Studio 25.04 + PipeWire.

```bash
pactl load-module module-remap-source master=VirtualSink.monitor source_name=VirtualMic source_properties=device.description=VirtualMic
```

To check connection, please use Helvum.

![Helvum screenshot](https://i.gyazo.com/3e7d026299a4966a1c306ce6a911385f.png)

## For macOS

You need to install [Loopback.app](https://rogueamoeba.com/loopback/).

![Loopback screenshot](https://i.gyazo.com/051fe278806212ef0061b2d18acd7359.png)
