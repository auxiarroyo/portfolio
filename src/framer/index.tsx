/**
 * Local stand-in for Framer's `framer` runtime module.
 *
 * The exported page components in `src/pages` are byte-for-byte the sources from
 * the Framer project, so they still `import { addPropertyControls, ControlType,
 * Link, useIsStaticRenderer } from "framer"`. Vite aliases that specifier here
 * (see vite.config.ts) so the pages compile unchanged outside Framer.
 *
 * Those four are the entire Framer surface this project uses.
 */
import {
    Children,
    cloneElement,
    forwardRef,
    isValidElement,
    type AnchorHTMLAttributes,
    type ReactElement,
    type ReactNode,
} from "react"

/* ==========================================================================
   Property controls
   ==========================================================================
   In Framer these drive the editor's properties panel. Outside Framer there is
   no panel, so registration is a no-op — prop values are supplied explicitly by
   the route table in site.config.js. The definitions are still recorded on the
   component so they remain inspectable and the call keeps its original shape.
   ========================================================================== */

export interface PropertyControls {
    [key: string]: Record<string, unknown>
}

export function addPropertyControls(component: unknown, controls: PropertyControls): void {
    if (typeof component === "function" || (typeof component === "object" && component !== null)) {
        try {
            Object.defineProperty(component, "propertyControls", {
                value: controls,
                configurable: true,
                enumerable: false,
                writable: true,
            })
        } catch {
            /* frozen component — the controls simply aren't recorded */
        }
    }
}

/** Mirrors Framer's ControlType enum for the members this project references. */
export const ControlType = {
    Boolean: "boolean",
    Number: "number",
    String: "string",
    Color: "color",
    Enum: "enum",
    Link: "link",
    Image: "image",
    ResponsiveImage: "responsiveimage",
    File: "file",
    Date: "date",
    Object: "object",
    Array: "array",
    ComponentInstance: "componentinstance",
    EventHandler: "eventhandler",
    Transition: "transition",
    Padding: "padding",
    BorderRadius: "borderradius",
    Border: "border",
    BoxShadow: "boxshadow",
    Font: "font",
    SegmentedEnum: "segmentedenum",
} as const

/* ==========================================================================
   Static renderer
   ========================================================================== */

/**
 * In Framer this is `true` only inside the canvas / thumbnail renderer, where
 * effects and animation must not run. A deployed site is not that renderer, so
 * this returns `false` — including during prerendering, which keeps the
 * server-rendered markup identical to the first client render and avoids
 * hydration mismatches. The pages already guard their own DOM access with
 * `typeof window === "undefined"` checks, so prerendering stays safe.
 */
export function useIsStaticRenderer(): boolean {
    return false
}

/* ==========================================================================
   Link
   ========================================================================== */

/**
 * Resolve a site-internal path against the deployment base path.
 *
 * GitHub Pages project sites are served from a subdirectory, so an absolute path
 * like `/contact` authored in Framer must become `/<repo>/contact/`.
 *
 * The trailing slash matters: each route is emitted as `<route>/index.html`, and
 * a directory URL resolves to that file directly. Without it GitHub Pages answers
 * with a 301 to the slashed form, and stricter static servers just 404. Anything
 * that is not a site-internal path — external URL, mailto:, tel:, #anchor, or a
 * path with a query, fragment or file extension — is returned untouched.
 */
export function resolveHref(href?: string): string | undefined {
    if (typeof href !== "string" || href.length === 0) return href
    if (!href.startsWith("/") || href.startsWith("//")) return href

    const base = import.meta.env.BASE_URL || "/"
    const path = href.slice(1)
    if (path.length === 0) return base

    const bare = !/[?#]/.test(path) && !/\.[a-zA-Z0-9]+$/.test(path)
    const suffix = bare && !path.endsWith("/") ? "/" : ""
    return base + path + suffix
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
    href?: string
    openInNewTab?: boolean
    children?: ReactNode
}

/**
 * Framer's `<Link>` routes by page node inside the editor. On a static build the
 * routes are real files on disk, so a base-resolved anchor is both sufficient and
 * more robust — every page is an independent document, which is exactly what the
 * prerendered output provides.
 *
 * Crucially, Framer's Link *applies* itself to an element child rather than
 * wrapping it, and every call site here already supplies a fully-formed anchor:
 *
 *     <SiteLink href="/contact">
 *         <a className="aag-nav-link" href="/contact">Contacto</a>
 *     </SiteLink>
 *
 * Wrapping would emit `<a><a>…</a></a>`. That is invalid HTML: the parser closes
 * the outer anchor when it meets the inner one, so the browser's DOM never
 * matches the server string and hydration fails. Cloning the child and rewriting
 * its href keeps the markup valid and identical on both sides.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
    { href, openInNewTab, children, ...rest },
    ref
) {
    const newTabProps = openInNewTab
        ? { target: "_blank", rel: "noopener noreferrer" }
        : null

    const only = Children.count(children) === 1 ? Children.only(children) : null

    if (only && isValidElement(only)) {
        const child = only as ReactElement<AnchorHTMLAttributes<HTMLAnchorElement>>
        // The child carries its own href (the same site path); resolve that so the
        // anchor the visitor actually clicks points at the deployed location.
        const target = child.props.href ?? href
        return cloneElement(child, {
            ...rest,
            ...newTabProps,
            href: resolveHref(target),
            ref,
        } as never)
    }

    return (
        <a ref={ref} href={resolveHref(href)} {...newTabProps} {...rest}>
            {children}
        </a>
    )
})
