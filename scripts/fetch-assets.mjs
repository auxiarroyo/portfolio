/**
 * Downloads every remote image the site references into public/assets, then
 * rewrites the page sources to point at the local copies.
 *
 * The goal is a self-contained repository: once this has run, nothing the
 * deployed site loads comes from framerusercontent.com or any other third party,
 * so the site keeps working even if the original Framer project is deleted.
 *
 * Safe to re-run. Already-downloaded files are skipped, and once the sources have
 * been rewritten there are no remote URLs left to find, so a second run is a
 * no-op that just verifies the manifest.
 *
 *   node scripts/fetch-assets.mjs
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BASE } from "../site.config.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const pagesDir = path.join(root, "src", "pages")
const assetsDir = path.join(root, "public", "assets")
const manifestPath = path.join(root, "assets-manifest.json")

/** Assets referenced from the document head rather than from page source. */
const HEAD_ASSETS = [
    ["https://framerusercontent.com/images/YOGI10yTCaBNyL766djSZCYu1g.svg", "favicon.svg"],
    ["https://framerusercontent.com/images/SLcwg4HB3s2w2BgMKUQVuvzxqyA.png", "apple-touch-icon.png"],
    ["https://framerusercontent.com/images/Odz13bnSVmRFIMuPptZk19zIQ3Q.png", "og-image.png"],
]

const REMOTE = /https:\/\/(?:framerusercontent\.com\/images|images\.unsplash\.com)\/[^"']+/g

/** Map a remote URL to a stable local filename. */
function localName(url) {
    const { hostname, pathname } = new URL(url)
    const base = pathname.split("/").pop() || ""

    if (hostname === "images.unsplash.com") {
        // e.g. /photo-1634084462412-b54873c0a56d?fm=jpg&… → photo-1634084462412-….jpg
        const fm = new URL(url).searchParams.get("fm") || "jpg"
        return `${base}.${fm}`
    }
    return base
}

async function download(url, dest, attempt = 1) {
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length === 0) throw new Error("empty response")
        await writeFile(dest, buf)
        return buf.length
    } catch (err) {
        if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 400 * attempt))
            return download(url, dest, attempt + 1)
        }
        throw new Error(`${url} → ${err.message}`)
    }
}

/** Run `worker` over `items` with bounded concurrency. */
async function pool(items, limit, worker) {
    const results = []
    let i = 0
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (i < items.length) {
                const index = i++
                results[index] = await worker(items[index])
            }
        })
    )
    return results
}

async function main() {
    await mkdir(assetsDir, { recursive: true })

    const files = (await readdir(pagesDir)).filter((f) => f.endsWith(".tsx"))
    const sources = new Map()
    for (const f of files) sources.set(f, await readFile(path.join(pagesDir, f), "utf8"))

    // Collect every distinct remote URL still present in the sources.
    const urls = new Set()
    for (const src of sources.values()) for (const m of src.matchAll(REMOTE)) urls.add(m[0])
    for (const [url] of HEAD_ASSETS) urls.add(url)

    const mapping = existsSync(manifestPath)
        ? JSON.parse(await readFile(manifestPath, "utf8"))
        : {}

    const headNames = new Map(HEAD_ASSETS)
    const targets = [...urls].map((url) => ({
        url,
        name: headNames.get(url) ?? localName(url),
    }))

    console.log(`Found ${targets.length} remote assets to ensure locally.`)

    let downloaded = 0
    let skipped = 0
    const failures = []

    await pool(targets, 8, async ({ url, name }) => {
        const dest = path.join(assetsDir, name)
        if (existsSync(dest)) {
            skipped++
            mapping[url] = name
            return
        }
        try {
            await download(url, dest)
            downloaded++
            mapping[url] = name
        } catch (err) {
            failures.push(err.message)
        }
    })

    if (failures.length) {
        console.error(`\n${failures.length} asset(s) failed to download:`)
        for (const f of failures) console.error("  " + f)
        process.exitCode = 1
        return
    }

    await writeFile(manifestPath, JSON.stringify(mapping, null, 2) + "\n", "utf8")

    // Rewrite the page sources to the local, base-prefixed paths.
    let rewritten = 0
    for (const [file, src] of sources) {
        const next = src.replace(REMOTE, (url) => {
            const name = mapping[url] ?? localName(url)
            return `${BASE}assets/${name}`
        })
        if (next !== src) {
            await writeFile(path.join(pagesDir, file), next, "utf8")
            rewritten++
        }
    }

    // Measured from disk rather than accumulated during download, so the figure
    // reflects what actually ends up committed.
    let bytes = 0
    for (const name of await readdir(assetsDir)) {
        bytes += (await stat(path.join(assetsDir, name))).size
    }

    console.log(
        `Downloaded ${downloaded}, reused ${skipped}. public/assets is now ${(
            bytes /
            1024 /
            1024
        ).toFixed(1)} MB.`
    )
    console.log(`Rewrote URLs in ${rewritten} page source file(s) to "${BASE}assets/…".`)
}

await main()
