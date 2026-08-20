/**
 * Removes the last hardcoded references to the old Framer-hosted site from the
 * exported page sources.
 *
 * The Framer project carried `const PORTFOLIO_URL = "https://auxiarroyo.framer.website"`
 * in five pages — a link from the site back to its own Framer deployment. On this
 * build the portfolio link points at this site's own root instead, so the
 * deployed output contains no reference to Framer at all.
 *
 * Kept as a script rather than a one-off edit so it can be replayed if the pages
 * are ever re-exported from Framer.
 *
 *   node scripts/strip-remote-refs.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pagesDir = fileURLToPath(new URL("../src/pages", import.meta.url))

/** [pattern, replacement, human-readable description] */
const REWRITES = [
    [
        /"https:\/\/auxiarroyo\.framer\.website\/?"/g,
        '"/"',
        "portfolio link → this site's own root",
    ],
]

const files = (await readdir(pagesDir)).filter((f) => f.endsWith(".tsx"))
let changedFiles = 0
const totals = new Map()

for (const file of files) {
    const full = path.join(pagesDir, file)
    const src = await readFile(full, "utf8")
    let next = src

    for (const [pattern, replacement, label] of REWRITES) {
        const hits = next.match(pattern)
        if (!hits) continue
        totals.set(label, (totals.get(label) ?? 0) + hits.length)
        next = next.replace(pattern, replacement)
    }

    if (next !== src) {
        await writeFile(full, next, "utf8")
        changedFiles++
    }
}

if (totals.size === 0) {
    console.log("No remote references found — sources are already clean.")
} else {
    for (const [label, count] of totals) console.log(`Rewrote ${count}× ${label}`)
    console.log(`Updated ${changedFiles} file(s).`)
}
