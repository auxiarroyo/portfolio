/**
 * Repoints the hardcoded asset paths in src/pages at the current BASE.
 *
 * Vite rewrites asset URLs it can see in HTML and CSS, but these paths live
 * inside ordinary JavaScript strings in the page sources, so they have to be
 * rewritten in the source itself. Run this after changing BASE in site.config.js:
 *
 *   1. edit BASE in site.config.js
 *   2. npm run rebase
 *   3. npm run build
 *
 * Idempotent — running it when nothing has changed reports no changes.
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BASE } from "../site.config.js"

const pagesDir = fileURLToPath(new URL("../src/pages", import.meta.url))

/**
 * Matches an existing asset path under any base, e.g.
 *   "/portfolio-auxi-arroyo/assets/x.png"  or  "/assets/x.png"
 * capturing just the filename.
 */
const ASSET_PATH = /"(?:\/[^"\s]*?)?\/?assets\/([A-Za-z0-9._-]+)"/g

const files = (await readdir(pagesDir)).filter((f) => f.endsWith(".tsx"))
let changedFiles = 0
let rewrites = 0

for (const file of files) {
    const full = path.join(pagesDir, file)
    const src = await readFile(full, "utf8")

    const next = src.replace(ASSET_PATH, (match, name) => {
        const replacement = `"${BASE}assets/${name}"`
        if (replacement !== match) rewrites++
        return replacement
    })

    if (next !== src) {
        await writeFile(full, next, "utf8")
        changedFiles++
    }
}

if (rewrites === 0) {
    console.log(`Asset paths already point at "${BASE}assets/…" — nothing to do.`)
} else {
    console.log(`Repointed ${rewrites} asset path(s) across ${changedFiles} file(s) to "${BASE}assets/…".`)
    console.log("Run `npm run build` to regenerate dist/.")
}
