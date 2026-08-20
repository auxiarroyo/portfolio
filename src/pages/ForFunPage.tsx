import {
    useEffect,
    useRef,
    useState,
    useCallback,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
} from "react"
import { addPropertyControls, ControlType, Link, useIsStaticRenderer } from "framer"

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
   For Fun — Auxi Arroyo García
   A large, explorable "canvas map" of little pieces of personality. Drag the
   board around (mouse / touch) to discover cards: curiosities, favourite
   places, inspirations, funny details. Header/nav reused from the rest of the
   site. Single-screen, no footer — the whole thing is one playful surface.
   ========================================================================== */

const EMAIL = "carreque45@gmail.com"
const PROFILE_SRC =
    "/portfolio/assets/u93idApkziW9L6NOU8M3hTzMQ5s.png"

type Lang = "es" | "en"

const CONTENT = {
    es: {
        htmlLang: "es",
        nav: { home: "Inicio", about: "Sobre mí", projects: "Proyectos", garden: "Jardín digital", contact: "Contacto" },
        menuLabel: "Abrir menú",
        langAria: "Cambiar idioma",
        name: "Auxi Arroyo García",
        boardAria: "Mapa interactivo — arrastra para explorar",
        hint: "Arrastra para explorar",
        recenter: "Volver al centro",
    },
    en: {
        htmlLang: "en",
        nav: { home: "Home", about: "About", projects: "Projects", garden: "Digital Garden", contact: "Contact" },
        menuLabel: "Open menu",
        langAria: "Change language",
        name: "Auxi Arroyo García",
        boardAria: "Interactive map — drag to explore",
        hint: "Drag to explore",
        recenter: "Back to center",
    },
} as const

/* ---------------------------------------------------------------------------
   CARDS — scattered around a central hero on a big virtual "world".
   x / y are world coordinates (px) relative to the world centre; rot in deg.
--------------------------------------------------------------------------- */
type CardKind = "hero" | "note" | "quote" | "place" | "chip" | "color"
interface Card {
    id: string
    kind: CardKind
    x: number
    y: number
    rot: number
    emoji?: string
    color?: string
    es: { title?: string; text?: string }
    en: { title?: string; text?: string }
}

