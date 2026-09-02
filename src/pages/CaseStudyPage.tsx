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
/* Footer "let's talk" target. Empty = fall back to the email link. */
const CONTACT_URL = ""

/* Header avatar — identical circular portrait used across the site. The
   "Profile Photo" panel control still overrides this when set. */
const PROFILE_SRC =
    "/portfolio/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"

type Lang = "es" | "en"
type Bi = { es: string; en: string }
type BiList = { es: string[]; en: string[] }

/* ---------------------------------------------------------------------------
   PROJECT CONTENT (single source of truth, bilingual).
   Replace with a real project — the layout and interaction stay identical.
--------------------------------------------------------------------------- */
type CaseImage = { src: string; ratio?: string; caption?: Bi }
/* A browsable carousel of related media (e.g. colour variants, pages, labels,
   or an ordered run of event screens). `ratio` sets the frame shape: "tall"
   (portrait), "wide" (landscape), "square" (capped 1:1, for object mockups),
   "screen" (6:5, capped — the shape event screens are authored in) or the
   default (4:3). */
type CaseCarousel = { key: string; heading?: Bi; ratio?: string; items: CaseMedia[] }
/* One numbered act of the story: a heading, its paragraphs, and an optional
   supporting image. */
interface StorySection {
    key: string
    heading: Bi
    body: BiList
    media?: CaseImage
}
/* A single piece of media inside a curated row. Most items are stills, in which
   case only `src` is set. When `video` is present the frame renders a real
   <video> and `src` becomes its poster, so an MP4 stays an MP4 instead of being
   flattened into a screenshot. `loop` marks the short ambient motion graphics
   that autoplay muted on repeat; everything longer stays click-to-play, so a
   page carrying two dozen screens never opens two dozen streams at once. */
type CaseMedia = {
    src: string
    video?: string
    loop?: boolean
    ratio?: string
    caption?: Bi
    alt?: Bi
}
/* A curated row of imagery. Instead of dropping every mockup into one uniform
   grid, a case study composes its work: full-bleed hero pieces, two-column
   pairings, four-up sets of variants and offset big/small groupings. "seq" is
   an even strip of however many items it is given, for showing an animation
   build or a run of screens in their original order. */
type EditorialRow = {
    key: string
    kind: "full" | "pair" | "quad" | "offset" | "seq" | "carousel"
    /* "carousel" only: frame shape passed through to CaseCarouselView. */
    ratio?: string
    /* Small category eyebrow above the row ("Editorial design", "Corporate
       materials"...). Lets one section carry curatorial grouping without
       fragmenting the page into many short sections. */
    label?: Bi
    /* "offset" only: put the large image on the right instead of the left. */
    flip?: boolean
    items: CaseMedia[]
}
/* A delivered billboard mockup, used exactly as supplied. The artwork is never
   recreated, recoloured or reframed — the file is the deliverable. */
type BillboardScene = {
    key: string
    src: string
    alt?: Bi
    caption?: Bi
}
type BillboardBlock = {
    heading: Bi
    intro?: Bi
    scenes: BillboardScene[]
    /* Optional flat artwork shown below the in-context scenes. */
    rows?: EditorialRow[]
}
/* Closing takeaways, each tied to a concrete piece of the case study. */
type LearnedBlock = { heading: Bi; items: { key: string; title: Bi; text: Bi }[] }
/* Context block that introduces a brand moment, paired with a motion piece.
   The video sits in a portrait frame beside the copy — its real shape — rather
   than being letterboxed into a landscape well. */
type BrandBlock = {
    heading: Bi
    body: BiList
    video?: { src?: string; poster: string; portrait?: boolean; caption?: Bi; alt?: Bi }
}
/* A large editorial statement used as a divider. `big` is set in the light
   weight and `emphasis` in the bold one, mirroring how the brand itself locks
   the two halves of the phrase together. */
type StatementBlock = { pre?: Bi; big: Bi; emphasis?: Bi; note?: Bi }

type CaseProject = {
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
    media1?: CaseImage
    gallery?: CaseImage[]
    galleryHeading?: Bi
    /* When present, browsable carousels are rendered instead of the flat gallery
       grid — used to group repeated imagery (variants, pages, applications). */
    carousels?: CaseCarousel[]
    /* Optional full-bleed hero background image. When set, the cover becomes a
       large image with a dark scrim and white title/category for contrast. */
    heroImage?: string
    /* Curated "selected work" composition (see EditorialRow). */
    editorial?: EditorialRow[]
    editorialHeading?: Bi
    editorialIntro?: Bi
    /* Billboard artwork shown in context. */
    billboard?: BillboardBlock
    /* Brand-moment block with an optional motion piece. */
    brand?: BrandBlock
    /* Large editorial statement used as a divider between acts. */
    statement?: StatementBlock
    /* A single browsable carousel placed by `order` (variants, applications). */
    rollups?: CaseCarousel
    /* "What I learned" cards. */
    learned?: LearnedBlock
    /* Final reflection — a single calm statement that closes the story. */
    closing?: { eyebrow?: Bi; text: Bi }
    /* Render order of the blocks that follow the story sections. Omit to keep
       the default sequence. Unknown or unset keys are simply skipped, so a
       project only lists what it actually uses. */
    order?: string[]
}

