import {
    useEffect,
    useRef,
    useState,
    useCallback,
    type CSSProperties,
    type ReactNode,
    type PointerEvent as ReactPointerEvent,
} from "react"
import { createPortal } from "react-dom"
import { addPropertyControls, ControlType, Link, useIsStaticRenderer } from "framer"

/**
 * Framer wraps every page in a breakpoint frame with overflow:clip and height:auto,
 * which turns that frame into the containing block for position:fixed — so fixed
 * elements anchor to the whole page instead of the window. Rendering them through
 * a host appended to <body> puts them back on the viewport. The host keeps the
 * aag-root class so portalled content still inherits the design tokens; --accent
 * comes from the property panel, so it is copied over inline.
 */
function usePortalHost(accent: string) {
    const [host, setHost] = useState<HTMLElement | null>(null)
    useEffect(() => {
        if (typeof document === "undefined") return
        const el = document.createElement("div")
        el.className = "aag-root aag-portal"
        el.style.setProperty("--accent", accent)
        document.body.appendChild(el)
        setHost(el)
        return () => {
            el.remove()
            setHost(null)
        }
    }, [accent])
    return host
}

/**
 * Internal paths must route through Framer's Link so they resolve in the editor
 * preview, which routes by page node rather than by URL path. External URLs and
 * mailto:/tel: links stay plain anchors.
 */
/* ==========================================================================
   THEME — site-wide light / dark switch.
   The choice is written to localStorage ("aag-theme") and applied as
   <html data-aag-theme="…">, which the token block at the end of CSS_STYLES
   keys off. Until the visitor picks a side we simply follow
   prefers-color-scheme, and keep following it if the OS setting changes.
   Every page component listens to the same window event so several mounted
   instances (nav + portalled UI) never disagree.
   ========================================================================== */
type AagTheme = "light" | "dark"
const AAG_THEME_KEY = "aag-theme"
const AAG_THEME_EVENT = "aag-theme-change"

function readStoredTheme(): AagTheme | null {
    try {
        const v = window.localStorage.getItem(AAG_THEME_KEY)
        return v === "light" || v === "dark" ? v : null
    } catch (e) {
        return null
    }
}

function systemTheme(): AagTheme {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: AagTheme) {
    if (typeof document === "undefined") return
    document.documentElement.setAttribute("data-aag-theme", theme)
}

function useAagTheme() {
    const isStatic = useIsStaticRenderer()
    const [theme, setTheme] = useState<AagTheme>("light")
    const themeRef = useRef<AagTheme>("light")

    const commit = useCallback((next: AagTheme) => {
        themeRef.current = next
        setTheme(next)
        applyTheme(next)
    }, [])

    useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        commit(readStoredTheme() ?? systemTheme())

        const onEvent = (e: Event) => {
            const next = (e as CustomEvent).detail
            if (next === "light" || next === "dark") {
                themeRef.current = next
                setTheme(next)
            }
        }
        window.addEventListener(AAG_THEME_EVENT, onEvent as EventListener)

        /* Follow the OS only while the visitor has not made an explicit choice. */
        const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null
        const onSystem = () => {
            if (readStoredTheme()) return
            commit(systemTheme())
        }
        if (mq && typeof mq.addEventListener === "function") mq.addEventListener("change", onSystem)

        return () => {
            window.removeEventListener(AAG_THEME_EVENT, onEvent as EventListener)
            if (mq && typeof mq.removeEventListener === "function") mq.removeEventListener("change", onSystem)
        }
    }, [isStatic, commit])

    const toggleTheme = useCallback(() => {
        if (typeof window === "undefined") return
        const next: AagTheme = themeRef.current === "dark" ? "light" : "dark"
        try {
            window.localStorage.setItem(AAG_THEME_KEY, next)
        } catch (e) {
            /* private mode — the theme still applies for this session */
        }
        const root = document.documentElement
        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (!reduce) {
            root.classList.add("aag-theme-anim")
            window.setTimeout(() => root.classList.remove("aag-theme-anim"), 460)
        }
        commit(next)
        window.dispatchEvent(new CustomEvent(AAG_THEME_EVENT, { detail: next }))
    }, [commit])

    return { theme, toggleTheme }
}

/* Sun / moon switch. Lives inside the nav pill next to ES / EN so it reads as
   part of the same control cluster rather than a bolted-on button. */
function ThemeToggle({
    theme,
    onToggle,
    label,
}: {
    theme: AagTheme
    onToggle: () => void
    label: string
}) {
    return (
        <button
            type="button"
            className="aag-theme-btn"
            onClick={onToggle}
            aria-label={label}
            title={label}
            aria-pressed={theme === "dark"}
        >
            <span className="aag-theme-ico aag-theme-ico--sun" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4.1" />
                    <path d="M12 2.7v2.1M12 19.2v2.1M2.7 12h2.1M19.2 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M18.5 5.5L17 7M7 17l-1.5 1.5" />
                </svg>
            </span>
            <span className="aag-theme-ico aag-theme-ico--moon" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z" />
                </svg>
            </span>
        </button>
    )
}

function SiteLink({ href, children }: { href?: string; children: any }) {
    if (typeof href === "string" && href.startsWith("/")) {
        return <Link href={href}>{children}</Link>
    }
    return children
}

/* ==========================================================================
   Project Detail / Explanation page — Auxi Arroyo García
   Bilingual (ES / EN), responsive, accessible, self-contained code component.

   This page is a natural extension of the Projects page (ProjectsPage.tsx) and
   the About page: it reuses the EXACT same design system — the same header /
   navigation, the same curved footer, the same tokens, spacing, shadows, radii,
   hover effects and responsive breakpoints. Only the middle content is new.

   THE INTERACTION (editorial cover → story):
   The first screen is a calm cover: category + large title + meta, with plenty
   of white space. As the user scrolls, the cover gently fades, lifts, softens
   (blur) and scales down while a lead statement crossfades in — the cover
   evolves into the project story. Below, each block reveals on scroll with the
   same signature (fade + slight vertical move + blur→sharp). Easing is
   cubic-bezier(0.22,1,0.36,1); durations 0.5–0.9s. Everything degrades to a
   clean static layout under prefers-reduced-motion and on the static canvas.

   TO PUBLISH A REAL PROJECT: edit the PROJECT object below (bilingual). Nothing
   else needs to change. The nav links to /about, /projects and /contact.
   ========================================================================== */

const EMAIL = "carreque45@gmail.com"
/* Public contact shown in the floating status pill (one-click copy) */
const FAB_EMAIL = "auxiliadoraarroyo123@gmail.com"
const LINKEDIN_URL = "https://www.linkedin.com/in/auxiarroyo/"
/* Back / "explore more" target. */
const PROJECTS_URL = "/projects"
/* Contact page target for the footer "let's talk" link. */
const CONTACT_URL = "/contact"

/* Header avatar — identical circular portrait used across the site. The
   "Profile Photo" panel control still overrides this when set. */
const PROFILE_SRC =
    "/portfolio-auxi-arroyo/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"

type Lang = "es" | "en"
type Bi = { es: string; en: string }
type BiList = { es: string[]; en: string[] }

/* ---------------------------------------------------------------------------
   PROJECT CONTENT (single source of truth, bilingual).
   Replace with a real project — the layout and interaction stay identical.
--------------------------------------------------------------------------- */
interface StorySection {
    key: string
    heading: Bi
    body: BiList
}
const PROJECT: {
    category: Bi
    title: Bi
    year: string
    role: Bi
    client: Bi
    lead: Bi
    overview: BiList
    services: BiList
    quote: Bi
    sections: StorySection[]
} = {
    category: { es: "Branding", en: "Branding" },
    title: { es: "Identidad de marca", en: "Brand Identity" },
    year: "2025",
    role: {
        es: "Dirección de arte · Identidad visual",
        en: "Art Direction · Visual Identity",
    },
    client: { es: "Proyecto de estudio", en: "Studio project" },
    lead: {
        es: "Una identidad construida con calma: sistema tipográfico, color y ritmo pensados para crecer con la marca.",
        en: "An identity built with calm: a typographic system, colour and rhythm designed to grow with the brand.",
    },
    overview: {
        es: [
            "Este proyecto parte de una idea sencilla: dar a la marca una voz visual coherente, cálida y contemporánea. Cada decisión —del peso tipográfico al espacio en blanco— busca claridad antes que ruido.",
            "El resultado es un sistema flexible que funciona igual en una tarjeta, en una pantalla o en una gran superficie, sin perder personalidad.",
        ],
        en: [
            "This project starts from a simple idea: give the brand a coherent, warm and contemporary visual voice. Every decision — from typographic weight to white space — favours clarity over noise.",
            "The result is a flexible system that works the same on a card, on a screen or across a large surface, without losing personality.",
        ],
    },
    services: {
        es: ["Estrategia", "Identidad visual", "Tipografía", "Guía de marca", "Arte final"],
        en: ["Strategy", "Visual identity", "Typography", "Brand guidelines", "Artwork"],
    },
    quote: {
        es: "El diseño no grita: acompaña. Cuando el sistema es claro, la marca respira.",
        en: "Design doesn't shout: it accompanies. When the system is clear, the brand breathes.",
    },
    sections: [
        {
            key: "brief",
            heading: { es: "El encargo", en: "The brief" },
            body: {
                es: [
                    "La marca necesitaba una identidad que transmitiera cercanía y precisión al mismo tiempo. Partimos de una auditoría visual para entender qué conservar y qué reimaginar.",
                    "El reto: un lenguaje reconocible en cualquier soporte, que se sintiera hecho a mano pero sistemático.",
                ],
                en: [
                    "The brand needed an identity that conveyed closeness and precision at once. We began with a visual audit to understand what to keep and what to reimagine.",
                    "The challenge: a recognisable language across any medium, one that felt handcrafted yet systematic.",
                ],
            },
        },
        {
            key: "approach",
            heading: { es: "El enfoque", en: "The approach" },
            body: {
                es: [
                    "Definimos una retícula base y una escala tipográfica que ordenan cada composición. El color se reduce a lo esencial: un neutro cálido y un acento coral que marca el ritmo.",
                    "Sobre esa base construimos componentes reutilizables —titulares, etiquetas, tarjetas— para que la marca pueda ampliarse sin fricción.",
                ],
                en: [
                    "We defined a base grid and a typographic scale that order every composition. Colour is reduced to the essentials: a warm neutral and a coral accent that sets the rhythm.",
                    "On that foundation we built reusable components — headlines, labels, cards — so the brand can expand without friction.",
                ],
            },
        },
        {
            key: "outcome",
            heading: { es: "El resultado", en: "The outcome" },
            body: {
                es: [
                    "Una identidad serena y flexible, con una guía de marca clara que cualquier equipo puede aplicar. La marca gana consistencia sin volverse rígida.",
                    "El sistema deja espacio para crecer: nuevos formatos, nuevas piezas, la misma voz.",
                ],
                en: [
                    "A calm, flexible identity with a clear brand guide any team can apply. The brand gains consistency without becoming rigid.",
                    "The system leaves room to grow: new formats, new pieces, the same voice.",
                ],
            },
        },
    ],
}

/* ---------------------------------------------------------------------------
   UI COPY (single source of truth per language)
--------------------------------------------------------------------------- */
const CONTENT = {
    es: {
        htmlLang: "es",
        nav: { home: "Inicio", about: "Sobre mí", projects: "Proyectos", garden: "Jardín digital", contact: "Contacto" },
        menuLabel: "Abrir menú",
        langAria: "Cambiar idioma",
        name: "Auxi Arroyo García",
        scrollCue: "Desliza",
        overviewLabel: "Resumen",
        yearLabel: "Año",
        roleLabel: "Rol",
        clientLabel: "Cliente",
        servicesLabel: "Servicios",
        nextEyebrow: "Sigue explorando",
        nextLabel: "Abrir caso de estudio",
        nextBig: "Ver proyectos",
        backToProjects: "Volver a proyectos",
        contactSmall: "¿Tienes un proyecto, una oportunidad o una idea en mente?",
        contactBig: "HABLEMOS",
        email: "Email",
        linkedin: "LinkedIn",
        backToTop: "Volver arriba",
        rights: "Todos los derechos reservados.",
        fab: {
            label: "Estado y contacto",
            status: "Disponible",
            copy: "Copiar email",
            copied: "¡Copiado!",
        },
    },
    en: {
        htmlLang: "en",
        nav: { home: "Home", about: "About", projects: "Projects", garden: "Digital Garden", contact: "Contact" },
        menuLabel: "Open menu",
        langAria: "Change language",
        name: "Auxi Arroyo García",
        scrollCue: "Scroll",
        overviewLabel: "Overview",
        yearLabel: "Year",
        roleLabel: "Role",
        clientLabel: "Client",
        servicesLabel: "Services",
        nextEyebrow: "Keep exploring",
        nextLabel: "Open Case Study",
        nextBig: "View projects",
        backToProjects: "Back to projects",
        contactSmall: "Have a project, opportunity or idea in mind?",
        contactBig: "LET'S TALK",
        email: "Email",
        linkedin: "LinkedIn",
        backToTop: "Back to top",
        rights: "All rights reserved.",
        fab: {
            label: "Status and contact",
            status: "Open to Work",
            copy: "Copy email",
            copied: "Copied!",
        },
    },
} as const