const CARDS: Card[] = [
    {
        id: "hero",
        kind: "hero",
        x: 0,
        y: 0,
        rot: 0,
        emoji: "✷",
        es: { title: "Para divertirme", text: "Curiosidades, lugares y cosas que me inspiran. Arrastra y curiosea." },
        en: { title: "Just for fun", text: "Curiosities, places and things that inspire me. Drag around and peek." },
    },
    {
        id: "place-valencia",
        kind: "place",
        x: -520,
        y: -230,
        rot: -5,
        emoji: "☀️",
        color: "#ffe3b0",
        es: { title: "Valencia", text: "Mar, naranjas y buena luz." },
        en: { title: "Valencia", text: "Sea, oranges and great light." },
    },
    {
        id: "color-collect",
        kind: "note",
        x: 470,
        y: -250,
        rot: 4,
        emoji: "🎨",
        es: { title: "Colecciono paletas", text: "Guardo combinaciones de color como quien guarda conchas." },
        en: { title: "I collect palettes", text: "I save colour combos like other people save seashells." },
    },
    {
        id: "type-nerd",
        kind: "note",
        x: -560,
        y: 190,
        rot: 3,
        emoji: "🔠",
        es: { title: "Type nerd", text: "Puedo pasar una hora eligiendo una tipografía. Y no me arrepiento." },
        en: { title: "Type nerd", text: "I'll spend an hour choosing a typeface. No regrets." },
    },
    {
        id: "cinema",
        kind: "note",
        x: 540,
        y: 210,
        rot: -4,
        emoji: "🎬",
        es: { title: "Vengo del audiovisual", text: "Encuadres simétricos y paletas de cine me tienen ganada." },
        en: { title: "Film background", text: "Symmetric framing and cinema palettes win me over." },
    },
    {
        id: "quote",
        kind: "quote",
        x: 0,
        y: -330,
        rot: -2,
        es: { text: "“Lo bonito también puede ser útil.”" },
        en: { text: "“Beautiful can be useful too.”" },
    },
    {
        id: "coffee",
        kind: "chip",
        x: -260,
        y: 300,
        rot: -6,
        emoji: "☕",
        color: "#e7d3c0",
        es: { title: "Café + playlist para diseñar" },
        en: { title: "Coffee + a playlist to design" },
    },
    {
        id: "analog",
        kind: "chip",
        x: 250,
        y: -80,
        rot: 5,
        emoji: "📷",
        color: "#cfe6d8",
        es: { title: "Fotografía analógica" },
        en: { title: "Analogue photography" },
    },
    {
        id: "stickers",
        kind: "chip",
        x: 300,
        y: 350,
        rot: -3,
        emoji: "✦",
        color: "#d9d0ff",
        es: { title: "Debilidad por los stickers" },
        en: { title: "A weakness for stickers" },
    },
    {
        id: "plants",
        kind: "place",
        x: -300,
        y: -60,
        rot: 4,
        emoji: "🪴",
        color: "#d4ecc4",
        es: { title: "Plantas", text: "Mi mesa es medio jardín." },
        en: { title: "Plants", text: "My desk is half a garden." },
    },
    {
        id: "color-blob",
        kind: "color",
        x: 720,
        y: -20,
        rot: 0,
        color: "linear-gradient(135deg,#ff8f6b,#ffd36b 40%,#7cc6ff 75%,#b98bff)",
        es: {},
        en: {},
    },
    {
        id: "color-blob2",
        kind: "color",
        x: -780,
        y: -10,
        rot: 0,
        color: "linear-gradient(135deg,#8be0c6,#8bb8ff 55%,#e08bd8)",
        es: {},
        en: {},
    },
    {
        id: "learning",
        kind: "chip",
        x: -40,
        y: 340,
        rot: 3,
        emoji: "🌱",
        color: "#ffe0ea",
        es: { title: "Siempre aprendiendo algo" },
        en: { title: "Always learning something" },
    },
    {
        id: "detail",
        kind: "note",
        x: 60,
        y: -120,
        rot: 2,
        emoji: "🔍",
        es: { title: "Amante del detalle", text: "El 4px que nadie nota — yo lo noto." },
        en: { title: "Detail lover", text: "The 4px nobody notices — I notice." },
    },
]

/* ==========================================================================
   ICONS
   ========================================================================== */
const Icon = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
    </svg>
)

/* ==========================================================================
   BOARD
   ========================================================================== */
interface BoardProps {
    t: (typeof CONTENT)[Lang]
    lang: Lang
    interactive: boolean
}

const WORLD_W = 1900
const WORLD_H = 1300