const PROJECT: CaseProject = {
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
        key: "brand",
        category: { es: "Branding", en: "Branding" },
        title: { es: "Identidad de marca", en: "Brand Identity" },
        info: { es: "Sistema visual · 2025", en: "Visual system · 2025" },
        href: "/projects",
        img: "/portfolio/assets/2t2B5gPUOamsIlklxHvREITjP8s.jpg",
    },
    {
        key: "uiux",
        category: { es: "UI/UX", en: "UI/UX" },
        title: { es: "App de producto", en: "Product App" },
        info: { es: "Diseño de producto · 2025", en: "Product design · 2025" },
        href: "/projects",
        img: "/portfolio/assets/8x2FY25Rvtbj4o57Ce5G6iz75M.jpg",
    },
    {
        key: "editorial",
        category: { es: "Editorial", en: "Editorial" },
        title: { es: "Publicación impresa", en: "Print Publication" },
        info: { es: "Dirección de arte · 2024", en: "Art direction · 2024" },
        href: "/projects",
        img: "/portfolio/assets/elmWo6V87sktLAuc86LJRzZK1g.jpg",
    },
    {
        key: "web",
        category: { es: "Web", en: "Web" },
        title: { es: "Sitio de portfolio", en: "Portfolio Site" },
        info: { es: "Diseño web · 2024", en: "Web design · 2024" },
        href: "/projects",
        img: "/portfolio/assets/HiCBfYljtFme6saAnqLlJs9nLK8.jpg",
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

/* ---------------------------------------------------------------------------
   CASE CAROUSEL — a browsable, scroll-snapping image carousel with arrows and
   dot indicators. Used to group repeated imagery (colour variants, pages,
   labels, applications) so users browse instead of scrolling past duplicates.
--------------------------------------------------------------------------- */
function CaseCarouselView({
    heading,
    items,
    lang,
    ratio,
}: {
    heading?: string
    items: CaseMedia[]
    lang: Lang
    ratio?: string
}) {
    const trackRef = useRef<HTMLDivElement | null>(null)
    const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
    const isStatic = useIsStaticRenderer()
    const [idx, setIdx] = useState(0)
    const count = items.length

    /* Only the slide in view plays. Every other video is paused and rewound, so
       a carousel mixing stills and motion never leaves work running out of
       sight. Sources are attached to the current slide and its two neighbours
       only, so opening the page does not fetch every clip at once. */
    const near = (i: number) => Math.abs(i - idx) <= 1
    useEffect(() => {
        if (isStatic) return
        videoRefs.current.forEach((v, i) => {
            if (!v) return
            if (i === idx) {
                const p = v.play()
                if (p && typeof p.catch === "function") p.catch(() => {})
            } else if (!v.paused) {
                v.pause()
                v.currentTime = 0
            }
        })
    }, [idx, isStatic])

    const scrollToIndex = (i: number) => {
        const track = trackRef.current
        if (!track) return
        const target = Math.max(0, Math.min(count - 1, i))
        track.scrollTo({ left: target * track.clientWidth, behavior: "smooth" })
    }
    const onScroll = () => {
        const track = trackRef.current
        if (!track) return
        const w = track.clientWidth || 1
        const next = Math.round(track.scrollLeft / w)
        setIdx((prev) => (prev === next ? prev : next))
    }

    const ratioClass =
        ratio === "wide"
            ? " is-wide"
            : ratio === "tall"
              ? " is-tall"
              : ratio === "square"
                ? " is-square"
                : ratio === "screen"
                  ? " is-screen"
                  : ""

    return (
        <div className={"pd-carousel" + (ratio === "screen" ? " is-screen" : "")}>
            {heading ? (
                <Reveal blur>
                    <span className="pd-eyebrow pd-carousel-eyebrow">{heading}</span>
                </Reveal>
            ) : null}
            <div className="pd-carousel-frame">
                <div className="pd-carousel-track" ref={trackRef} onScroll={onScroll}>
                    {items.map((it, i) => (
                        <figure className={"pd-carousel-slide" + ratioClass} key={i}>
                            <span className="pd-carousel-media">
                                {it.video && !isStatic ? (
                                    <video
                                        ref={(el) => {
                                            videoRefs.current[i] = el
                                        }}
                                        className="pd-carousel-video"
                                        src={near(i) ? it.video : undefined}
                                        poster={it.src}
                                        muted
                                        loop
                                        playsInline
                                        preload="none"
                                        aria-label={it.alt ? it.alt[lang] : ""}
                                    />
                                ) : (
                                    <img
                                        src={it.src}
                                        alt={it.alt ? it.alt[lang] : ""}
                                        loading="lazy"
                                        decoding="async"
                                        draggable={false}
                                    />
                                )}
                            </span>
                            {it.caption ? (
                                <figcaption className="pd-carousel-cap">{it.caption[lang]}</figcaption>
                            ) : null}
                        </figure>
                    ))}
                </div>
                {count > 1 ? (
                    <>
                        <button
                            type="button"
                            className="pd-carousel-arrow pd-carousel-prev"
                            aria-label={lang === "es" ? "Anterior" : "Previous"}
                            onClick={() => scrollToIndex(idx - 1)}
                            disabled={idx <= 0}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                        </button>
                        <button
                            type="button"
                            className="pd-carousel-arrow pd-carousel-next"
                            aria-label={lang === "es" ? "Siguiente" : "Next"}
                            onClick={() => scrollToIndex(idx + 1)}
                            disabled={idx >= count - 1}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                        </button>
                    </>
                ) : null}
            </div>
            {count > 1 ? (
                <div className="pd-carousel-dots">
                    {items.map((_, i) => (
                        <button
                            type="button"
                            key={i}
                            className={"pd-carousel-dot" + (i === idx ? " is-active" : "")}
                            aria-label={`${i + 1} / ${count}`}
                            onClick={() => scrollToIndex(i)}
                        />
                    ))}
                    <span className="pd-carousel-count" aria-hidden="true">
                        {String(idx + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
                    </span>
                </div>
            ) : null}
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
    project?: CaseProject
    related?: typeof RELATED
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

/* ==========================================================================
   EDITORIAL WORK ROWS
   A curated "selected work" section. Each row is a deliberate composition —
   full width, a two-up pairing, a four-up set of variants, or an offset
   big/small grouping — so the imagery reads as a case study rather than a
   contact sheet. An optional row label carries curatorial grouping (editorial
   design, corporate materials, outdoor) without splitting the page into many
   short sections. Reveal-on-scroll uses the same signature as the rest of the
   page (fade + lift + blur, cubic-bezier(0.22,1,0.36,1)).
   ========================================================================== */
function EditorialFigure({
    item,
    lang,
    delay = 0,
}: {
    item: CaseMedia
    lang: Lang
    delay?: number
}) {
    const isStatic = useIsStaticRenderer()
    const ref = useRef<HTMLVideoElement | null>(null)
    const [playing, setPlaying] = useState(false)
    const alt = item.alt ? item.alt[lang] : ""

    /* Ambient loops pause themselves when the visitor asks for reduced motion;
       the poster frame stays, so the composition never collapses. */
    useEffect(() => {
        const v = ref.current
        if (!v || !item.loop || typeof window === "undefined") return
        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduce) {
            v.pause()
            v.controls = true
        }
    }, [item.loop])

    /* Click-to-play pieces load nothing but their poster until asked. */
    const start = () => {
        const v = ref.current
        if (!v) return
        v.controls = true
        setPlaying(true)
        const p = v.play()
        if (p && typeof p.catch === "function") p.catch(() => {})
    }

    let media: ReactNode
    if (item.video && !isStatic && item.loop) {
        media = (
            <video
                ref={ref}
                className="pd-emedia"
                src={item.video}
                poster={item.src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={alt}
            />
        )
    } else if (item.video && !isStatic) {
        media = (
            <>
                <video
                    ref={ref}
                    className="pd-emedia"
                    src={item.video}
                    poster={item.src}
                    muted
                    playsInline
                    preload="none"
                    aria-label={alt}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                />
                {playing ? null : (
                    <button
                        type="button"
                        className="pd-eplay"
                        onClick={start}
                        aria-label={lang === "es" ? "Reproducir " + alt : "Play " + alt}
                    >
                        <span className="pd-eplay-dot" aria-hidden="true" />
                    </button>
                )}
            </>
        )
    } else {
        media = (
            <img
                className="pd-emedia"
                src={item.src}
                alt={alt}
                loading="lazy"
                decoding="async"
                draggable={false}
            />
        )
    }

    return (
        <Reveal blur delay={delay} tag="figure" className="pd-efig">
            <span
                className={"pd-eframe" + (item.video ? " is-media" : "")}
                /* A <video> with preload="none" has no intrinsic size yet, so the
                   frame carries the shape itself and the layout never jumps. */
                style={item.video ? { aspectRatio: item.ratio || "6 / 5" } : undefined}
            >
                {media}
            </span>
            {item.caption ? (
                <figcaption className="pd-ecap">{item.caption[lang]}</figcaption>
            ) : null}
        </Reveal>
    )
}

function EditorialRows({ rows, lang }: { rows: EditorialRow[]; lang: Lang }) {
    return (
        <div className="pd-editorial-rows">
            {rows.map((row) => (
                <div className="pd-erow-group" key={row.key}>
                    {row.label ? (
                        <Reveal blur>
                            <span className="pd-eyebrow pd-erow-label">{row.label[lang]}</span>
                        </Reveal>
                    ) : null}
                    {row.kind === "carousel" ? (
                        /* Screens belonging to one concept are browsed in place
                           instead of stacking down the page. */
                        <Reveal blur>
                            <CaseCarouselView
                                items={row.items}
                                lang={lang}
                                ratio={row.ratio}
                            />
                        </Reveal>
                    ) : (
                        <div
                            className={
                                "pd-erow pd-erow--" + row.kind + (row.flip ? " is-flip" : "")
                            }
                        >
                            {row.items.map((it, i) => (
                                <EditorialFigure
                                    key={row.key + "-" + i}
                                    item={it}
                                    lang={lang}
                                    delay={0.05 * Math.min(i, 3)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

/* ==========================================================================
   BRAND MOMENT — copy beside a motion piece.
   The video keeps its own portrait shape instead of being letterboxed into a
   landscape well, so a vertical brand piece reads as intended. It autoplays
   muted and loops (it is ambient, not narrative) and pauses with visible
   controls under prefers-reduced-motion. Falls back to the poster frame on the
   static renderer and whenever no video source is set yet.
   ========================================================================== */
function BrandVideo({
    video,
    lang,
}: {
    video: NonNullable<BrandBlock["video"]>
    lang: Lang
}) {
    const isStatic = useIsStaticRenderer()
    const ref = useRef<HTMLVideoElement | null>(null)

    useEffect(() => {
        const v = ref.current
        if (!v || typeof window === "undefined") return
        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduce) {
            v.pause()
            v.controls = true
        }
    }, [])

    const src = (video.src || "").trim()
    const alt = video.alt ? video.alt[lang] : ""
    const portrait = video.portrait !== false

    return (
        <figure className={"pd-bv" + (portrait ? " is-portrait" : "")}>
            <span className="pd-bv-frame">
                {src && !isStatic ? (
                    <video
                        ref={ref}
                        className="pd-bv-media"
                        src={src}
                        poster={video.poster}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        aria-label={alt}
                    />
                ) : (
                    <img
                        className="pd-bv-media"
                        src={video.poster}
                        alt={alt}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                    />
                )}
            </span>
            {video.caption ? (
                <figcaption className="pd-bv-cap">{video.caption[lang]}</figcaption>
            ) : null}
        </figure>
    )
}

/* Large editorial statement used as a divider between acts. The two halves are
   set in different weights, mirroring how the brand locks the phrase together. */
function StatementBlockView({ block, lang }: { block: StatementBlock; lang: Lang }) {
    return (
        <div className="pd-statement">
            {block.pre ? (
                <Reveal blur>
                    <span className="pd-eyebrow">{block.pre[lang]}</span>
                </Reveal>
            ) : null}
            <Reveal blur delay={0.05}>
                <p className="pd-statement-big">
                    <span className="pd-statement-a">{block.big[lang]}</span>
                    {block.emphasis ? (
                        <span className="pd-statement-b">{block.emphasis[lang]}</span>
                    ) : null}
                </p>
            </Reveal>
            {block.note ? (
                <Reveal blur delay={0.1}>
                    <p className="pd-statement-note">{block.note[lang]}</p>
                </Reveal>
            ) : null}
        </div>
    )
}

export default function CaseStudyPage(props: ProjectDetailPageProps) {
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

    /* Full-bleed hero image: fades with a gentle zoom as the cover leaves, so
       the whole hero (image + text) dissolves together into the story. */
    const heroBgStyle: CSSProperties = animate
        ? {
              opacity: 1 - out * 0.92,
              transform: `scale(${(1 + 0.07 * out).toFixed(4)})`,
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
    ]

    const p = props.project ?? PROJECT
    const sectionNavItems: { id: string; label: string }[] = [
        { id: "pd-overview", label: t.overviewLabel },
        ...p.sections.map((s) => ({ id: "pd-sec-" + s.key, label: s.heading[lang] })),
        ...(p.brand ? [{ id: "pd-brand", label: p.brand.heading[lang] }] : []),
        ...(p.editorial && p.editorial.length > 0 && p.editorialHeading
            ? [{ id: "pd-editorial", label: p.editorialHeading[lang] }]
            : []),
        ...(p.billboard && p.billboard.scenes.length > 0
            ? [{ id: "pd-billboard", label: p.billboard.heading[lang] }]
            : []),
        ...(p.rollups && p.rollups.heading
            ? [{ id: "pd-rollups", label: p.rollups.heading[lang] }]
            : []),
        ...(p.learned && p.learned.items.length > 0
            ? [{ id: "pd-learned", label: p.learned.heading[lang] }]
            : []),
    ]

    const metaItems: { label: string; value: string }[] = [
        { label: t.yearLabel, value: p.year },
        { label: t.roleLabel, value: p.role[lang] },
        { label: t.clientLabel, value: p.client[lang] },
    ]

    /* footer "let's talk" target: contact page if set, else a mailto */
    const contactUrl = (CONTACT_URL || "").trim()
    const contactHref = contactUrl || `mailto:${email}`

    /* ---------------------------------------------------------------------
       ORDERED STORY BLOCKS
       Everything between the story sections and "Keep exploring" is built as a
       keyed map and then emitted in the order the project asks for. A project
       that sets no `order` gets the original sequence, so existing case
       studies are unaffected.
    --------------------------------------------------------------------- */
    const storyBlocks: Record<string, ReactNode> = {}

    if (p.brand) {
        storyBlocks.brand = (
            <section
                className="aag-section pd-brand"
                id="pd-brand"
                key="brand"
                aria-label={p.brand.heading[lang]}
            >
                <div className="pd-brand-grid">
                    <div className="pd-brand-copy">
                        <Reveal blur>
                            <span className="pd-eyebrow">{p.brand.heading[lang]}</span>
                        </Reveal>
                        {p.brand.body[lang].map((para, i) => (
                            <Reveal key={i} blur delay={0.05 * Math.min(i, 3)}>
                                <p className="pd-para">{para}</p>
                            </Reveal>
                        ))}
                    </div>
                    {p.brand.video ? (
                        <Reveal blur delay={0.08} className="pd-brand-media">
                            <BrandVideo video={p.brand.video} lang={lang} />
                        </Reveal>
                    ) : null}
                </div>
            </section>
        )
    }

    if (p.statement) {
        storyBlocks.statement = (
            <section className="aag-section pd-statement-sec" key="statement">
                <StatementBlockView block={p.statement} lang={lang} />
            </section>
        )
    }

    if (p.editorial && p.editorial.length > 0) {
        storyBlocks.editorial = (
            <section
                className="aag-section pd-editorial"
                id="pd-editorial"
                key="editorial"
                aria-label={p.editorialHeading ? p.editorialHeading[lang] : t.overviewLabel}
            >
                {p.editorialHeading ? (
                    <Reveal blur>
                        <span className="pd-eyebrow">{p.editorialHeading[lang]}</span>
                    </Reveal>
                ) : null}
                {p.editorialIntro ? (
                    <Reveal blur delay={0.04}>
                        <p className="pd-para pd-bb-intro">{p.editorialIntro[lang]}</p>
                    </Reveal>
                ) : null}
                <EditorialRows rows={p.editorial} lang={lang} />
            </section>
        )
    }

    if (p.carousels && p.carousels.length > 0) {
        storyBlocks.carousels = (
            <section
                className="aag-section pd-carousels-sec"
                key="carousels"
                aria-label={p.galleryHeading ? p.galleryHeading[lang] : "Gallery"}
            >
                {p.carousels.map((c) => (
                    <CaseCarouselView
                        key={c.key}
                        heading={c.heading ? c.heading[lang] : undefined}
                        items={c.items}
                        lang={lang}
                        ratio={c.ratio}
                    />
                ))}
            </section>
        )
    }

    if (p.rollups && p.rollups.items.length > 0) {
        storyBlocks.rollups = (
            <section
                className="aag-section pd-carousels-sec"
                id="pd-rollups"
                key="rollups"
                aria-label={p.rollups.heading ? p.rollups.heading[lang] : "Gallery"}
            >
                <CaseCarouselView
                    heading={p.rollups.heading ? p.rollups.heading[lang] : undefined}
                    items={p.rollups.items}
                    lang={lang}
                    ratio={p.rollups.ratio}
                />
            </section>
        )
    }

    if (!p.carousels && p.gallery && p.gallery.length > 0) {
        storyBlocks.gallery = (
            <section
                className="aag-section pd-gallery-sec"
                key="gallery"
                aria-label={p.galleryHeading ? p.galleryHeading[lang] : "Gallery"}
            >
                {p.galleryHeading ? (
                    <Reveal blur>
                        <span className="pd-eyebrow">{p.galleryHeading[lang]}</span>
                    </Reveal>
                ) : null}
                <div className="pd-gallery-grid">
                    {p.gallery.map((g, gi) => (
                        <Reveal key={gi} blur delay={0.03 * Math.min(gi, 5)} className={"pd-gallery-item" + (g.ratio === "wide" ? " is-wide" : "")}>
                            <img src={g.src} alt="" loading="lazy" decoding="async" draggable={false} />
                            {g.caption ? <span className="pd-gallery-cap">{g.caption[lang]}</span> : null}
                        </Reveal>
                    ))}
                </div>
            </section>
        )
    }

    if (p.billboard && p.billboard.scenes.length > 0) {
        storyBlocks.billboard = (
            <section
                className="aag-section pd-billboard"
                id="pd-billboard"
                key="billboard"
                aria-label={p.billboard.heading[lang]}
            >
                <Reveal blur>
                    <span className="pd-eyebrow">{p.billboard.heading[lang]}</span>
                </Reveal>
                {p.billboard.intro ? (
                    <Reveal blur delay={0.04}>
                        <p className="pd-para pd-bb-intro">{p.billboard.intro[lang]}</p>
                    </Reveal>
                ) : null}
                <div className="pd-bb-scenes">
                    {p.billboard.scenes.map((sc, i) => (
                        <Reveal
                            blur
                            key={sc.key}
                            delay={0.05 * Math.min(i, 3)}
                            tag="figure"
                            className="pd-bb-fig"
                        >
                            <span className="pd-bb-frame">
                                <img
                                    src={sc.src}
                                    alt={sc.alt ? sc.alt[lang] : ""}
                                    loading="lazy"
                                    decoding="async"
                                    draggable={false}
                                />
                            </span>
                            {sc.caption ? (
                                <figcaption className="pd-bb-cap">{sc.caption[lang]}</figcaption>
                            ) : null}
                        </Reveal>
                    ))}
                </div>
                {p.billboard.rows && p.billboard.rows.length > 0 ? (
                    <EditorialRows rows={p.billboard.rows} lang={lang} />
                ) : null}
            </section>
        )
    }

    if (p.learned && p.learned.items.length > 0) {
        storyBlocks.learned = (
            <section
                className="aag-section pd-learned"
                id="pd-learned"
                key="learned"
                aria-label={p.learned.heading[lang]}
            >
                <Reveal blur>
                    <span className="pd-eyebrow">{p.learned.heading[lang]}</span>
                </Reveal>
                <div className="pd-learn-grid">
                    {p.learned.items.map((it, i) => (
                        <Reveal blur key={it.key} delay={0.04 * Math.min(i, 4)} className="pd-learn-card">
                            <span className="pd-learn-num">{String(i + 1).padStart(2, "0")}</span>
                            <h3 className="pd-learn-title">{it.title[lang]}</h3>
                            <p className="pd-learn-text">{it.text[lang]}</p>
                        </Reveal>
                    ))}
                </div>
            </section>
        )
    }

    if (p.closing) {
        storyBlocks.closing = (
            <section className="aag-section pd-closing" key="closing" aria-label={t.overviewLabel}>
                {p.closing.eyebrow ? (
                    <Reveal blur>
                        <span className="pd-eyebrow">{p.closing.eyebrow[lang]}</span>
                    </Reveal>
                ) : null}
                <Reveal blur delay={0.05}>
                    <p className="pd-lead-statement pd-closing-text">{p.closing.text[lang]}</p>
                </Reveal>
            </section>
        )
    }

    const DEFAULT_BLOCK_ORDER = [
        "brand",
        "statement",
        "editorial",
        "carousels",
        "gallery",
        "billboard",
        "rollups",
        "learned",
        "closing",
    ]
    const blockOrder = p.order && p.order.length > 0 ? p.order : DEFAULT_BLOCK_ORDER


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
                    className={`pd-intro ${animate ? "" : "pd-intro--flat"}${p.heroImage ? " pd-intro--media" : ""}`}
                    ref={introRef}
                    aria-labelledby="pd-title"
                    style={animate && trackH ? { height: `${trackH}px` } : undefined}
                >
                    <div className="pd-intro-sticky">
                        {p.heroImage ? (
                            <div className="pd-hero-media" style={heroBgStyle} aria-hidden="true">
                                <img
                                    src={p.heroImage}
                                    alt=""
                                    loading="eager"
                                    decoding="async"
                                    draggable={false}
                                />
                                <div className="pd-hero-scrim" />
                            </div>
                        ) : null}
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

                    {/* feature media — hidden when this image is already the hero */}
                    {p.media1 && p.media1.src !== p.heroImage ? (
                        <section className="aag-section pd-mediablock">
                            <Reveal blur className="pd-figure">
                                <figure className="pd-media pd-media--auto">
                                    <img src={p.media1.src} alt="" loading="lazy" decoding="async" draggable={false} />
                                </figure>
                                {p.media1.caption ? <p className="pd-media-cap">{p.media1.caption[lang]}</p> : null}
                            </Reveal>
                        </section>
                    ) : p.media1 ? null : (
                        <section className="aag-section pd-mediablock" aria-hidden="true">
                            <Reveal blur tag="figure" className="pd-media pd-media--wide">
                                <span className="pd-media-tag">16 / 9</span>
                            </Reveal>
                        </section>
                    )}

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
                            {sec.media ? (
                                <Reveal blur className="pd-figure pd-figure--insection">
                                    <figure className="pd-media pd-media--auto">
                                        <img src={sec.media.src} alt="" loading="lazy" decoding="async" draggable={false} />
                                    </figure>
                                    {sec.media.caption ? <p className="pd-media-cap">{sec.media.caption[lang]}</p> : null}
                                </Reveal>
                            ) : null}
                        </section>
                    ))}

                    {/* ---------- ORDERED STORY BLOCKS ---------- */}
                    {blockOrder.map((k) => storyBlocks[k] ?? null)}

                    {/* ---------- KEEP EXPLORING — related project cards ---------- */}
                    <section className="aag-section pd-next" aria-label={t.nextEyebrow}>
                        <Reveal blur>
                            <span className="pd-eyebrow pd-next-eyebrow">{t.nextEyebrow}</span>
                        </Reveal>
                        <Reveal blur className="pd-related-grid">
                            {(props.related ?? RELATED).slice(0, 2).map((r) => (
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

addPropertyControls(CaseStudyPage, {
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

/* ---- Full-bleed hero image (Chroma · Neon · Bokobá) ---- */
.pd-hero-media {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    will-change: opacity, transform;
    transform-origin: center;
}
.pd-hero-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
}
.pd-hero-scrim {
    position: absolute;
    inset: 0;
    background:
        linear-gradient(180deg, rgba(12,12,16,0.50) 0%, rgba(12,12,16,0.34) 38%, rgba(12,12,16,0.62) 100%);
}
.pd-intro--media .pd-hero { position: relative; z-index: 1; }
.pd-intro--media .pd-hero-title {
    color: #fff;
    text-shadow: 0 2px 40px rgba(0,0,0,0.32);
}
.pd-intro--media .pd-hero-cat {
    color: rgba(255,255,255,0.92);
    text-shadow: 0 1px 20px rgba(0,0,0,0.35);
}
.pd-intro--media .pd-scrollcue-label { color: rgba(255,255,255,0.82); }
.pd-intro--media .pd-scrollcue-line {
    background: linear-gradient(to bottom, rgba(255,255,255,0.85), transparent);
}

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
.pd-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pd-media--auto { aspect-ratio: auto; display: block; background: #f4f4f1; }
.pd-media--auto img { height: auto; object-fit: contain; }
.pd-figure { margin: 0; width: 100%; }
.pd-figure--insection { margin-top: clamp(28px, 4vw, 44px); }
.pd-media-cap { margin: 12px 2px 0; font-size: 13px; color: var(--muted); line-height: 1.45; }
.pd-gallery-grid { margin-top: clamp(22px, 3vw, 36px); display: grid; grid-template-columns: repeat(2, 1fr); gap: clamp(14px, 2vw, 24px); }
.pd-gallery-item { position: relative; border-radius: 18px; overflow: hidden; background: #f0f0ec; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
.pd-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; aspect-ratio: 4 / 5; transition: transform 0.5s ease; }
.pd-gallery-item.is-wide { grid-column: 1 / -1; }
.pd-gallery-item.is-wide img { aspect-ratio: 16 / 9; }
.pd-gallery-item:hover img { transform: scale(1.04); }
.pd-gallery-cap { position: absolute; left: 10px; bottom: 10px; z-index: 2; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: #fff; background: rgba(0,0,0,0.34); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 4px 10px; border-radius: 999px; }
@media (max-width: 640px) { .pd-gallery-grid { grid-template-columns: 1fr; } .pd-gallery-item.is-wide { grid-column: auto; } .pd-gallery-item.is-wide img { aspect-ratio: 4 / 5; } }

/* ---- Case carousel ---- */
.pd-carousels-sec { display: flex; flex-direction: column; gap: clamp(46px, 7vw, 88px); }
.pd-carousel { margin-top: 0; }
.pd-carousel-eyebrow { display: block; margin-bottom: clamp(16px, 2vw, 22px); }
.pd-carousel-frame { position: relative; }
.pd-carousel-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    border-radius: clamp(14px, 2vw, 22px);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
}
.pd-carousel-track::-webkit-scrollbar { display: none; }
.pd-carousel-slide {
    flex: 0 0 100%;
    scroll-snap-align: center;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
}
.pd-carousel-media {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #f4f4f1;
    border-radius: clamp(14px, 2vw, 22px);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}
.pd-carousel-slide.is-wide .pd-carousel-media { aspect-ratio: 16 / 9; }
.pd-carousel-slide.is-tall .pd-carousel-media { aspect-ratio: 3 / 4; }
/* Square object mockups: keep the frame square and capped, so one roll-up
   reads at a comfortable size instead of stretching the full track width. */
.pd-carousel-slide.is-square .pd-carousel-media { aspect-ratio: 1 / 1; width: min(100%, 620px); }
.pd-carousel-media img { width: 100%; height: 100%; object-fit: contain; display: block; }
.pd-carousel-cap { text-align: center; margin-top: 14px; font-size: 13px; color: var(--muted); }
.pd-carousel-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 46px; height: 46px;
    border-radius: 50%;
    background: rgba(255,255,255,0.92);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2;
    transition: transform 0.2s cubic-bezier(0.22,0.61,0.36,1), opacity 0.2s ease, background 0.2s ease;
}
.pd-carousel-arrow:hover { transform: translateY(-50%) scale(1.07); background: #fff; }
.pd-carousel-arrow:disabled { opacity: 0; pointer-events: none; }
.pd-carousel-prev { left: clamp(10px, 1.4vw, 18px); }
.pd-carousel-next { right: clamp(10px, 1.4vw, 18px); }
.pd-carousel-dots { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: clamp(16px, 2vw, 22px); }
.pd-carousel-dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: var(--border); cursor: pointer; padding: 0; transition: background 0.2s ease, transform 0.2s ease; }
.pd-carousel-dot.is-active { background: var(--accent); transform: scale(1.25); }
@media (max-width: 640px) { .pd-carousel-arrow { width: 40px; height: 40px; } }

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

/* ==========================================================================
   SELECTED WORK — curated editorial rows
   Deliberate compositions rather than a uniform contact sheet: full-width
   pieces, two-up pairings, four-up variant sets and offset big/small groups.
   Radii, borders, shadows and hover scale are the same tokens the gallery and
   carousel already use, so a case study using these rows still reads as one
   design system.
   ========================================================================== */
.pd-editorial { padding-top: clamp(56px, 8vw, 108px); }
.pd-editorial-rows {
    margin-top: clamp(24px, 3vw, 42px);
    display: flex;
    flex-direction: column;
    gap: clamp(34px, 5vw, 78px);
}
.pd-erow { display: grid; gap: clamp(14px, 2vw, 26px); align-items: start; }
.pd-erow--full { grid-template-columns: 1fr; }
.pd-erow--pair { grid-template-columns: 1fr 1fr; }
.pd-erow--quad { grid-template-columns: repeat(4, 1fr); }
.pd-erow--offset { grid-template-columns: 1.62fr 1fr; align-items: end; }
.pd-erow--offset.is-flip { grid-template-columns: 1fr 1.62fr; }
.pd-efig { margin: 0; min-width: 0; }
.pd-eframe {
    display: block;
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    background: #f0f0ec;
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
}
.pd-eframe img {
    display: block;
    width: 100%;
    height: auto;
    transition: transform 0.6s cubic-bezier(0.22,1,0.36,1);
}
.pd-efig:hover .pd-eframe img { transform: scale(1.03); }
.pd-ecap { margin: 12px 2px 0; font-size: 13px; color: var(--muted); line-height: 1.45; }

/* ==========================================================================
   BILLBOARD IN CONTEXT
   The scene is vector art sized from the artwork's own aspect ratio, so it
   scales cleanly at any width and never distorts the delivered design.
   ========================================================================== */
.pd-billboard { padding-top: clamp(56px, 8vw, 108px); }
.pd-bb-intro { max-width: 660px; margin-top: 14px; }
.pd-bb-scenes {
    margin-top: clamp(26px, 3.4vw, 46px);
    display: flex;
    flex-direction: column;
    gap: clamp(34px, 5vw, 72px);
}
.pd-bb-fig { margin: 0; }
.pd-bb-frame {
    display: block;
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    background: #f0f0ec;
}
.pd-bb-frame img { display: block; width: 100%; height: auto; }
.pd-bb-cap { margin: 12px 2px 0; font-size: 13px; color: var(--muted); line-height: 1.45; }

/* ==========================================================================
   WHAT I LEARNED — takeaway cards
   Same card language as the related-project cards: surface fill, hairline
   border, small shadow, gentle lift on hover.
   ========================================================================== */
.pd-learned { padding-top: clamp(56px, 8vw, 108px); }
.pd-learn-grid {
    margin-top: clamp(24px, 3vw, 40px);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: clamp(16px, 2vw, 26px);
}
.pd-learn-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: clamp(20px, 2.4vw, 28px);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease;
}
.pd-learn-card:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
.pd-learn-num { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--accent); }
.pd-learn-title { font-size: clamp(16px, 1.5vw, 18px); font-weight: 600; line-height: 1.32; }
.pd-learn-text { font-size: 14.5px; line-height: 1.62; color: var(--muted); }

/* ---------- FINAL REFLECTION ---------- */
.pd-closing { padding-top: clamp(56px, 8vw, 108px); }
.pd-closing-text { max-width: 880px; font-size: clamp(22px, 3vw, 40px); }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 980px) {
    .pd-learn-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
    .pd-erow--quad { grid-template-columns: repeat(2, 1fr); }
    .pd-erow--offset, .pd-erow--offset.is-flip { grid-template-columns: 1fr 1fr; align-items: start; }
}
@media (max-width: 640px) {
    .pd-editorial, .pd-billboard, .pd-learned, .pd-closing { padding-top: clamp(40px, 6vw, 72px); }
    .pd-erow--pair, .pd-erow--offset, .pd-erow--offset.is-flip { grid-template-columns: 1fr; }
    .pd-editorial-rows { gap: clamp(26px, 7vw, 44px); }
    .pd-learn-grid { grid-template-columns: 1fr; }
    .pd-eframe, .pd-bb-frame { border-radius: 14px; }
}

/* ---------- DARK MODE ---------- */
html[data-aag-theme="dark"] .pd-eframe { background: #201f1e; }
html[data-aag-theme="dark"] .pd-learn-card { background: var(--surface); }
html[data-aag-theme="dark"] .pd-learn-title { color: var(--text); }
html[data-aag-theme="dark"] .pd-learn-text { color: #b8b6ae; }
html[data-aag-theme="dark"] .pd-ecap,
html[data-aag-theme="dark"] .pd-bb-cap { color: var(--muted); }
html[data-aag-theme="dark"] .pd-bb-frame { background: #171716; }

/* ==========================================================================
   BRAND MOMENT — copy beside a portrait motion piece.
   The video column is capped near the asset's own pixel width so a vertical
   brand piece is never blown up past its resolution.
   ========================================================================== */
.pd-brand { padding-top: clamp(56px, 8vw, 108px); }
.pd-brand-grid {
    display: grid;
    grid-template-columns: 1fr minmax(250px, 330px);
    gap: clamp(28px, 4vw, 64px);
    align-items: center;
}
.pd-brand-copy { display: flex; flex-direction: column; gap: 18px; max-width: 640px; }
.pd-brand-media { min-width: 0; }
.pd-bv { margin: 0; }
.pd-bv-frame {
    display: block;
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    background: #10141c;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
}
.pd-bv.is-portrait .pd-bv-frame { aspect-ratio: 9 / 16; }
.pd-bv-media { display: block; width: 100%; height: 100%; object-fit: cover; }
.pd-bv-cap { margin: 12px 2px 0; font-size: 13px; color: var(--muted); line-height: 1.45; }

/* ==========================================================================
   EDITORIAL STATEMENT — divider between acts.
   Two weights, echoing how the brand locks the phrase together.
   ========================================================================== */
.pd-statement-sec { padding-top: clamp(56px, 9vw, 120px); }
.pd-statement { max-width: 1000px; }
.pd-statement-big {
    margin-top: 18px;
    font-size: clamp(34px, 7vw, 92px);
    line-height: 1.02;
    letter-spacing: -0.035em;
    color: var(--text);
    display: flex;
    flex-direction: column;
}
.pd-statement-a { font-weight: 300; font-style: italic; opacity: 0.72; }
.pd-statement-b { font-weight: 700; }
.pd-statement-note {
    margin-top: clamp(18px, 2.4vw, 28px);
    max-width: 560px;
    font-size: 15px;
    line-height: 1.6;
    color: var(--muted);
}

/* ---------- editorial row grouping ---------- */
.pd-erow-group { display: flex; flex-direction: column; gap: clamp(12px, 1.6vw, 18px); }
.pd-erow-label { color: var(--accent); }

/* ---------- RESPONSIVE (brand + statement) ---------- */
@media (max-width: 900px) {
    .pd-brand-grid { grid-template-columns: 1fr; gap: clamp(24px, 4vw, 36px); }
    .pd-brand-media { max-width: 330px; }
}
@media (max-width: 640px) {
    .pd-brand, .pd-statement-sec { padding-top: clamp(40px, 6vw, 72px); }
    .pd-brand-media { max-width: 100%; }
    .pd-bv-frame { border-radius: 14px; }
}

/* ---------- DARK MODE ---------- */
html[data-aag-theme="dark"] .pd-bv-cap,
html[data-aag-theme="dark"] .pd-statement-note { color: var(--muted); }
html[data-aag-theme="dark"] .pd-statement-big { color: var(--text); }

/* ==========================================================================
   MEDIA INSIDE EDITORIAL ROWS
   A curated row can hold stills and motion side by side. Video frames keep the
   same radius, hairline border and shadow as the image frames, so a row that
   mixes the two still reads as one composition. Short ambient loops autoplay
   muted; longer pieces wait behind a play control and load nothing but their
   poster until the visitor asks for them.
   ========================================================================== */
.pd-eframe.is-media { background: #0b2a4a; }
.pd-emedia {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s cubic-bezier(0.22,1,0.36,1);
}
.pd-efig:hover .pd-eframe.is-media .pd-emedia { transform: none; }
.pd-eplay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    border: 0;
    padding: 0;
    cursor: pointer;
    background: rgba(8, 26, 45, 0.28);
    transition: background 0.35s ease;
}
.pd-eplay:hover { background: rgba(8, 26, 45, 0.14); }
.pd-eplay:focus-visible { outline: 2px solid var(--accent); outline-offset: -4px; }
.pd-eplay-dot {
    position: relative;
    display: block;
    width: clamp(44px, 4.4vw, 60px);
    height: clamp(44px, 4.4vw, 60px);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.24);
    transition: transform 0.4s cubic-bezier(0.22,1,0.36,1);
}
.pd-eplay:hover .pd-eplay-dot { transform: scale(1.07); }
/* Play triangle, drawn with a border so no icon asset is needed. */
.pd-eplay-dot::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 54%;
    transform: translate(-50%, -50%);
    border-style: solid;
    border-width: 8px 0 8px 13px;
    border-color: transparent transparent transparent #12233a;
}

/* ---------- sequence strip ----------
   An even run of screens — an animation build, or a set of related states —
   held in their original order. Flexible count, so the same kind serves a
   three-up and a five-up without a bespoke rule. */
.pd-erow--seq { display: flex; flex-wrap: nowrap; }
.pd-erow--seq > .pd-efig { flex: 1 1 0; min-width: 0; }

@media (max-width: 900px) {
    .pd-erow--seq { flex-wrap: wrap; }
    .pd-erow--seq > .pd-efig { flex: 1 1 calc(50% - clamp(14px, 2vw, 26px)); }
}
@media (max-width: 640px) {
    .pd-erow--seq { flex-direction: column; }
    .pd-erow--seq > .pd-efig { flex: 1 1 auto; }
    .pd-eplay-dot { width: 46px; height: 46px; }
}

/* ---------- landscape brand video ----------
   BrandVideo defaults to a portrait frame. When a case study hands it a
   landscape or near-square piece, the frame takes the screen's own shape and
   the media column widens to match, instead of squeezing it into the narrow
   portrait column.
   ========================================================================== */
.pd-bv:not(.is-portrait) .pd-bv-frame { aspect-ratio: 6 / 5; }
.pd-brand-grid:has(.pd-bv:not(.is-portrait)) {
    grid-template-columns: 1fr minmax(300px, 480px);
}
@media (max-width: 900px) {
    .pd-brand-grid:has(.pd-bv:not(.is-portrait)) { grid-template-columns: 1fr; }
    .pd-brand:has(.pd-bv:not(.is-portrait)) .pd-brand-media { max-width: 100%; }
}

html[data-aag-theme="dark"] .pd-eframe.is-media { background: #0a1c2e; }

/* ==========================================================================
   CAROUSELS CARRYING MIXED MEDIA
   A carousel slide can now hold a still or a real video, so the screens that
   belong to one concept — category title, project film, award card — are
   browsed in one frame instead of stacking down the page. The controls stay
   the ones the portfolio already uses: the same round arrow, the same accent
   dot, the same radius. Only a quiet counter is new.
   ========================================================================== */
.pd-carousel-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    background: #0b2a4a;
}
/* Event screens are 6:5. Capping the whole carousel — not just the media —
   keeps the arrows hugging the artwork instead of floating in white space, and
   stops one slide from running the full content width. */
.pd-carousel.is-screen { max-width: 800px; margin-left: auto; margin-right: auto; }
/* Where the column is wider than the capped carousel, the arrows step outside
   the artwork instead of sitting on top of it, so a control never lands over a
   wordmark. Below that width they overlay the frame, as they always have. */
@media (min-width: 1000px) {
    .pd-carousel.is-screen .pd-carousel-prev { left: -27px; }
    .pd-carousel.is-screen .pd-carousel-next { right: -27px; }
}
.pd-carousel-slide.is-screen .pd-carousel-media { aspect-ratio: 6 / 5; background: #0b2a4a; }
.pd-carousel-count {
    margin-left: 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    align-self: center;
}
/* The dots row centres as a group; the counter rides along at its right. */
.pd-carousel-dots { align-items: center; }

/* A carousel standing in for an editorial row keeps that row's rhythm. */
.pd-erow-group > .pd-carousel { margin-top: 4px; }

@media (max-width: 640px) {
    /* Touch swipe is the primary gesture here, but the arrows stay reachable —
       pulled in tight to the frame so nothing sits outside the viewport. */
    .pd-carousel-arrow { width: 38px; height: 38px; }
    .pd-carousel-prev { left: 8px; }
    .pd-carousel-next { right: 8px; }
    .pd-carousel-count { font-size: 10px; }
}

html[data-aag-theme="dark"] .pd-carousel-slide.is-screen .pd-carousel-media,
html[data-aag-theme="dark"] .pd-carousel-video { background: #0a1c2e; }
`


/* =========================================================================
   REAL CASE STUDIES — Chroma · The Neon Museum · Bokobá (bilingual).
   ========================================================================= */
const CHROMA: CaseProject = {
    "category": {
        "es": "Editorial · Print",
        "en": "Editorial · Print"
    },
    "title": {
        "es": "Chroma",
        "en": "Chroma"
    },
    "year": "2024",
    "role": {
        "es": "Diseño editorial",
        "en": "Editorial design"
    },
    "client": {
        "es": "Proyecto de estudio",
        "en": "Studio project"
    },
    "lead": {
        "es": "Chroma es una revista sobre el color: pureza, intensidad y matiz llevados al papel para inspirar a quienes crean con la mirada.",
        "en": "Chroma is a magazine about colour: purity, intensity and hue brought to paper to inspire those who create by looking."
    },
    "overview": {
        "es": [
            "Chroma es una revista pensada para amantes del color, creativos y artistas que buscan inspiración y profundidad en su trabajo. Con una periodicidad mensual, su regularidad favorece un contenido más creativo y especializado: cada edición es un compendio de ideas frescas y enfoques innovadores.",
            "El nombre parte de una idea sencilla —“chroma” se refiere a la pureza y la intensidad de un color— y todo el sistema editorial gira en torno a ese concepto."
        ],
        "en": [
            "Chroma is a magazine designed for colour enthusiasts, creatives and artists looking for inspiration and depth in their work. Published monthly, its regularity encourages more creative and specialised content: each edition is a compendium of fresh ideas and innovative approaches.",
            "The name comes from a simple idea — “chroma” refers to the purity and intensity of a colour — and the whole editorial system revolves around that concept."
        ]
    },
    "services": {
        "es": [
            "Dirección de arte",
            "Diseño editorial",
            "Tipografía",
            "Sistema de color",
            "Arte final"
        ],
        "en": [
            "Art direction",
            "Editorial design",
            "Typography",
            "Colour system",
            "Artwork"
        ]
    },
    "quote": {
        "es": "Cada número es un color. El color ordena la portada, marca el ritmo interior y convierte la revista en objeto de colección.",
        "en": "Each issue is a colour. Colour orders the cover, sets the interior rhythm and turns the magazine into a collectible object."
    },
    "heroImage": "/portfolio/assets/iE8mTwTJh2eFlAF9SpWoclrthcM.png",
    "media1": {
        "src": "/portfolio/assets/iE8mTwTJh2eFlAF9SpWoclrthcM.png",
        "ratio": "wide",
        "caption": {
            "es": "Chroma — una revista sobre los colores",
            "en": "Chroma — a magazine about colours"
        }
    },
    "sections": [
        {
            "key": "cover",
            "heading": {
                "es": "La portada",
                "en": "Cover design"
            },
            "body": {
                "es": [
                    "Para componer la portada y la contraportada se implementó un sistema basado en una macro-imagen que cubre por completo ambas superficies, mostrando una textura y un color correspondientes al tono específico del número.",
                    "El título se destaca dentro de un cuadrado Pantone que simula una lupa, situado en el centro de la portada."
                ],
                "en": [
                    "To compose the front and back cover, a system based on a macro image covering both surfaces entirely was implemented, showing a texture and colour matching the issue’s specific tone.",
                    "The title is highlighted within a Pantone square that simulates a magnifying glass, placed at the centre of the cover."
                ]
            }
        },
        {
            "key": "interiors",
            "heading": {
                "es": "Los interiores",
                "en": "Interiors"
            },
            "body": {
                "es": [
                    "En el interior, cada revista adquiere una identidad única apoyándose en la psicología del color y en el uso de tipografías distintivas, como Fairplay Display.",
                    "Para la composición se recurre a la ley de los tercios y a la composición por bloques, que aporta orden y serenidad al ordenar el contenido en unidades definidas, facilitando la jerarquía y una lectura fluida."
                ],
                "en": [
                    "Inside, each magazine acquires a unique identity relying on colour psychology and the use of distinctive typefaces such as Fairplay Display.",
                    "The composition uses the rule of thirds and block composition, which brings order and calm by organising content into defined units, easing hierarchy and a fluid reading experience."
                ]
            }
        },
        {
            "key": "insert",
            "heading": {
                "es": "El encarte",
                "en": "Insert design"
            },
            "body": {
                "es": [
                    "El encarte se compone de dos partes: una pieza informativa acompañada de una obra gráfica y una serie de imágenes que evocan creatividad. Cada imagen se vincula a una tonalidad concreta, presentada con su nombre y sus códigos RGB y CMYK.",
                    "Ambas piezas se diseñan con pliegues troquelados que permiten separarlas con facilidad, favoreciendo su manejo y disfrute."
                ],
                "en": [
                    "The insert consists of two parts: an informative piece accompanied by an artwork, and a series of images that evoke creativity. Each image is linked to a particular shade, presented with its name and its RGB and CMYK codes.",
                    "Both pieces are designed with die-cut folds that allow them to be separated easily, favouring handling and enjoyment."
                ]
            }
        },
        {
            "key": "create",
            "heading": {
                "es": "Separa, combina y crea",
                "en": "Detach, combine & create"
            },
            "body": {
                "es": [
                    "La experiencia no termina en la lectura: cada lámina se convierte en una pieza independiente. Al separar y combinar imágenes, el lector da rienda suelta a su imaginación y crea composiciones personalizadas.",
                    "Chroma deja de ser solo una revista para convertirse en un material creativo que invita a jugar con el color."
                ],
                "en": [
                    "The experience does not end with reading: each sheet becomes an independent piece. By detaching and combining images, the reader gives free rein to their imagination and creates personalised compositions.",
                    "Chroma stops being just a magazine to become a creative material that invites you to play with colour."
                ]
            },
            "media": {
                "src": "/portfolio/assets/sqwgbH6sQ6p3q04c7Cvl4prSes.png",
                "caption": {
                    "es": "Láminas combinables",
                    "en": "Combinable sheets"
                }
            }
        }
    ],
    "galleryHeading": {
        "es": "La colección",
        "en": "The collection"
    },
    "carousels": [
        {
            "key": "variants",
            "heading": { "es": "Variantes de color", "en": "Colour variants" },
            "ratio": "tall",
            "items": [
                { "src": "/portfolio/assets/42jm92FG2vrsTgJawSZgOTM2Kc.png", "caption": { "es": "Azul", "en": "Blue" } },
                { "src": "/portfolio/assets/DFklDmDBjpPsBf46YNOl8F0.png", "caption": { "es": "Azul acero", "en": "Steel blue" } },
                { "src": "/portfolio/assets/Kux1giP5xvYCAtiqYO0SMeI0c.png", "caption": { "es": "Azul cobalto", "en": "Cobalt blue" } },
                { "src": "/portfolio/assets/UpLo3fqmKbGJbBRcVw1MRtyIWA.png", "caption": { "es": "Azul Francia", "en": "French blue" } },
                { "src": "/portfolio/assets/8lsTkedaTmWJChjtRR7knpEzY.png", "caption": { "es": "Azul grisáceo", "en": "Greyish blue" } },
                { "src": "/portfolio/assets/RYvYVJrUgEhMwKz1h3UeEjQak.png", "caption": { "es": "Azul marino", "en": "Navy blue" } },
                { "src": "/portfolio/assets/6vLZeg7UWvPf0TfosAX36YVVcQM.png", "caption": { "es": "Azul medio", "en": "Medium blue" } },
                { "src": "/portfolio/assets/bThDW5wclMNl9x9iBvMTRWRtQ.png", "caption": { "es": "Azul oscuro", "en": "Dark blue" } },
                { "src": "/portfolio/assets/a9aAgACORAJmJdOo9xOiHKiCM.png", "caption": { "es": "Azul persa", "en": "Persian blue" } },
                { "src": "/portfolio/assets/BID6RQN877BhOtc6T7NA8mP3i4.png", "caption": { "es": "Azul Prusia", "en": "Prussian blue" } },
                { "src": "/portfolio/assets/0SnFl120Msk9nHEbhgzJlJkeA.png", "caption": { "es": "Azul royal", "en": "Royal blue" } },
                { "src": "/portfolio/assets/EJTrHm9c09aketL6cglNZsmjpY.png", "caption": { "es": "Azur", "en": "Azure" } }
            ]
        },
        {
            "key": "pages",
            "heading": { "es": "Páginas", "en": "Pages" },
            "ratio": "tall",
            "items": [
                { "src": "/portfolio/assets/gEYQ8PVyRADZR2esuAmjwdQTwY.png", "caption": { "es": "Página 01", "en": "Page 01" } },
                { "src": "/portfolio/assets/YRonamm2yR678Gfr4T9bD7fwyQ.png", "caption": { "es": "Página 02", "en": "Page 02" } },
                { "src": "/portfolio/assets/uv3Sfae3qV0WtYsGvig1RR89IIo.png", "caption": { "es": "Página 03", "en": "Page 03" } },
                { "src": "/portfolio/assets/W7WmCQcqWdExJyiRjhZ2Qr1j4.png", "caption": { "es": "Página 04", "en": "Page 04" } },
                { "src": "/portfolio/assets/0aRhCjqAnQgLfdK0qw9AXzcLtUQ.png", "caption": { "es": "Página 05", "en": "Page 05" } },
                { "src": "/portfolio/assets/ujsrHhLeGDPL7dXBoe9jnJ4qIg.png", "caption": { "es": "Página 06", "en": "Page 06" } },
                { "src": "/portfolio/assets/MaZZ8wxv9dNAwX83bU8c1Ol7pUY.png", "caption": { "es": "Página 07", "en": "Page 07" } },
                { "src": "/portfolio/assets/p0auppldhut6aO4PosiXhYzOBU.png", "caption": { "es": "Página 08", "en": "Page 08" } },
                { "src": "/portfolio/assets/YuyetyLTfgCOcW7BdNImHMmYS4.png", "caption": { "es": "Página 09", "en": "Page 09" } },
                { "src": "/portfolio/assets/Gimvqm6VUWGu7kgC33QnLGd9VI.png", "caption": { "es": "Página 10", "en": "Page 10" } },
                { "src": "/portfolio/assets/doDmvAQMh6rUpMrFhly2tutSEeA.png", "caption": { "es": "Página 11", "en": "Page 11" } },
                { "src": "/portfolio/assets/iAKGfbhHzzicSnVQTWSmMx7VU4.png", "caption": { "es": "Página 12", "en": "Page 12" } },
                { "src": "/portfolio/assets/xKCwu01M0nNhX2K1Ry2MVW3wCE.png", "caption": { "es": "Página 13", "en": "Page 13" } },
                { "src": "/portfolio/assets/S9qxSTkn6a5UrECltPGMuMiuQU.png", "caption": { "es": "Página 14", "en": "Page 14" } },
                { "src": "/portfolio/assets/UB920fNHRiXkjtq8tLLg4k7xoSU.png", "caption": { "es": "Página 15", "en": "Page 15" } },
                { "src": "/portfolio/assets/erqUCTz01ZosYo7aGBn7teyBqkY.png", "caption": { "es": "Página 16", "en": "Page 16" } },
                { "src": "/portfolio/assets/8A14KsSlSJ4hn6l0J8c216CrvlA.png", "caption": { "es": "Página 17", "en": "Page 17" } }
            ]
        },
        {
            "key": "covers",
            "heading": { "es": "Portadas e interior", "en": "Covers & interior" },
            "items": [
                { "src": "/portfolio/assets/09V0ervvKsrLCoZf3zFtuYhPWA.png", "caption": { "es": "Sistema de portadas por color", "en": "Colour-based cover system" } },
                { "src": "/portfolio/assets/oKNB9NMgXDHp6WaLbMhkfKzytrE.png", "ratio": "wide", "caption": { "es": "Portadas e índice", "en": "Covers & index" } },
                { "src": "/portfolio/assets/oDfQKFvZ3bTHjo6Yxldc3759o.png", "caption": { "es": "Composición interior por bloques", "en": "Block-based interior composition" } },
                { "src": "/portfolio/assets/dtb4xgQslpqAzyKPvSes7RlI.png", "caption": { "es": "Contraportada", "en": "Back cover" } },
                { "src": "/portfolio/assets/BwkRvu4AgJEbaVDwIE0ecpSRPn8.png", "ratio": "wide", "caption": { "es": "Bloque de revistas", "en": "Magazine stack" } }
            ]
        },
        {
            "key": "inserts",
            "heading": { "es": "Encartes", "en": "Inserts" },
            "items": [
                { "src": "/portfolio/assets/svsBnYiix2dzxnitzNCmYeAdF8.png", "caption": { "es": "Encarte", "en": "Insert" } },
                { "src": "/portfolio/assets/xETQX3Jgs2NxeId8rWahZbN50ZM.png", "caption": { "es": "Encarte troquelado", "en": "Die-cut insert" } }
            ]
        }
    ]
}
const NEON: CaseProject = {
    "category": {
        "es": "Branding · Rebranding",
        "en": "Branding · Rebranding"
    },
    "title": {
        "es": "The Neon Museum",
        "en": "The Neon Museum"
    },
    "year": "2024",
    "role": {
        "es": "Identidad visual",
        "en": "Visual identity"
    },
    "client": {
        "es": "The Neon Museum, Las Vegas",
        "en": "The Neon Museum, Las Vegas"
    },
    "lead": {
        "es": "Rebranding para el museo que preserva los letreros de neón que dieron forma a la identidad de Las Vegas.",
        "en": "A rebranding for the museum that preserves the neon signs that shaped the identity of Las Vegas."
    },
    "overview": {
        "es": [
            "The Neon Museum de Las Vegas es un destino icónico que alberga algunos de los letreros de neón más famosos de la ciudad. Funciona como una organización sin ánimo de lucro dedicada a preservar piezas del apogeo de Las Vegas a mediados de siglo.",
            "Los letreros de neón fueron una parte esencial de la imagen de la ciudad en los años 50 y 60, pero con la llegada de la tecnología LED muchos han sido retirados. El museo honra cómo estas formas iluminadas moldearon la identidad y el paisaje visual de la ciudad."
        ],
        "en": [
            "The Neon Museum in Las Vegas is an iconic destination that houses some of the city’s most famous neon signs. It operates as a non-profit dedicated to preserving exhibits from Vegas’ mid-century heyday.",
            "Neon signs were a significant part of the city’s image in the 1950s and 1960s, but with the arrival of LED technology many have been retired. The museum honours how these illuminated forms shaped the city’s identity and visual landscape."
        ]
    },
    "services": {
        "es": [
            "Estrategia de marca",
            "Identidad visual",
            "Sistema de iconos",
            "Papelería",
            "Merchandising"
        ],
        "en": [
            "Brand strategy",
            "Visual identity",
            "Icon system",
            "Stationery",
            "Merchandising"
        ]
    },
    "quote": {
        "es": "El neón es más que iluminación: es una forma de expresión artística y comunicación visual que sigue inspirando.",
        "en": "Neon is more than lighting: it is a form of artistic expression and visual communication that still inspires."
    },
    "heroImage": "/portfolio/assets/6uXPO81uvlYA2kRF8tPjYbGtzg.png",
    "media1": {
        "src": "/portfolio/assets/6uXPO81uvlYA2kRF8tPjYbGtzg.png"
    },
    "sections": [
        {
            "key": "medium",
            "heading": {
                "es": "El neón como medio artístico",
                "en": "Neon as an artistic medium"
            },
            "body": {
                "es": [
                    "El neón se ha convertido en una forma de expresión artística y comunicación visual. Su brillo y su capacidad para formar geometrías complejas lo hacen excepcionalmente eficaz para instalaciones que atraen la mirada.",
                    "Ya sea para destacar edificios emblemáticos o decorar espacios creativos, el neón sigue siendo fuente de inspiración en el mundo del arte y la señalética."
                ],
                "en": [
                    "Neon has become a form of artistic expression and visual communication. Its brightness and capacity for complex geometric forms make it exceptionally effective for eye-catching installations.",
                    "Whether used to highlight landmark buildings or decorate creative spaces, neon remains a source of inspiration in the world of art and signage."
                ]
            }
        },
        {
            "key": "universe",
            "heading": {
                "es": "El universo gráfico",
                "en": "The graphic universe"
            },
            "body": {
                "es": [
                    "El sistema de diseño incorpora un conjunto de iconos inspirados en la ciudad de Las Vegas, todos trazados con líneas curvas que evocan las formas sinuosas de los letreros de neón.",
                    "Estas formas geométricas fluidas mantienen coherencia visual con el museo a la vez que resultan fácilmente reconocibles, creando una cualidad orgánica que refuerza la conexión con el neón."
                ],
                "en": [
                    "The design system features a set of icons inspired by the city of Las Vegas, all drawn with curved lines that evoke the sinuous shapes of neon signs.",
                    "These flowing geometric forms keep visual coherence with the museum while remaining easily recognisable, creating an organic quality that reinforces the connection to neon."
                ]
            }
        },
        {
            "key": "apps",
            "heading": {
                "es": "Aplicaciones",
                "en": "Applications"
            },
            "body": {
                "es": [
                    "La identidad se extiende a un sistema completo de aplicaciones: papelería, tarjetas, cuaderno, tote bag y merchandising que llevan el lenguaje curvo del neón a cada punto de contacto.",
                    "El resultado es una marca cálida y reconocible que celebra el patrimonio luminoso de Las Vegas."
                ],
                "en": [
                    "The identity extends into a complete system of applications: stationery, cards, notebook, tote bag and merchandising that bring the curved neon language to every touchpoint.",
                    "The result is a warm, recognisable brand that celebrates the luminous heritage of Las Vegas."
                ]
            }
        }
    ],
    "galleryHeading": {
        "es": "Aplicaciones de marca",
        "en": "Brand applications"
    },
    "carousels": [
        {
            "key": "mockups",
            "heading": { "es": "Mockups", "en": "Mockups" },
            "items": [
                { "src": "/portfolio/assets/9WOJrSua7HrXJix9NDhgeyiuOw.png", "caption": { "es": "Tarjeta", "en": "Card" } },
                { "src": "/portfolio/assets/oqMu8wHIzXDZXcJZsJoeQ9DfQ.png", "caption": { "es": "Cuaderno", "en": "Notebook" } },
                { "src": "/portfolio/assets/vg7dAC7GmT5LYuRqtDWWGdA.png", "caption": { "es": "Tote bag", "en": "Tote bag" } }
            ]
        },
        {
            "key": "applications",
            "heading": { "es": "Aplicaciones", "en": "Applications" },
            "items": [
                { "src": "/portfolio/assets/aXAUVJUcd798CEqdyomdT1ntW0.png", "caption": { "es": "Mapa y señalética", "en": "Map & wayfinding" } },
                { "src": "/portfolio/assets/ghIL9IQcAWdzZdvlcOjizF1Mn58.png", "caption": { "es": "Aplicación textil", "en": "Textile application" } },
                { "src": "/portfolio/assets/feUwmzYzB8LofqNsakHhNDAUiY.png", "ratio": "wide", "caption": { "es": "Manual de marca", "en": "Brand manual" } }
            ]
        }
    ]
}
const BOKOBA: CaseProject = {
    "category": {
        "es": "Branding · Packaging",
        "en": "Branding · Packaging"
    },
    "title": {
        "es": "Bokobá",
        "en": "Bokobá"
    },
    "year": "2024",
    "role": {
        "es": "Identidad y packaging",
        "en": "Identity & packaging"
    },
    "client": {
        "es": "Bokobá Sparkling Water",
        "en": "Bokobá Sparkling Water"
    },
    "lead": {
        "es": "Bokobá es un homenaje a tu bienestar: agua con gas inspirada en la esencia de las aguas frescas mexicanas.",
        "en": "Bokobá is a tribute to your well-being: sparkling water inspired by the essence of Mexican aguas frescas."
    },
    "overview": {
        "es": [
            "Bokobá es más que una bebida refrescante; es una experiencia que invita a conectar con tu cuerpo y a celebrar el placer de cuidarlo. Inspirada en la esencia de las aguas frescas mexicanas, captura la frescura pura de frutas, hierbas aromáticas y un toque de dulzor natural.",
            "El nombre nace de su raíz: literalmente significa “batir o remar el agua” —de las voces Bokob, batir/remar, y Há, agua—, una imagen que evoca el chapoteo fresco de cada sorbo."
        ],
        "en": [
            "Bokobá is more than a refreshing drink; it is an experience that invites you to connect with your body and celebrate the pleasure of taking care of it. Inspired by the essence of Mexican aguas frescas, it captures the pure freshness of fruits, aromatic herbs and a touch of natural sweetness.",
            "The name is born from its root: it literally means “to beat or row water” — from the words Bokob, beat/row, and Há, water — an image that evokes the fresh splash of every sip."
        ]
    },
    "services": {
        "es": [
            "Naming",
            "Identidad visual",
            "Ilustración",
            "Packaging",
            "Packaging secundario"
        ],
        "en": [
            "Naming",
            "Visual identity",
            "Illustration",
            "Packaging",
            "Secondary packaging"
        ]
    },
    "quote": {
        "es": "Cada sabor es una fruta, cada lata un color: un sistema fresco y vivo que despierta los sentidos.",
        "en": "Each flavour is a fruit, each can a colour: a fresh, living system that awakens the senses."
    },
    "heroImage": "/portfolio/assets/KyAuNTvy7aCNxOhDAFoDemtB1c8.gif",
    "media1": {
        "src": "/portfolio/assets/KyAuNTvy7aCNxOhDAFoDemtB1c8.gif",
        "ratio": "wide",
        "caption": {
            "es": "Bokobá — frescura en movimiento",
            "en": "Bokobá — freshness in motion"
        }
    },
    "sections": [
        {
            "key": "flavours",
            "heading": {
                "es": "El sistema de sabores",
                "en": "The flavour system"
            },
            "body": {
                "es": [
                    "Cada sabor se traduce en un color y una ilustración propios, creando una familia reconocible en el lineal. Arándano, hibisco, horchata, limón, tamarindo y uva comparten un mismo lenguaje visual, cálido y natural.",
                    "La tipografía y las formas orgánicas remiten a la tradición de las aguas frescas, actualizada con una mirada contemporánea."
                ],
                "en": [
                    "Each flavour is translated into its own colour and illustration, creating a family that is recognisable on the shelf. Blueberry, hibiscus, horchata, lemon, tamarind and grape share a single visual language, warm and natural.",
                    "The typography and organic shapes recall the tradition of aguas frescas, updated with a contemporary eye."
                ]
            },
            "media": {
                "src": "/portfolio/assets/p9K6BS5VmQWZQkTTdhx56LKrKtY.png",
                "caption": {
                    "es": "Caja y sistema de latas",
                    "en": "Box & can system"
                }
            }
        },
        {
            "key": "etymology",
            "heading": {
                "es": "La etimología",
                "en": "The etymology"
            },
            "body": {
                "es": [
                    "El logotipo se construye sobre el significado del nombre: batir o remar el agua. El movimiento del agua se traduce en un símbolo dinámico que sintetiza la esencia de la marca.",
                    "Es un guiño al origen del término y a la sensación de frescura que Bokobá quiere transmitir en cada contacto."
                ],
                "en": [
                    "The logo is built on the meaning of the name: to beat or row water. The movement of water is translated into a dynamic symbol that synthesises the essence of the brand.",
                    "It is a nod to the origin of the term and to the feeling of freshness that Bokobá wants to convey at every touchpoint."
                ]
            },
            "media": {
                "src": "/portfolio/assets/oeqM9nAXquJVkIUEtHi3PT7Co.gif",
                "caption": {
                    "es": "Logotipo en movimiento",
                    "en": "Logo in motion"
                }
            }
        },
        {
            "key": "secondary",
            "heading": {
                "es": "Packaging secundario",
                "en": "Secondary packaging"
            },
            "body": {
                "es": [
                    "Inspirado en los puestos tradicionales de aguas frescas, el packaging secundario evoca la sensación de hogar en cada sorbo. Su formato plegable, similar a un toldo portátil, es práctico y fácil de llevar a cualquier parte.",
                    "Además de funcional, sirve como expositor para presentar las latas, combinando utilidad con la nostalgia de la cultura de las aguas frescas mexicanas."
                ],
                "en": [
                    "Inspired by traditional aguas frescas stands, the secondary packaging evokes a sense of home with every sip. Its foldable format, similar to a portable awning, is practical and easy to carry anywhere.",
                    "As well as being functional, it serves as a stand to display the cans, combining utility with the nostalgia of Mexican aguas frescas culture."
                ]
            },
            "media": {
                "src": "/portfolio/assets/ZvVJzscSPoMVUG5ZFUFy6aTWbhQ.png",
                "caption": {
                    "es": "Latas en contexto",
                    "en": "Cans in context"
                }
            }
        }
    ],
    "galleryHeading": {
        "es": "Los sabores",
        "en": "The flavours"
    },
    "carousels": [
        {
            "key": "labels",
            "heading": { "es": "Etiquetas de sabor", "en": "Flavour labels" },
            "ratio": "tall",
            "items": [
                { "src": "/portfolio/assets/MIrA0kMqZrDZD8weA2jVzTThpk.png", "caption": { "es": "Arándano", "en": "Blueberry" } },
                { "src": "/portfolio/assets/J4xbn8KEm1QwxJewAfew9lOzAvw.png", "caption": { "es": "Hibisco", "en": "Hibiscus" } },
                { "src": "/portfolio/assets/WopXtbAcFycPxR9ajPRlpfrF4.png", "caption": { "es": "Horchata", "en": "Horchata" } },
                { "src": "/portfolio/assets/W7K8EVsm1HCnt5p3G659fib2UM.png", "caption": { "es": "Limón", "en": "Lemon" } },
                { "src": "/portfolio/assets/46l2S41EzNExkE3KX3zJlynyIyw.png", "caption": { "es": "Tamarindo", "en": "Tamarind" } },
                { "src": "/portfolio/assets/YrpGtkGxOR021YdyJ0nc45xIeE.png", "caption": { "es": "Uva", "en": "Grape" } }
            ]
        }
    ]
}
const CHROMA_RELATED: typeof RELATED = [
    {
        "key": "neon",
        "category": {
            "es": "Branding",
            "en": "Branding"
        },
        "title": {
            "es": "The Neon Museum",
            "en": "The Neon Museum"
        },
        "info": {
            "es": "Rebranding · 2024",
            "en": "Rebranding · 2024"
        },
        "href": "/the-neon-museum",
        "img": "/portfolio/assets/9WOJrSua7HrXJix9NDhgeyiuOw.png"
    },
    {
        "key": "bokoba",
        "category": {
            "es": "Packaging",
            "en": "Packaging"
        },
        "title": {
            "es": "Bokobá",
            "en": "Bokobá"
        },
        "info": {
            "es": "Identidad y packaging · 2024",
            "en": "Identity & packaging · 2024"
        },
        "href": "/bokoba",
        "img": "/portfolio/assets/J4xbn8KEm1QwxJewAfew9lOzAvw.png"
    },
    {
        "key": "youicy",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Youicy",
            "en": "Youicy"
        },
        "info": {
            "es": "Diseño de producto · 2024",
            "en": "Product design · 2024"
        },
        "href": "/youicy",
        "img": "/portfolio/assets/YrpGtkGxOR021YdyJ0nc45xIeE.png"
    },
    {
        "key": "nailly",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Nailing",
            "en": "Nailing"
        },
        "info": {
            "es": "App móvil · 2024",
            "en": "Mobile app · 2024"
        },
        "href": "/nailing",
        "img": "/portfolio/assets/oqMu8wHIzXDZXcJZsJoeQ9DfQ.png"
    }
]
const NEON_RELATED: typeof RELATED = [
    {
        "key": "bokoba",
        "category": {
            "es": "Packaging",
            "en": "Packaging"
        },
        "title": {
            "es": "Bokobá",
            "en": "Bokobá"
        },
        "info": {
            "es": "Identidad y packaging · 2024",
            "en": "Identity & packaging · 2024"
        },
        "href": "/bokoba",
        "img": "/portfolio/assets/J4xbn8KEm1QwxJewAfew9lOzAvw.png"
    },
    {
        "key": "chroma",
        "category": {
            "es": "Editorial",
            "en": "Editorial"
        },
        "title": {
            "es": "Chroma",
            "en": "Chroma"
        },
        "info": {
            "es": "Revista sobre el color · 2024",
            "en": "A magazine about colour · 2024"
        },
        "href": "/chroma",
        "img": "/portfolio/assets/g4yBChKIzhvrn48BYpcQjBoNXk.png"
    },
    {
        "key": "youicy",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Youicy",
            "en": "Youicy"
        },
        "info": {
            "es": "Diseño de producto · 2024",
            "en": "Product design · 2024"
        },
        "href": "/youicy",
        "img": "/portfolio/assets/YrpGtkGxOR021YdyJ0nc45xIeE.png"
    },
    {
        "key": "nailly",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Nailing",
            "en": "Nailing"
        },
        "info": {
            "es": "App móvil · 2024",
            "en": "Mobile app · 2024"
        },
        "href": "/nailing",
        "img": "/portfolio/assets/oqMu8wHIzXDZXcJZsJoeQ9DfQ.png"
    }
]
const BOKOBA_RELATED: typeof RELATED = [
    {
        "key": "chroma",
        "category": {
            "es": "Editorial",
            "en": "Editorial"
        },
        "title": {
            "es": "Chroma",
            "en": "Chroma"
        },
        "info": {
            "es": "Revista sobre el color · 2024",
            "en": "A magazine about colour · 2024"
        },
        "href": "/chroma",
        "img": "/portfolio/assets/g4yBChKIzhvrn48BYpcQjBoNXk.png"
    },
    {
        "key": "neon",
        "category": {
            "es": "Branding",
            "en": "Branding"
        },
        "title": {
            "es": "The Neon Museum",
            "en": "The Neon Museum"
        },
        "info": {
            "es": "Rebranding · 2024",
            "en": "Rebranding · 2024"
        },
        "href": "/the-neon-museum",
        "img": "/portfolio/assets/9WOJrSua7HrXJix9NDhgeyiuOw.png"
    },
    {
        "key": "youicy",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Youicy",
            "en": "Youicy"
        },
        "info": {
            "es": "Diseño de producto · 2024",
            "en": "Product design · 2024"
        },
        "href": "/youicy",
        "img": "/portfolio/assets/YrpGtkGxOR021YdyJ0nc45xIeE.png"
    },
    {
        "key": "nailly",
        "category": {
            "es": "UX/UI",
            "en": "UX/UI"
        },
        "title": {
            "es": "Nailing",
            "en": "Nailing"
        },
        "info": {
            "es": "App móvil · 2024",
            "en": "Mobile app · 2024"
        },
        "href": "/nailing",
        "img": "/portfolio/assets/oqMu8wHIzXDZXcJZsJoeQ9DfQ.png"
    }
]

/**
 * Chroma — case study
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export function ChromaPage(props: ProjectDetailPageProps) {
    return <CaseStudyPage {...props} project={CHROMA} related={CHROMA_RELATED} />
}
/**
 * The Neon Museum — case study
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export function NeonMuseumPage(props: ProjectDetailPageProps) {
    return <CaseStudyPage {...props} project={NEON} related={NEON_RELATED} />
}
/**
 * Bokobá — case study
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export function BokobaPage(props: ProjectDetailPageProps) {
    return <CaseStudyPage {...props} project={BOKOBA} related={BOKOBA_RELATED} />
}

/* =========================================================================
   MAGTEL — corporate communication, graphic & editorial design (bilingual).
   Internship in Magtel's Communication Department, during a period in which
   the group was rolling out a renewed corporate identity. Same template and
   design system as Chroma / The Neon Museum / Bokoba: only the data changes.
   ========================================================================= */
const MAG = {
    memoria: "/portfolio/assets/h013BrlBVVq5AmFxFlPNmWo2VM.jpg",
    politica: "/portfolio/assets/3DVAcFOf7sRRY6d2xs3p2HmyUZE.jpg",
    cuaderno: "/portfolio/assets/wBoP5nYom4IuzIRJmW4GuyH60aQ.jpg",
    rollupAzul: "/portfolio/assets/9RuYEn2RnkPTL6ofMrJuE8mFo.jpg",
    rollupBlanco: "/portfolio/assets/4uZygESUiwdYAYeAlBSlg76RwdE.jpg",
    fundacionAzul: "/portfolio/assets/JDGz9IzrDM1qgnlS0LOlef8oOqY.jpg",
    fundacionBlanco: "/portfolio/assets/oLpEX8oSoAic8kKQQdIEOnpoY6w.jpg",
    vallaMagtelAzul: "/portfolio/assets/rG3zLhZip3yvTy33t5L4QViw6Q.jpg",
    vallaMagtelBlanco: "/portfolio/assets/XI6gi6yi7cZkt8cS55SJhlA4q94.jpg",
    mockupVallaAzul: "/portfolio/assets/ALZQy7FquXPPXYcr81baCzloA.jpg",
    mockupVallaBlanca: "/portfolio/assets/PmnrWZxTcmDADQFPsV4X88d77Q.jpg",
    videoPoster: "/portfolio/assets/cacd7l15geQEoRUTmeOC93Sw.jpg",
}

/* Brand motion piece (Magtel Innovation & Technology, 360x640, 12s, muted loop).
   Framer carries this file inline as a data URI because its asset API only
   accepts video from a public HTTPS URL; here it is a plain static asset, so
   the payload stays out of the JS bundle. */
const MAG_VIDEO_URL = "/portfolio/assets/magtel-brand-video.mp4"

const MAGTEL: CaseProject = {
    category: {
        es: "Comunicación corporativa · Gráfico y editorial",
        en: "Corporate Communication · Graphic & Editorial",
    },
    title: { es: "Magtel", en: "Magtel" },
    year: "2024 — 2025",
    role: {
        es: "Diseño gráfico y editorial",
        en: "Graphic & editorial design",
    },
    client: {
        es: "Magtel · Departamento de Comunicación",
        en: "Magtel · Communication Department",
    },
    lead: {
        es: "Prácticas en el Departamento de Comunicación de Magtel, durante la puesta en marcha de una identidad corporativa renovada.",
        en: "An internship in Magtel's Communication Department, while the group was rolling out a renewed corporate identity.",
    },
    overview: {
        es: [
            "Magtel es un grupo empresarial con sede en Córdoba que trabaja en ingeniería e infraestructuras, energía, telecomunicaciones, medio ambiente e innovación. Su comunicación tiene que llegar a públicos muy distintos —clientes, administraciones, equipos internos, candidatos— y en todos ellos sonar a la misma empresa.",
            "Hice mis prácticas dentro de su Departamento de Comunicación en un momento en el que la marca estaba evolucionando hacia el lenguaje visual de Magtel Innovation & Technology. Colaboré en llevar esa identidad renovada a piezas internas y externas: memoria anual, documentación corporativa, vallas de obra, roll-ups, presentaciones, piezas para la web y campañas de email. Tambien trabaje para la Fundación Magtel, que tiene su propia marca dentro del grupo.",
        ],
        en: [
            "Magtel is a business group based in Córdoba working across engineering and infrastructure, energy, telecommunications, the environment and innovation. Its communication has to reach very different audiences — clients, public bodies, internal teams, candidates — and sound like the same company to all of them.",
            "I did my internship inside their Communication Department at a moment when the brand was evolving towards the visual language of Magtel Innovation & Technology. I collaborated on carrying that renewed identity into internal and external pieces: the annual report, corporate documentation, site billboards, roll-ups, presentations, web assets and email campaigns. I also worked for Fundación Magtel, which has its own brand within the group.",
        ],
    },
    services: {
        es: [
            "Diseño editorial",
            "Diseño gráfico",
            "Comunicación corporativa",
            "Presentaciones",
            "Diseño web y piezas digitales",
            "Email marketing",
            "Aplicaciones de marca",
            "Comunicación exterior",
        ],
        en: [
            "Editorial design",
            "Graphic design",
            "Corporate communication",
            "Presentations",
            "Web & digital assets",
            "Email marketing",
            "Brand applications",
            "Outdoor communication",
        ],
    },
    quote: {
        es: "Una identidad corporativa no se sostiene en una pieza, sino en la coherencia de todas: la memoria anual, el correo interno y la valla de obra tienen que reconocerse entre sí.",
        en: "A corporate identity isn't held up by one piece, but by the consistency of all of them: the annual report, the internal email and the site billboard all have to recognise each other.",
    },
    heroImage: MAG.memoria,
    media1: { src: MAG.memoria },
    sections: [
        {
            key: "role",
            heading: { es: "Mi papel", en: "My role" },
            body: {
                es: [
                    "Entré en el Departamento de Comunicación como una pieza más del equipo: recibía encargos de distintas áreas del grupo, los interpretaba y los devolvía convertidos en piezas listas para imprenta o para publicar.",
                    "Trabajé siempre con un manual de marca ya definido. Mi papel no fue dirigir el cambio de identidad, sino participar en su implementación: adaptar materiales existentes y resolver piezas nuevas dentro del lenguaje visual renovado, cuidando que lo que decia la guía y lo que después se veia impreso o en pantalla coincidieran.",
                    "El encargo iba del formato largo al formato corto. Por un lado, documentos extensos —la memoria anual, la política de gestion— donde la maquetación tenia que ordenar mucha información sin cansar al lector. Por otro, piezas rapidas: roll-ups, vallas, cabeceras de email, presentaciones para reuniones y gráficos para la web.",
                ],
                en: [
                    "I joined the Communication Department as one more part of the team: briefs came in from different areas of the group, I interpreted them and returned them as pieces ready for print or publication.",
                    "I always worked with a brand manual that was already defined. My role was not to lead the identity change but to take part in rolling it out: adapting existing materials and resolving new pieces inside the renewed visual language, making sure what the guide said and what was later printed or shown on screen matched.",
                    "The briefs ranged from long form to short form. On one side, extensive documents — the annual report, the management policy — where layout had to organise a lot of information without wearing the reader out. On the other, fast pieces: roll-ups, billboards, email headers, meeting presentations and web graphics.",
                ],
            },
        },
    ],
    brand: {
        heading: { es: "La evolución de la marca", en: "Brand evolution" },
        body: {
            es: [
                "Durante mis prácticas, Magtel estaba evolucionando su identidad corporativa hacia el lenguaje de Magtel Innovation & Technology: una marca que ya no se explica solo por la obra, sino también por la tecnología.",
                "Desde el equipo de comunicación colaboré en trasladar ese lenguaje renovado a los soportes del día a día, respetando la guía de marca y resolviendo las decisiones que la guía no llegaba a cubrir.",
            ],
            en: [
                "During my internship, Magtel was evolving its corporate identity towards the language of Magtel Innovation & Technology: a brand no longer explained by construction alone, but by technology too.",
                "From within the communication team I collaborated on carrying that renewed language into everyday materials, respecting the brand guide and resolving the decisions the guide did not quite cover.",
            ],
        },
        video: {
            src: MAG_VIDEO_URL,
            poster: MAG.videoPoster,
            portrait: true,
            alt: {
                es: "Pieza de marca en movimiento de Magtel Innovation & Technology",
                en: "Magtel Innovation & Technology brand motion piece",
            },
        },
    },
    statement: {
        pre: { es: "El mensaje de la identidad renovada", en: "The message of the renewed identity" },
        big: { es: "Transformando", en: "Transformando" },
        emphasis: { es: "tu mundo", en: "tu mundo" },
        note: {
            es: "Innovación, infraestructuras, energía, telecomunicaciones y transformación digital, reunidas bajo una sola frase.",
            en: "Innovation, infrastructure, energy, telecommunications and digital transformation, gathered under a single line.",
        },
    },
    editorialHeading: { es: "Aplicaciones de la nueva identidad", en: "Applying the new identity" },
    editorialIntro: {
        es: "La misma identidad, resuelta en formatos que no se parecen en nada entre sí.",
        en: "The same identity, resolved across formats that have nothing in common.",
    },
    editorial: [
        {
            key: "longform",
            kind: "pair",
            label: { es: "Diseño editorial", en: "Editorial design" },
            items: [
                {
                    src: MAG.memoria,
                    caption: { es: "Memoria anual 2024", en: "2024 Annual Report" },
                },
                {
                    src: MAG.politica,
                    caption: { es: "Política de Gestión", en: "Management Policy" },
                },
            ],
        },
        {
            key: "cuaderno",
            kind: "full",
            label: { es: "Materiales corporativos", en: "Corporate materials" },
            items: [
                {
                    src: MAG.cuaderno,
                    caption: {
                        es: "Cuaderno corporativo — el sistema de iconos del grupo compuesto en retícula sobre cartón reciclado.",
                        en: "Corporate notebook — the group's icon system composed on a grid over recycled board.",
                    },
                },
            ],
        },
    ],
    billboard: {
        heading: { es: "Comunicación exterior", en: "Outdoor communication" },
        intro: {
            es: "La identidad renovada también salió a la calle. La valla de obra lleva el posicionamiento de Magtel a los entornos donde la empresa trabaja de verdad —infraestructura, energía, obra— y convierte el propio emplazamiento en soporte del mensaje: la marca aparece justo donde se está construyendo.",
            en: "The renewed identity also went outdoors. The site hoarding carries Magtel's positioning into the environments where the company actually works — infrastructure, energy, construction — turning the site itself into the medium: the brand shows up exactly where something is being built.",
        },
        scenes: [
            {
                key: "mundo-azul",
                src: MAG.mockupVallaAzul,
                alt: {
                    es: "Valla de obra con el diseño azul de Magtel en un emplazamiento en construcción",
                    en: "Construction hoarding carrying the blue Magtel design on a building site",
                },
            },
            {
                key: "mundo-blanco",
                src: MAG.mockupVallaBlanca,
                alt: {
                    es: "Valla de obra con el diseño blanco de Magtel, iluminada de noche",
                    en: "Construction hoarding carrying the white Magtel design, lit at night",
                },
            },
        ],
        rows: [
            {
                key: "valla-magtel",
                kind: "pair",
                label: { es: "Otras vallas de la campaña", en: "Other billboards in the campaign" },
                items: [{ src: MAG.vallaMagtelAzul }, { src: MAG.vallaMagtelBlanco }],
            },
        ],
    },
    rollups: {
        key: "rollups",
        heading: { es: "Roll-ups y eventos", en: "Roll-ups & events" },
        ratio: "square",
        items: [
            { src: MAG.rollupAzul, caption: { es: "Magtel Innovation & Technology", en: "Magtel Innovation & Technology" } },
            { src: MAG.rollupBlanco, caption: { es: "Magtel Innovation & Technology", en: "Magtel Innovation & Technology" } },
            { src: MAG.fundacionAzul, caption: { es: "Fundación Magtel", en: "Fundación Magtel" } },
            { src: MAG.fundacionBlanco, caption: { es: "Fundación Magtel", en: "Fundación Magtel" } },
        ],
    },
    learned: {
        heading: { es: "Lo que me llevo", en: "What I learned" },
        items: [
            {
                key: "editorial",
                title: { es: "Editorial de formato largo", en: "Long-form editorial" },
                text: {
                    es: "Maquetar la memoria anual y la política de gestion me obligó a pensar en retícula, jerarquía y ritmo a lo largo de decenas de páginas, no de una sola composición bonita.",
                    en: "Laying out the annual report and the management policy forced me to think in grid, hierarchy and rhythm across dozens of pages, not one nice composition.",
                },
            },
            {
                key: "manual",
                title: { es: "Implantar una identidad renovada", en: "Rolling out a renewed identity" },
                text: {
                    es: "Adaptar piezas al nuevo lenguaje visual me enseñó que un cambio de marca se juega en los detalles: qué hacer cuando la guía no contempla un formato, y cómo decidirlo sin romper el sistema.",
                    en: "Adapting pieces to the new visual language taught me that a brand change is won in the details: what to do when the guide does not cover a format, and how to decide without breaking the system.",
                },
            },
            {
                key: "escalas",
                title: { es: "La misma marca a dos escalas", en: "One brand at two scales" },
                text: {
                    es: "Una valla se lee a veinte metros y un email en una bandeja de entrada. Ajustar la identidad a esos dos extremos —tamaños, contraste, cuánto texto aguanta cada pieza— fue buena parte del trabajo.",
                    en: "A billboard is read from twenty metres; an email from an inbox. Fitting the identity to those two extremes — sizes, contrast, how much copy each piece can carry — was a good part of the job.",
                },
            },
            {
                key: "publicos",
                title: { es: "Comunicación interna y externa", en: "Internal and external comms" },
                text: {
                    es: "Lo que sale fuera y lo que circula dentro no persiguen lo mismo. Entender a quién le hablaba cada encargo cambiaba el tono, la cantidad de información y el formato final.",
                    en: "What goes out and what circulates inside are not after the same thing. Understanding who each brief was speaking to changed the tone, the amount of information and the final format.",
                },
            },
            {
                key: "equipos",
                title: { es: "Equipos multidisciplinares", en: "Multidisciplinary teams" },
                text: {
                    es: "Los encargos venían de comunicación, de marketing y de departamentos técnicos. Aprendí a preguntar lo suficiente al principio —qué, para quién, dónde se ve— para no rehacer después.",
                    en: "Briefs came from communication, from marketing and from technical departments. I learned to ask enough up front — what, for whom, where it will be seen — to avoid redoing it later.",
                },
            },
            {
                key: "digital",
                title: { es: "Web y email marketing", en: "Web and email marketing" },
                text: {
                    es: "Preparar gráficos para la web y cabeceras de campañas me enseñó restricciones que el papel no tiene: peso, formatos, cómo se ve una pieza en móvil y qué se rompe en cada cliente de correo.",
                    en: "Preparing web graphics and campaign headers taught me constraints paper does not have: file weight, formats, how a piece looks on mobile and what breaks in each email client.",
                },
            },
        ],
    },
    closing: {
        eyebrow: { es: "Para terminar", en: "To close" },
        text: {
            es: "Magtel me enseñó que una pieza de diseño rara vez funciona sola. La memoria, la valla, el roll-up y el email no eran proyectos independientes: eran la misma voz apareciendo en sitios distintos. Desde entonces, antes de resolver un encargo, intento entender dónde encaja dentro de todo lo demás.",
            en: "Magtel taught me that a design piece rarely works on its own. The report, the billboard, the roll-up and the email were not separate projects: they were the same voice showing up in different places. Since then, before solving a brief, I try to understand where it fits within everything else.",
        },
    },
    order: ["brand", "statement", "editorial", "billboard", "rollups", "learned", "closing"],
}

/* Same four neighbours Framer lists, pointed at the repo's local cover images
   (the site vendors every asset — nothing loads from framerusercontent.com). */
const MAGTEL_RELATED: typeof RELATED = [
    {
        key: "chroma",
        category: { es: "Editorial · Print", en: "Editorial · Print" },
        title: { es: "Chroma", en: "Chroma" },
        info: { es: "Diseño editorial · 2024", en: "Editorial design · 2024" },
        href: "/chroma",
        img: "/portfolio/assets/g4yBChKIzhvrn48BYpcQjBoNXk.png",
    },
    {
        key: "neon",
        category: { es: "Branding · Rebranding", en: "Branding · Rebranding" },
        title: { es: "The Neon Museum", en: "The Neon Museum" },
        info: { es: "Identidad visual · 2024", en: "Visual identity · 2024" },
        href: "/the-neon-museum",
        img: "/portfolio/assets/9WOJrSua7HrXJix9NDhgeyiuOw.png",
    },
    {
        key: "bokoba",
        category: { es: "Branding · Packaging", en: "Branding · Packaging" },
        title: { es: "Bokobá", en: "Bokobá" },
        info: { es: "Packaging · 2024", en: "Packaging · 2024" },
        href: "/bokoba",
        img: "/portfolio/assets/J4xbn8KEm1QwxJewAfew9lOzAvw.png",
    },
    {
        key: "youicy",
        category: { es: "UX/UI · Product Design", en: "UX/UI · Product Design" },
        title: { es: "Youicy", en: "Youicy" },
        info: { es: "Diseño de producto · 2025", en: "Product design · 2025" },
        href: "/youicy",
        img: "/portfolio/assets/YrpGtkGxOR021YdyJ0nc45xIeE.png",
    },
]

/**
 * Magtel — case study
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export function MagtelPage(props: ProjectDetailPageProps) {
    return <CaseStudyPage {...props} project={MAGTEL} related={MAGTEL_RELATED} />
}

/* =========================================================================
   FUNDACIÓN MAGTEL — graphic, editorial and event communication (bilingual).
   An internship inside the foundation's communication environment, working as
   a graphic designer. Separate from the MAGTEL case study above: the group and
   its foundation are two different brands with two different jobs.
   Same template and design system as the other four case studies: only the
   data changes. The event screens are the ordered run-of-show of the V Premios
   Fundación Magtel, kept in their original numbering; exact duplicates (the
   holding logo screen, repeated ten times, and four category screens shown
   twice) appear once.
   ========================================================================= */
const FM = {
    portada: "/portfolio/assets/fm-premios-logo.jpg",
    auxi: "/portfolio/assets/fm-presidenta.jpg",
    jurado: "/portfolio/assets/fm-jurado.jpg",
    ponentes: "/portfolio/assets/fm-ponentes.jpg",
    autoridad: "/portfolio/assets/fm-autoridad.jpg",
    cierre: "/portfolio/assets/fm-logo.jpg",
    memoria: "/portfolio/assets/fm-memoria-2024.jpg",
    aperturaPoster: "/portfolio/assets/fm-apertura-poster.jpg",
    aperturaVideo: "/portfolio/assets/fm-apertura.mp4",
}

/* Every motion piece is a local MP4 with a poster frame beside it, named
   <clip>-poster.jpg. The screens run at 6:5, the shape they were authored in;
   only the welcome reel (16:9) differs. */
const fmv = (name: string) => ({
    src: "/portfolio/assets/" + name + "-poster.jpg",
    video: "/portfolio/assets/" + name + ".mp4",
})

const FUNDACION: CaseProject = {
    category: {
        es: "Diseño gráfico · Editorial y comunicación de eventos",
        en: "Graphic Design · Editorial & Event Communication",
    },
    title: { es: "Fundación Magtel", en: "Fundación Magtel" },
    year: "2025",
    role: { es: "Diseño gráfico", en: "Graphic design" },
    client: { es: "Fundación Magtel", en: "Fundación Magtel" },
    lead: {
        es: "Prácticas en el entorno de comunicación de la Fundación Magtel, colaborando como diseñadora gráfica en las piezas visuales de sus premios anuales y de su memoria.",
        en: "An internship within Fundación Magtel's communication environment, contributing as a graphic designer to the visual pieces for its annual awards and its report.",
    },
    overview: {
        es: [
            "La Fundación Magtel es la entidad social del grupo Magtel. Trabaja en inserción sociolaboral, innovación tecnológica, innovación social y cooperación internacional, y cada año reconoce proyectos de otras organizaciones a través de los Premios Fundación Magtel.",
            "Hice mis prácticas dentro de su entorno de comunicación, colaborando como diseñadora gráfica. Mi trabajo se centró en las piezas visuales de la V Edición de los premios —el sistema de pantallas del acto, las cabeceras de categoría y las tarjetas de premiado— y en piezas editoriales y corporativas como la memoria anual. Trabajé siempre dentro de una identidad ya definida: la mía fue una labor de aplicación, no de creación de la marca.",
        ],
        en: [
            "Fundación Magtel is the Magtel group's social arm. It works in labour inclusion, technological innovation, social innovation and international cooperation, and every year it recognises projects by other organisations through the Premios Fundación Magtel.",
            "I did my internship inside its communication environment, contributing as a graphic designer. My work centred on the visual pieces for the fifth edition of the awards — the screen system for the ceremony, the category titles and the award cards — and on editorial and corporate pieces such as the annual report. I always worked inside an identity that was already defined: my job was to apply it, not to create the brand.",
        ],
    },
    services: {
        es: [
            "Diseño gráfico",
            "Comunicación de eventos",
            "Aplicaciones de identidad",
            "Pantallas y soportes digitales",
            "Diseño editorial",
            "Comunicación corporativa",
            "Motion y piezas audiovisuales",
        ],
        en: [
            "Graphic design",
            "Event communication",
            "Identity applications",
            "Screens and digital media",
            "Editorial design",
            "Corporate communication",
            "Motion and audiovisual assets",
        ],
    },
    quote: {
        es: "Un acto no se diseña pantalla a pantalla, sino como una secuencia: cada pieza tiene que saber qué viene antes y qué viene después.",
        en: "An event isn't designed screen by screen but as a sequence: every piece has to know what comes before it and what comes after.",
    },
    heroImage: FM.portada,
    media1: { src: FM.portada },
    sections: [
        {
            key: "role",
            heading: { es: "Mi papel", en: "My role" },
            body: {
                es: [
                    "Entré como diseñadora gráfica dentro del entorno de comunicación de la Fundación. Recibía los encargos, los interpretaba y los devolvía convertidos en piezas listas para proyectarse en el acto o para imprimirse.",
                    "El trabajo se movió entre lo gráfico, lo editorial y lo audiovisual: el sistema de pantallas de los premios, las cabeceras animadas de cada categoría, las tarjetas de cada proyecto reconocido, las cortinillas de los vídeos y la maquetación de piezas corporativas como la memoria anual.",
                    "La identidad de la Fundación ya estaba definida. Mi papel fue aplicarla con coherencia a formatos muy distintos y resolver las decisiones que el manual no llegaba a cubrir: cómo se comporta la marca en una pantalla de gran formato, cuánto texto aguanta una cartela, cómo enlazan una cabecera animada y el vídeo que viene detrás.",
                ],
                en: [
                    "I joined as a graphic designer within the foundation's communication environment. Briefs came to me, I interpreted them and returned them as pieces ready to be projected at the ceremony or sent to print.",
                    "The work moved between graphic, editorial and audiovisual: the screen system for the awards, the animated category titles, the cards for each recognised project, the video bumpers, and the layout of corporate pieces such as the annual report.",
                    "The foundation's identity was already defined. My role was to apply it consistently across very different formats and to resolve the decisions the manual did not cover: how the brand behaves on a large-format screen, how much copy a caption can carry, how an animated title hands over to the video that follows it.",
                ],
            },
        },
    ],
    brand: {
        heading: { es: "El acto", en: "The ceremony" },
        body: {
            es: [
                "La V Edición de los Premios Fundación Magtel reconoce proyectos en cuatro áreas: inserción sociolaboral, innovación tecnológica, cooperación internacional e innovación social.",
                "Todo el acto se sostiene sobre una pantalla. Desde la bienvenida hasta la entrega final, lo que el público ve es una secuencia continua de piezas gráficas y audiovisuales que tienen que encadenarse sin costuras y sonar siempre a la misma institución.",
            ],
            en: [
                "The fifth edition of the Premios Fundación Magtel recognises projects across four areas: labour inclusion, technological innovation, international cooperation and social innovation.",
                "The whole ceremony rests on one screen. From the welcome to the final handover, what the audience sees is a continuous sequence of graphic and audiovisual pieces that have to link up seamlessly and always sound like the same institution.",
            ],
        },
        video: {
            src: FM.aperturaVideo,
            poster: FM.aperturaPoster,
            portrait: false,
            caption: {
                es: "Vídeo institucional de apertura — extracto",
                en: "Opening institutional video — excerpt",
            },
            alt: {
                es: "Vídeo institucional de apertura de la V Edición",
                en: "Opening institutional video for the fifth edition",
            },
        },
    },
    statement: {
        pre: { es: "El lema de la Fundación", en: "The foundation's line" },
        big: { es: "Cuidando", en: "Cuidando" },
        emphasis: { es: "tu Mundo", en: "tu Mundo" },
        note: {
            es: "Cuatro áreas de trabajo, una misma voz: la que sostiene tanto la memoria anual como cada pantalla del acto.",
            en: "Four areas of work, one voice: the one holding up both the annual report and every screen of the ceremony.",
        },
    },
    editorialHeading: { es: "Sistema visual del acto", en: "The event's visual system" },
    editorialIntro: {
        es: "La secuencia completa de pantallas, en el orden en que se proyectaron. Cada categoría repite la misma estructura —cabecera animada, vídeo del proyecto y tarjeta de premiado— para que el público reconozca en qué punto del acto está sin que nadie se lo explique. Cada bloque se recorre con las flechas, igual que se recorrió en la sala.",
        en: "The full sequence of screens, in the order they were projected. Every category repeats the same structure — animated title, project film and award card — so the audience always knows where in the ceremony it is without being told. Each block is browsed with the arrows, the same way it ran in the room.",
    },
    editorial: [
        {
            key: "apertura",
            kind: "full",
            label: { es: "Apertura del acto", en: "Opening the event" },
            items: [
                { ...fmv("fm-desayuno"), ratio: "16 / 9", alt: { es: "Vídeo de bienvenida del acto", en: "Event welcome reel" }, caption: { es: "Vídeo de bienvenida — extracto", en: "Welcome reel — excerpt" } },
            ],
        },
        {
            key: "presentacion",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Apertura y presentación", en: "Opening and introductions" },
            items: [
                { src: FM.portada, caption: { es: "Cabecera de la V Edición", en: "V Edition title screen" } },
                { src: FM.auxi, caption: { es: "Presentación institucional", en: "Institutional presentation" } },
                { src: FM.jurado, caption: { es: "Composición del jurado", en: "The jury" } },
            ],
        },
        {
            key: "cifras",
            kind: "full",
            label: { es: "Las candidaturas, en cifras", en: "The entries, in figures" },
            items: [
                { ...fmv("fm-infografia"), loop: true, alt: { es: "Infografía animada de candidaturas", en: "Animated entries infographic" }, caption: { es: "Las candidaturas recibidas, animadas sobre el mapa.", en: "The entries received, animated over the map." } },
            ],
        },
        {
            key: "criterios",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Criterios de selección", en: "Selection criteria" },
            items: [
                { src: "/portfolio/assets/fm-criterios-1.jpg", caption: { es: "Criterio 1 de 5", en: "Criterion 1 of 5" } },
                { src: "/portfolio/assets/fm-criterios-2.jpg", caption: { es: "Criterio 2 de 5", en: "Criterion 2 of 5" } },
                { src: "/portfolio/assets/fm-criterios-3.jpg", caption: { es: "Criterio 3 de 5", en: "Criterion 3 of 5" } },
                { src: "/portfolio/assets/fm-criterios-4.jpg", caption: { es: "Criterio 4 de 5", en: "Criterion 4 of 5" } },
                { src: "/portfolio/assets/fm-criterios-5.jpg", caption: { es: "La lista completa", en: "The complete list" } },
            ],
        },
        {
            key: "insercion",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Inserción Sociolaboral", en: "Social & Labour Inclusion" },
            items: [
                { ...fmv("fm-insercion-intro"), alt: { es: "Cabecera animada de Inserción Sociolaboral", en: "Social & Labour Inclusion animated title" }, caption: { es: "Cabecera de categoría", en: "Category title screen" } },
                { ...fmv("fm-insercion-accesit-video"), alt: { es: "Vídeo del proyecto con accésit", en: "Runner-up project video" }, caption: { es: "Vídeo del proyecto — accésit", en: "Project film — runner-up" } },
                { ...fmv("fm-insercion-accesit"), caption: { es: "Accésit — Fundación Esperanza en Acción", en: "Runner-up — Fundación Esperanza en Acción" } },
                { ...fmv("fm-insercion-ganador-video"), alt: { es: "Vídeo del proyecto ganador", en: "Winning project video" }, caption: { es: "Vídeo del proyecto — primer premio", en: "Project film — first prize" } },
                { ...fmv("fm-insercion-ganador"), caption: { es: "Primer premio — Asociación La Maquinilla", en: "First prize — Asociación La Maquinilla" } },
            ],
        },
        {
            key: "tecnologica",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Innovación Tecnológica", en: "Technological Innovation" },
            items: [
                { ...fmv("fm-tecnologica-intro"), alt: { es: "Cabecera animada de Innovación Tecnológica", en: "Technological Innovation animated title" }, caption: { es: "Cabecera de categoría", en: "Category title screen" } },
                { ...fmv("fm-tecnologica-accesit-video"), alt: { es: "Vídeo del proyecto con accésit", en: "Runner-up project video" }, caption: { es: "Vídeo del proyecto — accésit", en: "Project film — runner-up" } },
                { ...fmv("fm-tecnologica-accesit"), caption: { es: "Accésit — Recisil", en: "Runner-up — Recisil" } },
                { ...fmv("fm-tecnologica-ganador-video"), alt: { es: "Vídeo del proyecto ganador", en: "Winning project video" }, caption: { es: "Vídeo del proyecto — primer premio", en: "Project film — first prize" } },
                { ...fmv("fm-tecnologica-ganador"), caption: { es: "Primer premio — Heral Enología", en: "First prize — Heral Enología" } },
            ],
        },
        {
            key: "cooperacion",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Cooperación Internacional", en: "International Cooperation" },
            items: [
                { ...fmv("fm-cooperacion-intro"), alt: { es: "Cabecera animada de Cooperación Internacional", en: "International Cooperation animated title" }, caption: { es: "Cabecera de categoría", en: "Category title screen" } },
                { ...fmv("fm-cooperacion-accesit-video"), alt: { es: "Vídeo del proyecto con accésit", en: "Runner-up project video" }, caption: { es: "Vídeo del proyecto — accésit", en: "Project film — runner-up" } },
                { ...fmv("fm-cooperacion-accesit"), caption: { es: "Accésit — Asociación SEVIHDA", en: "Runner-up — Asociación SEVIHDA" } },
                { ...fmv("fm-cooperacion-ganador-video"), alt: { es: "Vídeo del proyecto ganador", en: "Winning project video" }, caption: { es: "Vídeo del proyecto — primer premio", en: "Project film — first prize" } },
                { ...fmv("fm-cooperacion-ganador"), caption: { es: "Primer premio — Delwende al servicio de la vida", en: "First prize — Delwende al servicio de la vida" } },
            ],
        },
        {
            key: "social",
            kind: "carousel",
            ratio: "screen",
            label: { es: "Innovación Social", en: "Social Innovation" },
            items: [
                { ...fmv("fm-social-intro"), alt: { es: "Cabecera animada de Innovación Social", en: "Social Innovation animated title" }, caption: { es: "Cabecera de categoría", en: "Category title screen" } },
                { ...fmv("fm-social-accesit-video"), alt: { es: "Vídeo del proyecto con accésit", en: "Runner-up project video" }, caption: { es: "Vídeo del proyecto — accésit", en: "Project film — runner-up" } },
                { ...fmv("fm-social-accesit"), caption: { es: "Accésit — PidGin", en: "Runner-up — PidGin" } },
                { ...fmv("fm-social-ganador-video"), alt: { es: "Vídeo del proyecto ganador", en: "Winning project video" }, caption: { es: "Vídeo del proyecto — primer premio", en: "Project film — first prize" } },
                { ...fmv("fm-social-ganador"), caption: { es: "Primer premio — Fundación Futuro Singular Córdoba", en: "First prize — Fundación Futuro Singular Córdoba" } },
            ],
        },
        {
            key: "cierre",
            kind: "seq",
            label: { es: "Ponentes, autoridades y cierre", en: "Speakers, officials and close" },
            items: [
                { src: FM.ponentes, caption: { es: "Ponentes", en: "Speakers" } },
                { src: FM.autoridad, caption: { es: "Autoridades", en: "Officials" } },
                { src: FM.cierre, caption: { es: "La marca cierra el acto igual que lo abre.", en: "The mark closes the event the same way it opens it." } },
            ],
        },
    ],
    billboard: {
        heading: { es: "Diseño editorial — Memoria anual", en: "Editorial design — Annual Report" },
        intro: {
            es: "Fuera del acto, el trabajo siguió en formato largo. La memoria anual recoge la actividad de la Fundación durante el año y exige lo contrario que una pantalla: no un golpe de vista, sino una lectura sostenida. Colaboré en su diseño trasladando la misma identidad a una pieza impresa, donde el ritmo lo marcan la retícula y la jerarquía en lugar del montaje.",
            en: "Away from the ceremony, the work carried on in long form. The annual report gathers the foundation's activity across the year and asks for the opposite of a screen: not a glance, but sustained reading. I collaborated on its design, carrying the same identity into a printed piece where grid and hierarchy set the rhythm instead of editing.",
        },
        scenes: [
            {
                key: "memoria-2024",
                src: FM.memoria,
                alt: {
                    es: "Portada de la memoria anual 2024 de la Fundación Magtel",
                    en: "Cover of Fundación Magtel's 2024 annual report",
                },
                caption: {
                    es: "Memoria 2024 — \u201CCuidando tu Mundo\u201D",
                    en: "2024 Annual Report — \u201CCuidando tu Mundo\u201D",
                },
            },
        ],
    },
    learned: {
        heading: { es: "Lo que me llevo", en: "What I learned" },
        items: [
            {
                key: "evento",
                title: { es: "Diseñar para un acto real", en: "Designing for a real event" },
                text: {
                    es: "Una pantalla de evento no se juzga en el ordenador, sino a diez metros y en el minuto exacto en el que aparece. Aprendí a diseñar pensando en la sala: tamaños, contraste y cuánto tiempo tiene realmente el público para leer.",
                    en: "An event screen isn't judged on a monitor but from ten metres away, at the exact minute it appears. I learned to design with the room in mind: sizes, contrast and how long the audience actually has to read.",
                },
            },
            {
                key: "secuencia",
                title: { es: "Coherencia a lo largo de una secuencia", en: "Consistency across a sequence" },
                text: {
                    es: "Cuarenta y siete pantallas seguidas no perdonan una incoherencia. Mantener la misma retícula, los mismos pesos y las mismas transiciones de principio a fin fue tan importante como resolver cada pieza por separado.",
                    en: "Forty-seven screens in a row don't forgive an inconsistency. Holding the same grid, weights and transitions from start to finish mattered as much as resolving each piece on its own.",
                },
            },
            {
                key: "identidad",
                title: { es: "Aplicar una identidad existente", en: "Applying an existing identity" },
                text: {
                    es: "Trabajar dentro de una marca ya definida enseña a leer un manual y también a decidir dónde termina. Las cabeceras de categoría fueron eso: traducir un sistema pensado para papel a una pieza en movimiento.",
                    en: "Working inside an already-defined brand teaches you to read a manual and also to tell where it ends. The category titles were exactly that: translating a system made for print into something that moves.",
                },
            },
            {
                key: "editorial",
                title: { es: "Editorial en contexto corporativo", en: "Editorial in a corporate context" },
                text: {
                    es: "La memoria anual me obligó a pensar en páginas y no en composiciones sueltas: retícula, jerarquía y ritmo sostenidos a lo largo de un documento entero.",
                    en: "The annual report forced me to think in pages rather than isolated compositions: grid, hierarchy and rhythm sustained across a whole document.",
                },
            },
            {
                key: "formatos",
                title: { es: "Lo físico y lo digital", en: "Physical and digital" },
                text: {
                    es: "La misma identidad tenía que funcionar proyectada en gran formato y también impresa y sostenida en la mano. Cada soporte pedía sus propios ajustes sin romper el conjunto.",
                    en: "The same identity had to work projected at large format and also printed and held in the hand. Each medium asked for its own adjustments without breaking the whole.",
                },
            },
            {
                key: "equipo",
                title: { es: "Trabajar con comunicación", en: "Working with a comms team" },
                text: {
                    es: "Las piezas dependían de una escaleta, de otros equipos y de plazos que no controlaba yo. Aprendí a preguntar pronto —qué, para quién, en qué momento del acto— y a entregar en un formato que el siguiente pudiera usar sin volver a preguntarme.",
                    en: "The pieces depended on a run-of-show, on other teams and on deadlines I didn't control. I learned to ask early — what, for whom, at what point in the ceremony — and to hand over in a format the next person could use without coming back to me.",
                },
            },
        ],
    },
    closing: {
        eyebrow: { es: "Para terminar", en: "To close" },
        text: {
            es: "En la Fundación entendí que diseñar comunicación para un acto es diseñar tiempo, no sólo composiciones. Cada pantalla dura lo que dura, aparece cuando le toca y tiene que entregarle el relevo a la siguiente. Desde entonces pienso los encargos como secuencia: dónde entra esta pieza, qué la precede y qué viene después.",
            en: "At the foundation I understood that designing communication for an event means designing time, not just compositions. Every screen lasts what it lasts, appears when it should and has to hand over to the next one. Since then I think of briefs as a sequence: where this piece comes in, what precedes it and what follows.",
        },
    },
    order: ["brand", "statement", "editorial", "billboard", "learned", "closing"],
}

const FUNDACION_RELATED: typeof RELATED = [
    {
        key: "magtel",
        category: { es: "Comunicación corporativa", en: "Corporate communication" },
        title: { es: "Magtel", en: "Magtel" },
        info: { es: "Gráfico y editorial · 2024", en: "Graphic & editorial · 2024" },
        href: "/magtel",
        img: "/portfolio/assets/h013BrlBVVq5AmFxFlPNmWo2VM.jpg",
    },
    {
        key: "chroma",
        category: { es: "Editorial", en: "Editorial" },
        title: { es: "Chroma", en: "Chroma" },
        info: { es: "Revista sobre el color · 2024", en: "A magazine about colour · 2024" },
        href: "/chroma",
        img: "/portfolio/assets/g4yBChKIzhvrn48BYpcQjBoNXk.png",
    },
    {
        key: "neon",
        category: { es: "Branding", en: "Branding" },
        title: { es: "The Neon Museum", en: "The Neon Museum" },
        info: { es: "Rebranding · 2024", en: "Rebranding · 2024" },
        href: "/the-neon-museum",
        img: "/portfolio/assets/9WOJrSua7HrXJix9NDhgeyiuOw.png",
    },
    {
        key: "bokoba",
        category: { es: "Packaging", en: "Packaging" },
        title: { es: "Bokobá", en: "Bokobá" },
        info: { es: "Identidad y packaging · 2024", en: "Identity & packaging · 2024" },
        href: "/bokoba",
        img: "/portfolio/assets/J4xbn8KEm1QwxJewAfew9lOzAvw.png",
    },
]

/**
 * Fundacion Magtel - case study
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 2400
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export function FundacionMagtelPage(props: ProjectDetailPageProps) {
    return <CaseStudyPage {...props} project={FUNDACION} related={FUNDACION_RELATED} />
}