/* ---------------------------------------------------------------------------
   RELATED PROJECTS — the "Keep exploring" grid reuses the Projects-page card
   language (cover, category, title, info). Two columns on desktop.
--------------------------------------------------------------------------- */
const RELATED: {
    key: string
    category: Bi
    title: Bi
    info: Bi
    href: string
    img: string
}[] = [
    {
        key: "youicy",
        category: { es: "UX/UI · Product Design", en: "UX/UI · Product Design" },
        title: { es: "Youicy", en: "Youicy" },
        info: { es: "App de empleabilidad · 2025", en: "Employability app · 2025" },
        href: "/youicy",
        img: "/portfolio-auxi-arroyo/assets/LkpyWk4k4d75CleHWZKiaCKtFU.png",
    },
    {
        key: "chroma",
        category: { es: "Editorial", en: "Editorial" },
        title: { es: "Chroma", en: "Chroma" },
        info: { es: "Revista sobre el color · 2024", en: "A magazine about colour · 2024" },
        href: "/chroma",
        img: "/portfolio-auxi-arroyo/assets/iE8mTwTJh2eFlAF9SpWoclrthcM.png",
    },
]

/* ---------------------------------------------------------------------------
   SECTION NAV — a small floating index that jumps to each part of the story
   (Overview · The Brief · The Approach · The Outcome) and tracks the active
   section while scrolling.
--------------------------------------------------------------------------- */
function SectionNav({
    items,
    label,
}: {
    items: { id: string; label: string }[]
    label: string
}) {
    const [active, setActive] = useState(0)
    const go = useCallback((id: string) => {
        if (typeof document === "undefined") return
        const el = document.getElementById(id)
        if (!el) return
        const reduce =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
    }, [])
    useEffect(() => {
        if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return
        const els = items
            .map((it) => document.getElementById(it.id))
            .filter((el): el is HTMLElement => !!el)
        if (!els.length) return
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        const idx = items.findIndex((it) => it.id === e.target.id)
                        if (idx >= 0) setActive(idx)
                    }
                })
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
        )
        els.forEach((el) => obs.observe(el))
        return () => obs.disconnect()
    }, [items])
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLDivElement | null>(null)

    /* close the menu on outside click or Escape */
    useEffect(() => {
        if (!open || typeof document === "undefined") return
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onDown)
            document.removeEventListener("keydown", onKey)
        }
    }, [open])

    const jump = useCallback((id: string) => {
        go(id)
        setOpen(false)
    }, [go])

    return (
        <div className={"pd-secnav" + (open ? " is-open" : "")} ref={rootRef}>
            <div className="pd-secnav-panel" role="menu" aria-label={label} aria-hidden={!open}>
                <p className="pd-secnav-heading">{label}</p>
                <ul className="pd-secnav-list">
                    {items.map((it, i) => (
                        <li key={it.id}>
                            <button
                                type="button"
                                role="menuitem"
                                tabIndex={open ? 0 : -1}
                                className={"pd-secnav-item" + (i === active ? " is-active" : "")}
                                onClick={() => jump(it.id)}
                                aria-current={i === active ? "true" : undefined}
                            >
                                <span className="pd-secnav-dot" aria-hidden="true" />
                                <span className="pd-secnav-label">{it.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            <button
                type="button"
                className="pd-secnav-fab"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={label}
                onClick={() => setOpen((v) => !v)}
            >
                <span className="pd-secnav-fab-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        {open ? (
                            <path d="M6 6l12 12M18 6L6 18" />
                        ) : (
                            <>
                                <path d="M4 7h16" />
                                <path d="M4 12h16" />
                                <path d="M4 17h16" />
                            </>
                        )}
                    </svg>
                </span>
            </button>
        </div>
    )
}

/* ---------------------------------------------------------------------------
   Small math helpers for scroll-driven values
--------------------------------------------------------------------------- */
function clamp01(v: number) {
    return v < 0 ? 0 : v > 1 ? 1 : v
}
/* normalise p from [a,b] → [0,1] */
function mapRange(p: number, a: number, b: number) {
    if (b === a) return 0
    return clamp01((p - a) / (b - a))
}
/* smoothstep easing for scroll interpolation */
function smooth(t: number) {
    const x = clamp01(t)
    return x * x * (3 - 2 * x)
}

/* ---------------------------------------------------------------------------
   Reveal-on-scroll wrapper — same behaviour as the other pages, with an
   optional soft blur→sharp so story blocks share the cover's signature.
   Respects reduced motion and the static canvas renderer.
--------------------------------------------------------------------------- */
function Reveal({
    children,
    delay = 0,
    blur = false,
    y,
    style,
    className,
    id,
    tag = "div",
}: {
    children: ReactNode
    delay?: number
    blur?: boolean
    y?: number
    style?: CSSProperties
    className?: string
    id?: string
    tag?: "div" | "section" | "li" | "article" | "figure"
}) {
    const isStatic = useIsStaticRenderer()
    const ref = useRef<HTMLElement | null>(null)
    const [shown, setShown] = useState<boolean>(isStatic)

    useEffect(() => {
        if (isStatic) {
            setShown(true)
            return
        }
        if (typeof window === "undefined") {
            setShown(true)
            return
        }
        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduce) {
            setShown(true)
            return
        }
        const el = ref.current
        if (!el || typeof IntersectionObserver === "undefined") {
            setShown(true)
            return
        }
        let settled = false
        const obs = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        settled = true
                        setShown(true)
                        obs.disconnect()
                    }
                })
            },
            { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
        )
        obs.observe(el)
        const fallback = window.setTimeout(() => {
            if (!settled) setShown(true)
        }, 900)
        return () => {
            obs.disconnect()
            window.clearTimeout(fallback)
        }
    }, [isStatic])

    const dist = y ?? (blur ? 26 : 16)
    const Tag = tag as any
    return (
        <Tag
            ref={ref as any}
            id={id}
            className={className}
            style={{
                ...style,
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : `translateY(${dist}px)`,
                filter: blur ? (shown ? "blur(0px)" : "blur(9px)") : undefined,
                transition: `opacity 0.75s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}s, filter 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
                willChange: "opacity, transform",
            }}
        >
            {children}
        </Tag>
    )
}

/* ---------------------------------------------------------------------------
   BRAND FLOWER (@positivo) — replaces the rotating star across the site.
   Premium motion: a slow rotation on the image + a gentle float/scale on the
   wrapper, on two different periods so the rhythm never feels mechanical.
--------------------------------------------------------------------------- */
const FLOWER_SRC =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAOdEVYdFNvZnR3YXJlAEZpZ21hnrGWYwAAB79JREFUeAHtnT9sG3UUx9/7OXEJ9I+DxMISI2BgqitgYEB1N5SAmm4MSDgDTWBpmJBgSDMAY8NCUzrUlRhgoa5EQ8VSVx1YWpEiJIQqVHeABUTcJCSpk/s93vs55178785/7vwr3EdqfTqf69fv79+793vvjNAlazOvZ7WmDCo4TERZJEwBUsp9nwCWEbCM/EpKXz+wb18RFwpliIj198Yzzg5md+3L8KmU5+1yv2zDTi6m2cnU+kbllEbI8QfT0DGYR8SLBxa/LUIIuPYR4Ky3McO0LZCAvRnW9GuLwzg8NbJYKEEfMPZtbs8RH0HvlFQCTuz/fGk5yMW+Aq6/M57RCi5BVz3O58sJFw58ceV96IH16ddPaaLT/WlYL5jnRp73a2T0NQ70AoRLaRiTxzrtjdLr1jYrZ/gwB+Hha1tLAddmxueI4DREQ0ciVods5RovVBkInzIomjp49rtCszebChixeC6BRIxYvBqI6lizBUbVn5BhOwDxhHSFKpf8LlrbqFyIWjyBSF8S16j+/B4BN2cm0xHMeS3h4ZBZOzlxptX7MjL4okkYDCntwKUVHgHek3sE3KbKNRgwhDQrTnr9eWncAY0ML+mhje0574magDJ0IQRXpRv4zmGu/hw37hmwgPoGNgLuDt1+OKF9grJeI3ePBzV0G/A2sBFwGypZsKT3uWjSNcHY4LfBKh42sHFjVqfH74JlAjJlZyT5zGNbkOLhexfso3Dw3NIJXH9vMqOdyo9gIeJ7Eeg0h3YugH2YBh5ydraz2FFMJjpkGCOoMT4CC0kNbe1kFIdwjoK9pBEoDZYiDTwkBhLYCQ+Mw2SxgDxyDyl2TtNgL2mwGNKQUf2Po/1/4B6YUhDTE4rvTSLb6PmvwdNfWYZwLGCXsAfDAoIKtHkS0wh7CLcVob4NMd1BVFIKVBFiukIPYbEaTDg5sRK7M53BNx+lQ+eWnjFuDCn6DGI6gn3AorwaATmYmoeYjnBAz8urEXB08WqJQ9UXISYYCHnRTA5rdyJ6a99s7FQHw+19Qk3A0XyhTAmYh5i28N3HvNv7hIZQ6v3p8QU+eQoiAp99AWDlL6C//wz+mSefgsTMh+ZzO2c/hqiQnEdeeY94zzUEE/iCWQKM7O5k6N2PYOj9jwGfHgt0vSuevNLmBkSFuC0a9Yn6802jMfrB8LGoRNQ3bwCMPG6E9BPRKx78fg/0119AFOyKd8w7dGs2tftgVMM58eY0qJde5Q3qDTMk6Y97DdfUi7ez+An3wH8gbGTYSs9rJp6xy+8fWJ0Zz/HEOYchR4fbiThA8T6TKa3dNQnw4dObd5Y/ePnZy+x5jyJgaFlR9PMtIxCOPQcq8wrQrz8BrN0fjHjI97iopg6eu7Loeyl0wMrMa2kOIJ5mf/FoWD3S2xOdr86BOv5WJOIR+8CoTGXBfCeJ5l3vCJsyB9BZ/sKjPMRTvLvXt95ZE9ElBPFEMP7flziIcl3KHZzHkoXRLkodutoTkSxRyRhg8caIKIV93tnT33/DPfChWDuXv+x7z8PqnzIHRIk370ujUdSJSK+rZiZRFkJiz5wnoo080XZ17iOl3fKL+U4S3gMJGIVwxpgmC4bMgX4uTgiW5IMK2VbAPhewtDekzWobxE8MAZ4fYf7g4lK+3UUt3RhJutzcrvzAh69ByPi5Kq1cnJCRCP3khy8+D5/eunO91UVNe2CY1UkNBnTg5w2oJ4qVefYJp5q907AKm3TfiMQTOnGSxS/03jubBSYSKLc6PdE0R3GPgDLn7WbqpyEiZAjo334J7OeJiM6Nq2aFRhYyOii3dnK8Ifl9zxCuqkw5iGlJfcVSTcDVk29MAjq+lUIxUHJGkkdcx/vhEEbHijqMR4C02qjU3DojoOl9licz2gRHpk65JV/VHoi21WFYT0ptPMjJgVrJiZLamiqgRwVeTI7Lq0oknSzEdAFlZRhzNCcWsFsSW5VJqRM5DDFdwYHkjOK/0xDTLWlZhdMQ0x0EY1aXOZDlyU7214k8AhUEcZ1IT2CJV2HZTLETN43WVnir477SFpc5kCaxrQS2grCsQNtbaKNUYpm3ba+DpUiJiEoMDRfBTsoSuOTN+yLYibFP7f+8sBxlQmVgEMzDvpytZAFsZNc+N5x1GSwDQZmqAcndlmwpsAzXvmqdyFZywSZ3RjJC9+47oGXJ71h07avWiUiGvkXVSuy+7BHMGGtRL1QJqj1101MnklwgG1wGhHyzdAoHnCmwAbbP+3zVPXUiCtVAjZQG9BaxeDHVVAp7et5qrzSzr7FO5N2JWdQ0kB06R8OR0fPtn567OjNxjaMMWYgYCWxo5RypTzZvrBM5e2WBcAAVSwhTfuIJztbwiUG4XZjQU80y9ZtGYw4tLp2OVEQWzy+NzEWmGo1OZCLupgK3fAhty3CWEVHmnBDdG5lTJFUiqHgu0hNMMVDIFaamwIaorX2+GaomM5/UtRCy8gvOSHJqtMfn65s524G5ECruA9kXOEe6bwU3UoPRYSmBH275BRL2nCAgvU68kaD2dVzmUC1vcHIcxTmOAVvdzCOKLnL0ohDWDxEIPdWxdNmwXdeJCO5PYrA4UvJwCMRoIrl3LUuwUeovlAPL+88vRb5q1n6uA+ko25Oiut1H81MYCPd6qRER/gUh0u8QUa+0GAAAAABJRU5ErkJggg=="

function Flower({ size = 30 }: { size?: number }) {
    return (
        <span
            className="aag-flower"
            aria-hidden="true"
            style={{ width: size, height: size }}
        >
            <img src={FLOWER_SRC} alt="" width={size} height={size} draggable={false} />
        </span>
    )
}

/* ---------------------------------------------------------------------------
   FLOATING STATUS — small floating pill on every page.
   Circular avatar + copyable email + a live "open to work" status.
--------------------------------------------------------------------------- */
function StatusFab({
    email,
    profileSrc,
    label,
    statusText,
    copyLabel,
    copiedLabel,
}: {
    email: string
    profileSrc: string
    label: string
    statusText: string
    copyLabel: string
    copiedLabel: string
}) {
    const [copied, setCopied] = useState(false)
    const tRef = useRef<number | null>(null)
    const copy = useCallback(() => {
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(email)
            }
        } catch (e) {
            /* clipboard unavailable */
        }
        setCopied(true)
        if (typeof window !== "undefined") {
            if (tRef.current) window.clearTimeout(tRef.current)
            tRef.current = window.setTimeout(() => setCopied(false), 1800)
        }
    }, [email])
    useEffect(
        () => () => {
            if (tRef.current && typeof window !== "undefined") window.clearTimeout(tRef.current)
        },
        []
    )
    return (
        <div className="aag-fab" role="group" aria-label={label}>
            <button
                type="button"
                className="aag-fab-mail"
                onClick={copy}
                aria-label={`${copyLabel}: ${email}`}
                title={email}
            >
                <span className="aag-fab-avatar" aria-hidden="true">
                    <img src={profileSrc} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="aag-fab-email">{email}</span>
                <span className="aag-fab-copy" aria-hidden="true">
                    {copied ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="11" height="11" rx="2.5" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h8" />
                        </svg>
                    )}
                </span>
                <span className={"aag-fab-toast" + (copied ? " is-on" : "")} aria-live="polite">
                    {copiedLabel}
                </span>
            </button>
            <span className="aag-fab-divider" aria-hidden="true" />
            <span className="aag-fab-status">
                <span className="aag-fab-dot" aria-hidden="true" />
                <span className="aag-fab-status-text">{statusText}</span>
            </span>
        </div>
    )
}

interface ProjectDetailPageProps {
    profileImage?: { src?: string; srcSet?: string; alt?: string }
    email?: string
    linkedinUrl?: string
    projectsUrl?: string
    accent?: string
    defaultLanguage?: Lang
    style?: CSSProperties
}

/**
 * Project Detail page — Auxi Arroyo García
 *
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
/* ==========================================================================
   AAG_CURSOR — site-wide custom cursor (desktop / fine-pointer only).
   A soft dot + ring trails the pointer. Over interactive elements the ring
   grows and inverts (mix-blend); over elements carrying a data-cursor-label it
   swaps to a floating pill ("View Project"). Falls back to the native cursor on
   touch, reduced-motion and the static renderer.
   ========================================================================== */
function AagCursor() {
    const isStatic = useIsStaticRenderer()
    const boxRef = useRef<HTMLDivElement | null>(null)
    const labelRef = useRef<HTMLSpanElement | null>(null)
    useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        const mm = window.matchMedia
        if (!mm || !mm("(pointer: fine)").matches || mm("(prefers-reduced-motion: reduce)").matches) return
        const rootEl = document.documentElement
        rootEl.classList.add("aag-cursor-on")
        const box = boxRef.current
        const labelEl = labelRef.current
        let x = window.innerWidth / 2, y = window.innerHeight / 2, tx = x, ty = y, raf = 0
        const render = () => {
            x += (tx - x) * 0.22
            y += (ty - y) * 0.22
            if (box) box.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`
            if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) { raf = window.requestAnimationFrame(render) } else { raf = 0 }
        }
        const kick = () => { if (!raf) raf = window.requestAnimationFrame(render) }
        const onMove = (e: PointerEvent) => {
            tx = e.clientX; ty = e.clientY
            if (box && !box.classList.contains("is-visible")) box.classList.add("is-visible")
            const el = e.target as HTMLElement | null
            const labelHost = el && el.closest ? (el.closest("[data-cursor-label]") as HTMLElement | null) : null
            const interactive = el && el.closest ? el.closest("a, button, [role='button'], input, textarea, select, label, summary") : null
            if (box) {
                if (labelHost) {
                    box.classList.add("is-label"); box.classList.remove("is-link")
                    if (labelEl) labelEl.textContent = labelHost.getAttribute("data-cursor-label") || ""
                } else if (interactive) {
                    box.classList.add("is-link"); box.classList.remove("is-label")
                } else {
                    box.classList.remove("is-link"); box.classList.remove("is-label")
                }
            }
            kick()
        }
        const onOut = () => { if (box) box.classList.remove("is-visible") }
        const onDown = () => { if (box) box.classList.add("is-down") }
        const onUp = () => { if (box) box.classList.remove("is-down") }
        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerdown", onDown, { passive: true })
        window.addEventListener("pointerup", onUp, { passive: true })
        document.addEventListener("pointerleave", onOut)
        return () => {
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointerup", onUp)
            document.removeEventListener("pointerleave", onOut)
            rootEl.classList.remove("aag-cursor-on")
            if (raf) window.cancelAnimationFrame(raf)
        }
    }, [isStatic])
    return (
        <div className="aag-cursor" ref={boxRef} aria-hidden="true">
            <span className="aag-cursor-dot" />
            <span className="aag-cursor-ring" />
            <span className="aag-cursor-label" ref={labelRef} />
        </div>
    )
}