function ForFunBoard({ t, lang, interactive }: BoardProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [hinted, setHinted] = useState(false)
    const gesture = useRef<null | { sx: number; sy: number; px: number; py: number; moved: boolean }>(null)
    const rafRef = useRef<number>(0)
    const pendRef = useRef<{ x: number; y: number } | null>(null)

    const clampPan = useCallback((x: number, y: number) => {
        const vp = viewportRef.current
        const vw = vp ? vp.clientWidth : 1200
        const vh = vp ? vp.clientHeight : 800
        // world is centred; allow dragging until an edge reaches the viewport edge (+margin)
        const maxX = Math.max(0, (WORLD_W - vw) / 2 + 160)
        const maxY = Math.max(0, (WORLD_H - vh) / 2 + 160)
        return {
            x: Math.max(-maxX, Math.min(maxX, x)),
            y: Math.max(-maxY, Math.min(maxY, y)),
        }
    }, [])

    const applyPan = useCallback((x: number, y: number) => {
        pendRef.current = { x, y }
        if (typeof window === "undefined") {
            const c = clampPan(x, y)
            setPan(c)
            return
        }
        if (!rafRef.current) {
            rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = 0
                const p = pendRef.current
                pendRef.current = null
                if (p) setPan(clampPan(p.x, p.y))
            })
        }
    }, [clampPan])

    useEffect(() => {
        return () => {
            if (rafRef.current && typeof window !== "undefined") window.cancelAnimationFrame(rafRef.current)
        }
    }, [])

    const onPointerDown = useCallback(
        (e: ReactPointerEvent<HTMLDivElement>) => {
            if (!interactive) return
            // let links handle their own clicks
            if ((e.target as Element).closest("a")) return
            viewportRef.current?.setPointerCapture(e.pointerId)
            gesture.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, moved: false }
            setDragging(true)
        },
        [interactive, pan]
    )

    const onPointerMove = useCallback(
        (e: ReactPointerEvent<HTMLDivElement>) => {
            const g = gesture.current
            if (!g) return
            const dx = e.clientX - g.sx
            const dy = e.clientY - g.sy
            if (Math.abs(dx) + Math.abs(dy) > 3) {
                g.moved = true
                if (!hinted) setHinted(true)
            }
            applyPan(g.px + dx, g.py + dy)
        },
        [applyPan, hinted]
    )

    const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        viewportRef.current?.releasePointerCapture?.(e.pointerId)
        gesture.current = null
        setDragging(false)
    }, [])

    const recenter = useCallback(() => {
        setPan({ x: 0, y: 0 })
        setHinted(true)
    }, [])

    return (
        <div
            className={`ff-board ${dragging ? "is-dragging" : ""}`}
            ref={viewportRef}
            role="application"
            aria-label={t.boardAria}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <div
                className="ff-world"
                style={{
                    width: WORLD_W,
                    height: WORLD_H,
                    transform: `translate(-50%, -50%) translate3d(${pan.x}px, ${pan.y}px, 0)`,
                }}
            >
                {CARDS.map((c, i) => {
                    const copy = c[lang]
                    const style: CSSProperties = {
                        left: `calc(50% + ${c.x}px)`,
                        top: `calc(50% + ${c.y}px)`,
                        transform: `translate(-50%, -50%) rotate(${c.rot}deg)`,
                        ["--i" as any]: i,
                    }
                    if (c.kind === "hero") {
                        return (
                            <article key={c.id} className="ff-card ff-hero" style={style}>
                                <span className="ff-hero-star" aria-hidden="true">{c.emoji}</span>
                                <h1 className="ff-hero-title">{copy.title}</h1>
                                <p className="ff-hero-text">{copy.text}</p>
                            </article>
                        )
                    }
                    if (c.kind === "quote") {
                        return (
                            <article key={c.id} className="ff-card ff-quote" style={style}>
                                <p>{copy.text}</p>
                            </article>
                        )
                    }
                    if (c.kind === "color") {
                        return (
                            <div
                                key={c.id}
                                className="ff-card ff-color"
                                style={{ ...style, background: c.color }}
                                aria-hidden="true"
                            />
                        )
                    }
                    if (c.kind === "chip") {
                        return (
                            <div key={c.id} className="ff-card ff-chip" style={{ ...style, ["--chip" as any]: c.color }}>
                                <span className="ff-chip-emoji" aria-hidden="true">{c.emoji}</span>
                                <span className="ff-chip-label">{copy.title}</span>
                            </div>
                        )
                    }
                    // note / place
                    return (
                        <article key={c.id} className={`ff-card ff-note ${c.kind === "place" ? "ff-place" : ""}`} style={style}>
                            <span className="ff-note-emoji" aria-hidden="true" style={c.color ? { background: c.color } : undefined}>
                                {c.emoji}
                            </span>
                            <div className="ff-note-body">
                                {copy.title ? <h2 className="ff-note-title">{copy.title}</h2> : null}
                                {copy.text ? <p className="ff-note-text">{copy.text}</p> : null}
                            </div>
                        </article>
                    )
                })}
            </div>

            <div className={`ff-hint ${hinted ? "is-hidden" : ""}`} aria-hidden="true">
                <span className="ff-hint-hand">✷</span>
                {t.hint}
            </div>

            <button type="button" className="ff-recenter" onClick={recenter} aria-label={t.recenter} title={t.recenter}>
                <Icon d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                <span className="ff-recenter-dot" />
            </button>
        </div>
    )
}

