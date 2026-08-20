/**
 * Makes the pages' inline <style> blocks safe to server-render.
 *
 * Each page ships its stylesheet as `<style>{CSS_STYLES}</style>`. That works in
 * Framer, which renders on the client, but React's *server* renderer escapes text
 * children — so prerendering turns `>` into `&gt;` and `'` into `&#x27;` inside
 * the CSS. Browsers parse <style> as raw text and never decode those entities, so
 * the served stylesheet arrives corrupted:
 *
 *   .aag-hero-inner &gt; * { … }                     ← invalid selector, rule dropped
 *   @import url(&#x27;…Manrope…&#x27;);              ← web font never loads
 *
 * It also makes the server markup differ from the client render, which fails
 * hydration and forces React to throw away the prerendered DOM entirely.
 *
 * Passing the CSS through dangerouslySetInnerHTML is React's supported way to
 * emit a stylesheet verbatim, and fixes both problems at once. The content is a
 * build-time constant defined in the page itself — there is no user input here.
 *
 *   node scripts/fix-style-tags.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const pagesDir = fileURLToPath(new URL("../src/pages", import.meta.url))

/** `<style>{IDENT}</style>` → `<style dangerouslySetInnerHTML={{ __html: IDENT }} />` */
const STYLE_TAG = /<style>\{([A-Za-z_$][\w$]*)\}<\/style>/g

const files = (await readdir(pagesDir)).filter((f) => f.endsWith(".tsx"))
let changed = 0
let replacements = 0

for (const file of files) {
    const full = path.join(pagesDir, file)
    const src = await readFile(full, "utf8")

    const next = src.replace(STYLE_TAG, (_match, ident) => {
        replacements++
        return `<style dangerouslySetInnerHTML={{ __html: ${ident} }} />`
    })

    if (next !== src) {
        await writeFile(full, next, "utf8")
        changed++
    }
}

if (replacements === 0) {
    console.log("No raw <style>{…}</style> tags found — sources are already SSR-safe.")
} else {
    console.log(`Rewrote ${replacements} <style> tag(s) across ${changed} file(s).`)
}
