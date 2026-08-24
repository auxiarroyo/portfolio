/**
 * Lazy registry of every page component.
 *
 * Each entry is a dynamic import so Vite code-splits the pages into separate
 * chunks — a visitor landing on /projects downloads only the projects page, not
 * all 1.3 MB of page source.
 */
export const pageModules: Record<string, () => Promise<Record<string, unknown>>> = {
    AboutPage: () => import("./pages/AboutPage"),
    CaseStudyPage: () => import("./pages/CaseStudyPage"),
    ChargingPage: () => import("./pages/ChargingPage"),
    DigitalGardenPage: () => import("./pages/DigitalGardenPage"),
    ForFunPage: () => import("./pages/ForFunPage"),
    HomePage: () => import("./pages/HomePage"),
    NailingPage: () => import("./pages/NailingPage"),
    ProjectDetailPage: () => import("./pages/ProjectDetailPage"),
    ProjectsPage: () => import("./pages/ProjectsPage"),
    YouicyPage: () => import("./pages/YouicyPage"),
}

import type { ComponentType } from "react"

/**
 * Page components are typed loosely on purpose: each one declares its own props
 * interface, and the route table supplies those values as plain data.
 */
export type PageComponent = ComponentType<Record<string, unknown>>

/** Resolve a route's `module` + `export` pair to the actual component function. */
export async function loadPageComponent(
    moduleName: string,
    exportName: string
): Promise<PageComponent> {
    const loader = pageModules[moduleName]
    if (!loader) throw new Error(`Unknown page module: ${moduleName}`)

    const mod = await loader()
    const component = mod[exportName]
    if (typeof component !== "function") {
        throw new Error(`Module ${moduleName} has no component export "${exportName}"`)
    }
    return component as PageComponent
}
