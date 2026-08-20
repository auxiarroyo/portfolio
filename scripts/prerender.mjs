/**
 * Renders every route to a real HTML file.
 *
 * GitHub Pages does no server-side rewriting, so a single-page app would 404 on
 * any deep link. Emitting one document per route (dist/about/index.html, …)
 * makes every URL a real file — deep links, refreshes, crawlers and no-JS
 * visitors all get complete markup, and React hydrates it on load.
 *
 * Runs after `vite build` (client shell + assets) and `vite build --ssr`
 * (server bundle), both of which npm's `build` script invokes first.
 *
 *   node scripts/prerender.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { BASE, SITE, ROUTES } from "../site.config.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const distDir = path.join(root, "dist")
const template = await readFile(path.join(distDir, "index.html"), "utf8")

const { render } = await import(pathToFileURL(path.join(root, "dist-ssr", "entry-server.js")).href)

/** Escape a string for use inside a double-quoted HTML attribute. */
const attr = (s) =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")

/** Absolute-from-domain-root URL for a file living in public/. */
const asset = (rel) => BASE + rel

/**
 * Build the <head> metadata for a route.
 *
 * Framer served the same title and description on every page. Per your choice,
 * the description, og:image and icons stay exactly as harvested, while each page
 * gets its own title.
 */
function head(route) {
    const title = route.title || SITE.title
    const description = SITE.description

    return [
        `<title>${attr(title)}</title>`,
        `<meta name="description" content="${attr(description)}" />`,
        `<meta name="theme-color" content="${attr(SITE.themeColor)}" />`,
        `<link rel="icon" type="image/svg+xml" href="${attr(asset(SITE.icon))}" />`,
        `<link rel="apple-touch-icon" href="${attr(asset(SITE.appleIcon))}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:title" content="${attr(title)}" />`,
        `<meta property="og:description" content="${attr(description)}" />`,
        `<meta property="og:image" content="${attr(asset(SITE.ogImage))}" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<meta name="twitter:title" content="${attr(title)}" />`,
        `<meta name="twitter:description" content="${attr(description)}" />`,
        `<meta name="twitter:image" content="${attr(asset(SITE.ogImage))}" />`,
    ].join("\n    ")
}

/** dist-relative output file for a route path. */
function outputFile(routePath) {
    if (routePath === "/") return "index.html"
    return path.join(routePath.replace(/^\//, ""), "index.html")
}

function compose(route, appHtml) {
    return template
        .replace("<!--app-head-->", head(route))
        .replace(
            '<div id="root">',
            `<div id="root" data-route="${attr(route.path)}" data-prerendered="true">`
        )
        .replace("<!--app-html-->", appHtml)
}

let failures = 0

for (const route of ROUTES) {
    let appHtml
    try {
        appHtml = await render(route.path)
    } catch (err) {
        console.error(`✗ ${route.path} — render failed: ${err.stack || err.message}`)
        failures++
        continue
    }

    const rel = outputFile(route.path)
    const dest = path.join(distDir, rel)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, compose(route, appHtml), "utf8")

    console.log(`✓ ${route.path.padEnd(26)} → ${rel}  (${(appHtml.length / 1024).toFixed(0)} KB)`)
}

/* ------------------------------------------------------------------------- *
 * 404
 * ------------------------------------------------------------------------- *
 * The Framer project's /404 page was empty, so this is a new minimal page
 * built from the site's own design tokens. GitHub Pages serves dist/404.html
 * automatically for any unmatched path.
 * ------------------------------------------------------------------------- */
const notFound = `<!doctype html>
<html lang="${SITE.lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Página no encontrada — ${attr(SITE.title)}</title>
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="${attr(SITE.themeColor)}" />
    <link rel="icon" type="image/svg+xml" href="${attr(asset(SITE.icon))}" />
    <link rel="apple-touch-icon" href="${attr(asset(SITE.appleIcon))}" />
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');
      :root { --background:#f7f7f5; --text:#161616; --muted:#666; --accent:#ff654d; }
      @media (prefers-color-scheme: dark) {
        :root { --background:#121212; --text:#f2f2f0; --muted:#9b9b9b; }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px;
        background: var(--background); color: var(--text);
        font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased; line-height: 1.5;
      }
      main { text-align: center; max-width: 34rem; }
      .code { font-size: clamp(4rem, 18vw, 8rem); font-weight: 800; letter-spacing: -0.04em; color: var(--accent); margin: 0; line-height: 1; }
      h1 { font-size: clamp(1.25rem, 4vw, 1.75rem); font-weight: 600; margin: 16px 0 8px; }
      p { color: var(--muted); margin: 0 0 32px; }
      a {
        display: inline-block; padding: 12px 26px; border-radius: 999px;
        background: var(--accent); color: #fff; text-decoration: none; font-weight: 600;
        transition: transform .18s ease, opacity .18s ease;
      }
      a:hover { transform: translateY(-2px); opacity: .92; }
      a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
      @media (prefers-reduced-motion: reduce) { a { transition: none; } a:hover { transform: none; } }
    </style>
  </head>
  <body>
    <main>
      <p class="code">404</p>
      <h1>Esta página no existe</h1>
      <p>La página que buscas no está aquí — puede que se haya movido o que el enlace sea incorrecto.</p>
      <a href="${attr(BASE)}">Volver al inicio</a>
    </main>
  </body>
</html>
`
await writeFile(path.join(distDir, "404.html"), notFound, "utf8")
console.log(`✓ ${"404".padEnd(26)} → 404.html`)

/* GitHub Pages would otherwise run the output through Jekyll, which ignores
   files and folders beginning with an underscore. */
await writeFile(path.join(distDir, ".nojekyll"), "", "utf8")

if (failures > 0) {
    console.error(`\n${failures} route(s) failed to prerender.`)
    process.exit(1)
}
console.log(`\nPrerendered ${ROUTES.length} routes + 404.`)
