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
 * comes from the property panel, so it is copied over inline. It must NOT carry
 * dg-root, which sets height:100dvh and overflow:hidden for the canvas.
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
   Digital Garden — Auxi Arroyo García
   An infinite, pannable canvas of curated inspiration. Minimal, editorial,
   experimental, calm. Drag in any direction to explore clusters of books,
   films, designers, references… plus a small "recommend me something" note.
   Shares the site design system (tokens, floating nav, Manrope, coral accent,
   bilingual ES/EN via localStorage key "aag-about-lang").
   ========================================================================== */

const EMAIL = "carreque45@gmail.com"
/* Public contact shown in the floating status pill (one-click copy) */
const FAB_EMAIL = "auxiliadoraarroyo123@gmail.com"
const LINKEDIN_URL = "https://www.linkedin.com/in/auxiarroyo/"
const PORTFOLIO_URL = "/"
/* Where "recommend me something" submissions are delivered. FORM_ENDPOINT uses
   FormSubmit (no signup — confirm once via the activation email it sends on the
   first submission). To switch providers later, point FORM_ENDPOINT at your own
   service; the POST body is plain JSON. A mailto: fallback guarantees a
   recommendation is never lost if the network request fails. */
const RECOMMEND_EMAIL = "auxiliadora.arroyo123@gmail.com"
const FORM_ENDPOINT = `https://formsubmit.co/ajax/${RECOMMEND_EMAIL}`
const PROFILE_SRC =
    "/portfolio/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"

type Lang = "es" | "en"

/* ---------------------------------------------------------------------------
   CUSTOM ICON SET — inline, recolorable. The project's Iconos, redrawn in one
   flat style; holes use var(--icon-hole) so dark contexts keep contrast.
--------------------------------------------------------------------------- */
type IconName =
    | "star" | "book" | "camera" | "monitor" | "briefcase" | "image"
    | "globe" | "eye" | "download" | "send" | "compass" | "location"