export default function ProjectDetailPage(props: ProjectDetailPageProps) {
    const {
        profileImage,
        email = EMAIL,
        linkedinUrl = LINKEDIN_URL,
        projectsUrl = PROJECTS_URL,
        accent = "#ff654d",
        defaultLanguage = "es",
    } = props

    const isStatic = useIsStaticRenderer()
    const portalHost = usePortalHost(accent)

    /* ---- language state + persistence (shared key across the whole site) ---- */
    const [lang, setLang] = useState<Lang>(defaultLanguage)
    const [fading, setFading] = useState(false)
    const reduceMotionRef = useRef(false)

    useEffect(() => {
        if (typeof window === "undefined") return
        reduceMotionRef.current =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        try {
            const saved = window.localStorage.getItem("aag-about-lang")
            if (saved === "es" || saved === "en") setLang(saved)
        } catch (e) {
            /* localStorage unavailable — keep default */
        }
    }, [])

    const changeLang = useCallback(
        (next: Lang) => {
            if (next === lang) return
            const persist = () => {
                try {
                    if (typeof window !== "undefined")
                        window.localStorage.setItem("aag-about-lang", next)
                } catch (e) {
                    /* ignore */
                }
            }
            if (isStatic || reduceMotionRef.current || typeof window === "undefined") {
                setLang(next)
                persist()
                return
            }
            setFading(true)
            window.setTimeout(() => {
                setLang(next)
                persist()
                setFading(false)
            }, 160)
        },
        [lang, isStatic]
    )

    const t = CONTENT[lang]

    /* keep <html lang> in sync for accessibility on the published site */
    useEffect(() => {
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.lang = t.htmlLang
        }
    }, [t.htmlLang])

    /* ---- navigation state (compact by default, expands on hover/tap) ---- */
    const [navOpen, setNavOpen] = useState(false)
    const { theme, toggleTheme } = useAagTheme()

    /* ---- back-to-top floating button ---- */
    const [showTop, setShowTop] = useState(false)
    useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        const onScroll = () => setShowTop(window.scrollY > 640)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [isStatic])
    const scrollToTop = useCallback(() => {
        if (typeof window === "undefined") return
        const behavior: ScrollBehavior = reduceMotionRef.current ? "auto" : "smooth"
        window.scrollTo({ top: 0, behavior })
    }, [])

    /* ---- SCROLL PROGRESS for the cover → story crossfade ---- */
    const introRef = useRef<HTMLDivElement | null>(null)
    const [progress, setProgress] = useState(0)
    /* animate only when we truly can (not static, not reduced motion). Resolve
       synchronously at first render so the published page starts pinned and
       never shifts from the flat layout to the pinned one after hydration. */
    const [animate, setAnimate] = useState<boolean>(() => {
        if (isStatic || typeof window === "undefined") return false
        try {
            return !(
                typeof window.matchMedia === "function" &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            )
        } catch (e) {
            return false
        }
    })
    /* the scroll-track height is measured in PIXELS from the real viewport, so
       it never depends on `vh` (which misbehaves on the Framer canvas). */
    const trackFactor = (w: number) => (w <= 480 ? 1.75 : w <= 760 ? 1.95 : 2.1)
    const [trackH, setTrackH] = useState<number>(() => {
        if (typeof window === "undefined") return 0
        const vh = window.innerHeight || 800
        const w = window.innerWidth || 1200
        return Math.round(vh * trackFactor(w))
    })

    useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduce) return
        setAnimate(true)
        const el = introRef.current
        if (!el) return
        let raf = 0
        const setTrack = () => {
            const vh = window.innerHeight || 800
            const w = window.innerWidth || 1200
            setTrackH(Math.round(vh * trackFactor(w)))
        }
        const measure = () => {
            raf = 0
            const rect = el.getBoundingClientRect()
            const vh = window.innerHeight || 1
            const total = rect.height - vh
            const prog = total > 0 ? clamp01(-rect.top / total) : 0
            setProgress(prog)
        }
        const onScroll = () => {
            if (raf) return
            raf = window.requestAnimationFrame(measure)
        }
        const onResize = () => {
            setTrack()
            onScroll()
        }
        setTrack()
        measure()
        window.addEventListener("scroll", onScroll, { passive: true })
        window.addEventListener("resize", onResize)
        return () => {
            if (raf) window.cancelAnimationFrame(raf)
            window.removeEventListener("scroll", onScroll)
            window.removeEventListener("resize", onResize)
        }
    }, [isStatic])

    /* ---- subtle pointer parallax on the cover (hover sophistication) ---- */
    const coverInnerRef = useRef<HTMLDivElement | null>(null)
    const pRaf = useRef(0)
    const onCoverMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!animate || reduceMotionRef.current || typeof window === "undefined") return
        if (e.pointerType === "touch") return
        const el = coverInnerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height) return
        const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2))
        const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2))
        if (pRaf.current) return
        pRaf.current = window.requestAnimationFrame(() => {
            pRaf.current = 0
            el.style.setProperty("--mx", nx.toFixed(3))
            el.style.setProperty("--my", ny.toFixed(3))
        })
    }
    const onCoverLeave = () => {
        const el = coverInnerRef.current
        if (!el) return
        el.style.setProperty("--mx", "0")
        el.style.setProperty("--my", "0")
    }

    /* ---- derived hero style from scroll progress ----
       Single layer only: the pinned hero calmly fades, lifts and softens as
       you scroll. The explanation lives in normal flow below, so nothing ever
       overlaps. */
    const out = smooth(mapRange(progress, 0, 0.72)) // hero leaving 0→1
    const cueOpacity = 1 - mapRange(progress, 0, 0.12)

    const heroStyle: CSSProperties = animate
        ? {
              opacity: 1 - out,
              transform: `translate3d(0, ${(-44 * out).toFixed(2)}px, 0) scale(${(1 - 0.03 * out).toFixed(4)})`,
              filter: out > 0.008 ? `blur(${(7 * out).toFixed(2)}px)` : "none",
              pointerEvents: out > 0.5 ? "none" : "auto",
          }
        : {}

    /* Profile photo: panel control wins, otherwise the uploaded default. */
    const photoSrc = profileImage && profileImage.src ? profileImage.src : PROFILE_SRC
    const photoSrcSet =
        profileImage && profileImage.srcSet ? profileImage.srcSet : undefined

    /* ---- nav items (About · Projects · Contact) — real page links ---- */
    const navItems: { key: string; label: string; href: string }[] = [
        { key: "home", label: t.nav.home, href: "/" },
        { key: "about", label: t.nav.about, href: "/about" },
        { key: "projects", label: t.nav.projects, href: "/projects" },
        { key: "garden", label: t.nav.garden, href: "/digital-garden" },
        { key: "contact", label: t.nav.contact, href: "/contact" },
    ]

    const p = PROJECT
    const sectionNavItems: { id: string; label: string }[] = [
        { id: "pd-overview", label: t.overviewLabel },
        ...p.sections.map((s) => ({ id: `pd-sec-${s.key}`, label: s.heading[lang] })),
    ]
    const metaItems: { label: string; value: string }[] = [
        { label: t.yearLabel, value: p.year },
        { label: t.roleLabel, value: p.role[lang] },
        { label: t.clientLabel, value: p.client[lang] },
    ]

    /* footer "let's talk" target: contact page if set, else a mailto */
    const contactUrl = (CONTACT_URL || "").trim()
    const contactHref = contactUrl || `mailto:${email}`

    return (
        <div
            className={`aag-root${isStatic ? " aag-static" : ""}`}
            style={{
                width: "100%",
                position: "relative",
                ["--accent" as any]: accent,
            }}
        >
            <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
            {/* ===================== NAVIGATION (identical to the site) ===================== */}
            <div className="aag-nav-wrap">
                <nav className={`aag-nav ${navOpen ? "is-open" : ""}`} aria-label={t.nav.projects}>
                    <SiteLink href="/">
                        <a className="aag-brand" href="/" aria-label={t.name}>
                            <span className="aag-avatar" aria-hidden="true">
                                <img src={photoSrc} srcSet={photoSrcSet} alt="" loading="eager" decoding="async" />
                            </span>
                            <span className="aag-brand-name">{t.name}</span>
                        </a>
                    </SiteLink>

                    <div className="aag-nav-right">
                        <div className="aag-nav-menu">
                            <div className="aag-nav-menu-inner">
                                <div className="aag-nav-links" role="list">
                                    {navItems.map((item) => (
                                        <SiteLink key={item.key} href={item.href}>
                                            <a
                                                className="aag-nav-link"
                                                href={item.href}
                                                role="listitem"
                                            >
                                                {item.label}
                                            </a>
                                        </SiteLink>
                                    ))}
                                </div>
                                <ThemeToggle
                                    theme={theme}
                                    onToggle={toggleTheme}
                                    label={lang === "es" ? "Cambiar tema" : "Switch theme"}
                                />
                                <div className="aag-lang" role="group" aria-label={t.langAria}>
                                    <button
                                        type="button"
                                        className={`aag-lang-btn ${lang === "es" ? "is-active" : ""}`}
                                        aria-pressed={lang === "es"}
                                        onClick={() => changeLang("es")}
                                    >
                                        ES
                                    </button>
                                    <span className="aag-lang-sep" aria-hidden="true">/</span>
                                    <button
                                        type="button"
                                        className={`aag-lang-btn ${lang === "en" ? "is-active" : ""}`}
                                        aria-pressed={lang === "en"}
                                        onClick={() => changeLang("en")}
                                    >
                                        EN
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            className="aag-dots"
                            aria-label={t.menuLabel}
                            aria-expanded={navOpen}
                            onClick={() => setNavOpen((v) => !v)}
                        >
                            <span className="aag-dot" />
                            <span className="aag-dot" />
                            <span className="aag-dot" />
                        </button>
                    </div>
                </nav>

                {/* touch / small-screen dropdown */}
                <div className={`aag-mobile-menu ${navOpen ? "is-open" : ""}`}>
                    {navItems.map((item) => (
                        <SiteLink key={item.key} href={item.href}>
                            <a
                                className="aag-mobile-link"
                                href={item.href}
                                onClick={() => setNavOpen(false)}
                            >
                                {item.label}
                            </a>
                        </SiteLink>
                    ))}
                    <ThemeToggle
                        theme={theme}
                        onToggle={toggleTheme}
                        label={lang === "es" ? "Cambiar tema" : "Switch theme"}
                    />
                    <div className="aag-mobile-lang" role="group" aria-label={t.langAria}>
                        <button
                            type="button"
                            className={`aag-lang-btn ${lang === "es" ? "is-active" : ""}`}
                            aria-pressed={lang === "es"}
                            onClick={() => changeLang("es")}
                        >
                            ES
                        </button>
                        <span className="aag-lang-sep" aria-hidden="true">/</span>
                        <button
                            type="button"
                            className={`aag-lang-btn ${lang === "en" ? "is-active" : ""}`}
                            aria-pressed={lang === "en"}
                            onClick={() => changeLang("en")}
                        >
                            EN
                        </button>
                    </div>
                </div>
            </div>

            {/* ===================== CONTENT ===================== */}
            <main
                className="aag-main"
                style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s ease" }}
            >
                {/* ---------- STICKY HERO (pinned, single-layer scroll fade) ---------- */}
                <section
                    className={`pd-intro ${animate ? "" : "pd-intro--flat"}`}
                    ref={introRef}
                    aria-labelledby="pd-title"
                    style={animate && trackH ? { height: `${trackH}px` } : undefined}
                >
                    <div className="pd-intro-sticky">
                        <div
                            className="pd-hero"
                            style={heroStyle}
                            onPointerMove={onCoverMove}
                            onPointerLeave={onCoverLeave}
                        >
                            <div className="pd-hero-inner" ref={coverInnerRef}>
                                <h1 id="pd-title" className="pd-hero-title">
                                    {p.title[lang]}
                                </h1>
                                <span className="pd-hero-cat">{p.category[lang]}</span>
                            </div>
                        </div>
                        <div
                            className="pd-scrollcue"
                            style={{ opacity: animate ? cueOpacity : 1 }}
                            aria-hidden="true"
                        >
                            <span className="pd-scrollcue-label">{t.scrollCue}</span>
                            <span className="pd-scrollcue-line" />
                        </div>
                    </div>
                </section>

                {/* ---------- STORY ---------- */}
                <article className="pd-story">
                    {/* lead statement — the bridge from the cover into the story */}
                    <section className="aag-section pd-leadblock" aria-label={t.overviewLabel}>
                        <Reveal blur>
                            <p className="pd-lead-statement">{p.lead[lang]}</p>
                        </Reveal>
                    </section>

                    {/* credits grid */}
                    <section className="aag-section pd-metablock" aria-label={t.overviewLabel}>
                        <Reveal blur className="pd-meta-grid">
                            {metaItems.map((m) => (
                                <div className="pd-meta-cell" key={m.label}>
                                    <span className="pd-meta-label">{m.label}</span>
                                    <span className="pd-meta-value">{m.value}</span>
                                </div>
                            ))}
                            <div className="pd-meta-cell pd-meta-cell--wide">
                                <span className="pd-meta-label">{t.servicesLabel}</span>
                                <div className="pd-services">
                                    {p.services[lang].map((s) => (
                                        <span className="pd-service-chip" key={s}>
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </Reveal>
                    </section>

                    {/* overview */}
                    <section className="aag-section pd-overview" id="pd-overview" aria-label={t.overviewLabel}>
                        <Reveal blur>
                            <span className="pd-eyebrow">{t.overviewLabel}</span>
                        </Reveal>
                        <div className="pd-prose">
                            {p.overview[lang].map((para, i) => (
                                <Reveal key={i} blur delay={0.04 * Math.min(i, 3)}>
                                    <p className="pd-para pd-para--lead">{para}</p>
                                </Reveal>
                            ))}
                        </div>
                    </section>

                    {/* first media placeholder */}
                    <section className="aag-section pd-mediablock" aria-hidden="true">
                        <Reveal blur tag="figure" className="pd-media pd-media--wide">
                            <span className="pd-media-tag">16 / 9</span>
                        </Reveal>
                    </section>

                    {/* pull quote */}
                    <section className="aag-section pd-quoteblock">
                        <Reveal blur>
                            <blockquote className="pd-quote">
                                <span className="pd-quote-mark" aria-hidden="true">“</span>
                                {p.quote[lang]}
                            </blockquote>
                        </Reveal>
                    </section>

                    {/* story sections */}
                    {p.sections.map((sec, si) => (
                        <section
                            className="aag-section pd-section"
                            key={sec.key}
                            aria-labelledby={`pd-sec-${sec.key}`}
                        >
                            <div className="pd-section-grid">
                                <Reveal blur className="pd-section-head">
                                    <span className="pd-section-index">
                                        {String(si + 1).padStart(2, "0")}
                                    </span>
                                    <h2 id={`pd-sec-${sec.key}`} className="pd-section-title">
                                        {sec.heading[lang]}
                                    </h2>
                                </Reveal>
                                <div className="pd-section-body">
                                    {sec.body[lang].map((para, i) => (
                                        <Reveal key={i} blur delay={0.05 * Math.min(i, 3)}>
                                            <p className="pd-para">{para}</p>
                                        </Reveal>
                                    ))}
                                </div>
                            </div>
                            {si === 1 ? (
                                <Reveal blur tag="figure" className="pd-media pd-media--tall">
                                    <span className="pd-media-tag">4 / 3</span>
                                </Reveal>
                            ) : null}
                        </section>
                    ))}

                    {/* ---------- KEEP EXPLORING — related project cards ---------- */}
                    <section className="aag-section pd-next" aria-label={t.nextEyebrow}>
                        <Reveal blur>
                            <span className="pd-eyebrow pd-next-eyebrow">{t.nextEyebrow}</span>
                        </Reveal>
                        <Reveal blur className="pd-related-grid">
                            {RELATED.map((r) => (
                                <SiteLink href={r.href} key={r.key}>
                                <a className="pd-related-card" href={r.href} data-cursor-label={t.nextLabel}>
                                    <span className="pd-related-media">
                                        <img
                                            src={r.img}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            draggable={false}
                                        />
                                    </span>
                                    <span className="pd-related-cat">{r.category[lang]}</span>
                                    <span className="pd-related-title">{r.title[lang]}</span>
                                    <span className="pd-related-info">{r.info[lang]}</span>
                                </a>
                                </SiteLink>
                            ))}
                        </Reveal>
                        <Reveal blur>
                            <SiteLink href={projectsUrl}>
                                <a className="pd-related-all" href={projectsUrl}>
                                    {t.backToProjects}
                                </a>
                            </SiteLink>
                        </Reveal>
                    </section>
                </article>

                {/* ---------- FOOTER (identical to About / Projects) ---------- */}
                <div className="aag-footer-shell">
                    <footer className="aag-section aag-footer" id="contacto">
                        <div className="aag-footer-top">
                            <Reveal>
                                <p className="aag-footer-small">{t.contactSmall}</p>
                            </Reveal>
                        </div>

                        <Reveal>
                            <SiteLink href={contactHref}>
                            <a className="aag-footer-big-link" href={contactHref}>
                                <h2 className="aag-footer-big">{t.contactBig}</h2>
                                <span className="aag-footer-arrow" aria-hidden="true">
                                    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M5 12h14M13 6l6 6-6 6" />
                                    </svg>
                                </span>
                            </a>
                            </SiteLink>
                        </Reveal>

                        <div className="aag-footer-bottom">
                            <div className="aag-footer-socials">
                                <a className="aag-social" href={`mailto:${email}`} aria-label={t.email} title={t.email}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <rect x="3" y="5" width="18" height="14" rx="2.5" />
                                        <path d="M4 7l8 6 8-6" />
                                    </svg>
                                </a>
                                <a className="aag-social" href={linkedinUrl} target="_blank" rel="noreferrer" aria-label={t.linkedin} title={t.linkedin}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C21.6 8.65 23 10.6 23 14v7h-4v-6.2c0-1.48-.03-3.38-2.06-3.38-2.06 0-2.38 1.6-2.38 3.27V21h-4V9Z" />
                                    </svg>
                                </a>
                            </div>
                            <p className="aag-footer-copy">
                                © {t.name}. {t.rights}
                            </p>
                        </div>
                    </footer>
                </div>
            </main>

            {/* ===================== FLOATING UI (section nav · back to top · status pill) =====================
                Portalled into body so position:fixed resolves against the window,
                not against Framer's clipped page frame. */}
            {portalHost && createPortal(
                <>
                    <SectionNav items={sectionNavItems} label={t.overviewLabel} />

                    <button
                        type="button"
                        className={`aag-totop ${showTop ? "is-visible" : ""}`}
                        onClick={scrollToTop}
                        aria-label={t.backToTop}
                        title={t.backToTop}
                        tabIndex={showTop ? 0 : -1}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 19V5M6 11l6-6 6 6" />
                        </svg>
                    </button>

                    <StatusFab
                        email={FAB_EMAIL}
                        profileSrc={photoSrc}
                        label={t.fab.label}
                        statusText={t.fab.status}
                        copyLabel={t.fab.copy}
                        copiedLabel={t.fab.copied}
                    />
                </>,
                portalHost
            )}
        </div>
    )
}

addPropertyControls(ProjectDetailPage, {
    profileImage: {
        type: ControlType.ResponsiveImage,
        title: "Profile Photo",
    },
    email: {
        type: ControlType.String,
        title: "Email",
        defaultValue: EMAIL,
        placeholder: "you@example.com",
    },
    linkedinUrl: {
        type: ControlType.Link,
        title: "LinkedIn",
        defaultValue: LINKEDIN_URL,
    },
    projectsUrl: {
        type: ControlType.Link,
        title: "Projects Page",
        defaultValue: PROJECTS_URL,
    },
    accent: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#ff654d",
    },
    defaultLanguage: {
        type: ControlType.Enum,
        title: "Default Lang",
        options: ["es", "en"],
        optionTitles: ["Español", "English"],
        defaultValue: "es",
        displaySegmentedControl: true,
    },
})

/* ==========================================================================
   STYLES
   The shared block below is the EXACT CSS from the Projects / About pages —
   tokens, header/nav, footer (curved separator), back-to-top and responsive
   breakpoints — so this page is visually identical where it reuses the design
   system. Only the Project-Detail-specific additions follow it.
   ========================================================================== */
const CSS_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.aag-root {
    --background: #f7f7f5;
    --surface: #ffffff;
    --text: #161616;
    --muted: #666666;
    --border: #deded9;
    --shadow: 0 12px 30px rgba(0,0,0,0.07);
    --shadow-sm: 0 4px 14px rgba(0,0,0,0.05);
    --maxw: 1240px;
    --pad: 40px;
    background: var(--background);
    color: var(--text);
    font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    line-height: 1.5;
    font-size: 16px;
}
/* ---------- PAGE TRANSITION (soft fade-in on load) ---------- */
.aag-root { animation: aag-page-in 0.55s cubic-bezier(0.22,0.61,0.36,1) both; }
.aag-root.aag-static { animation: none; }
/* Host for viewport-anchored UI portalled into body: invisible and weightless.
   Not aag-static, which is the global no-motion switch and would also kill the
   status pill entrance and its pulsing dot. */
.aag-root.aag-portal { background: transparent; animation: none; height: 0; width: 0; }
@keyframes aag-page-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .aag-root { animation: none; } }
.aag-root *, .aag-root *::before, .aag-root *::after { box-sizing: border-box; }
.aag-root p { margin: 0; }
.aag-root h1, .aag-root h2, .aag-root h3 { margin: 0; font-weight: 600; }
.aag-root ul { list-style: none; margin: 0; padding: 0; }
.aag-root button { font-family: inherit; }
.aag-root a { color: inherit; text-decoration: none; }
.aag-root :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 6px;
}

