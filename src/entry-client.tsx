/**
 * Client entry — hydrates the prerendered markup for whichever route was served.
 *
 * Every route is a real HTML document produced at build time, so there is no
 * client-side router: navigation is ordinary anchors between real pages. This
 * entry only needs to work out which page it is on and attach React to it.
 */
import { createElement } from "react"
import { hydrateRoot, createRoot } from "react-dom/client"
import { ROUTES } from "../site.config.js"
import { loadPageComponent } from "./pages-registry"

/**
 * Determine the current route.
 *
 * The prerenderer stamps `data-route` onto the root element, which is exact.
 * The fallback (stripping the base path off the URL) only matters for `vite dev`,
 * where pages are served without prerendering.
 */
function currentRoutePath(root: HTMLElement): string {
    const stamped = root.dataset.route
    if (stamped) return stamped

    const base = import.meta.env.BASE_URL || "/"
    let path = window.location.pathname
    if (base !== "/" && path.startsWith(base)) path = "/" + path.slice(base.length)
    path = decodeURIComponent(path).replace(/index\.html$/, "").replace(/(.+)\/$/, "$1")
    return path || "/"
}

async function main() {
    const root = document.getElementById("root")
    if (!root) throw new Error("Root element #root not found")

    const path = currentRoutePath(root)
    const route = ROUTES.find((r) => r.path === path)

    if (!route) {
        // Unknown path in dev; the deployed build serves 404.html instead.
        console.warn(`No route registered for "${path}"`)
        return
    }

    const Component = await loadPageComponent(route.module, route.export)
    const element = createElement(Component, route.props)

    // Prerendered documents already contain the markup, so hydrate. `vite dev`
    // serves an empty shell, which must be rendered from scratch instead.
    if (root.dataset.prerendered === "true") {
        hydrateRoot(root, element)
    } else {
        createRoot(root).render(element)
    }
}

void main()