const ICONS: Record<IconName, ReactNode> = {
    star: (
        <path d="M11.1169 3.66283C11.4929 2.95492 12.5073 2.95492 12.8833 3.66283L14.8393 7.34568C14.9838 7.61783 15.2458 7.80813 15.5493 7.8615L19.6563 8.58374C20.4458 8.72256 20.7592 9.68727 20.2021 10.2636L17.304 13.262C17.0898 13.4835 16.9898 13.7915 17.0328 14.0966L17.6151 18.2258C17.727 19.0195 16.9063 19.6157 16.1861 19.264L12.4389 17.4343C12.162 17.299 11.8382 17.299 11.5613 17.4343L7.81412 19.264C7.09384 19.6157 6.27321 19.0195 6.38513 18.2258L6.96739 14.0966C7.01042 13.7915 6.91037 13.4835 6.69621 13.262L3.79806 10.2636C3.24098 9.68727 3.55444 8.72256 4.34389 8.58374L8.45093 7.8615C8.75442 7.80813 9.01636 7.61782 9.1609 7.34568L11.1169 3.66283Z" fill="currentColor"/>
    ),
    book: (
        <>
            <path d="M6 4.2A2.2 2.2 0 0 1 8.2 2H17a1 1 0 0 1 1 1v13.5a1 1 0 0 1-1 1H8.2A2.2 2.2 0 0 0 6 20.7V4.2Z" fill="currentColor"/>
            <path d="M8 19.5h9a1 1 0 0 1 0 2H8.2A2.2 2.2 0 0 1 6 19.9a2.2 2.2 0 0 1 2-.4Z" fill="currentColor"/>
            <rect x="8.6" y="6" width="6.4" height="1.7" rx=".85" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
    camera: (
        <>
            <path fillRule="evenodd" clipRule="evenodd" d="M9.2 5.5a2 2 0 0 0-1.86 1.27L7 7.6l-1.7.14A2.6 2.6 0 0 0 3 10.2c-.13 1.5-.13 3.1 0 4.6A2.6 2.6 0 0 0 5.3 17.2c3.78.32 9.62.32 13.4 0A2.6 2.6 0 0 0 21 14.8c.13-1.5.13-3.1 0-4.6a2.6 2.6 0 0 0-2.3-2.46L17 7.6l-.34-.83A2 2 0 0 0 14.8 5.5H9.2ZM12 9.1a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z" fill="currentColor"/>
            <circle cx="12" cy="12.5" r="1.95" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
    monitor: (
        <>
            <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 15H7a2.5 2.5 0 0 1-2.5-2.5v-7Z" fill="currentColor"/>
            <rect x="9.4" y="15.4" width="5.2" height="1.8" rx=".9" fill="currentColor"/>
            <rect x="7" y="19.2" width="10" height="1.9" rx=".95" fill="currentColor"/>
        </>
    ),
    briefcase: (
        <>
            <path fillRule="evenodd" clipRule="evenodd" d="M7.25009 5.4612V6.88179L5.55616 7.01852C4.35848 7.1152 3.38151 8.01697 3.18943 9.20309C3.14768 9.46088 3.10972 9.71911 3.07553 9.97772C3.05857 10.1061 3.127 10.2303 3.244 10.2857L3.32106 10.3222C8.74976 12.8926 15.2504 12.8926 20.6791 10.3222L20.7562 10.2857C20.8732 10.2303 20.9416 10.1061 20.9246 9.97773C20.8905 9.71912 20.8525 9.46088 20.8107 9.20309C20.6187 8.01697 19.6417 7.1152 18.444 7.01852L16.7501 6.88179V5.4612C16.7501 4.59495 16.1163 3.85906 15.2597 3.73056L14.0398 3.54757C12.6875 3.34474 11.3126 3.34474 9.96041 3.54757L8.7405 3.73056C7.88384 3.85906 7.25009 4.59495 7.25009 5.4612ZM13.8173 5.03098C12.6126 4.85027 11.3876 4.85027 10.1829 5.03098L8.96301 5.21396C8.84063 5.23232 8.75009 5.33745 8.75009 5.4612V6.77621C10.915 6.65219 13.0852 6.65219 15.2501 6.77621V5.4612C15.2501 5.33745 15.1596 5.23232 15.0372 5.21396L13.8173 5.03098Z" fill="currentColor"/>
            <path d="M21.1184 12.0709C21.1109 11.9308 20.9643 11.8432 20.836 11.9C15.265 14.3667 8.73513 14.3667 3.16421 11.9C3.03591 11.8432 2.88923 11.9308 2.88177 12.0709C2.78 13.9823 2.88255 15.9019 3.18943 17.7969C3.38151 18.983 4.35848 19.8848 5.55616 19.9815L7.42808 20.1326C10.4711 20.3782 13.529 20.3782 16.5721 20.1326L18.444 19.9815C19.6417 19.8848 20.6187 18.983 20.8107 17.7969C21.1176 15.9019 21.2202 13.9823 21.1184 12.0709Z" fill="currentColor"/>
        </>
    ),
    image: (
        <>
            <path fillRule="evenodd" clipRule="evenodd" d="M5 4.5A2.5 2.5 0 0 0 2.5 7v10A2.5 2.5 0 0 0 5 19.5h14a2.5 2.5 0 0 0 2.5-2.5V7A2.5 2.5 0 0 0 19 4.5H5Zm4.4 3.4a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z" fill="currentColor"/>
            <path d="M4 16.8l4.6-4.4a1 1 0 0 1 1.35-.03l2.4 2.1 2.7-2.4a1 1 0 0 1 1.33 0L21 16v1a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 4 16.8Z" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" fill="currentColor"/>
            <g stroke="var(--icon-hole,#f7f7f5)" strokeWidth="1.3" fill="none">
                <path d="M3.2 12h17.6"/>
                <path d="M12 3.2v17.6"/>
                <ellipse cx="12" cy="12" rx="4.2" ry="9"/>
            </g>
        </>
    ),
    eye: (
        <>
            <path d="M12 9.75C10.7574 9.75 9.75 10.7574 9.75 12C9.75 13.2426 10.7574 14.25 12 14.25C13.2426 14.25 14.25 13.2426 14.25 12C14.25 10.7574 13.2426 9.75 12 9.75Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 5.5C9.38223 5.5 7.02801 6.55139 5.33162 7.85335C4.48232 8.50519 3.78544 9.22913 3.29649 9.93368C2.81686 10.6248 2.5 11.3515 2.5 12C2.5 12.6485 2.81686 13.3752 3.29649 14.0663C3.78544 14.7709 4.48232 15.4948 5.33162 16.1466C7.02801 17.4486 9.38223 18.5 12 18.5C14.6178 18.5 16.972 17.4486 18.6684 16.1466C19.5177 15.4948 20.2146 14.7709 20.7035 14.0663C21.1831 13.3752 21.5 12.6485 21.5 12C21.5 11.3515 21.1831 10.6248 20.7035 9.93368C20.2146 9.22913 19.5177 8.50519 18.6684 7.85335C16.972 6.55139 14.6178 5.5 12 5.5ZM8.25 12C8.25 9.92893 9.92893 8.25 12 8.25C14.0711 8.25 15.75 9.92893 15.75 12C15.75 14.0711 14.0711 15.75 12 15.75C9.92893 15.75 8.25 14.0711 8.25 12Z" fill="currentColor"/>
        </>
    ),
    download: (
        <>
            <path d="M6 3.5A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h9A2.5 2.5 0 0 0 17.5 18V9h-4A1.5 1.5 0 0 1 12 7.5v-4H6Z" fill="currentColor"/>
            <path d="M13.5 3.9V7a.5.5 0 0 0 .5.5h3.1L13.5 3.9Z" fill="currentColor"/>
            <path d="M9.6 12.9a.9.9 0 0 1 1.27 0l.03.03V10.5a.9.9 0 0 1 1.8 0v2.43l.03-.03a.9.9 0 1 1 1.27 1.27l-2.06 2.06a.9.9 0 0 1-1.27 0L8.6 14.17a.9.9 0 0 1 0-1.27Z" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
    send: (
        <path d="M4.4 11.3 19 4.6a.7.7 0 0 1 .95.95L13.2 20.1a.7.7 0 0 1-1.3-.06l-1.66-5.02a1 1 0 0 0-.66-.66L4.46 12.6a.7.7 0 0 1-.06-1.3Z" fill="currentColor"/>
    ),
    compass: (
        <>
            <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" fill="var(--icon-hole,#f7f7f5)"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM15.3775 8.01521L10.0785 9.35387C9.72216 9.44389 9.44391 9.72214 9.35389 10.0785L8.01527 15.3775C7.92255 15.7446 8.25549 16.0775 8.6225 15.9848L13.9215 14.6461C14.2779 14.5561 14.5561 14.2779 14.6462 13.9215L15.9848 8.62244C16.0775 8.25542 15.7446 7.92249 15.3775 8.01521Z" fill="currentColor"/>
        </>
    ),
    location: (
        <>
            <path d="M12 3C7.58172 3 4 6.58172 4 11V11.3274C4 13.013 4.53207 14.646 5.50638 16H5.5L5.52299 16.023C5.72211 16.2976 5.9395 16.5607 6.1744 16.8103C6.52837 17.1864 12 21.5 12 21.5C12.7985 21.0933 17.174 17.5026 17.8256 16.8103C18.063 16.5581 18.2824 16.2921 18.4833 16.0143L18.5 16H18.4936C19.4679 14.646 20 13.013 20 11.3274V11C20 6.58172 16.4183 3 12 3Z" fill="currentColor"/>
            <path d="M15.25 11C15.25 9.20507 13.7949 7.75 12 7.75C10.2051 7.75 8.75 9.20507 8.75 11C8.75 12.7949 10.2051 14.25 12 14.25C13.7949 14.25 15.25 12.7949 15.25 11Z" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
}
function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            {ICONS[name]}
        </svg>
    )
}

/* ---------------------------------------------------------------------------
   UI COPY
--------------------------------------------------------------------------- */
const CONTENT = {
    es: {
        htmlLang: "es",
        nav: { home: "Inicio", about: "Sobre mí", projects: "Proyectos", garden: "Jardín digital", contact: "Contacto" },
        menuLabel: "Abrir menú",
        langAria: "Cambiar idioma",
        name: "Auxi Arroyo García",
        kicker: "Jardín digital",
        heroTitle: "Mi jardín digital.",
        heroSub: "Una colección viva de referencias que me inspiran.",
        heroSub2: "Arrastra en cualquier dirección para explorar.",
        dragHint: "Arrastra para explorar",
        recenter: "Recentrar",
        canvasAria: "Tablero de inspiración",
        seeds: "referencias",
        boardHint: "Toca cualquier tarjeta para saber más.",
        whyRecommend: "Por qué lo recomiendo",
        whyInspires: "Por qué me inspira",
        someRefs: "Algunas referencias",
        explore: "Explorar",
        close: "Cerrar",
        fab: {
            label: "Estado y contacto",
            status: "Disponible",
            copy: "Copiar email",
            copied: "¡Copiado!",
        },
        community: {
            title: "Recomiéndame algo",
            sub: "¿Un libro, una película, un portfolio? Comparte lo que te inspira.",
            typeLabel: "Tipo",
            types: ["Libro", "Película", "Serie", "Diseñador/a", "Portfolio", "Web", "Otro"],
            nameLabel: "Recomendación",
            namePh: "Título, nombre o enlace…",
            noteLabel: "Por qué (opcional)",
            notePh: "Cuéntame qué te gusta de ello…",
            send: "Enviar recomendación",
            sending: "Enviando…",
            error: "No se pudo enviar. Inténtalo de nuevo.",
            success: "¡Gracias! Lo revisaré pronto.",
            again: "Recomendar otra",
        },
    },
    en: {
        htmlLang: "en",
        nav: { home: "Home", about: "About", projects: "Projects", garden: "Digital Garden", contact: "Contact" },
        menuLabel: "Open menu",
        langAria: "Change language",
        name: "Auxi Arroyo García",
        kicker: "Digital Garden",
        heroTitle: "My digital garden.",
        heroSub: "A living collection of references that inspire me.",
        heroSub2: "Drag in any direction to explore.",
        dragHint: "Drag to explore",
        recenter: "Recenter",
        canvasAria: "Inspiration board",
        seeds: "references",
        boardHint: "Tap any card to learn more.",
        whyRecommend: "Why I recommend it",
        whyInspires: "Why it inspires me",
        someRefs: "A few references",
        explore: "Explore",
        close: "Close",
        fab: {
            label: "Status and contact",
            status: "Open to Work",
            copy: "Copy email",
            copied: "Copied!",
        },
        community: {
            title: "Recommend me something",
            sub: "A book, a film, a portfolio? Share what inspires you.",
            typeLabel: "Type",
            types: ["Book", "Film", "Series", "Designer", "Portfolio", "Website", "Other"],
            nameLabel: "Recommendation",
            namePh: "Title, name or link…",
            noteLabel: "Why (optional)",
            notePh: "Tell me what you love about it…",
            send: "Send recommendation",
            sending: "Sending…",
            error: "Couldn't send. Please try again.",
            success: "Thank you! I'll take a look soon.",
            again: "Recommend another",
        },
    },
} as const

/* ---------------------------------------------------------------------------
   GARDEN DATA — clusters positioned on the virtual canvas (offsets from centre).
   Curated placeholder references — edit freely.
--------------------------------------------------------------------------- */
type Cluster = {
    key: string
    icon: IconName
    x: number
    y: number
    title: { es: string; en: string }
    items: string[]
}
const CLUSTERS: Cluster[] = [
    {
        key: "books", icon: "book", x: -660, y: -290,
        title: { es: "Libros", en: "Books" },
        items: ["The Design of Everyday Things — Don Norman", "Grid Systems — Müller-Brockmann", "Thinking with Type — Ellen Lupton", "Ways of Seeing — John Berger"],
    },
    {
        key: "movies", icon: "camera", x: -110, y: -380,
        title: { es: "Películas", en: "Movies" },
        items: ["Blade Runner 2049", "Her — Spike Jonze", "Helvetica — Gary Hustwit", "Perfect Days — Wim Wenders"],
    },
    {
        key: "series", icon: "monitor", x: 470, y: -320,
        title: { es: "Series", en: "TV Series" },
        items: ["Abstract: The Art of Design", "Halt and Catch Fire", "Severance", "Mad Men"],
    },
    {
        key: "designers", icon: "star", x: 960, y: -120,
        title: { es: "Diseñadores", en: "Designers" },
        items: ["Dieter Rams", "Paula Scher", "Kenya Hara", "Massimo Vignelli"],
    },
    {
        key: "portfolios", icon: "briefcase", x: -820, y: 40,
        title: { es: "Portfolios", en: "Portfolios" },
        items: ["Rauno Freiberg", "Emil Kowalski", "Tobias van Schneider", "Jordan Singer"],
    },
    {
        key: "posters", icon: "image", x: -560, y: 340,
        title: { es: "Carteles", en: "Posters" },
        items: ["Swiss International Style", "Polish Poster School", "Experimental Jetset", "Saul Bass"],
    },
    {
        key: "websites", icon: "globe", x: -40, y: 420,
        title: { es: "Webs", en: "Websites" },
        items: ["Awwwards", "SiteInspire", "Godly", "Minimal.gallery"],
    },
    {
        key: "visual", icon: "eye", x: 520, y: 380,
        title: { es: "Referencias visuales", en: "Visual References" },
        items: ["Are.na", "Cosmos", "Savee", "Mood boards"],
    },
    {
        key: "resources", icon: "download", x: 940, y: 220,
        title: { es: "Recursos de diseño", en: "Design Resources" },
        items: ["Refactoring UI", "Type Scale", "Coolors", "Framer"],
    },
]

/* Spread multiplier applied to every cluster offset — larger = more breathing
   room (horizontal + vertical) between blocks on the explorable canvas. */
const SPREAD = 1.32

/* Clusters shown as a grid of visual cover / poster tiles (the rest stay as
   clean link lists, so the canvas gains imagery without feeling overloaded). */
const VISUAL_KEYS = new Set(["books", "movies", "series", "designers", "portfolios", "posters"])

/* A small palette of editorial cover gradients — books, film posters and
   design covers are often purely typographic, so a typeset title on a rich
   ground reads as an intentional cover rather than a placeholder. */
const COVER_GRADIENTS = [
    "linear-gradient(150deg, #ff7a5c 0%, #ff4d6d 100%)",
    "linear-gradient(150deg, #2f3350 0%, #12233f 100%)",
    "linear-gradient(150deg, #6b7f6e 0%, #35544a 100%)",
    "linear-gradient(150deg, #d98a54 0%, #a8552f 100%)",
    "linear-gradient(150deg, #7a6ea6 0%, #4b3f74 100%)",
    "linear-gradient(150deg, #3a3f47 0%, #1c1f24 100%)",
    "linear-gradient(150deg, #e0a24a 0%, #c46b3d 100%)",
    "linear-gradient(150deg, #4f7a8c 0%, #2b4a5c 100%)",
]
function coverBg(seed: string): string {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
    return COVER_GRADIENTS[h % COVER_GRADIENTS.length]
}

/* ---------------------------------------------------------------------------
   BOARD — each category becomes a visual card that opens a modal. The metadata
   below (representative image + short explanation + why I recommend it + why it
   inspires me) is merged with the CLUSTERS data by `key`. Bilingual.
--------------------------------------------------------------------------- */
type CategoryMeta = {
    image: string
    blurb: { es: string; en: string }
    recommend: { es: string; en: string }
    inspires: { es: string; en: string }
}
/* Display order for the board (matches the way the collection is described). */
const CATEGORY_ORDER = ["portfolios", "posters", "books", "movies", "series", "designers", "resources", "visual", "websites"] as const

/* Pill row — a curated subset of the categories above. The map still renders
   every cluster in CATEGORY_ORDER; these pills only decide which of them can be
   focused. `keys` lets one pill cover more than one cluster, which is how
   "Audiovisual" gathers the films and the series behind a single filter. A pill
   without its own `title` reuses the cluster's, so the two stay in sync. */
type PillFilter = { key: string; keys: string[]; title?: { es: string; en: string } }
const PILL_FILTERS: PillFilter[] = [
    { key: "portfolios", keys: ["portfolios"] },
    { key: "books", keys: ["books"] },
    { key: "audiovisual", keys: ["movies", "series"], title: { es: "Audiovisual", en: "Audiovisual" } },
    { key: "designers", keys: ["designers"] },
]

const CATEGORY_META: Record<string, CategoryMeta> = {
    portfolios: {
        image: "/portfolio/assets/photo-1634084462412-b54873c0a56d.jpg",
        blurb: {
            es: "Portfolios de diseñadores cuya forma de contar su trabajo me marca el listón.",
            en: "Designer portfolios whose way of telling their work sets my bar.",
        },
        recommend: {
            es: "Son ejemplos de cómo la estructura, el ritmo y el detalle pueden hacer que un proyecto respire.",
            en: "They're examples of how structure, rhythm and detail can let a project breathe.",
        },
        inspires: {
            es: "Me recuerdan que un portfolio no es una galería: es una historia editada con criterio.",
            en: "They remind me a portfolio isn't a gallery: it's a story edited with judgement.",
        },
    },
    posters: {
        image: "/portfolio/assets/photo-1563050860-87d45eaaeabb.jpg",
        blurb: {
            es: "Carteles y escuelas gráficas donde una sola imagen tiene que decirlo todo.",
            en: "Posters and graphic schools where a single image has to say it all.",
        },
        recommend: {
            es: "La mejor escuela de jerarquía, composición y economía de recursos.",
            en: "The best school of hierarchy, composition and economy of means.",
        },
        inspires: {
            es: "Me empujan a quitar antes que a añadir, y a confiar en el espacio en blanco.",
            en: "They push me to remove before adding, and to trust white space.",
        },
    },
    books: {
        image: "/portfolio/assets/photo-1658842042844-eeb5ad17b7d3.jpg",
        blurb: {
            es: "Libros que vuelvo a abrir cuando necesito reordenar cómo pienso el diseño.",
            en: "Books I reopen whenever I need to reorder how I think about design.",
        },
        recommend: {
            es: "Mezclan teoría y práctica sin perder la mirada humana sobre lo que hacemos.",
            en: "They blend theory and practice without losing the human view of what we do.",
        },
        inspires: {
            es: "Me dan vocabulario para nombrar decisiones que antes tomaba por intuición.",
            en: "They give me vocabulary to name decisions I used to make on intuition.",
        },
    },
    movies: {
        image: "/portfolio/assets/photo-1746157981411-05e0b952d3ec.jpg",
        blurb: {
            es: "Películas donde la dirección de arte, el color y el encuadre son puro diseño.",
            en: "Films where art direction, colour and framing are pure design.",
        },
        recommend: {
            es: "Enseñan a construir atmósfera y a contar con luz, ritmo y silencios.",
            en: "They teach how to build atmosphere and tell stories with light, pace and silence.",
        },
        inspires: {
            es: "Me recuerdan que emocionar es una decisión de diseño, no una casualidad.",
            en: "They remind me that moving people is a design decision, not an accident.",
        },
    },
    series: {
        image: "/portfolio/assets/photo-1777714221034-0d5152d676df.jpg",
        blurb: {
            es: "Series con una identidad visual tan fuerte que se reconocen en un fotograma.",
            en: "Series with a visual identity so strong you recognise them in one frame.",
        },
        recommend: {
            es: "Son másterclass de coherencia: un mundo sostenido durante horas sin fisuras.",
            en: "They're masterclasses in consistency: a world held for hours without cracks.",
        },
        inspires: {
            es: "Me inspiran a pensar sistemas, no piezas sueltas.",
            en: "They inspire me to think in systems, not isolated pieces.",
        },
    },
    designers: {
        image: "/portfolio/assets/photo-1621111848501-8d3634f82336.jpg",
        blurb: {
            es: "Diseñadores cuyo criterio y trayectoria son una brújula para mí.",
            en: "Designers whose judgement and body of work are a compass for me.",
        },
        recommend: {
            es: "Cada uno defiende una idea clara de para qué sirve el diseño.",
            en: "Each one defends a clear idea of what design is for.",
        },
        inspires: {
            es: "Me inspiran a tener voz propia y a sostenerla con honestidad.",
            en: "They inspire me to have my own voice and hold it with honesty.",
        },
    },
    resources: {
        image: "/portfolio/assets/photo-1759910546841-526487211a19.jpg",
        blurb: {
            es: "Recursos y herramientas que uso para pasar de la idea al detalle final.",
            en: "Resources and tools I use to go from the idea to the final detail.",
        },
        recommend: {
            es: "Ahorran tiempo en lo mecánico para poder dedicarlo a lo que de verdad importa.",
            en: "They save time on the mechanical so I can spend it on what really matters.",
        },
        inspires: {
            es: "Me recuerdan que el buen oficio también está en cuidar el proceso.",
            en: "They remind me that good craft also lives in caring for the process.",
        },
    },
    visual: {
        image: "/portfolio/assets/photo-1666152680666-78b4c07c3f38.jpg",
        blurb: {
            es: "Archivos y moodboards donde guardo lo que me para en seco.",
            en: "Archives and moodboards where I keep whatever stops me in my tracks.",
        },
        recommend: {
            es: "Son el mejor antídoto contra el bloqueo: referencias sin filtrar, en crudo.",
            en: "They're the best antidote to a block: raw, unfiltered references.",
        },
        inspires: {
            es: "Me inspiran a mirar más y a coleccionar antes de crear.",
            en: "They inspire me to look more and to collect before creating.",
        },
    },
    websites: {
        image: "/portfolio/assets/photo-1542744095-291d1f67b221.jpg",
        blurb: {
            es: "Webs y galerías que sigo para no perder el pulso de lo que se está haciendo.",
            en: "Websites and galleries I follow to keep a pulse on what's being made.",
        },
        recommend: {
            es: "Muestran cómo interacción, movimiento y contenido pueden ir de la mano.",
            en: "They show how interaction, motion and content can move together.",
        },
        inspires: {
            es: "Me inspiran a diseñar experiencias, no solo pantallas bonitas.",
            en: "They inspire me to design experiences, not just pretty screens.",
        },
    },
}

/* ---------------------------------------------------------------------------
   COMMUNITY CARD — front-end only "recommend me something" note
--------------------------------------------------------------------------- */
function CommunityCard({ t }: { t: (typeof CONTENT)[Lang] }) {
    const c = t.community
    const [type, setType] = useState<string>(c.types[0])
    const [name, setName] = useState("")
    const [note, setNote] = useState("")
    const [sent, setSent] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState(false)
    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || sending) return
        setSending(true)
        setError(false)
        const payload = {
            _subject: `New portfolio recommendation: ${type}`,
            Type: type,
            Recommendation: name.trim(),
            Why: note.trim() || "—",
        }
        try {
            const res = await fetch(FORM_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error("bad status")
            setSent(true)
        } catch (err) {
            /* Network/endpoint failed — fall back to a prefilled email so the
               recommendation is never lost, then still show the success state. */
            try {
                const body = encodeURIComponent(
                    `Type: ${type}\nRecommendation: ${name.trim()}\nWhy: ${note.trim() || "—"}`
                )
                if (typeof window !== "undefined") {
                    window.location.href = `mailto:${RECOMMEND_EMAIL}?subject=${encodeURIComponent("New portfolio recommendation")}&body=${body}`
                    setSent(true)
                } else {
                    setError(true)
                }
            } catch (e2) {
                setError(true)
            }
        } finally {
            setSending(false)
        }
    }
    /* ---- independent drag (reposition the window) ---- */
    const [pos, setPos] = useState({ x: 0, y: 0 })
    const drag = useRef({ on: false, sx: 0, sy: 0, bx: 0, by: 0 })
    const onGripDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        drag.current = { on: true, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) {}
    }
    const onGripMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!drag.current.on) return
        e.stopPropagation()
        setPos({
            x: drag.current.bx + (e.clientX - drag.current.sx),
            y: drag.current.by + (e.clientY - drag.current.sy),
        })
    }
    const onGripUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        drag.current.on = false
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch (err) {}
    }
    return (
        <div
            className="dg-card dg-card--community dg-no-pan"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        >
            <div
                className="dg-card-head dg-grip"
                onPointerDown={onGripDown}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onPointerCancel={onGripUp}
            >
                <span className="dg-card-ico"><Icon name="send" size={20} /></span>
                <h3 className="dg-card-title">{c.title}</h3>
                <span className="dg-grip-dots" aria-hidden="true">
                    <i /><i /><i /><i /><i /><i />
                </span>
            </div>
            {sent ? (
                <div className="dg-community-done">
                    <p className="dg-community-success">{c.success}</p>
                    <button type="button" className="dg-link-btn" onClick={() => { setSent(false); setName(""); setNote("") }}>
                        {c.again}
                    </button>
                </div>
            ) : (
                <form className="dg-form" onSubmit={submit}>
                    <p className="dg-card-sub">{c.sub}</p>
                    <label className="dg-field">
                        <span>{c.typeLabel}</span>
                        <select value={type} onChange={(e) => setType(e.target.value)}>
                            {c.types.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </label>
                    <label className="dg-field">
                        <span>{c.nameLabel}</span>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePh} />
                    </label>
                    <label className="dg-field">
                        <span>{c.noteLabel}</span>
                        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={c.notePh} />
                    </label>
                    <button type="submit" className="dg-send" disabled={sending} aria-busy={sending}>
                        {sending ? c.sending : c.send}
                        <Icon name="send" size={16} />
                    </button>
                    {error && <p className="dg-form-error" role="alert">{c.error}</p>}
                </form>
            )}
        </div>
    )
}