/* ---------- NAV ---------- */
.aag-nav-wrap {
    position: sticky;
    top: 16px;
    z-index: 10;
    width: 100%;
    padding: 0 var(--pad);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
}
.aag-nav {
    pointer-events: auto;
    width: fit-content;
    max-width: 100%;
    min-width: 320px;
    display: flex;
    align-items: center;
    background: rgba(255,255,255,0.86);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    border-radius: 999px;
    padding: 7px 12px 7px 7px;
    transition: box-shadow 0.3s ease, min-width 0.42s cubic-bezier(0.4,0,0.2,1);
    transform: translateZ(0);
    isolation: isolate;
    backface-visibility: hidden;
}
.aag-nav:hover { box-shadow: var(--shadow); }
.aag-brand {
    display: inline-flex;
    align-items: center;
    gap: 13px;
    margin-right: 20px;
    background: transparent;
    border: none;
    padding: 3px 6px 3px 3px;
    cursor: pointer;
    border-radius: 999px;
    color: var(--text);
    flex-shrink: 0;
}
.aag-avatar {
    width: 34px; height: 34px;
    border-radius: 50%;
    background: #ececE8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
}
.aag-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
.aag-brand-name { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }

/* ---- compact ↔ expanded reveal ---- */
.aag-nav-right { margin-left: auto; display: flex; align-items: center; flex-shrink: 0; }
.aag-nav-menu {
    display: grid;
    grid-template-columns: 0fr;
    transition: grid-template-columns 0.42s cubic-bezier(0.4,0,0.2,1);
}
.aag-nav-menu-inner {
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    opacity: 0;
    transition: opacity 0.28s ease 0.04s;
}
.aag-dots {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 8px 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 999px;
    transition: opacity 0.28s ease, width 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s ease, margin 0.3s ease, visibility 0s linear 0s;
}
.aag-dot {
    display: block;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #bdbdb5;
    animation: aag-typing 1.4s infinite ease-in-out both;
}
.aag-dot:nth-child(2) { animation-delay: 0.18s; }
.aag-dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes aag-typing {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; background: #c8c8c0; }
    30% { transform: translateY(-4px); opacity: 1; background: var(--text); }
}

