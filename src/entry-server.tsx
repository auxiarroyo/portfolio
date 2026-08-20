/**
 * Server entry — renders a route to static HTML at build time.
 *
 * Consumed by scripts/prerender.mjs, which injects the result into the built
 * index.html shell to produce one real document per route.
 */
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { ROUTES } from "../site.config.js"
import { loadPageComponent } from "./pages-registry"

export async function render(path: string): Promise<string> {
    const route = ROUTES.find((r) => r.path === path)
    if (!route) throw new Error(`No route registered for "${path}"`)

    const Component = await loadPageComponent(route.module, route.export)
    return renderToString(createElement(Component, route.props))
}

export { ROUTES }