/* ==========================================================================
   PAGE
   ========================================================================== */
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

interface DigitalGardenPageProps {
    profileImage?: { src?: string; srcSet?: string; alt?: string }
    accent?: string
    defaultLanguage?: Lang
    style?: CSSProperties
}

/**
 * Digital Garden — Auxi Arroyo García
 *
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 832
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
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

export default function DigitalGardenPage(props: DigitalGardenPageProps) {
    const { profileImage, accent = "#ff654d", defaultLanguage = "es" } = props
    const isStatic = useIsStaticRenderer()
    const portalHost = usePortalHost(accent)

    const [lang, setLang] = useState<Lang>(defaultLanguage)
    const [fading, setFading] = useState(false)
    const [navOpen, setNavOpen] = useState(false)
    const { theme, toggleTheme } = useAagTheme()
    const reduceRef = useRef(false)

    useEffect(() => {
        if (typeof window === "undefined") return
        reduceRef.current = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        try {
            const saved = window.localStorage.getItem("aag-about-lang")
            if (saved === "es" || saved === "en") setLang(saved)
        } catch (e) { /* ignore */ }
    }, [])

    const changeLang = useCallback((next: Lang) => {
        if (next === lang) return
        const persist = () => { try { if (typeof window !== "undefined") window.localStorage.setItem("aag-about-lang", next) } catch (e) {} }
        if (isStatic || reduceRef.current || typeof window === "undefined") { setLang(next); persist(); return }
        setFading(true)
        window.setTimeout(() => { setLang(next); persist(); setFading(false) }, 160)
    }, [lang, isStatic])

    const t = CONTENT[lang]

    useEffect(() => {
        if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = t.htmlLang
    }, [t.htmlLang])

    /* ---- board modal (open a category) ---- */
    const [activeKey, setActiveKey] = useState<string | null>(null)
    const openCat = useCallback((key: string) => setActiveKey(key), [])
    const closeCat = useCallback(() => setActiveKey(null), [])
    /* Active pill: "all" or a PILL_FILTERS key. Nothing is filtered by it right
       now — it only marks which pill reads as selected. */
    const [filter, setFilter] = useState<string>("all")

    useEffect(() => {
        if (typeof document === "undefined" || !activeKey) return
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setActiveKey(null) }
        document.addEventListener("keydown", onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.removeEventListener("keydown", onKey)
            document.body.style.overflow = prev
        }
    }, [activeKey])

    const activeCluster = activeKey ? CLUSTERS.find((c) => c.key === activeKey) ?? null : null
    const activeMeta = activeKey ? CATEGORY_META[activeKey] ?? null : null

    const navItems: { key: string; label: string; href: string; current?: boolean }[] = [
        { key: "home", label: t.nav.home, href: "/" },
        { key: "about", label: t.nav.about, href: "/about" },
        { key: "projects", label: t.nav.projects, href: "/projects" },
        { key: "garden", label: t.nav.garden, href: "/digital-garden", current: true },
    ]

    const photoSrc = profileImage && profileImage.src ? profileImage.src : PROFILE_SRC
    const photoSrcSet = profileImage && profileImage.srcSet ? profileImage.srcSet : undefined

    return (
        <div
            className={`aag-root dg-root${isStatic ? " aag-static" : ""}`}
            style={{ width: "100%", position: "relative", ["--accent" as any]: accent }}
        >
            <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
            {/* ===================== NAVIGATION (shared) ===================== */}
            <div className="aag-nav-wrap">
                <nav className={`aag-nav ${navOpen ? "is-open" : ""}`} aria-label={t.name}>
                    <SiteLink href="/">
                        <a className="aag-brand" href="/" aria-label={`${t.name} — ${t.nav.home}`}>
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
                                                className={`aag-nav-link${item.current ? " is-current" : ""}`}
                                                href={item.href}
                                                aria-current={item.current ? "page" : undefined}
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
                                    <button type="button" className={`aag-lang-btn ${lang === "es" ? "is-active" : ""}`} aria-pressed={lang === "es"} onClick={() => changeLang("es")}>ES</button>
                                    <span className="aag-lang-sep" aria-hidden="true">/</span>
                                    <button type="button" className={`aag-lang-btn ${lang === "en" ? "is-active" : ""}`} aria-pressed={lang === "en"} onClick={() => changeLang("en")}>EN</button>
                                </div>
                            </div>
                        </div>
                        <button type="button" className="aag-dots" aria-label={t.menuLabel} aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
                            <span className="aag-dot" /><span className="aag-dot" /><span className="aag-dot" />
                        </button>
                    </div>
                </nav>
                <div className={`aag-mobile-menu ${navOpen ? "is-open" : ""}`}>
                    {navItems.map((item) => (
                        <SiteLink key={item.key} href={item.href}>
                            <a className={`aag-mobile-link${item.current ? " is-current" : ""}`} href={item.href} aria-current={item.current ? "page" : undefined} onClick={() => setNavOpen(false)}>
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
                        <button type="button" className={`aag-lang-btn ${lang === "es" ? "is-active" : ""}`} aria-pressed={lang === "es"} onClick={() => changeLang("es")}>ES</button>
                        <span className="aag-lang-sep" aria-hidden="true">/</span>
                        <button type="button" className={`aag-lang-btn ${lang === "en" ? "is-active" : ""}`} aria-pressed={lang === "en"} onClick={() => changeLang("en")}>EN</button>
                    </div>
                </div>
            </div>

            {/* ===================== INSPIRATION BOARD ===================== */}
            <main
                className="dg-board"
                style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s ease" }}
                aria-label={t.canvasAria}
            >
                <header className="dg-board-hero">
                    <h1 className="dg-board-title">{t.heroTitle}</h1>
                    <p className="dg-board-sub">{t.heroSub}</p>
                </header>

                {/* Pill filters — focus the map on one kind of reference. */}
                <div className="dg-filters" role="tablist" aria-label={t.kicker}>
                    <button
                        type="button"
                        className={"dg-pill" + (filter === "all" ? " is-active" : "")}
                        aria-pressed={filter === "all"}
                        onClick={() => setFilter("all")}
                    >
                        {lang === "es" ? "Todo" : "All"}
                    </button>
                    {PILL_FILTERS.map((pill) => {
                        const label = pill.title
                            ? pill.title[lang]
                            : CLUSTERS.find((c) => c.key === pill.keys[0])?.title[lang]
                        if (!label) return null
                        return (
                            <button
                                key={pill.key}
                                type="button"
                                className={"dg-pill" + (filter === pill.key ? " is-active" : "")}
                                aria-pressed={filter === pill.key}
                                onClick={() => setFilter(pill.key)}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>

                {/* Coming-soon pill. Same language as the "Retos" panel on /about:
                    a pulsing accent dot beside a muted label, folded here into one
                    pill so it reads as part of the filter row above it. */}
                <div className="dg-soon-wrap">
                    <p className="dg-soon">
                        <span className="dg-soon-dot" aria-hidden="true" />
                        {lang === "es"
                            ? "Próximamente, estoy preparando esta sección con calma, vuelve pronto para verla."
                            : "Coming soon, I am putting this section together with care. Check back soon to see it."}
                    </p>
                </div>

                {/* The reference grid is intentionally empty for now: every tile
                    was placeholder seed data (a gradient, a title and a Google
                    search link) rather than a real recommendation, so the board
                    showed filler instead of content. CLUSTERS, CATEGORY_ORDER and
                    CATEGORY_META are kept above, so a category can be brought back
                    one at a time by rendering a dg-map section over them again.
                    Until then the pills describe what is coming, and the pill
                    below says so. */}

                {/* Recommend me something */}
                <section className="dg-community-section" aria-label={t.community.title}>
                    <CommunityCard t={t} />
                </section>
            </main>

            {/* ===================== CATEGORY MODAL ===================== */}
            {/* Portalled into body so position:fixed resolves against the window,
                not against Framer's clipped page frame. */}
            {portalHost && activeCluster && activeMeta ? createPortal(
                <div className="dg-modal-overlay" onClick={closeCat} role="presentation">
                    <div
                        className="dg-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={activeCluster.title[lang]}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button type="button" className="dg-modal-close" onClick={closeCat} aria-label={t.close}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                        <div className="dg-modal-media">
                            <img src={activeMeta.image} alt="" loading="eager" decoding="async" draggable={false} />
                            <span className="dg-modal-badge"><Icon name={activeCluster.icon} size={18} /></span>
                        </div>
                        <div className="dg-modal-body">
                            <span className="dg-modal-kicker">{t.kicker}</span>
                            <h3 className="dg-modal-title">{activeCluster.title[lang]}</h3>
                            <p className="dg-modal-blurb">{activeMeta.blurb[lang]}</p>
                            <div className="dg-modal-why">
                                <div className="dg-modal-why-item">
                                    <h4>{t.whyRecommend}</h4>
                                    <p>{activeMeta.recommend[lang]}</p>
                                </div>
                                <div className="dg-modal-why-item">
                                    <h4>{t.whyInspires}</h4>
                                    <p>{activeMeta.inspires[lang]}</p>
                                </div>
                            </div>
                            <div className="dg-modal-refs">
                                <h4>{t.someRefs}</h4>
                                <ul>
                                    {activeCluster.items.map((it) => (
                                        <li key={it}>
                                            <a href={`https://www.google.com/search?q=${encodeURIComponent(it)}`} target="_blank" rel="noreferrer">
                                                <span>{it}</span>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>,
                portalHost
            ) : null}

            {portalHost && createPortal(
                <StatusFab
                    email={FAB_EMAIL}
                    profileSrc={photoSrc}
                    label={t.fab.label}
                    statusText={t.fab.status}
                    copyLabel={t.fab.copy}
                    copiedLabel={t.fab.copied}
                />,
                portalHost
            )}
        </div>
    )
}

addPropertyControls(DigitalGardenPage, {
    profileImage: { type: ControlType.ResponsiveImage, title: "Profile Photo" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#ff654d" },
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
   ========================================================================== */
const CSS_STYLES = `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

.aag-root {
    --background: #f7f7f5;
    --surface: #ffffff;
    --text: #161616;
    --muted: #666666;
    --border: #deded9;
    --shadow: 0 12px 30px rgba(0,0,0,0.07);
    --shadow-sm: 0 4px 14px rgba(0,0,0,0.05);
    --pad: 40px;
    background: var(--background);
    color: var(--text);
    font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    line-height: 1.5;
    font-size: 16px;
}
.aag-root { animation: aag-page-in 0.55s cubic-bezier(0.22,0.61,0.36,1) both; }
.aag-root.aag-static { animation: none; }
/* Host for viewport-anchored UI portalled into body: invisible and weightless.
   Not aag-static, which is the global no-motion switch and would also kill the
   status pill entrance and its pulsing dot. */
.aag-root.aag-portal { background: transparent; animation: none; height: 0; width: 0; }
@keyframes aag-page-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .aag-root { animation: none; } }
.aag-root *, .aag-root *::before, .aag-root *::after { box-sizing: border-box; }
.aag-root p, .aag-root h1, .aag-root h3 { margin: 0; }
.aag-root h1, .aag-root h3 { font-weight: 600; }
.aag-root ul { list-style: none; margin: 0; padding: 0; }
.aag-root button { font-family: inherit; }
.aag-root a { color: inherit; text-decoration: none; }
.aag-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }

.dg-root { height: 100dvh; overflow: hidden; position: relative; }
@supports not (height: 100dvh) { .dg-root { height: 100vh; } }

/* ---------- NAV (floating over the canvas) ---------- */
.aag-nav-wrap { position: fixed; top: 16px; left: 0; right: 0; z-index: 20; width: 100%; padding: 0 var(--pad); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.aag-nav { pointer-events: auto; width: fit-content; max-width: 100%; min-width: 320px; display: flex; align-items: center; background: rgba(255,255,255,0.86); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border: 1px solid var(--border); box-shadow: var(--shadow-sm); border-radius: 999px; padding: 7px 12px 7px 7px; transition: box-shadow 0.3s ease; transform: translateZ(0); isolation: isolate; backface-visibility: hidden; }
.aag-nav:hover { box-shadow: var(--shadow); }
.aag-brand { display: inline-flex; align-items: center; gap: 13px; margin-right: 20px; background: transparent; border: none; padding: 3px 6px 3px 3px; cursor: pointer; border-radius: 999px; color: var(--text); flex-shrink: 0; }
.aag-avatar { width: 34px; height: 34px; border-radius: 50%; background: #ececE8; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.aag-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
.aag-brand-name { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
.aag-nav-right { margin-left: auto; display: flex; align-items: center; flex-shrink: 0; }
.aag-nav-menu { display: grid; grid-template-columns: 0fr; transition: grid-template-columns 0.42s cubic-bezier(0.4,0,0.2,1); }
.aag-nav-menu-inner { overflow: hidden; display: flex; align-items: center; gap: 2px; min-width: 0; opacity: 0; transition: opacity 0.28s ease 0.04s; }
.aag-dots { display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px; border: none; background: transparent; cursor: pointer; border-radius: 999px; transition: opacity 0.28s ease, width 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s ease, margin 0.3s ease, visibility 0s linear 0s; }
.aag-dot { display: block; width: 6px; height: 6px; border-radius: 50%; background: #bdbdb5; animation: aag-typing 1.4s infinite ease-in-out both; }
.aag-dot:nth-child(2) { animation-delay: 0.18s; }
.aag-dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes aag-typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; background: #c8c8c0; } 30% { transform: translateY(-4px); opacity: 1; background: var(--text); } }
@media (min-width: 821px) {
    .aag-nav:hover .aag-nav-menu, .aag-nav:focus-within .aag-nav-menu, .aag-nav.is-open .aag-nav-menu { grid-template-columns: 1fr; }
    .aag-nav:hover .aag-nav-menu-inner, .aag-nav:focus-within .aag-nav-menu-inner, .aag-nav.is-open .aag-nav-menu-inner { opacity: 1; }
    .aag-nav:hover .aag-dots, .aag-nav:focus-within .aag-dots, .aag-nav.is-open .aag-dots { opacity: 0; width: 0; padding: 0; margin: 0; visibility: hidden; pointer-events: none; transition: opacity 0.24s ease, width 0.3s cubic-bezier(0.4,0,0.2,1), padding 0.3s ease, margin 0.3s ease, visibility 0s linear 0.28s; }
}
.aag-nav-links { display: flex; align-items: center; gap: 2px; }
.aag-nav-link { position: relative; background: transparent; border: none; cursor: pointer; color: var(--muted); font-size: 14px; font-weight: 500; letter-spacing: -0.01em; padding: 8px 13px; border-radius: 999px; white-space: nowrap; transition: color 0.24s cubic-bezier(0.22,0.61,0.36,1); }
.aag-nav-link:hover, .aag-nav-link:focus-visible { color: var(--text); }
.aag-nav-link.is-current { color: var(--accent); }
.aag-lang { display: inline-flex; align-items: center; gap: 2px; padding: 4px 6px; margin-left: 4px; flex-shrink: 0; }
.aag-lang-btn { background: transparent; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); padding: 4px 5px; border-radius: 6px; transition: color 0.2s ease; }
.aag-lang-btn:hover { color: var(--text); }
.aag-lang-btn.is-active { color: var(--accent); }
.aag-lang-sep { color: var(--border); font-size: 12px; }
.aag-mobile-lang { display: flex; align-items: center; gap: 2px; padding: 10px 14px 4px; margin-top: 4px; border-top: 1px solid var(--border); }
.aag-mobile-menu { pointer-events: auto; width: 100%; max-width: 420px; margin-top: 8px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); border-radius: 20px; padding: 8px; display: none; flex-direction: column; gap: 2px; opacity: 0; transform: translateY(-8px); transition: opacity 0.2s ease, transform 0.2s ease; }
.aag-mobile-menu.is-open { opacity: 1; transform: translateY(0); }
.aag-mobile-link { text-align: left; background: transparent; border: none; cursor: pointer; color: var(--text); font-size: 16px; font-weight: 500; padding: 12px 14px; border-radius: 12px; min-height: 44px; transition: color 0.2s ease; }
.aag-mobile-link:hover, .aag-mobile-link:focus-visible { color: var(--accent); }
.aag-mobile-link.is-current { color: var(--accent); }

/* ---------- CANVAS ---------- */
.dg-viewport {
    position: absolute; inset: 0;
    overflow: hidden;
    touch-action: none;
    overscroll-behavior: none;
    cursor: grab;
    background-color: var(--background);
    background-image: radial-gradient(circle, rgba(22,22,22,0.10) 1px, transparent 1px);
    background-size: 26px 26px;
}
.dg-viewport.is-grabbing { cursor: grabbing; }
.dg-world { position: absolute; inset: 0; will-change: transform; }
.dg-node { position: absolute; left: calc(50% + var(--x)); top: calc(50% + var(--y)); transform: translate(-50%, -50%); }

.dg-card {
    width: 280px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow-sm);
    padding: 20px;
    transition: transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease, border-color 0.28s ease;
}
.dg-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: #cfcfc7; }
.dg-card-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.dg-card-ico { width: 40px; height: 40px; border-radius: 12px; background: var(--background); border: 1px solid var(--border); color: var(--text); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dg-card-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.dg-card-list { display: flex; flex-direction: column; gap: 4px; }
.dg-card-list li { position: relative; }
.dg-card-link {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 8px 5px 16px;
    margin: 0 -8px;
    border-radius: 9px;
    font-size: 13.5px;
    line-height: 1.4;
    color: var(--muted);
    cursor: pointer;
    transition: background 0.2s ease, color 0.2s ease;
}
.dg-card-link::before {
    content: "";
    position: absolute;
    left: 6px;
    top: 12px;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.55;
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.dg-card-link-text { flex: 1; }
.dg-card-link-arrow {
    display: inline-flex;
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--accent);
    opacity: 0;
    transform: translate(-3px, 3px);
    transition: opacity 0.2s ease, transform 0.2s ease;
}
.dg-card-link:hover, .dg-card-link:focus-visible {
    background: rgba(255,101,77,0.08);
    color: var(--text);
}
.dg-card-link:hover::before, .dg-card-link:focus-visible::before { opacity: 1; transform: scale(1.2); }
.dg-card-link:hover .dg-card-link-arrow, .dg-card-link:focus-visible .dg-card-link-arrow { opacity: 1; transform: translate(0,0); }

/* ---- Visual cover / poster tiles ---- */
.dg-covers { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; }
.dg-cover { display: flex; flex-direction: column; gap: 8px; text-decoration: none; cursor: pointer; }
.dg-cover-art {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: 11px;
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    padding: 11px;
    border: 1px solid rgba(0,0,0,0.06);
    box-shadow: var(--shadow-sm);
    transition: transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s ease;
}
.dg-cover-art::after {
    content: "";
    position: absolute; inset: 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.14) 100%);
    pointer-events: none;
}
.dg-cover:hover .dg-cover-art { transform: translateY(-4px); box-shadow: var(--shadow); }
.dg-cover-art-title {
    position: relative;
    z-index: 1;
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.16;
    letter-spacing: -0.01em;
    color: #fff;
    text-shadow: 0 1px 10px rgba(0,0,0,0.28);
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.dg-cover-label { font-size: 12px; line-height: 1.32; color: var(--muted); }
.dg-cover-label b { display: block; color: var(--text); font-weight: 600; letter-spacing: -0.01em; }
.dg-cover-meta { color: var(--muted); }
.dg-cover:hover .dg-cover-label b { color: var(--accent); }

/* Draggable community window */
.dg-node--community { z-index: 4; }
.dg-grip { cursor: grab; touch-action: none; -webkit-user-select: none; user-select: none; }
.dg-grip:active { cursor: grabbing; }
.dg-grip .dg-card-title { flex: 1; }
.dg-grip-dots {
    display: grid;
    grid-template-columns: repeat(2, 3px);
    gap: 3px;
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity 0.2s ease;
}
.dg-grip-dots i { width: 3px; height: 3px; border-radius: 50%; background: var(--muted); display: block; }
.dg-grip:hover .dg-grip-dots { opacity: 0.85; }

/* Hero node */
.dg-node--hero { z-index: 2; }
.dg-hero { width: 340px; text-align: center; display: flex; flex-direction: column; align-items: center; }
.dg-hero-kicker { font-size: 11.5px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.dg-hero-title { font-size: clamp(30px, 4vw, 42px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.03; }
.dg-hero-sub { margin-top: 18px; font-size: 15px; color: var(--muted); line-height: 1.5; max-width: 320px; }
.dg-hero-hint { margin-top: clamp(34px, 6vh, 54px); display: inline-flex; align-items: center; gap: 9px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #a9a9a1; }
.dg-hero-hand { display: inline-flex; color: var(--accent); animation: dg-float 3.4s ease-in-out infinite; }
.aag-static .dg-hero-hand { animation: none; }
@keyframes dg-float { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-3px) rotate(-8deg); } }

/* Community card */
.dg-card--community { width: 320px; }
.dg-card-sub { font-size: 13.5px; color: var(--muted); line-height: 1.45; margin-bottom: 14px; }
.dg-form { display: flex; flex-direction: column; gap: 12px; }
.dg-field { display: flex; flex-direction: column; gap: 5px; }
.dg-field > span { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.dg-field select, .dg-field input, .dg-field textarea {
    width: 100%; font-family: inherit; font-size: 14px; color: var(--text);
    background: var(--background); border: 1px solid var(--border); border-radius: 10px;
    padding: 10px 12px; transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.dg-field textarea { resize: none; }
.dg-field select:focus, .dg-field input:focus, .dg-field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255,101,77,0.14); }
.dg-send { margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 46px; border: none; border-radius: 999px; background: var(--text); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: transform 0.2s ease, background 0.2s ease; }
.dg-send:hover { background: #000; transform: translateY(-1px); }
.dg-send:disabled { opacity: 0.6; cursor: default; transform: none; }
.dg-form-error { margin-top: 2px; font-size: 12.5px; color: #d64545; line-height: 1.4; }
.dg-community-done { text-align: center; padding: 14px 0 6px; }
.dg-community-success { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
.dg-link-btn { background: transparent; border: none; cursor: pointer; color: var(--accent); font-size: 14px; font-weight: 600; }
.dg-link-btn:hover { text-decoration: underline; }

/* Controls */
.dg-recenter { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 15; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 999px; background: rgba(255,255,255,0.9); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border: 1px solid var(--border); box-shadow: var(--shadow-sm); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.2s ease; }
.dg-recenter:hover { box-shadow: var(--shadow); color: var(--accent); transform: translateX(-50%) translateY(-2px); }
.dg-drag-hint { position: absolute; bottom: 26px; right: 26px; z-index: 15; font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #b3b3ab; pointer-events: none; }

@media (max-width: 1024px) { .aag-root { --pad: 32px; } }
@media (max-width: 820px) {
    .aag-nav-menu { display: none; }
    .aag-dots { opacity: 1 !important; width: auto !important; visibility: visible !important; padding: 8px 10px !important; pointer-events: auto !important; }
    .aag-mobile-menu { display: flex; position: absolute; top: 100%; left: 0; right: 0; pointer-events: none; }
    .aag-mobile-menu.is-open { pointer-events: auto; }
    .aag-nav { min-width: 0; width: 100%; max-width: 520px; }
    .aag-nav-wrap { align-items: stretch; top: 12px; }
    .aag-nav, .aag-mobile-menu { margin-left: auto; margin-right: auto; }
    .aag-brand { margin-right: auto; }
}
@media (min-width: 481px) and (max-width: 820px) {
    .aag-nav { width: fit-content; max-width: 100%; }
    .aag-brand { margin-right: 10px; }
    .aag-nav-right { margin-left: 0; }
    .aag-dots { gap: 4px; padding: 6px 8px; }
    .aag-dot { width: 5px; height: 5px; }
}
@media (max-width: 760px) { .aag-root { --pad: 24px; } }
@media (max-width: 600px) {
    .dg-card { width: 250px; }
    .dg-card--community { width: 280px; }
    .dg-hero { width: 280px; }
    .dg-drag-hint { display: none; }
}
@media (max-width: 480px) {
    .aag-root { --pad: 18px; font-size: 15px; }
    .aag-brand-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
@media (prefers-reduced-motion: reduce) {
    .aag-root *, .aag-root *::before, .aag-root *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
/* ==========================================================================
   INSPIRATION BOARD (redesign) — scrolling board + tiles + modal
   ========================================================================== */
/* The board scrolls (the old canvas locked the page to one viewport). */
.dg-root { height: auto !important; min-height: 100dvh; overflow: visible !important; }
@supports not (height: 100dvh) { .dg-root { min-height: 100vh; } }
.dg-root {
    background-color: var(--background);
    background-image: radial-gradient(circle, rgba(22,22,22,0.055) 1px, transparent 1px);
    background-size: 28px 28px;
}

.dg-board {
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(120px, 15vh, 176px) var(--pad) clamp(72px, 12vw, 128px);
}
/* The title now opens the page on its own — no kicker, no tap hint — so the
   block sits a little higher and carries all of the breathing room itself. */
.dg-board-hero { text-align: center; max-width: 720px; margin: 0 auto clamp(40px, 6vw, 68px); }
.dg-root .dg-board-title { margin-top: 0; font-size: clamp(36px, 6vw, 68px); font-weight: 700; letter-spacing: -0.035em; line-height: 1.0; }
.dg-root .dg-board-sub { margin-top: clamp(24px, 3.2vw, 38px); font-size: clamp(16px, 1.5vw, 20px); color: var(--muted); line-height: 1.55; }

.dg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(18px, 2vw, 26px); }

/* ---- Open map: pill filters + reference cover cards ---- */
.dg-filters { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; max-width: 940px; margin: 0 auto clamp(30px, 4vw, 46px); }
.dg-pill { appearance: none; -webkit-appearance: none; border: 1px solid var(--border, #e5e5df); background: #ffffff; color: #4a4a44; font-family: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: -0.01em; padding: 9px 16px; border-radius: 999px; cursor: pointer; transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s cubic-bezier(0.22,0.61,0.36,1); }
.dg-pill:hover { border-color: #cfcfc7; transform: translateY(-1px); }
.dg-pill.is-active { background: var(--accent, #ff654d); border-color: var(--accent, #ff654d); color: #fff; }
.dg-filter-blurb { text-align: center; max-width: 620px; margin: -6px auto clamp(30px, 4vw, 42px); color: #6b6b64; font-size: 15px; line-height: 1.55; }
/* Coming-soon pill. Borrows the design language of the "Retos" panel on /about:
   a pulsing accent dot next to a muted label on a surface card with a hairline
   border, folded here into a single pill so it sits with the filter row instead
   of taking over the section. The wrapper does the centring and the vertical
   rhythm: its negative top margin eats part of .dg-filters' bottom margin so the
   pill reads as part of that row, and its own bottom margin keeps the gap the
   pills used to leave below. The pill itself is scoped to .aag-root because the
   base "-aag-root p { margin: 0 }" reset outranks a bare class and would quietly
   drop its margin. Accent has no token in this file, so it carries the same
   literal fallback .dg-pill uses. */
.dg-soon-wrap { text-align: center; margin: -18px auto clamp(30px, 4vw, 46px); }
.aag-root .dg-soon {
    display: inline-flex; align-items: center; gap: 10px;
    margin: 0; max-width: min(100%, 620px);
    padding: 11px 20px 11px 17px;
    border: 1px solid var(--border, #e5e5df); border-radius: 999px;
    background: var(--surface, #ffffff); box-shadow: var(--shadow-sm);
    color: var(--muted, #6b6b64);
    font-size: 13.5px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.5;
    text-align: left;
}
.dg-soon-dot {
    flex-shrink: 0;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent, #ff654d);
    animation: dg-soon-pulse 2.4s ease-out infinite;
}
.aag-static .dg-soon-dot { animation: none; }
@keyframes dg-soon-pulse {
    0% { box-shadow: 0 0 0 0 rgba(255,101,77,0.30); }
    70% { box-shadow: 0 0 0 9px rgba(255,101,77,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,101,77,0); }
}
/* Wrapped onto several lines on a narrow screen a 999px radius reads as a blob,
   so the pill relaxes into a rounded card at the same breakpoint the rest of the
   page uses. */
@media (max-width: 560px) {
    .aag-root .dg-soon { border-radius: 20px; padding: 12px 18px; align-items: flex-start; }
    .dg-soon-dot { margin-top: 6px; }
}
.dg-map { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(16px, 2vw, 26px); }
.dg-card { display: flex; flex-direction: column; gap: 12px; text-decoration: none; color: inherit; }
/* Map cards are clean cover tiles. Neutralise the legacy boxed .dg-card chrome
   (fixed 280px/250px width, surface, border, padding) left over from the old
   pannable canvas — it broke the fluid grid and overflowed small screens. The
   community form card keeps that chrome because it lives outside .dg-map. */
.dg-map .dg-card { width: auto; background: transparent; border: none; box-shadow: none; padding: 0; border-radius: 0; }
.dg-card-cover { position: relative; aspect-ratio: 3 / 4; border-radius: 14px; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 20px; box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.06)); transition: transform 0.32s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.32s ease; }
.dg-card:hover .dg-card-cover, .dg-card:focus-visible .dg-card-cover { transform: translateY(-5px); box-shadow: 0 16px 34px rgba(0,0,0,0.16); }
.dg-card-cover-title { color: #fff; font-size: clamp(15px, 1.35vw, 18px); font-weight: 700; line-height: 1.24; letter-spacing: -0.01em; text-align: center; text-shadow: 0 1px 12px rgba(0,0,0,0.20); display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.dg-card-badge { position: absolute; top: 12px; right: 12px; width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.24); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.dg-card-meta { display: flex; flex-direction: column; gap: 2px; padding: 0 2px; min-width: 0; }
.dg-card-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; color: #1a1a17; }
.dg-card-cat { font-size: 12.5px; color: #9a9a92; line-height: 1.35; }
@media (max-width: 1024px) { .dg-map { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 680px) { .dg-map { grid-template-columns: repeat(2, 1fr); } }
/* On phones tighten the poster tiles so two columns stay clean and legible. */
@media (max-width: 480px) {
    .dg-map { gap: 12px; }
    .dg-card { gap: 9px; }
    .dg-card-cover { padding: 14px; border-radius: 12px; }
    .dg-card-cover-title { font-size: 14px; -webkit-line-clamp: 4; }
    .dg-card-title { font-size: 13.5px; }
    .dg-card-cat { font-size: 12px; }
}
.dg-tile {
    display: flex; flex-direction: column; text-align: left;
    background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
    box-shadow: var(--shadow-sm); overflow: hidden; cursor: pointer; padding: 0;
    transition: transform 0.28s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.28s ease, border-color 0.28s ease;
}
.dg-tile:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: #d3d3cc; }
.dg-tile-media { position: relative; display: block; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; background: #ececE8; }
.dg-tile-media img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.5s cubic-bezier(0.22,0.61,0.36,1); }
.dg-tile:hover .dg-tile-media img { transform: scale(1.05); }
.dg-tile-badge {
    position: absolute; top: 12px; left: 12px; width: 34px; height: 34px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; color: var(--text);
    background: rgba(255,255,255,0.92); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    box-shadow: 0 2px 10px rgba(0,0,0,0.12);
}
.dg-tile-body { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 20px; flex: 1; }
.dg-tile-title { font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.dg-tile-blurb { font-size: 14px; color: var(--muted); line-height: 1.5; flex: 1; }
.dg-tile-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
.dg-tile-count { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #a2a29a; }
.dg-tile-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--accent); }
.dg-tile-cta svg { transition: transform 0.24s ease; }
.dg-tile:hover .dg-tile-cta svg { transform: translateX(3px); }

.dg-community-section { margin-top: clamp(52px, 8vw, 96px); display: flex; justify-content: center; }

/* ---- Modal ---- */
.dg-modal-overlay {
    position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
    padding: clamp(16px, 4vw, 40px);
    background: rgba(18,18,20,0.5); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    animation: dg-fade 0.22s ease both;
}
.dg-modal {
    position: relative; width: 100%; max-width: 640px; max-height: 88vh; overflow: hidden;
    display: flex; flex-direction: column;
    background: var(--surface); border-radius: 24px; border: 1px solid var(--border);
    box-shadow: 0 30px 80px rgba(0,0,0,0.28);
    animation: dg-pop 0.28s cubic-bezier(0.22,1,0.36,1) both;
}
.dg-modal-close {
    position: absolute; top: 14px; right: 14px; z-index: 2; width: 38px; height: 38px; border-radius: 50%;
    border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    color: #fff; background: rgba(0,0,0,0.4); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    transition: background 0.2s ease, transform 0.2s ease;
}
.dg-modal-close:hover { background: rgba(0,0,0,0.62); transform: rotate(90deg); }
.dg-modal-media { position: relative; width: 100%; aspect-ratio: 16 / 8; overflow: hidden; background: #ececE8; flex-shrink: 0; }
.dg-modal-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dg-modal-badge {
    position: absolute; bottom: -22px; left: 24px; width: 46px; height: 46px; border-radius: 14px;
    display: inline-flex; align-items: center; justify-content: center; color: var(--accent);
    background: var(--surface); box-shadow: 0 6px 18px rgba(0,0,0,0.14);
}
.dg-modal-body { padding: 34px 28px 28px; overflow-y: auto; }
.dg-modal-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
/* These four were scoped to .dg-root only to beat the base margin reset. The
   modal now renders in the body portal, which cannot carry dg-root (it sets
   height:100dvh and overflow:hidden for the canvas), so they are scoped to
   .aag-root instead: same specificity, matches page root and portal host. */
.aag-root .dg-modal-title { margin-top: 8px; font-size: clamp(24px, 3.4vw, 32px); font-weight: 700; letter-spacing: -0.03em; }
.aag-root .dg-modal-blurb { margin-top: 12px; font-size: 16px; color: var(--text); line-height: 1.55; }
.dg-modal-why { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
.aag-root .dg-modal-why-item h4 { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.dg-modal-why-item p { font-size: 14px; color: var(--muted); line-height: 1.55; }
.dg-modal-refs { margin-top: 26px; border-top: 1px solid var(--border); padding-top: 20px; }
.aag-root .dg-modal-refs h4 { margin: 0 0 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #a2a29a; }
.dg-modal-refs ul { display: flex; flex-direction: column; gap: 2px; }
.dg-modal-refs a { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 10px; margin: 0 -10px; border-radius: 10px; font-size: 14.5px; color: var(--text); transition: background 0.18s ease, color 0.18s ease; }
.dg-modal-refs a:hover { background: var(--background); color: var(--accent); }
.dg-modal-refs a svg { flex-shrink: 0; color: #b3b3ab; }
.dg-modal-refs a:hover svg { color: var(--accent); }
@keyframes dg-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dg-pop { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }

@media (max-width: 1024px) { .dg-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) {
    .dg-grid { grid-template-columns: 1fr; }
    .dg-modal-why { grid-template-columns: 1fr; gap: 16px; }
    .dg-board { padding-top: clamp(104px, 14vh, 140px); }
}
@media (prefers-reduced-motion: reduce) {
    .dg-modal-overlay, .dg-modal { animation: none; }
    .dg-tile:hover { transform: none; }
    .dg-tile:hover .dg-tile-media img { transform: none; }
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
/* custom cursor removed */
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
html[data-aag-theme="dark"] .dg-soon,
html[data-aag-theme="dark"] .dg-filter-blurb,
html[data-aag-theme="dark"] .dg-card-cat { color: var(--muted); }
html[data-aag-theme="dark"] .aag-work-media { background: #201f1e; }
`