/* Reveal on hover / keyboard focus / tap-open (pointer devices) */
@media (min-width: 811px) {
    .aag-nav:hover .aag-nav-menu,
    .aag-nav:focus-within .aag-nav-menu,
    .aag-nav.is-open .aag-nav-menu { grid-template-columns: 1fr; }
    .aag-nav:hover .aag-nav-menu-inner,
    .aag-nav:focus-within .aag-nav-menu-inner,
    .aag-nav.is-open .aag-nav-menu-inner { opacity: 1; }
    .aag-nav:hover .aag-dots,
    .aag-nav:focus-within .aag-dots,
    .aag-nav.is-open .aag-dots {
        opacity: 0;
        width: 0;
        padding: 0;
        margin: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.24s ease, width 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s ease, margin 0.3s ease, visibility 0s linear 0.28s;
    }
}
.aag-nav-links {
    display: flex;
    align-items: center;
    gap: 2px;
}
.aag-nav-link {
    position: relative;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: -0.01em;
    padding: 8px 13px;
    border-radius: 999px;
    white-space: nowrap;
    transition: color 0.24s cubic-bezier(0.22,0.61,0.36,1);
}
.aag-nav-link:hover, .aag-nav-link:focus-visible { color: var(--text); }
.aag-nav-link.is-current { color: var(--accent); }
.aag-lang {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    margin-left: 4px;
    flex-shrink: 0;
}
.aag-lang-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    padding: 4px 5px;
    border-radius: 6px;
    transition: color 0.2s ease;
}
.aag-lang-btn:hover { color: var(--text); }
.aag-lang-btn.is-active { color: var(--accent); }
.aag-lang-sep { color: var(--border); font-size: 12px; }
.aag-mobile-lang {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 10px 14px 4px;
    margin-top: 4px;
    border-top: 1px solid var(--border);
}
.aag-mobile-menu {
    pointer-events: auto;
    width: 100%;
    max-width: 420px;
    margin-top: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    border-radius: 20px;
    padding: 8px;
    display: none;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.aag-mobile-menu.is-open { opacity: 1; transform: translateY(0); }
.aag-mobile-link {
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text);
    font-size: 16px;
    font-weight: 500;
    padding: 12px 14px;
    border-radius: 12px;
    min-height: 44px;
}
.aag-mobile-link:hover, .aag-mobile-link:focus-visible { color: var(--accent); }
.aag-mobile-link.is-current { color: var(--accent); }

/* ---------- LAYOUT ---------- */
.aag-main { width: 100%; }
.aag-section {
    width: 100%;
    max-width: var(--maxw);
    margin: 0 auto;
    padding-left: var(--pad);
    padding-right: var(--pad);
}
.aag-h1 {
    font-size: clamp(44px, 7vw, 88px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.0;
}
.aag-h2 {
    font-size: clamp(24px, 3vw, 32px);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
}

/* ---------- HERO ---------- */
.aag-hero { padding-top: 92px; scroll-margin-top: 96px; }
.aag-hero-grid {
    display: grid;
    grid-template-columns: minmax(300px, 400px) 1fr;
    gap: clamp(52px, 6.5vw, 116px);
    align-items: start;
}
.aag-photo {
    width: 100%;
    aspect-ratio: 4 / 5;
    background: #e9e9e5;
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-sm);
}
.aag-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.aag-photo-ph { font-size: 56px; font-weight: 600; color: #c4c4bd; letter-spacing: -0.02em; }
.aag-hero-id {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 30px;
}
.aag-hero-name { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
.aag-hero-role { font-size: 15px; color: var(--muted); margin-top: 4px; }
.aag-hero-loc { font-size: 13px; color: var(--muted); margin-top: 7px; opacity: 0.85; }
.aag-accent-mark { flex-shrink: 0; filter: drop-shadow(0 8px 16px rgba(255,101,77,0.28)); line-height: 0; }
.aag-accent-mark img { display: block; width: 56px; height: 56px; }
.aag-hero-right { padding-top: 12px; }
.aag-lead { margin-top: 44px; display: flex; flex-direction: column; gap: 26px; max-width: 620px; }
.aag-lead p { font-size: 16px; line-height: 1.75; color: #3a3a3a; }

/* ---------- TWO COLUMN (exp + edu) ---------- */
.aag-exp { padding-top: clamp(70px, 9vw, 130px); scroll-margin-top: 96px; }
.aag-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(28px, 4vw, 56px);
    align-items: start;
}
.aag-col { min-width: 0; }
.aag-card-list { margin-top: clamp(44px, 4.5vw, 60px); display: flex; flex-direction: column; gap: 16px; }
.aag-card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow-sm);
    padding: 20px 22px;
    text-align: left;
}
.aag-exp-card, .aag-edu-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
    transition: transform 0.24s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.24s ease, border-color 0.24s ease;
}
.aag-exp-card:hover, .aag-edu-card:hover,
.aag-exp-card:focus-visible, .aag-edu-card:focus-visible {
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    border-color: #d3d3cc;
}
.aag-card-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.aag-card-title { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
.aag-card-company { font-size: 14px; color: var(--muted); }
.aag-card-period { font-size: 13px; color: var(--muted); opacity: 0.85; margin-top: 1px; }
.aag-card-cta { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
.aag-card-hint {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--accent);
    opacity: 0;
    transform: translateX(4px);
    transition: opacity 0.24s ease, transform 0.24s ease;
}
.aag-card-arrow {
    width: 32px; height: 32px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.24s cubic-bezier(0.22,0.61,0.36,1), background 0.24s ease, color 0.24s ease, border-color 0.24s ease;
}
.aag-exp-card:hover .aag-card-hint, .aag-exp-card:focus-visible .aag-card-hint,
.aag-edu-card:hover .aag-card-hint, .aag-edu-card:focus-visible .aag-card-hint { opacity: 1; transform: translateX(0); }
.aag-exp-card:hover .aag-card-arrow, .aag-exp-card:focus-visible .aag-card-arrow,
.aag-edu-card:hover .aag-card-arrow, .aag-edu-card:focus-visible .aag-card-arrow {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: translateX(2px);
}
.aag-edu-main { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.aag-edu-title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.35; }
.aag-edu-org { font-size: 14px; color: var(--muted); }
.aag-edu-period { font-size: 13px; color: var(--muted); opacity: 0.85; }
.aag-viewall-wrap { margin-top: 20px; }
.aag-viewall {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 9px 18px;
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    transition: background 0.2s ease, border-color 0.2s ease;
}
.aag-viewall:hover { background: var(--surface); border-color: #d0d0c8; }
.aag-viewall-chevron {
    width: 8px; height: 8px;
    border-right: 1.6px solid currentColor;
    border-bottom: 1.6px solid currentColor;
    transform: rotate(45deg);
    transition: transform 0.25s ease;
    margin-top: -3px;
}
.aag-viewall-chevron.up { transform: rotate(-135deg); margin-top: 2px; }

/* ---------- LOGO MARQUEE ---------- */
.aag-logos { padding-top: clamp(70px, 9vw, 120px); }
.aag-logos-heading { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.aag-marquee {
    margin-top: 22px;
    position: relative;
    overflow: hidden;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    padding: 30px 0;
    /* fade edges for a premium finish */
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
    mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.aag-marquee-track {
    display: flex;
    align-items: center;
    width: max-content;
    gap: clamp(38px, 5vw, 68px);
    animation: aag-marquee 46s linear infinite;
    will-change: transform;
}
.aag-marquee:hover .aag-marquee-track { animation-play-state: paused; }
@keyframes aag-marquee {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(-50%, 0, 0); }
}
.aag-logo {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 30px;
    opacity: 0.5;
    filter: grayscale(1);
    transition: opacity 0.25s ease;
}
.aag-logo:hover { opacity: 0.9; }
.aag-logo img { height: 100%; width: auto; object-fit: contain; display: block; }
.aag-logo-word {
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #2a2a2a;
    white-space: nowrap;
}

/* ---------- SKILLS ---------- */
.aag-skills { padding-top: clamp(70px, 9vw, 130px); scroll-margin-top: 96px; }
.aag-skills-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(32px, 5vw, 72px);
    align-items: start;
}
.aag-skills-left { position: sticky; top: 96px; }
.aag-skills-title {
    font-size: clamp(30px, 3.6vw, 46px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.08;
}
.aag-tools { margin-top: 34px; }
.aag-tools-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.aag-tools-list { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 12px; }
.aag-tool { position: relative; display: inline-flex; }
.aag-tool-tile {
    width: 44px; height: 44px;
    border-radius: 12px;
    background: var(--text);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    cursor: default;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s cubic-bezier(0.22,0.61,0.36,1), background 0.2s ease;
}
.aag-tool-tile:hover, .aag-tool-tile:focus-visible { transform: translateY(-3px); background: #000; }
.aag-tool-tip {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%) translateY(4px);
    background: var(--text);
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: -0.005em;
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.16);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease, transform 0.18s ease;
    z-index: 5;
}
.aag-tool-tip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: var(--text);
}
.aag-tool:hover .aag-tool-tip, .aag-tool:focus-within .aag-tool-tip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
}
.aag-skill-list { display: flex; flex-direction: column; }
.aag-skill-item { border-bottom: 1px solid var(--border); }
.aag-skill-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 14px;
    background: transparent;
    border: none;
    border-radius: 14px;
    cursor: pointer;
    text-align: left;
    color: var(--text);
    transition: background 0.24s ease, box-shadow 0.24s ease, transform 0.24s cubic-bezier(0.22,0.61,0.36,1);
}
.aag-skill-row:hover, .aag-skill-row:focus-visible {
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    transform: translateX(3px);
}
.aag-skill-badge {
    flex-shrink: 0;
    width: 38px; height: 38px;
    border-radius: 50%;
    background: var(--text);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.24s ease, transform 0.24s cubic-bezier(0.22,0.61,0.36,1);
}
.aag-skill-row:hover .aag-skill-badge, .aag-skill-row:focus-visible .aag-skill-badge {
    background: var(--accent);
    transform: scale(1.06);
}
.aag-skill-text { flex: 1; min-width: 0; font-size: 16px; font-weight: 500; letter-spacing: -0.01em; }
.aag-skill-arrow {
    flex-shrink: 0;
    color: var(--muted);
    display: inline-flex;
    opacity: 0;
    transform: translateX(-4px);
    transition: opacity 0.24s ease, transform 0.24s ease, color 0.24s ease;
}
.aag-skill-row:hover .aag-skill-arrow, .aag-skill-row:focus-visible .aag-skill-arrow {
    opacity: 1;
    transform: translateX(0);
    color: var(--accent);
}