/* ==========================================================================
   PAGE
   ========================================================================== */
interface ForFunPageProps {
    profileImage?: { src?: string; srcSet?: string; alt?: string }
    email?: string
    accent?: string
    defaultLanguage?: Lang
    style?: CSSProperties
}

/**
 * For Fun page — Auxi Arroyo García
 *
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 832
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function ForFunPage(props: ForFunPageProps) {
    const { profileImage, accent = "#ff654d", defaultLanguage = "es" } = props

    const isStatic = useIsStaticRenderer()
    const [lang, setLang] = useState<Lang>(defaultLanguage)
    const [navOpen, setNavOpen] = useState(false)
    const { theme, toggleTheme } = useAagTheme()
    const [vhpx, setVhpx] = useState<number | null>(() =>
        typeof window !== "undefined" && window.innerHeight ? window.innerHeight : null
    )
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
            /* ignore */
        }
        const onResize = () => setVhpx(window.innerHeight)
        onResize()
        window.addEventListener("resize", onResize)
        window.addEventListener("orientationchange", onResize)
        return () => {
            window.removeEventListener("resize", onResize)
            window.removeEventListener("orientationchange", onResize)
        }
    }, [])

    const changeLang = useCallback((next: Lang) => {
        setLang(next)
        try {
            if (typeof window !== "undefined") window.localStorage.setItem("aag-about-lang", next)
        } catch (e) {
            /* ignore */
        }
    }, [])

    const t = CONTENT[lang]

    useEffect(() => {
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.lang = t.htmlLang
        }
    }, [t.htmlLang])

    const navItems = [
        { key: "home", label: t.nav.home, href: "/" },
        { key: "about", label: t.nav.about, href: "/about" },
        { key: "projects", label: t.nav.projects, href: "/projects" },
        { key: "garden", label: t.nav.garden, href: "/digital-garden" },
        { key: "contact", label: t.nav.contact, href: "/contact" },
    ]

    const photoSrc = profileImage && profileImage.src ? profileImage.src : PROFILE_SRC
    const photoSrcSet = profileImage && profileImage.srcSet ? profileImage.srcSet : undefined

    return (
        <div
            className={`aag-root ff-root${isStatic ? " aag-static" : ""}`}
            style={{
                width: "100%",
                position: "relative",
                ["--accent" as any]: accent,
                ["--vhpx" as any]: vhpx ? `${vhpx}px` : undefined,
            }}
        >
            <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />

            {/* ===================== NAVIGATION ===================== */}
            <div className="aag-nav-wrap">
                <nav className={`aag-nav ${navOpen ? "is-open" : ""}`} aria-label={t.name}>
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
                                            <a className="aag-nav-link" href={item.href} role="listitem">
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
                            <a className="aag-mobile-link" href={item.href} onClick={() => setNavOpen(false)}>
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

            {/* ===================== BOARD ===================== */}
            <main className="ff-main">
                <ForFunBoard t={t} lang={lang} interactive={!isStatic} />
            </main>
        </div>
    )
}

