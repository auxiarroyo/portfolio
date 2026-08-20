# Portfolio — Auxi Arroyo García

The portfolio site of Auxi Arroyo García, exported out of Framer into plain
React source and built as a fully static site for GitHub Pages.

Nothing the deployed site loads comes from Framer: all 144 images, the favicon
and the social preview image are committed to this repository.

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # full static build into dist/
npm run preview  # serve the built site
```

> When previewing locally, use trailing slashes (`/projects/`, not `/projects`).
> `vite preview` falls back to the home page for extensionless paths; GitHub
> Pages resolves them correctly either way.

## How it works

Every page of this site was already a single self-contained React component in
Framer, which is what makes a clean export possible. The build has three steps,
run in order by `npm run build`:

1. **`vite build`** — bundles the client and code-splits each page into its own
   chunk, so a visitor downloads only the page they asked for.
2. **`vite build --ssr`** — bundles the same pages for Node.
3. **`scripts/prerender.mjs`** — renders every route to real HTML.

That third step is the important one. GitHub Pages does no server-side
rewriting, so a normal single-page app 404s on any deep link. Instead each route
is written out as its own document (`dist/about/index.html`, …), so deep links,
refreshes, crawlers and no-JS visitors all get complete markup. React then
hydrates it in the browser.

There is deliberately **no client-side router** — every page is an independent
document and navigation is ordinary anchors.

## Layout

| Path | What it is |
| --- | --- |
| `site.config.js` | Base path, site metadata, and the route table. **Start here.** |
| `src/pages/*.tsx` | The 11 page components, exported from Framer essentially verbatim. |
| `src/framer/index.tsx` | Local stand-in for Framer's runtime — the only translation layer. |
| `src/entry-client.tsx` | Hydrates the prerendered markup. |
| `src/entry-server.tsx` | Renders a route to HTML at build time. |
| `scripts/` | The export/build scripts described below. |
| `public/assets/` | All 144 images, the favicon and the OG image. |
| `docs/framer-export/` | Snapshot of the Framer canvas: property controls and the per-page prop values they were set to. |

### The `framer` shim

The page sources still `import { … } from "framer"`, exactly as they did inside
Framer. Vite aliases that specifier to `src/framer/index.tsx`, which means the
1.3 MB of page source stays byte-for-byte comparable with the Framer original
and can be re-exported later without re-editing it.

Only four Framer APIs are used across the whole site:

- `addPropertyControls` / `ControlType` — editor-panel metadata; a no-op here,
  since prop values come from the route table instead.
- `useIsStaticRenderer` — returns `false`, matching a deployed site.
- `Link` — resolves site paths against the base path. It *clones* its child
  rather than wrapping it, because every call site already supplies a complete
  `<a>`; wrapping would emit invalid nested anchors.

## Changing the repository name

GitHub Pages serves a project site from `https://<user>.github.io/<repo>/`, so
the base path has to match the repository name. It is currently
`/portfolio/`, matching the `portfolio` repository. If you rename the repo:

1. Edit `BASE` in `site.config.js`.
2. `npm run rebase` — rewrites the hardcoded asset paths in `src/pages`.
3. `npm run build`.

Moving to a user site (`<user>.github.io`) or a custom domain served at the
domain root is the same procedure with `BASE = "/"`.

## Deployment

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.
To enable it once: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.

The build also emits `dist/.nojekyll`, which stops GitHub from running the
output through Jekyll (which would drop files beginning with an underscore).

## Scripts applied to the exported sources

These ran once during the export and are kept so they can be replayed if the
pages are ever re-exported from Framer.

| Script | What it does |
| --- | --- |
| `scripts/fetch-assets.mjs` | Downloads every remote image into `public/assets` and rewrites the URLs. |
| `scripts/strip-remote-refs.mjs` | Repoints the `PORTFOLIO_URL` constant from the old Framer-hosted site to this site's own root. |
| `scripts/fix-style-tags.mjs` | Converts `<style>{CSS}</style>` to `dangerouslySetInnerHTML`. |
| `scripts/rebase.mjs` | Rewrites asset paths after a `BASE` change. |
| `scripts/prerender.mjs` | Renders every route to static HTML (part of `npm run build`). |

### Why `fix-style-tags` was necessary

Each page ships its stylesheet as `<style>{CSS_STYLES}</style>`. That is fine in
Framer, which renders on the client, but React's *server* renderer escapes text
children — so prerendering turned `>` into `&gt;` and `'` into `&#x27;` inside
the CSS. Browsers parse `<style>` as raw text and never decode those entities,
so the stylesheet arrived corrupted: `.aag-hero-inner &gt; *` is not a valid
selector, and `@import url(&#x27;…Manrope…&#x27;)` meant the web font never
loaded. It also made the server markup differ from the client render, which
failed hydration outright.

## Content notes

- The site is **Spanish-first** (`lang="es"`) with a built-in ES/EN switch; the
  choice persists in `localStorage` and updates `<html lang>`.
- Light/dark theme follows the OS by default and is also switchable.
- Routes `/for-fun`, `/explicación-proyecto` and `/charging-page` are reachable
  only by direct URL — nothing in the site links to them. They were like that in
  Framer and have been preserved.
- The Digital Garden's "recommend me something" form posts to `formsubmit.co`,
  a third-party form service. It is client-side only and works on a static host.
- Ten of the fourteen routes had never been published on the old Framer site;
  they go live for the first time with this deployment.
- Framer set one title and description for the entire site. The description and
  social image are reproduced exactly; each page now has its own `<title>`.