/* ---------- VALUES ---------- */
.aag-values { padding-top: clamp(70px, 9vw, 130px); }
.aag-values-inner {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 24px;
    box-shadow: var(--shadow);
    padding: clamp(28px, 4vw, 52px);
}
.aag-values-text { margin-top: 26px; font-size: clamp(17px, 1.8vw, 20px); line-height: 1.65; color: #333; max-width: 780px; }
.aag-values-list { margin-top: 34px; display: flex; flex-wrap: wrap; gap: 10px; }
.aag-value-chip {
    font-size: 14px;
    font-weight: 500;
    color: var(--text);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 9px 16px;
}

/* ---------- PHILOSOPHY IMAGE CAROUSEL ---------- */
.aag-photocar {
    margin-top: clamp(28px, 4vw, 44px);
    overflow: hidden;
    cursor: grab;
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
}
.aag-photocar:active { cursor: grabbing; }
.aag-photocar-track { display: flex; gap: 20px; width: max-content; will-change: transform; }
.aag-photocar-item {
    flex-shrink: 0;
    width: clamp(240px, 32vw, 360px);
    aspect-ratio: 4 / 3;
    border-radius: 20px;
    overflow: hidden;
    background:
        linear-gradient(135deg, #ececE8 0%, #f4f4f1 50%, #e7e7e2 100%);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-sm);
}
.aag-photocar-item img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; display: block; pointer-events: none; }
.aag-photocar-ph {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b7b7ae;
}

/* ---------- FOOTER ---------- */
/* Full-bleed shell gives the footer a subtle raised surface so the curved
   separator reads. Footer content/layout unchanged. */
.aag-footer-shell {
    position: relative;
    width: 100%;
    margin-top: clamp(56px, 8vw, 120px);
    background: var(--surface);
    border-top: 1px solid var(--border);
}
.aag-footer-curve {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    transform: translateY(-100%);
    height: clamp(48px, 7vw, 104px);
    line-height: 0;
    pointer-events: none;
    filter: drop-shadow(0 -5px 14px rgba(0,0,0,0.035));
}
.aag-footer-curve svg { display: block; width: 100%; height: 100%; }
.aag-footer-curve path { fill: var(--surface); }
.aag-footer { padding-top: clamp(44px, 6vw, 84px); padding-bottom: 56px; scroll-margin-top: 96px; }
.aag-footer-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.aag-footer-small { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); max-width: 100%; }
.aag-footer-big-link {
    margin-top: 12px;
    display: inline-flex;
    align-items: center;
    gap: clamp(16px, 3vw, 44px);
    color: var(--text);
    max-width: 100%;
}
.aag-footer-big {
    font-size: clamp(52px, 15vw, 200px);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 0.9;
    color: var(--text);
    overflow-wrap: break-word;
    word-break: break-word;
    transition: color 0.3s ease;
}
.aag-footer-arrow {
    flex-shrink: 0;
    width: clamp(46px, 6vw, 92px);
    height: clamp(46px, 6vw, 92px);
    border-radius: 50%;
    border: 1.5px solid var(--border);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.32s cubic-bezier(0.22,0.61,0.36,1), background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
.aag-footer-arrow svg { width: 44%; height: 44%; }
.aag-footer-big-link:hover .aag-footer-arrow,
.aag-footer-big-link:focus-visible .aag-footer-arrow {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: translateX(8px);
}
.aag-footer-big-link:hover .aag-footer-big,
.aag-footer-big-link:focus-visible .aag-footer-big { color: var(--accent); }
.aag-footer-bottom {
    margin-top: clamp(36px, 5vw, 64px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 18px;
    border-top: 1px solid var(--border);
    padding-top: 26px;
}
.aag-footer-socials { display: flex; gap: 12px; }
.aag-social {
    width: 46px; height: 46px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.22s cubic-bezier(0.22,0.61,0.36,1), background 0.22s ease, border-color 0.22s ease, color 0.22s ease;
}
.aag-social:hover { transform: translateY(-3px); border-color: var(--accent); color: var(--accent); }
.aag-footer-copy { font-size: 13px; color: var(--muted); }

/* ---------- BACK TO TOP ---------- */
.aag-totop {
    position: fixed;
    right: clamp(18px, 3vw, 34px);
    bottom: clamp(18px, 3vw, 34px);
    z-index: 900;
    width: 48px; height: 48px;
    border-radius: 50%;
    background: var(--text);
    color: #fff;
    border: 1px solid rgba(0,0,0,0.05);
    box-shadow: 0 10px 26px rgba(0,0,0,0.18);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: translateY(14px) scale(0.9);
    pointer-events: none;
    transition: opacity 0.32s cubic-bezier(0.22,0.61,0.36,1), transform 0.32s cubic-bezier(0.22,0.61,0.36,1), background 0.24s ease;
}
.aag-totop.is-visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
.aag-totop:hover { background: var(--accent); transform: translateY(-3px) scale(1.04); }
.aag-totop:active { transform: translateY(0) scale(0.98); }

/* ---------- MODAL ---------- */
.aag-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(20,20,20,0.42);
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    transition: opacity 0.18s ease;
}
.aag-modal {
    width: 100%;
    max-width: 640px;
    max-height: 86vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 22px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.22);
    padding: 30px;
    transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.22,0.61,0.36,1);
    color: var(--text);
}
.aag-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.aag-modal-title { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
.aag-modal-sub { margin-top: 8px; font-size: 14px; color: var(--muted); }
.aag-modal-close-icon {
    flex-shrink: 0;
    width: 36px; height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease, border-color 0.2s ease;
}
.aag-modal-close-icon:hover { background: var(--background); border-color: #cfcfc7; }
.aag-modal-body { margin-top: 22px; display: flex; flex-direction: column; gap: 22px; }
.aag-modal-label { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); }
.aag-modal-text { margin-top: 8px; font-size: 15px; line-height: 1.6; color: #333; }
.aag-modal-resp { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.aag-modal-resp li {
    position: relative;
    padding-left: 20px;
    font-size: 15px;
    line-height: 1.55;
    color: #333;
}
.aag-modal-resp li::before {
    content: "";
    position: absolute;
    left: 2px; top: 9px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
}
.aag-modal-tech { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
.aag-tech-chip {
    font-size: 13px;
    font-weight: 500;
    color: #3a3a3a;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 12px;
}
.aag-modal-foot { margin-top: 26px; display: flex; justify-content: flex-end; }
.aag-modal-close-text {
    background: var(--text);
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 11px 24px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s ease;
}
.aag-modal-close-text:hover { background: #000; }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 1199px) {
    .aag-root { --pad: 32px; }
    .aag-hero-grid { grid-template-columns: minmax(260px, 340px) 1fr; gap: 40px; }
    .aag-two-col { gap: 32px; }
    .aag-skills-grid { gap: 40px; }
    .aag-skills-left { position: static; }
}
@media (max-width: 810px) {
    /* touch / small screens: inline reveal off, dots become the tap toggle */
    .aag-nav-menu { display: none; }
    .aag-dots { opacity: 1 !important; width: auto !important; visibility: visible !important; padding: 8px 10px !important; pointer-events: auto !important; }
    .aag-mobile-menu { display: flex; position: absolute; top: 100%; left: 0; right: 0; pointer-events: none; }
    .aag-mobile-menu.is-open { pointer-events: auto; }
    .aag-nav { min-width: 0; width: 100%; max-width: 520px; }
    .aag-nav-wrap { align-items: stretch; }
    .aag-nav, .aag-mobile-menu { margin-left: auto; margin-right: auto; }
    .aag-brand { margin-right: auto; }
    .aag-brand-name { display: inline; }
    .aag-photocar-item { width: clamp(220px, 60vw, 320px); }
}
/* Breakpoint 2 (Tablet) only — pull the typing dots next to the name and
   slightly shrink them. Excludes phone (<=480) and desktop (>=811). */
@media (min-width: 481px) and (max-width: 810px) {
    .aag-nav { width: fit-content; max-width: 100%; }
    .aag-brand { margin-right: 10px; }
    .aag-nav-right { margin-left: 0; }
    .aag-dots { gap: 4px; padding: 6px 8px; }
    .aag-dot { width: 5px; height: 5px; }
}
@media (max-width: 760px) {
    .aag-root { --pad: 24px; }
    .aag-hero { padding-top: 60px; }
    .aag-hero-grid { grid-template-columns: 1fr; gap: 34px; }
    .aag-photo { max-width: 380px; }
    .aag-two-col { grid-template-columns: 1fr; gap: 48px; }
    .aag-skills-grid { grid-template-columns: 1fr; gap: 36px; }
    .aag-footer-small { max-width: 100%; }
    .aag-marquee-track { gap: 40px; }
}
@media (max-width: 480px) {
    .aag-root { --pad: 20px; font-size: 15px; }
    .aag-brand-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .aag-card-hint { opacity: 1; transform: none; }
    .aag-skill-arrow { opacity: 1; transform: none; }
    .aag-modal { padding: 22px; border-radius: 18px; }
    .aag-footer-bottom { flex-direction: column; align-items: flex-start; }
    .aag-footer-big-link { flex-wrap: wrap; gap: 20px; }
    .aag-photocar-item { width: clamp(200px, 72vw, 300px); }
    .aag-tool-tile { width: 42px; height: 42px; }
}

@media (prefers-reduced-motion: reduce) {
    .aag-root *, .aag-root *::before, .aag-root *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}

/* ==========================================================================
   PROJECT DETAIL PAGE ADDITIONS
   ========================================================================== */

/* ---------- INTRO (pinned cover → lead crossfade) ---------- */
.pd-intro {
    position: relative;
    width: 100%;
    height: auto; /* real height comes from JS (px) when animating */
}
.pd-intro-sticky {
    position: sticky;
    top: 0;
    height: 100vh;
    min-height: 560px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
/* single-layer hero — centered, calm, fades on scroll (no second layer) */
.pd-hero {
    width: 100%;
    max-width: var(--maxw);
    margin: 0 auto;
    padding-left: var(--pad);
    padding-right: var(--pad);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    will-change: opacity, transform, filter;
}
.pd-hero-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    --mx: 0;
    --my: 0;
}
.pd-hero-title {
    font-size: clamp(46px, 9.5vw, 140px);
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 0.94;
    color: var(--text);
    max-width: 16ch;
    transform: translate(calc(var(--mx) * 8px), calc(var(--my) * 6px));
    transition: transform 0.6s cubic-bezier(0.22,1,0.36,1);
}
.pd-hero-cat {
    margin-top: clamp(20px, 2.4vw, 34px);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    transform: translate(calc(var(--mx) * 4px), calc(var(--my) * 3px));
    transition: transform 0.5s cubic-bezier(0.22,1,0.36,1);
}
.pd-scrollcue {
    position: absolute;
    left: 50%;
    bottom: clamp(24px, 5vw, 54px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    pointer-events: none;
}
.pd-scrollcue-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
}
.pd-scrollcue-line {
    width: 1px;
    height: 42px;
    background: linear-gradient(to bottom, var(--muted), transparent);
    transform-origin: top;
    animation: pd-cue 1.9s cubic-bezier(0.6,0,0.2,1) infinite;
}
@keyframes pd-cue {
    0% { transform: scaleY(0.15); opacity: 0.2; }
    45% { transform: scaleY(1); opacity: 0.9; }
    100% { transform: scaleY(0.15); opacity: 0.2; transform-origin: bottom; }
}

/* Flat fallback (static canvas / reduced motion): no pin, everything visible */
.pd-intro--flat { height: auto !important; }
.pd-intro--flat .pd-intro-sticky {
    position: static !important;
    height: auto !important;
    min-height: 0 !important;
    padding-top: clamp(96px, 14vw, 180px);
    padding-bottom: clamp(16px, 3vw, 40px);
    overflow: visible;
}
.pd-intro--flat .pd-hero {
    opacity: 1 !important;
    filter: none !important;
    transform: none !important;
}
.pd-intro--flat .pd-scrollcue { display: none; }

/* lead statement — first flowing block, calm reveal, left aligned like the body */
.pd-leadblock { padding-top: clamp(52px, 8vw, 108px); }
.pd-lead-statement {
    max-width: 900px;
    font-size: clamp(26px, 4vw, 52px);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.18;
    color: var(--text);
}

/* ---------- STORY ---------- */
.pd-story { position: relative; z-index: 1; }
.pd-eyebrow {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
}

/* meta grid */
.pd-metablock { padding-top: clamp(20px, 4vw, 40px); }
.pd-meta-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(20px, 3vw, 40px);
    padding-bottom: clamp(28px, 4vw, 44px);
    border-bottom: 1px solid var(--border);
}
.pd-meta-cell { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pd-meta-cell--wide { grid-column: 1 / -1; }
.pd-meta-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
}
.pd-meta-value { font-size: clamp(15px, 1.6vw, 18px); font-weight: 500; color: var(--text); letter-spacing: -0.01em; }
.pd-services { display: flex; flex-wrap: wrap; gap: 9px; }
.pd-service-chip {
    font-size: 13px;
    font-weight: 500;
    color: #3a3a3a;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 8px 15px;
    transition: border-color 0.24s ease, color 0.24s ease, transform 0.24s cubic-bezier(0.22,1,0.36,1);
}
.pd-service-chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }

/* overview */
.pd-overview { padding-top: clamp(56px, 8vw, 104px); }
.pd-prose { margin-top: 26px; max-width: 720px; display: flex; flex-direction: column; gap: 22px; }
.pd-para { font-size: clamp(16px, 1.35vw, 18px); line-height: 1.75; color: #333; }
.pd-para--lead { font-size: clamp(18px, 1.7vw, 22px); line-height: 1.7; color: #2a2a2a; }

/* media placeholders */
.pd-mediablock { padding-top: clamp(48px, 7vw, 92px); }
.pd-media {
    position: relative;
    width: 100%;
    border-radius: 22px;
    overflow: hidden;
    background: linear-gradient(135deg, #ececE8 0%, #f4f4f1 50%, #e7e7e2 100%);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
}
.pd-media--wide { aspect-ratio: 16 / 9; }
.pd-media--tall { aspect-ratio: 4 / 3; margin-top: clamp(28px, 4vw, 44px); }
.pd-media-tag {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #b7b7ae;
}

/* pull quote */
.pd-quoteblock { padding-top: clamp(56px, 8vw, 104px); }
.pd-quote {
    position: relative;
    margin: 0;
    max-width: 900px;
    font-size: clamp(26px, 3.6vw, 46px);
    font-weight: 500;
    letter-spacing: -0.025em;
    line-height: 1.22;
    color: var(--text);
    padding-left: clamp(24px, 4vw, 54px);
}
.pd-quote-mark {
    position: absolute;
    left: -4px;
    top: -0.1em;
    font-size: 1.4em;
    line-height: 1;
    color: var(--accent);
}

/* story sections */
.pd-section { padding-top: clamp(56px, 8vw, 108px); }
.pd-section-grid {
    display: grid;
    grid-template-columns: minmax(200px, 300px) 1fr;
    gap: clamp(28px, 5vw, 80px);
    align-items: start;
}
.pd-section-head {
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: sticky;
    top: 104px;
}
.pd-section-index {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent);
}
.pd-section-title {
    font-size: clamp(26px, 3vw, 40px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.08;
    color: var(--text);
}
.pd-section-body { max-width: 640px; display: flex; flex-direction: column; gap: 20px; }

/* end navigation */
.pd-next { padding-top: clamp(80px, 12vw, 160px); }
.pd-next-eyebrow { margin-bottom: 14px; }
.pd-next-link {
    display: inline-flex;
    align-items: center;
    gap: clamp(16px, 3vw, 40px);
    color: var(--text);
    max-width: 100%;
}
.pd-next-big {
    font-size: clamp(44px, 10vw, 128px);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 0.92;
    color: var(--text);
    overflow-wrap: break-word;
    transition: color 0.3s ease;
}
.pd-next-arrow {
    flex-shrink: 0;
    width: clamp(46px, 6vw, 88px);
    height: clamp(46px, 6vw, 88px);
    border-radius: 50%;
    border: 1.5px solid var(--border);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.32s cubic-bezier(0.22,1,0.36,1), background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
.pd-next-arrow svg { width: 44%; height: 44%; }
.pd-next-link:hover .pd-next-arrow,
.pd-next-link:focus-visible .pd-next-arrow {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    transform: translateX(8px);
}
.pd-next-link:hover .pd-next-big,
.pd-next-link:focus-visible .pd-next-big { color: var(--accent); }
.pd-back {
    margin-top: clamp(32px, 5vw, 56px);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
    transition: color 0.24s ease;
}
.pd-back-arrow {
    display: inline-flex;
    transition: transform 0.28s cubic-bezier(0.22,1,0.36,1);
}
.pd-back:hover, .pd-back:focus-visible { color: var(--text); }
.pd-back:hover .pd-back-arrow, .pd-back:focus-visible .pd-back-arrow { transform: translateX(-5px); }

/* ---------- SECTION NAV (floating story index) ---------- */
/* Floating section menu — a small corner button (bottom-left, above the status
   pill) that opens an upward popover index of the story's sections. */
.pd-secnav {
    position: fixed;
    left: max(20px, env(safe-area-inset-left));
    bottom: calc(max(20px, env(safe-area-inset-bottom)) + 64px);
    z-index: 45;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    pointer-events: none;
}
.pd-secnav-fab {
    order: 2;
    width: 50px; height: 50px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.9);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    box-shadow: var(--shadow-sm);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 0.24s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.24s ease, background 0.24s ease, color 0.24s ease, border-color 0.24s ease;
}
.pd-secnav-fab:hover { transform: translateY(-2px); box-shadow: var(--shadow); background: #fff; }
.pd-secnav.is-open .pd-secnav-fab { background: var(--text); color: #fff; border-color: var(--text); }
.pd-secnav-panel {
    order: 1;
    width: 236px;
    max-width: calc(100vw - 40px);
    max-height: min(60vh, 440px);
    overflow-y: auto;
    background: rgba(255,255,255,0.96);
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow);
    padding: 12px;
    transform-origin: bottom left;
    opacity: 0;
    transform: translateY(10px) scale(0.96);
    pointer-events: none;
    transition: opacity 0.24s ease, transform 0.28s cubic-bezier(0.22,0.61,0.36,1);
}
.pd-secnav.is-open .pd-secnav-panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
.pd-secnav-heading {
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--muted); padding: 4px 10px 9px;
}
.pd-secnav-list { display: flex; flex-direction: column; gap: 2px; list-style: none; margin: 0; padding: 0; }
.pd-secnav-item {
    display: flex; align-items: center; gap: 11px; width: 100%;
    background: transparent; border: none; cursor: pointer;
    padding: 9px 10px; border-radius: 11px; text-align: left;
    color: var(--muted);
    transition: background 0.2s ease, color 0.2s ease;
}
.pd-secnav-item:hover { background: rgba(0,0,0,0.04); color: var(--text); }
.pd-secnav-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.pd-secnav-label { font-size: 13.5px; font-weight: 500; letter-spacing: -0.01em; line-height: 1.3; }
.pd-secnav-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #cfcfc8;
    flex-shrink: 0;
    transition: background 0.2s ease, transform 0.2s ease;
}
.pd-secnav-item.is-active { color: var(--text); }
.pd-secnav-item.is-active .pd-secnav-label { font-weight: 600; }
.pd-secnav-item.is-active .pd-secnav-dot { background: var(--accent); transform: scale(1.3); }
.aag-static .pd-secnav-panel { display: none; }

/* ---------- KEEP EXPLORING — related project cards ---------- */
.pd-related-grid {
    margin-top: clamp(28px, 4vw, 46px);
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: clamp(20px, 3vw, 36px);
}
.pd-related-card {
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    overflow: hidden;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    transition: transform 0.35s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.35s ease, border-color 0.3s ease;
}
.pd-related-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow);
    border-color: #d2d2cc;
}
.pd-related-media {
    display: block;
    width: 100%;
    height: clamp(180px, 24vw, 250px);
    overflow: hidden;
    background: #ececE8;
}
.pd-related-media img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.6s ease;
}
.pd-related-card:hover .pd-related-media img { transform: scale(1.05); }
.pd-related-cat {
    margin: 20px 22px 0;
    font-size: 11.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
}
.pd-related-title {
    margin: 9px 22px 0;
    font-size: clamp(20px, 2.4vw, 26px);
    font-weight: 600; letter-spacing: -0.02em; color: var(--text); line-height: 1.12;
}
.pd-related-info { margin: 9px 22px 24px; font-size: 14px; color: var(--muted); }
.pd-related-all {
    display: inline-flex;
    margin-top: clamp(26px, 3.5vw, 44px);
    font-size: 15px; font-weight: 600; color: var(--text);
    border-bottom: 1.5px solid var(--border);
    padding-bottom: 3px;
    transition: color 0.25s ease, border-color 0.25s ease;
}
.pd-related-all:hover { color: var(--accent); border-color: var(--accent); }

/* ---------- RESPONSIVE (Project Detail) ---------- */
@media (max-width: 900px) {
    .pd-section-grid { grid-template-columns: 1fr; gap: 20px; }
    .pd-section-head { position: static; }
    /* tighten vertical rhythm — less empty space on tablet */
    .pd-overview { padding-top: clamp(40px, 6vw, 72px); }
    .pd-quoteblock { padding-top: clamp(40px, 6vw, 72px); }
    .pd-section { padding-top: clamp(40px, 6vw, 72px); }
    .pd-mediablock { padding-top: clamp(36px, 5vw, 64px); }
    .pd-next { padding-top: clamp(56px, 9vw, 96px); }
}
@media (max-width: 760px) {
    .pd-meta-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
    .pd-related-grid { grid-template-columns: 1fr; gap: 22px; }
    .pd-prose, .pd-section-body, .pd-lead-statement, .pd-quote { max-width: 100%; }
}
@media (max-width: 560px) {
    .pd-secnav-fab { width: 46px; height: 46px; }
    .pd-overview, .pd-quoteblock, .pd-section { padding-top: clamp(36px, 9vw, 56px); }
    .pd-mediablock { padding-top: clamp(30px, 8vw, 48px); }
    .pd-next { padding-top: clamp(48px, 13vw, 72px); }
}
@media (max-width: 480px) {
    .pd-intro-sticky { min-height: 480px; }
    .pd-meta-grid { grid-template-columns: 1fr; gap: 20px; }
    .pd-hero-title { letter-spacing: -0.035em; }
}
@media (prefers-reduced-motion: reduce) {
    .pd-scrollcue-line { animation: none; transform: scaleY(1); opacity: 0.5; }
    .pd-hero { opacity: 1 !important; filter: none !important; transform: none !important; }
}
/* ---------- BRAND FLOWER (premium motion) ---------- */
.aag-flower {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    will-change: transform;
    animation: aag-flower-float 7s ease-in-out infinite;
}
.aag-flower img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    will-change: transform;
    animation: aag-flower-spin 18s linear infinite;
}
@keyframes aag-flower-spin { to { transform: rotate(360deg); } }
@keyframes aag-flower-float {
    0%   { transform: translateY(0) scale(1); }
    25%  { transform: translateY(-6px) scale(1.05); }
    50%  { transform: translateY(-1px) scale(1.02); }
    75%  { transform: translateY(-5px) scale(1.06); }
    100% { transform: translateY(0) scale(1); }
}
.aag-static .aag-flower, .aag-static .aag-flower img { animation: none; }