addPropertyControls(ForFunPage, {
    profileImage: { type: ControlType.ResponsiveImage, title: "Profile Photo" },
    email: { type: ControlType.String, title: "Email", defaultValue: EMAIL },
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
   STYLES — tokens + nav reused from the rest of the site, then the board.
   ========================================================================== */
const CSS_STYLES = `@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

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
.aag-root *, .aag-root *::before, .aag-root *::after { box-sizing: border-box; }
.aag-root p { margin: 0; }
.aag-root h1, .aag-root h2 { margin: 0; font-weight: 600; }
.aag-root button { font-family: inherit; }
.aag-root a { color: inherit; text-decoration: none; }
.aag-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }

/* ---------- NAV (shared) ---------- */
.aag-nav-wrap { position: fixed; top: 16px; left: 0; right: 0; z-index: 20; width: 100%; padding: 0 var(--pad); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.aag-nav { pointer-events: auto; width: fit-content; max-width: 100%; min-width: 320px; display: flex; align-items: center; background: rgba(255,255,255,0.86); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); border: 1px solid var(--border); box-shadow: var(--shadow-sm); border-radius: 999px; padding: 7px 12px 7px 7px; transition: box-shadow 0.3s ease, min-width 0.42s cubic-bezier(0.4,0,0.2,1); }
.aag-nav:hover { box-shadow: var(--shadow); }
.aag-brand { display: inline-flex; align-items: center; gap: 13px; margin-right: 20px; padding: 3px 6px 3px 3px; cursor: pointer; border-radius: 999px; color: var(--text); flex-shrink: 0; }
.aag-avatar { width: 34px; height: 34px; border-radius: 50%; background: #ececE8; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
.aag-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
.aag-nav-link { position: relative; background: transparent; border: none; cursor: pointer; color: var(--muted); font-size: 14px; font-weight: 500; letter-spacing: -0.01em; padding: 8px 13px; border-radius: 999px; white-space: nowrap; transition: color 0.24s, background 0.24s, transform 0.24s; }
.aag-nav-link:hover, .aag-nav-link:focus-visible { color: var(--text); background: rgba(0,0,0,0.045); transform: translateY(-1px); }
.aag-lang { display: inline-flex; align-items: center; gap: 2px; padding: 4px 6px; margin-left: 4px; flex-shrink: 0; }
.aag-lang-btn { background: transparent; border: none; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--muted); padding: 4px 5px; border-radius: 6px; transition: color 0.2s ease; }
.aag-lang-btn:hover { color: var(--text); }
.aag-lang-btn.is-active { color: var(--accent); }
.aag-lang-sep { color: var(--border); font-size: 12px; }
.aag-mobile-lang { display: flex; align-items: center; gap: 2px; padding: 10px 14px 4px; margin-top: 4px; border-top: 1px solid var(--border); }
.aag-mobile-menu { pointer-events: auto; width: 100%; max-width: 420px; margin-top: 8px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); border-radius: 20px; padding: 8px; display: none; flex-direction: column; gap: 2px; opacity: 0; transform: translateY(-8px); transition: opacity 0.2s ease, transform 0.2s ease; }
.aag-mobile-menu.is-open { opacity: 1; transform: translateY(0); }
.aag-mobile-link { text-align: left; background: transparent; border: none; cursor: pointer; color: var(--text); font-size: 16px; font-weight: 500; padding: 12px 14px; border-radius: 12px; min-height: 44px; }
.aag-mobile-link:hover { background: var(--background); }

/* ---------- LAYOUT ---------- */
.ff-root { height: var(--vhpx, 100vh); min-height: 560px; overflow: hidden; position: relative; }
.ff-main { position: absolute; inset: 0; }

/* ---------- BOARD ---------- */
.ff-board {
    position: absolute; inset: 0;
    background-color: var(--background);
    background-image: radial-gradient(circle, rgba(22,22,22,0.05) 1.1px, transparent 1.2px);
    background-size: 30px 30px;
    touch-action: none;
    overscroll-behavior: none;
    cursor: grab;
    -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent;
    overflow: hidden;
}
.ff-board.is-dragging { cursor: grabbing; }
.ff-world { position: absolute; left: 50%; top: 50%; will-change: transform; }
.aag-static .ff-world { transition: none; }

.ff-card { position: absolute; }
.ff-card.ff-note, .ff-card.ff-place, .ff-card.ff-quote, .ff-card.ff-chip {
    transition: transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease;
}
.ff-board:not(.is-dragging) .ff-note:hover,
.ff-board:not(.is-dragging) .ff-place:hover,
.ff-board:not(.is-dragging) .ff-quote:hover,
.ff-board:not(.is-dragging) .ff-chip:hover {
    transform: translate(-50%, -50%) rotate(0deg) scale(1.05) !important;
    box-shadow: 0 20px 44px rgba(0,0,0,0.16);
    z-index: 5;
}

/* hero */
.ff-hero {
    width: 340px; text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 26px;
    padding: 34px 30px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.12);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    z-index: 3;
}
.ff-hero-star { color: var(--accent); font-size: 30px; line-height: 1; animation: ff-spin 16s linear infinite; }
.aag-static .ff-hero-star { animation: none; }
@keyframes ff-spin { to { transform: rotate(360deg); } }
.ff-hero-title { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.ff-hero-text { font-size: 15px; color: var(--muted); line-height: 1.5; max-width: 260px; }

/* notes / places */
.ff-note {
    width: 250px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 18px;
    box-shadow: var(--shadow);
    display: flex; gap: 14px; align-items: flex-start;
}
.ff-note-emoji {
    flex-shrink: 0; width: 44px; height: 44px; border-radius: 13px;
    background: #f0efe9;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.ff-note-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 3px; }
.ff-note-text { font-size: 13.5px; color: var(--muted); line-height: 1.45; }
.ff-place { background: #fffdf7; }

/* quote */
.ff-quote {
    width: 300px;
    background: var(--text);
    color: #fff;
    border-radius: 20px;
    padding: 26px 28px;
    box-shadow: 0 18px 44px rgba(0,0,0,0.24);
}
.ff-quote p { font-family: 'Caveat', cursive; font-size: 30px; font-weight: 600; line-height: 1.2; }

/* chip / tag */
.ff-chip {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 11px 18px;
    background: var(--chip, #eee);
    border-radius: 999px;
    box-shadow: var(--shadow-sm);
    font-size: 15px; font-weight: 600; color: #2a2a26;
    white-space: nowrap;
}
.ff-chip-emoji { font-size: 17px; }

/* color blobs (decorative) */
.ff-color {
    width: 200px; height: 200px; border-radius: 34px;
    filter: blur(2px);
    opacity: 0.9;
    box-shadow: 0 20px 60px rgba(0,0,0,0.12);
}

/* hint + recenter */
.ff-hint {
    position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
    display: inline-flex; align-items: center; gap: 9px;
    background: rgba(255,255,255,0.9);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    padding: 10px 18px; border-radius: 999px;
    font-size: 13.5px; font-weight: 600; color: var(--text);
    pointer-events: none;
    transition: opacity 0.4s ease, transform 0.4s ease;
    animation: ff-float 2.4s ease-in-out infinite;
}
.ff-hint.is-hidden { opacity: 0; transform: translateX(-50%) translateY(10px); }
.ff-hint-hand { color: var(--accent); }
@keyframes ff-float { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-5px); } }

.ff-recenter {
    position: absolute; right: 22px; bottom: 22px;
    width: 46px; height: 46px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.9);
    -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    cursor: pointer; color: var(--text);
    transition: transform 0.16s ease, background 0.2s ease;
}
.ff-recenter:hover { transform: translateY(-2px) rotate(45deg); background: #fff; }
.ff-recenter-dot { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 1024px) { .aag-root { --pad: 32px; } }
@media (max-width: 820px) {
    .aag-nav-menu { display: none; }
    .aag-dots { opacity: 1 !important; width: auto !important; visibility: visible !important; padding: 8px 10px !important; pointer-events: auto !important; }
    .aag-mobile-menu { display: flex; position: absolute; top: 100%; left: 0; right: 0; pointer-events: none; }
    .aag-mobile-menu.is-open { pointer-events: auto; }
    .aag-nav { min-width: 0; width: 100%; max-width: 520px; margin-left: auto; margin-right: auto; }
    .aag-nav-wrap { align-items: stretch; top: 12px; }
    .aag-brand { margin-right: auto; }
}
@media (max-width: 760px) { .aag-root { --pad: 22px; } }
@media (max-width: 600px) {
    .ff-hero { width: 280px; padding: 26px 22px; }
    .ff-hero-title { font-size: 28px; }
    .ff-note { width: 220px; }
    .ff-quote { width: 250px; }
    .ff-quote p { font-size: 25px; }
    .ff-color { width: 150px; height: 150px; }
}
@media (prefers-reduced-motion: reduce) {
    .aag-root *, .aag-root *::before, .aag-root *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

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
