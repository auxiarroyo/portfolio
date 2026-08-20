import {
    useEffect,
    useRef,
    useState,
    useCallback,
    type CSSProperties,
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
   Contact page — Auxi Arroyo García
   Editorial two-column contact experience. Reuses the SAME design system,
   header/navigation and tokens as the About / Projects / Home pages. No footer:
   the page ends after the contact section. Bilingual (ES / EN), responsive,
   accessible, self-contained. The form is front-end only (validation + success
   / error placeholders) — ready to wire to a backend later.
   ========================================================================== */

const EMAIL = "auxiliadoraarroyo123@gmail.com"
/* Public contact shown in the floating status pill (one-click copy) */
const FAB_EMAIL = "auxiliadoraarroyo123@gmail.com"
const LINKEDIN_URL = "https://www.linkedin.com/in/auxiarroyo/"
const PORTFOLIO_URL = "/"

const PROFILE_SRC =
    "/portfolio/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"

/* Editorial visual that replaces the contact form (horizontal, object-fit cover) */
const CONTACT_IMG =
    "/portfolio/assets/RxEXlSbPNwdS4SM1dE4F0J1y5I.jpg"

type Lang = "es" | "en"

const CONTENT = {
    es: {
        htmlLang: "es",
        nav: { home: "Inicio", about: "Sobre mí", projects: "Proyectos", garden: "Jardín digital", contact: "Contacto" },
        menuLabel: "Abrir menú",
        langAria: "Cambiar idioma",
        name: "Auxi Arroyo García",
        title: "Hablemos",
        eyebrow: "( SALUDA )",
        lead: "¿Tienes un proyecto, una oportunidad o una idea en mente? Escríbeme y te responderé lo antes posible.",
        infoAria: "Información de contacto",
        labelEmail: "Email",
        labelPhone: "Teléfono",
        labelLocation: "Ubicación",
        labelLinkedin: "LinkedIn",
        formAria: "Formulario de contacto",
        fName: "Nombre",
        fEmail: "Email",
        fMessage: "Mensaje",
        phName: "Tu nombre",
        phEmail: "tu@email.com",
        phMessage: "Cuéntame en qué puedo ayudarte…",
        send: "Enviar mensaje",
        sending: "Enviando…",
        errRequired: "Este campo es obligatorio.",
        errEmail: "Introduce un email válido.",
        successTitle: "¡Mensaje enviado!",
        successText: "Gracias por escribir. Te responderé muy pronto.",
        successAgain: "Enviar otro mensaje",
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
        title: "Let's Talk",
        eyebrow: "( SAY HELLO )",
        lead: "Have a project, an opportunity or an idea in mind? Drop me a line and I'll get back to you as soon as I can.",
        infoAria: "Contact information",
        labelEmail: "Email",
        labelPhone: "Phone",
        labelLocation: "Location",
        labelLinkedin: "LinkedIn",
        formAria: "Contact form",
        fName: "Name",
        fEmail: "Email",
        fMessage: "Message",
        phName: "Your name",
        phEmail: "you@email.com",
        phMessage: "Tell me how I can help…",
        send: "Send Message",
        sending: "Sending…",
        errRequired: "This field is required.",
        errEmail: "Please enter a valid email.",
        successTitle: "Message sent!",
        successText: "Thanks for reaching out. I'll get back to you very soon.",
        successAgain: "Send another message",
        fab: {
            label: "Status and contact",
            status: "Open to Work",
            copy: "Copy email",
            copied: "Copied!",
        },
    },
} as const

interface ContactPageProps {
    profileImage?: { src?: string; srcSet?: string; alt?: string }
    contactImage?: { src?: string; srcSet?: string; alt?: string }
    email?: string
    phone?: string
    location?: string
    linkedinUrl?: string
    portfolioUrl?: string
    accent?: string
    defaultLanguage?: Lang
    style?: CSSProperties
}

/**
 * Contact page — Auxi Arroyo García
 *
 * @framerIntrinsicWidth 1280
 * @framerIntrinsicHeight 832
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
/* ---------------------------------------------------------------------------
   BRAND FLOWER (@positivo) — replaces the rotating star across the site.
   Premium motion: a slow rotation on the image + a gentle float/scale on the
   wrapper, on two different periods so the rhythm never feels mechanical.
--------------------------------------------------------------------------- */
const FLOWER_SRC =
    "data:image/png;base64,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"

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

export default function ContactPage(props: ContactPageProps) {
    const {
        profileImage,
        contactImage,
        email = EMAIL,
        phone = "+34 640 147 444",
        location = "España",
        linkedinUrl = LINKEDIN_URL,
        portfolioUrl = PORTFOLIO_URL,
        accent = "#ff654d",
        defaultLanguage = "es",
    } = props

    const isStatic = useIsStaticRenderer()

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
            /* localStorage unavailable */
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

    useEffect(() => {
        if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.lang = t.htmlLang
        }
    }, [t.htmlLang])

    const [navOpen, setNavOpen] = useState(false)
    const { theme, toggleTheme } = useAagTheme()

    const photoSrc = profileImage && profileImage.src ? profileImage.src : PROFILE_SRC
    const photoSrcSet = profileImage && profileImage.srcSet ? profileImage.srcSet : undefined
    const contactPhoto = contactImage && contactImage.src ? contactImage.src : CONTACT_IMG
    const contactPhotoSet = contactImage && contactImage.srcSet ? contactImage.srcSet : undefined

    const navItems: { key: string; label: string; href: string; current?: boolean }[] = [
        { key: "home", label: t.nav.home, href: "/" },
        { key: "about", label: t.nav.about, href: "/about" },
        { key: "projects", label: t.nav.projects, href: "/projects" },
        { key: "garden", label: t.nav.garden, href: "/digital-garden" },
        { key: "contact", label: t.nav.contact, href: "/contact", current: true },
    ]

    return (
        <div
            className={`aag-root aag-contact${isStatic ? " aag-static" : ""}`}
            style={{ width: "100%", position: "relative", ["--accent" as any]: accent }}
        >
            <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
            {/* ===================== NAVIGATION (identical to the rest of the site) ===================== */}
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

                <div className={`aag-mobile-menu ${navOpen ? "is-open" : ""}`}>
                    {navItems.map((item) => (
                        <SiteLink key={item.key} href={item.href}>
                            <a
                                className={`aag-mobile-link${item.current ? " is-current" : ""}`}
                                href={item.href}
                                aria-current={item.current ? "page" : undefined}
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

            {/* ===================== CONTACT ===================== */}
            <main
                className="aag-contact-main"
                style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s ease" }}
            >
                <section className="aag-contact-grid" aria-label={t.title}>
                    {/* LEFT — presentation + contact info */}
                    <div className="aag-contact-left">
                        <h1 className="aag-contact-title">{t.title}</h1>
                        <p className="aag-contact-lead">{t.lead}</p>

                        <ul className="aag-contact-list" aria-label={t.infoAria}>
                            <li className="aag-contact-item">
                                <span className="aag-contact-label">{t.labelEmail}</span>
                                <a className="aag-contact-value is-link" href={`mailto:${email}`}>
                                    {email}
                                </a>
                            </li>
                            <li className="aag-contact-item">
                                <span className="aag-contact-label">{t.labelLinkedin}</span>
                                <a
                                    className="aag-contact-value is-link"
                                    href={linkedinUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    /in/auxiarroyo
                                </a>
                            </li>
                            <li className="aag-contact-item">
                                <span className="aag-contact-label">{t.labelPhone}</span>
                                <a className="aag-contact-value is-link" href={`tel:${phone.replace(/\s+/g, "")}`}>
                                    {phone}
                                </a>
                            </li>
                            <li className="aag-contact-item">
                                <span className="aag-contact-label">{t.labelLocation}</span>
                                <span className="aag-contact-value">{location}</span>
                            </li>
                        </ul>
                    </div>

                    {/* RIGHT — editorial image (replaces the form) */}
                    <div className="aag-contact-right">
                        <figure className="aag-contact-visual">
                            <img
                                className="aag-contact-photo"
                                src={contactPhoto}
                                srcSet={contactPhotoSet}
                                alt=""
                                loading="eager"
                                decoding="async"
                                draggable={false}
                            />
                        </figure>
                    </div>
                </section>
            </main>
        </div>
    )
}

addPropertyControls(ContactPage, {
    profileImage: {
        type: ControlType.ResponsiveImage,
        title: "Profile Photo",
    },
    contactImage: {
        type: ControlType.ResponsiveImage,
        title: "Contact Image",
    },
    email: {
        type: ControlType.String,
        title: "Email",
        defaultValue: EMAIL,
        placeholder: "you@example.com",
    },
    phone: {
        type: ControlType.String,
        title: "Phone",
        defaultValue: "+34 640 147 444",
        placeholder: "+34 600 00 00 00",
    },
    location: {
        type: ControlType.String,
        title: "Location",
        defaultValue: "España",
        placeholder: "City, Country",
    },
    linkedinUrl: {
        type: ControlType.Link,
        title: "LinkedIn",
        defaultValue: LINKEDIN_URL,
    },
    portfolioUrl: {
        type: ControlType.Link,
        title: "Portfolio",
        defaultValue: PORTFOLIO_URL,
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
   STYLES — tokens + header/nav reused VERBATIM from the rest of the site,
   then the contact-specific styles. No footer.
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

@media (min-width: 821px) {
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

/* ---------- CONTACT LAYOUT ---------- */
.aag-contact { min-height: 100dvh; display: flex; flex-direction: column; overflow-x: clip; }
@supports not (min-height: 100dvh) { .aag-contact { min-height: 100vh; } }
.aag-contact-main {
    flex: 1;
    width: 100%;
    padding: clamp(84px, 13vh, 156px) 0 clamp(56px, 9vh, 110px);
    animation: aag-fade-up 0.6s cubic-bezier(0.22,0.61,0.36,1) both;
}
@keyframes aag-fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: none; }
}
.aag-contact-grid {
    width: 100%;
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 var(--pad);
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    gap: clamp(44px, 7vw, 110px);
    align-items: start;
}

/* LEFT */
.aag-contact-left { max-width: 460px; }
.aag-contact-title {
    font-size: clamp(52px, 9vw, 104px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 0.98;
}
.aag-contact-eyebrow {
    margin-top: 18px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
}
.aag-contact-lead {
    margin-top: clamp(28px, 3.4vh, 44px);
    font-size: clamp(15px, 1.4vw, 17px);
    line-height: 1.6;
    color: var(--muted);
    max-width: 400px;
}
.aag-contact-list {
    /* Contact info reads as a distinct, secondary block that sits noticeably
       lower on the page so the title and intro have room to breathe. */
    margin-top: clamp(80px, 15vh, 160px);
    display: flex;
    flex-direction: column;
    gap: 22px;
}
.aag-contact-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.aag-contact-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    opacity: 0.85;
}
.aag-contact-value {
    /* Secondary hierarchy: smaller and lighter than the lead/title */
    font-size: clamp(13.5px, 1.15vw, 15px);
    font-weight: 500;
    letter-spacing: -0.01em;
    color: #4a4a4a;
    width: fit-content;
}
.aag-contact-value.is-link {
    position: relative;
    background-image: linear-gradient(var(--accent), var(--accent));
    background-repeat: no-repeat;
    background-position: 0 100%;
    background-size: 0% 1.5px;
    transition: background-size 0.35s cubic-bezier(0.22,0.61,0.36,1), color 0.25s ease;
    padding-bottom: 2px;
}
.aag-contact-value.is-link:hover,
.aag-contact-value.is-link:focus-visible {
    background-size: 100% 1.5px;
}

/* RIGHT — EDITORIAL IMAGE (replaces the form) */
.aag-contact-right { width: 100%; }
.aag-contact-visual {
    margin: 0;
    width: 100%;
    height: clamp(440px, 66vh, 720px);
    border-radius: 24px;
    overflow: hidden;
    background: #ececE8;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
}
.aag-contact-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
    transition: transform 6s ease-out;
}
.aag-contact-visual:hover .aag-contact-photo { transform: scale(1.04); }
.aag-form {
    display: flex;
    flex-direction: column;
    gap: clamp(28px, 4vh, 38px);
}
.aag-field { position: relative; display: flex; flex-direction: column; }
.aag-field label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 10px;
    transition: color 0.25s ease;
}
.aag-field input,
.aag-field textarea {
    width: 100%;
    border: none;
    border-bottom: 1.5px solid var(--border);
    background: transparent;
    padding: 10px 2px;
    font-family: inherit;
    font-size: 16px;
    font-weight: 500;
    color: var(--text);
    outline: none;
    border-radius: 0;
    transition: border-color 0.3s ease;
    -webkit-appearance: none;
    appearance: none;
}
.aag-field textarea {
    resize: vertical;
    min-height: 130px;
    line-height: 1.6;
    padding-top: 12px;
}
.aag-field input::placeholder,
.aag-field textarea::placeholder { color: #b3b3ab; }
.aag-underline {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 1.5px;
    width: 100%;
    background: var(--accent);
    transform: scaleX(0);
    transform-origin: left center;
    transition: transform 0.4s cubic-bezier(0.22,0.61,0.36,1);
    pointer-events: none;
}
.aag-field:focus-within .aag-underline { transform: scaleX(1); }
.aag-field:focus-within label { color: var(--text); }
.aag-field.has-error input,
.aag-field.has-error textarea { border-bottom-color: #e5484d; }
.aag-field.has-error .aag-underline { background: #e5484d; }
.aag-field.has-error label { color: #e5484d; }
.aag-field-error {
    margin-top: 8px;
    font-size: 12.5px;
    font-weight: 500;
    color: #e5484d;
}
.aag-form-foot { margin-top: 4px; }

.aag-submit {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--text);
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 15px 26px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: background 0.25s ease, transform 0.25s ease, gap 0.25s ease, box-shadow 0.25s ease;
}
.aag-submit:hover {
    background: #000;
    transform: translateY(-2px);
    gap: 13px;
    box-shadow: 0 14px 30px rgba(0,0,0,0.16);
}
.aag-submit:active { transform: translateY(0); }
.aag-submit-arrow { display: inline-flex; transition: transform 0.25s ease; }
.aag-submit:hover .aag-submit-arrow { transform: translateX(3px); }
.aag-submit.is-ghost {
    background: transparent;
    color: var(--text);
    border: 1.5px solid var(--border);
    padding: 13px 24px;
}
.aag-submit.is-ghost:hover {
    background: var(--text);
    color: #fff;
    border-color: var(--text);
    box-shadow: none;
}

/* SUCCESS */
.aag-form-success {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: clamp(28px, 4vw, 44px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 22px;
    box-shadow: var(--shadow-sm);
    animation: aag-fade-up 0.4s cubic-bezier(0.22,0.61,0.36,1) both;
}
.aag-success-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px; height: 52px;
    border-radius: 50%;
    background: rgba(255,101,77,0.12);
    color: var(--accent);
}
.aag-success-title { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.aag-success-text { font-size: 15.5px; line-height: 1.6; color: var(--muted); max-width: 360px; }
.aag-form-success .aag-submit { margin-top: 6px; }

/* ---------- RESPONSIVE (nav reused + contact) ---------- */
@media (max-width: 1024px) { .aag-root { --pad: 32px; } .aag-contact-grid { gap: clamp(40px, 5vw, 72px); } }
@media (max-width: 820px) {
    .aag-nav-menu { display: none; }
    .aag-dots { opacity: 1 !important; width: auto !important; visibility: visible !important; padding: 8px 10px !important; pointer-events: auto !important; }
    /* Overlay the dropdown instead of letting it occupy flow space (nav-wrap is
       sticky/in-flow here, unlike the absolute nav on the Home page). */
    .aag-mobile-menu { display: flex; position: absolute; top: 100%; left: 0; right: 0; pointer-events: none; }
    .aag-mobile-menu.is-open { pointer-events: auto; }
    .aag-nav { min-width: 0; width: 100%; max-width: 520px; }
    .aag-nav-wrap { align-items: stretch; }
    .aag-nav, .aag-mobile-menu { margin-left: auto; margin-right: auto; }
    .aag-brand { margin-right: auto; }
    .aag-brand-name { display: inline; }
}
/* Keep the two-column editorial layout on tablet; stack only on phones. */
@media (max-width: 700px) {
    .aag-contact-grid { grid-template-columns: 1fr; gap: clamp(40px, 8vw, 60px); }
    .aag-contact-left { max-width: 560px; }
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
    .aag-contact-main { padding: clamp(64px, 11vh, 104px) 0 clamp(48px, 8vh, 80px); }
    .aag-contact-title { font-size: clamp(46px, 15vw, 68px); }
    /* Scale the desktop breathing room down on phones so it stays proportionate
       and never pushes the block off-screen — spacing scales, nothing overlaps. */
    .aag-contact-lead { margin-top: clamp(20px, 4vw, 30px); }
    .aag-contact-list { margin-top: clamp(44px, 9vw, 68px); gap: 20px; }
    .aag-contact-visual { height: clamp(300px, 52vh, 460px); border-radius: 18px; }
}
@media (max-width: 480px) {
    .aag-root { --pad: 20px; font-size: 15px; }
    .aag-brand-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

@media (prefers-reduced-motion: reduce) {
    .aag-root *, .aag-root *::before, .aag-root *::after {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
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