/* ---------- FLOATING STATUS PILL ---------- */
.aag-fab {
    position: fixed;
    left: max(20px, env(safe-area-inset-left));
    bottom: max(20px, env(safe-area-inset-bottom));
    z-index: 40;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px 6px 6px;
    background: rgba(255,255,255,0.86);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    border-radius: 999px;
    max-width: calc(100vw - 40px);
    animation: aag-fab-in 0.6s cubic-bezier(0.22,0.61,0.36,1) both 0.35s;
}
.aag-static .aag-fab { animation: none; }
@keyframes aag-fab-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.aag-fab:hover { box-shadow: var(--shadow); }
.aag-fab-mail {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 3px 8px 3px 3px;
    border-radius: 999px;
    color: var(--text);
    min-height: 40px;
}
.aag-fab-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: #ececE8;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.aag-fab-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.aag-fab-email { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); white-space: nowrap; }
.aag-fab-copy { display: inline-flex; color: var(--muted); transition: color 0.2s ease, transform 0.2s ease; }
.aag-fab-mail:hover .aag-fab-copy { color: var(--accent); transform: translateY(-1px); }
.aag-fab-toast {
    position: absolute;
    left: 4px;
    top: -36px;
    background: var(--text);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 5px 10px;
    border-radius: 8px;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.aag-fab-toast.is-on { opacity: 1; transform: translateY(0); }
.aag-fab-divider { width: 1px; align-self: stretch; margin: 7px 3px; background: var(--border); }
.aag-fab-status { display: inline-flex; align-items: center; gap: 7px; padding: 0 12px 0 7px; }
.aag-fab-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #35c47a;
    flex-shrink: 0;
    animation: aag-fab-pulse 2.4s ease-out infinite;
}
.aag-static .aag-fab-dot { animation: none; }
@keyframes aag-fab-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(53,196,122,0.45); }
    70%  { box-shadow: 0 0 0 7px rgba(53,196,122,0); }
    100% { box-shadow: 0 0 0 0 rgba(53,196,122,0); }
}
.aag-fab-status-text { font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); white-space: nowrap; }
@media (max-width: 600px) {
    .aag-fab { left: 14px; bottom: 14px; gap: 0; padding: 5px 6px 5px 5px; }
    .aag-fab-email { display: none; }
    .aag-fab-mail { padding-right: 5px; gap: 7px; }
    .aag-fab-status { padding: 0 9px 0 5px; }
}

