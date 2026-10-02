# UniEarth

**A new way to explore our planet.**

[Explore UniEarth](https://uniearth.org/) · [Open the interactive map](https://uniearth.org/map.html)

[![UniEarth interactive world map preview](https://uniearth.org/assets/social-preview.png)](https://uniearth.org/)

UniEarth is a free, browser-based interactive atlas for exploring the world through geography and public data. Move from a global view to Chinese provinces and US states, compare places through population and economic indicators, and inspect detailed information without creating an account.

The project is a static web application built with vanilla JavaScript, SVG and WebGL. Map data is stored in the repository, so the online map does not depend on external map tiles or a third-party map service.

## Highlights

- **241 countries and territories** rendered from Natural Earth 1:50m boundaries.
- **85 provincial and state regions** across China and the United States.
- **Five data views**: population, area, population density, total GDP and GDP per capita.
- **Three projections**: Equal Earth, Web Mercator and Equirectangular.
- **Interactive discovery** through search, pan, zoom, hover details, pinned selections, rankings and neighboring-country navigation.
- **English and Simplified Chinese UI** with localized labels, place names, units, currencies and search.
- **Offline-ready map** distributed as a self-contained `world-map.html` file.
- **No account, ads or external map API required.**

## Map coverage

| Level | Coverage | Available information |
| --- | --- | --- |
| World | Countries and territories | Capital, region, population, area, density, GDP, GDP per capita, languages, currencies, coordinates and land borders |
| China | Provincial-level divisions | Population, area, density, administrative center and national share |
| United States | States and Washington, D.C. | Population, area, density, capital and national share |

Color scales and top-ten rankings update with the selected geography and metric. Missing values remain visibly unavailable rather than being treated as zero.

## Interaction and shortcuts

| Input | Action |
| --- | --- |
| Search box | Find countries, Chinese provinces or US states in English or Chinese; country ISO codes are also supported |
| Mouse wheel or trackpad | Zoom the map |
| Drag | Pan the map |
| Hover | Preview geographic details |
| Click | Pin a place and open its full data panel |
| `1` / `2` / `3` | Switch between World, China and USA maps |
| `/` | Focus search |
| `R` | Reset the current map view |
| `F` | Enter or exit fullscreen |
| `Esc` | Clear the current selection |

## Pages and entry points

| File | Purpose |
| --- | --- |
| `index.html` | Product homepage, rotating WebGL globe, feature overview and map entry points |
| `map.html` | Main multi-file interactive map |
| `world-map.html` | Generated standalone map with styles, scripts and data inlined for offline use |

The interface defaults to English. A selected language is stored locally and can also be set with `?lang=en` or `?lang=zh`. Language switching preserves map mode, metric, zoom, selection, search context and URL state.

## Quick start

No application server or build step is required for normal local use. Start any static HTTP server from the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8765/
```

Opening files directly also works for the standalone map:

```text
world-map.html
```

## Architecture

- `app.js` contains map projection, rendering, interaction, search, ranking and data-panel logic.
- `i18n.js` contains shared map translations and localized formatting helpers.
- `home.js` localizes the homepage and keeps language state aligned with the map.
- `home-globe.js` maps Natural Earth 1:50m geometry onto the animated WebGL globe.
- `data.js` contains world geography metadata and statistical values.
- `data-sub.js` contains China provincial and US state geometry and metadata.
- `theme.css`, `home.css` and `styles.css` provide the shared design system and page-specific layouts.
- `assets/earth.svg` is the static homepage globe fallback generated from Natural Earth 1:110m data.

## Data sources

| Data | Source |
| --- | --- |
| World boundaries | Natural Earth 1:50m via `world-atlas` |
| Country metadata | `world-countries` / `mledoze` |
| Country population and GDP | World Bank Open Data |
| China provincial boundaries | Alibaba Cloud DataV |
| US state boundaries | `us-atlas` `states-10m` |
| Provincial and state statistics | Wikidata; observation years vary by region |

Source information is also shown inside the map. The repository keeps the processed datasets locally so the interface remains fast and deterministic.

## Rebuilding generated assets

Regenerate the standalone offline map after changing map source files:

```sh
python3 make_single.py
```

Regenerate the homepage globe fallback:

```sh
python3 build_home_globe.py
```

The source-data builders are:

```sh
python3 build.py
python3 build_sub.py
```

These builders may require their documented upstream input files and network access. Generated runtime data is already committed, so they are not required for normal development.

## Verification

The repository includes focused regression scripts:

```sh
node dev-i18n.js
node dev-smoke.js
node dev-seo.js
```

The tests use `jsdom`. If it is installed outside the repository, point the scripts to it with `JSDOM_PATH`:

```sh
JSDOM_PATH=/path/to/node_modules/jsdom node dev-i18n.js
```

Useful syntax and generated-file checks:

```sh
node --check app.js
node --check home.js
node --check home-globe.js
git diff --check
```

## SEO and social sharing

The production URL is configured in `seo-config.json` and currently points to `https://uniearth.org/`. The homepage and map have separate titles, descriptions, canonical URLs, Open Graph metadata, Twitter cards and JSON-LD. Language switching also updates visible metadata at runtime.

Regenerate SEO blocks and the standalone map after changing SEO configuration:

```sh
python3 build_seo.py
python3 make_single.py
```

For a new domain:

```sh
python3 build_seo.py --site-url https://example.com/
python3 make_single.py
```

The social preview is `assets/social-preview.png` at 1200 × 630 pixels. Regenerate it with:

```sh
python3 build_social_preview.py
```

The image builder requires Pillow and uses Arial on macOS or DejaVu Sans on Linux.

## Deployment checklist

Deploy the repository as a static site and include:

- `seo.js`
- `robots.txt`
- `sitemap.xml`
- `assets/social-preview.png`

After deployment:

1. Verify that the homepage, map, sitemap, robots file and social image return successful responses.
2. Submit `https://uniearth.org/sitemap.xml` to Google Search Console and Bing Webmaster Tools.
3. Use each search engine's URL inspection tools to confirm canonical URLs and rendered content.
4. Monitor indexing, search performance and Core Web Vitals after the site has been crawled.

The sitemap lists only the homepage and online map. Parameterized map URLs and `world-map.html` use canonical URLs to consolidate indexing signals. Do not block the offline map or its scripts in `robots.txt`, because crawlers still need to read the canonical metadata.