/* ---- AAG_CURSOR styles ---- */
/* custom cursor removed — native cursor everywhere */
.aag-cursor { position: fixed; top: 0; left: 0; z-index: 100000; pointer-events: none; opacity: 0; transition: opacity 0.25s ease; will-change: transform; }
.aag-cursor.is-visible { opacity: 1; }
.aag-cursor-dot { position: absolute; top: 0; left: 0; width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #ff654d); transform: translate(-50%, -50%); transition: width 0.22s ease, height 0.22s ease, opacity 0.22s ease; }
.aag-cursor-ring { position: absolute; top: 0; left: 0; width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--accent, #ff654d); background: transparent; opacity: 0.5; transform: translate(-50%, -50%); transition: width 0.3s cubic-bezier(0.22,1,0.36,1), height 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease, background 0.22s ease, border-color 0.22s ease; }
.aag-cursor.is-link .aag-cursor-ring { width: 48px; height: 48px; opacity: 1; background: #ffffff; border-color: transparent; mix-blend-mode: difference; }
.aag-cursor.is-link .aag-cursor-dot { width: 0; height: 0; opacity: 0; }
.aag-cursor.is-down .aag-cursor-ring { width: 28px; height: 28px; }
.aag-cursor-label { position: absolute; top: 0; left: 0; transform: translate(-50%, calc(-50% - 2px)); display: inline-flex; align-items: center; justify-content: center; height: 44px; padding: 0 18px; border-radius: 999px; background: var(--accent, #ff654d); color: #fff; font-family: "Manrope", -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap; opacity: 0; transform-origin: center; transition: opacity 0.2s ease; box-shadow: 0 8px 22px rgba(0,0,0,0.18); }
.aag-cursor.is-label .aag-cursor-dot, .aag-cursor.is-label .aag-cursor-ring { opacity: 0; }
.aag-cursor.is-label .aag-cursor-label { opacity: 1; }
@media (hover: none), (pointer: coarse) { .aag-cursor { display: none !important; } }

/* ==========================================================================
   THEME — LIGHT / DARK
   The palette lives entirely in tokens on .aag-root (and .dg-root / .cp-root /
   .ff-root, which inherit from it). Dark mode redefines the tokens and then
   re-states the handful of surfaces that were painted with literal colours,
   so nothing is a naive inversion: backgrounds go deep grey, type goes warm
   off-white, borders stay low-contrast and images keep their own contrast.
   The switch is stored in localStorage; with no stored choice the OS
   preference wins (see useAagTheme).
   ========================================================================== */
html[data-aag-theme="dark"] { background: #0d0d0c; color-scheme: dark; }
html[data-aag-theme="light"] { background: #f7f7f5; color-scheme: light; }

html[data-aag-theme="dark"] .aag-root,
html[data-aag-theme="dark"] .dg-root,
html[data-aag-theme="dark"] .cp-root,
html[data-aag-theme="dark"] .ff-root {
    --background: #0d0d0c;
    --surface: #171716;
    --surface-2: #201f1e;
    --text: #f2f1ec;
    --muted: #9d9c95;
    --border: #2c2b29;
    --hairline: #23221f;
    --shadow: 0 16px 40px rgba(0,0,0,0.55);
    --shadow-sm: 0 6px 18px rgba(0,0,0,0.42);
    --icon-hole: #0d0d0c;
    --on-accent: #16150f;
    --logo-tile: #f4f3ef;
}
.aag-root, .dg-root, .cp-root, .ff-root {
    --surface-2: #ffffff;
    --hairline: #e6e6e1;
    --on-accent: #ffffff;
    --logo-tile: #ffffff;
}

/* ---- Chrome: floating nav, mobile menu, status pill, back-to-top ---- */
html[data-aag-theme="dark"] .aag-nav,
html[data-aag-theme="dark"] .aag-fab { background: rgba(23,23,22,0.86); }
html[data-aag-theme="dark"] .aag-mobile-menu,
html[data-aag-theme="dark"] .aag-totop { background: var(--surface); }
html[data-aag-theme="dark"] .aag-avatar,
html[data-aag-theme="dark"] .aag-fab-avatar,
html[data-aag-theme="dark"] .aag-ig-avatar { background: #262523; }
html[data-aag-theme="dark"] .aag-dot { background: #4a4945; }
html[data-aag-theme="dark"] .aag-fab-toast { background: #f2f1ec; color: #16150f; }

/* ---- Type + dividers that were literal greys ---- */
html[data-aag-theme="dark"] .aag-hero-sub,
html[data-aag-theme="dark"] .aag-scroll-hint,
html[data-aag-theme="dark"] .aag-photocar-ph,
html[data-aag-theme="dark"] .dg-board-hint,
html[data-aag-theme="dark"] .pd-scrollcue-label { color: #6f6e68; }
html[data-aag-theme="dark"] .aag-hero-sub strong { color: var(--text); }

/* ---- Solid-dark buttons flip to solid-light so they stay the loudest thing --- */
html[data-aag-theme="dark"] .aag-hero-cta,
html[data-aag-theme="dark"] .aag-insp-cta,
html[data-aag-theme="dark"] .aag-submit,
html[data-aag-theme="dark"] .aag-cta-btn,
html[data-aag-theme="dark"] .dg-send,
html[data-aag-theme="dark"] .pd-back:hover {
    background: var(--text);
    color: var(--on-accent);
    box-shadow: 0 14px 32px rgba(0,0,0,0.5);
}
html[data-aag-theme="dark"] .aag-hero-screen .aag-hero-cta,
html[data-aag-theme="dark"] .aag-hero-screen .aag-hero-cta span { color: var(--on-accent); }
html[data-aag-theme="dark"] .aag-hero-cta:hover,
html[data-aag-theme="dark"] .aag-insp-cta:hover { background: #ffffff; }
html[data-aag-theme="dark"] .aag-skill-badge { background: #33322e; color: var(--text); }
html[data-aag-theme="dark"] .aag-skill-row:hover .aag-skill-badge { background: var(--accent); color: #fff; }
html[data-aag-theme="dark"] .aag-tool-tip { background: #f2f1ec; color: #16150f; }
html[data-aag-theme="dark"] .aag-ig-btn { background: rgba(255,255,255,0.08); }
html[data-aag-theme="dark"] .aag-ig-btn:hover { background: rgba(255,255,255,0.14); }
html[data-aag-theme="dark"] .aag-contact-ico { background: rgba(255,255,255,0.08); }
html[data-aag-theme="dark"] .aag-footer-big-link:hover .aag-footer-arrow,
html[data-aag-theme="dark"] .aag-footer-big-link:focus-visible .aag-footer-arrow { color: #fff; }

/* ---- Image / media wells: neutral dark instead of warm light grey ---- */
html[data-aag-theme="dark"] .aag-mood-stage,
html[data-aag-theme="dark"] .aag-gallery-stage,
html[data-aag-theme="dark"] .aag-photo,
html[data-aag-theme="dark"] .aag-proj-media,
html[data-aag-theme="dark"] .pd-media,
html[data-aag-theme="dark"] .pd-figure,
html[data-aag-theme="dark"] .pd-related-media,
html[data-aag-theme="dark"] .pd-carousel-media,
html[data-aag-theme="dark"] .dg-card-cover,
html[data-aag-theme="dark"] .dg-tile-media { background: #201f1e; }
html[data-aag-theme="dark"] .aag-photocar-item {
    background: linear-gradient(135deg, #1c1b1a 0%, #232220 50%, #1a1918 100%);
}
/* Photography and project covers stay untouched; only flat marks are damped. */
html[data-aag-theme="dark"] .aag-mood-img,
html[data-aag-theme="dark"] .aag-gallery-img,
html[data-aag-theme="dark"] .aag-proj-media img { filter: brightness(0.94) contrast(1.02); }

/* ---- Cards, tiles and panels ---- */
html[data-aag-theme="dark"] .aag-card,
html[data-aag-theme="dark"] .aag-skill-row,
html[data-aag-theme="dark"] .aag-cert,
html[data-aag-theme="dark"] .aag-cert-item,
html[data-aag-theme="dark"] .aag-chal-card,
html[data-aag-theme="dark"] .aag-soon,
html[data-aag-theme="dark"] .aag-values-inner,
html[data-aag-theme="dark"] .aag-info-card,
html[data-aag-theme="dark"] .aag-cta-card,
html[data-aag-theme="dark"] .aag-contact-link,
html[data-aag-theme="dark"] .aag-insp-chip,
html[data-aag-theme="dark"] .aag-value-chip,
html[data-aag-theme="dark"] .aag-tech-chip,
html[data-aag-theme="dark"] .aag-tool-tile,
html[data-aag-theme="dark"] .aag-social,
html[data-aag-theme="dark"] .aag-proj-card,
html[data-aag-theme="dark"] .aag-viewall,
html[data-aag-theme="dark"] .aag-filter,
html[data-aag-theme="dark"] .dg-card,
html[data-aag-theme="dark"] .dg-tile,
html[data-aag-theme="dark"] .dg-pill,
html[data-aag-theme="dark"] .dg-node,
html[data-aag-theme="dark"] .pd-related-card,
html[data-aag-theme="dark"] .pd-service-chip,
html[data-aag-theme="dark"] .pd-meta-cell,
html[data-aag-theme="dark"] .ff-card,
html[data-aag-theme="dark"] .ff-note { background: var(--surface); border-color: var(--border); color: var(--text); }
html[data-aag-theme="dark"] .aag-tool-tile { background: #201f1e; }
/* Brand logos keep a light plate so dark wordmarks stay readable. */
html[data-aag-theme="dark"] .aag-card--media .aag-card-media { background: var(--logo-tile); border-color: #34332f; }
html[data-aag-theme="dark"] .aag-filter.is-active,
html[data-aag-theme="dark"] .dg-pill.is-active { background: var(--text); color: var(--on-accent); border-color: var(--text); }

/* ---- Overlays and modals ---- */
html[data-aag-theme="dark"] .aag-modal-overlay,
html[data-aag-theme="dark"] .dg-modal-overlay,
html[data-aag-theme="dark"] .pd-lb { background: rgba(0,0,0,0.72); }
html[data-aag-theme="dark"] .aag-modal,
html[data-aag-theme="dark"] .dg-modal { background: var(--surface); color: var(--text); }
html[data-aag-theme="dark"] .aag-modal-close-icon,
html[data-aag-theme="dark"] .dg-modal-close,
html[data-aag-theme="dark"] .pd-lb-close,
html[data-aag-theme="dark"] .pd-lb-nav { background: rgba(255,255,255,0.1); color: var(--text); }
html[data-aag-theme="dark"] .aag-modal-close-text { background: var(--text); color: var(--on-accent); }

/* ---- Forms ---- */
html[data-aag-theme="dark"] .aag-field input,
html[data-aag-theme="dark"] .aag-field textarea,
html[data-aag-theme="dark"] .dg-field input,
html[data-aag-theme="dark"] .dg-field textarea {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
}
html[data-aag-theme="dark"] .aag-field input::placeholder,
html[data-aag-theme="dark"] .aag-field textarea::placeholder { color: #6f6e68; }

/* ---- Case-study chrome ---- */
html[data-aag-theme="dark"] .pd-secnav-panel,
html[data-aag-theme="dark"] .pd-secnav-fab { background: rgba(23,23,22,0.9); }
html[data-aag-theme="dark"] .pd-hero-scrim {
    background: linear-gradient(180deg, rgba(13,13,12,0.55) 0%, rgba(13,13,12,0.8) 100%);
}
html[data-aag-theme="dark"] .aag-intro { background: var(--background); }
html[data-aag-theme="dark"] .cp-loader { background: rgba(255,255,255,0.14); }

/* ---- The switch itself ---- */
.aag-theme-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    padding: 0;
    margin-left: 2px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.24s ease, background 0.24s ease;
}
.aag-theme-btn:hover { color: var(--text); background: rgba(0,0,0,0.05); }
html[data-aag-theme="dark"] .aag-theme-btn:hover { background: rgba(255,255,255,0.08); }
.aag-theme-ico {
    position: absolute;
    display: inline-flex;
    transition: opacity 0.3s ease, transform 0.42s cubic-bezier(0.22,1,0.36,1);
}
.aag-theme-ico--sun { opacity: 1; transform: rotate(0deg) scale(1); }
.aag-theme-ico--moon { opacity: 0; transform: rotate(-70deg) scale(0.6); }
html[data-aag-theme="dark"] .aag-theme-ico--sun { opacity: 0; transform: rotate(70deg) scale(0.6); }
html[data-aag-theme="dark"] .aag-theme-ico--moon { opacity: 1; transform: rotate(0deg) scale(1); }
/* In the mobile sheet the switch is a sibling of the links, so it gets the
   same row rhythm and tap target as them rather than floating loose. */
.aag-mobile-menu > .aag-theme-btn { width: 44px; height: 44px; margin: 2px 0 0 6px; border-radius: 12px; }

/* ---- Cross-fade between the two palettes (300–500ms), motion-safe.
   The class is only on <html> for the length of the switch, so it never
   competes with the hover / reveal transitions the rest of the time. ---- */
html.aag-theme-anim .aag-root,
html.aag-theme-anim .aag-root *,
html.aag-theme-anim .aag-root *::before,
html.aag-theme-anim .aag-root *::after {
    transition: background-color 380ms ease, border-color 380ms ease, color 380ms ease,
                fill 380ms ease, stroke 380ms ease, box-shadow 380ms ease, filter 380ms ease !important;
}
@media (prefers-reduced-motion: reduce) {
    html.aag-theme-anim .aag-root,
    html.aag-theme-anim .aag-root *,
    html.aag-theme-anim .aag-root *::before,
    html.aag-theme-anim .aag-root *::after { transition: none !important; }
}

/* ---- Dark mode, second pass: body copy that was written as a literal
   near-black. These are the reading sizes, so they get the full text colour
   rather than the muted one. aag-logo-word is deliberately absent: it sits
   on the light logo plate and must stay dark. ---- */
html[data-aag-theme="dark"] .aag-lead p,
html[data-aag-theme="dark"] .aag-values-text,
html[data-aag-theme="dark"] .aag-modal-text,
html[data-aag-theme="dark"] .aag-modal-resp li,
html[data-aag-theme="dark"] .aag-contact-value,
html[data-aag-theme="dark"] .pd-para,
html[data-aag-theme="dark"] .pd-para--lead { color: #d9d7d0; }
html[data-aag-theme="dark"] .aag-insp-chip,
html[data-aag-theme="dark"] .aag-tech-chip,
html[data-aag-theme="dark"] .pd-service-chip,
html[data-aag-theme="dark"] .dg-pill,
html[data-aag-theme="dark"] .dg-card-title,
html[data-aag-theme="dark"] .ff-chip { color: var(--text); }
html[data-aag-theme="dark"] .dg-filter-blurb,
html[data-aag-theme="dark"] .dg-card-cat { color: var(--muted); }
html[data-aag-theme="dark"] .aag-work-media { background: #201f1e; }
`
