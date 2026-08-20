import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
} from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

/* ==========================================================================
   Charging Page — animated intro loader — Auxi Arroyo García

   A calm, minimalist splash that plays once when entering the site: the brand
   flower (@positivo) gently pulses like a slowly beating heart for a few soft
   beats, then the whole screen fades + scales away and navigates to the Home
   page. Only transform/opacity animate (GPU-friendly). The loader plays once
   per session so it never delays repeat navigation, and it degrades to a quick
   fade under prefers-reduced-motion and stays static on the canvas.
   ========================================================================== */

/* @positivo brand flower (same asset used across the site), inlined as a data
   URI so the intro never waits on a network request. */
const FLOWER_SRC = "/portfolio-auxi-arroyo/assets/xFoqHrXNDyzuwBC6VbJT53CWzlI.png"

const HOME_URL = "/"

interface ChargingPageProps {
    homeUrl?: string
    beats?: number
    accent?: string
    playOncePerSession?: boolean
    style?: CSSProperties
}

/**
 * Charging Page — Auxi Arroyo García
 *
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 800
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any
 */
export default function ChargingPage(props: ChargingPageProps) {
    const {
        homeUrl = HOME_URL,
        beats = 3,
        accent = "#ff654d",
        playOncePerSession = true,
    } = props

    const isStatic = useIsStaticRenderer()
    const [leaving, setLeaving] = useState(false)
    const [ready, setReady] = useState(false)
    const timers = useRef<number[]>([])

    /* clamp the heartbeat count for a calm, refined rhythm */
    const heartbeats = Math.min(5, Math.max(2, Math.round(beats || 3)))
    const beatMs = 1150
    const holdMs = heartbeats * beatMs
    const exitMs = 620

    useEffect(() => {
        if (isStatic || typeof window === "undefined") return

        const reduce =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches

        const go = () => {
            try {
                window.location.assign(homeUrl)
            } catch (e) {
                window.location.href = homeUrl
            }
        }

        /* Only-on-entry: if this session already saw the intro, skip straight to
           Home so navigation is never delayed. */
        let seen = false
        if (playOncePerSession) {
            try {
                seen = window.sessionStorage.getItem("aag-intro-played") === "1"
            } catch (e) {
                seen = false
            }
        }
        if (seen) {
            go()
            return
        }
        try {
            if (playOncePerSession)
                window.sessionStorage.setItem("aag-intro-played", "1")
        } catch (e) {
            /* storage unavailable — still play once for this load */
        }

        /* trigger the entrance on the next frame so the transition runs */
        const raf = window.requestAnimationFrame(() => setReady(true))

        const totalHold = reduce ? 480 : holdMs
        const totalExit = reduce ? 220 : exitMs
        const t1 = window.setTimeout(() => setLeaving(true), totalHold)
        const t2 = window.setTimeout(go, totalHold + totalExit)
        timers.current = [t1, t2]

        return () => {
            window.cancelAnimationFrame(raf)
            timers.current.forEach((t) => window.clearTimeout(t))
            timers.current = []
        }
    }, [isStatic, homeUrl, playOncePerSession, holdMs, exitMs])

    const rootStyle: CSSProperties = {
        ["--accent" as any]: accent,
        ["--cp-beat" as any]: `${beatMs}ms`,
        opacity: leaving ? 0 : 1,
        transform: leaving ? "scale(1.04)" : "scale(1)",
        transition: `opacity ${exitMs}ms cubic-bezier(0.4,0,0.2,1), transform ${exitMs}ms cubic-bezier(0.22,1,0.36,1)`,
    }

    return (
        <div className={`cp-root${isStatic ? " cp-static" : ""}`} style={rootStyle}>
            <style dangerouslySetInnerHTML={{ __html: CSS_STYLES }} />
            {/* Oversized ghost flower bleeding off the right edge — an intentional,
               asymmetric counterweight to the left-anchored focal mark. */}
            <span className="cp-orb" aria-hidden="true">
                <img src={FLOWER_SRC} alt="" draggable={false} />
            </span>
            <div className={`cp-stage${ready || isStatic ? " is-ready" : ""}`}>
                <span className="cp-flower" aria-hidden="true">
                    <img src={FLOWER_SRC} alt="" width={140} height={140} draggable={false} />
                </span>
                <span className="cp-loader" aria-hidden="true">
                    <span className="cp-loader-fill" />
                </span>
            </div>
            <span className="cp-a11y" role="status" aria-live="polite">
                Cargando…
            </span>
        </div>
    )
}

addPropertyControls(ChargingPage, {
    homeUrl: {
        type: ControlType.Link,
        title: "Home Page",
        defaultValue: HOME_URL,
    },
    beats: {
        type: ControlType.Number,
        title: "Heartbeats",
        defaultValue: 3,
        min: 2,
        max: 5,
        step: 1,
        displayStepper: true,
    },
    accent: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#ff654d",
    },
    playOncePerSession: {
        type: ControlType.Boolean,
        title: "Play Once",
        enabledTitle: "Per Session",
        disabledTitle: "Every Visit",
        defaultValue: true,
    },
})

const CSS_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&display=swap');
.cp-root {
    --background: #f7f7f5;
    --text: #161616;
    --muted: #6b6b6b;
    position: relative;
    width: 100%;
    min-height: 100vh;
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    /* Intentionally off-centre: focal mark anchored toward the upper-left third
       (asymmetric top/bottom + left padding) rather than dead-centre. */
    padding: clamp(48px, 9vh, 110px) clamp(28px, 6vw, 90px) clamp(96px, 18vh, 180px) clamp(34px, 15vw, 240px);
    overflow: hidden;
    background: var(--background);
    color: var(--text);
    font-family: "Manrope", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
}
.cp-root *, .cp-root *::before, .cp-root *::after { box-sizing: border-box; }
/* Oversized ghost flower bleeding off the right edge — a soft counterweight that
   makes the composition feel deliberate and gives quiet, slow movement. */
.cp-orb {
    position: absolute;
    top: 50%;
    right: 0;
    width: clamp(340px, 48vw, 760px);
    height: clamp(340px, 48vw, 760px);
    transform: translate(36%, -50%);
    opacity: 0.06;
    pointer-events: none;
    z-index: 0;
    will-change: transform;
    animation: cp-spin 46s linear infinite;
}
.cp-orb img { width: 100%; height: 100%; object-fit: contain; display: block; }
@keyframes cp-spin {
    from { transform: translate(36%, -50%) rotate(0deg); }
    to   { transform: translate(36%, -50%) rotate(360deg); }
}
.cp-stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: clamp(24px, 3.6vw, 38px);
    opacity: 0;
    transform: scale(0.96);
    transition: opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
}
.cp-stage.is-ready { opacity: 1; transform: none; }
.cp-flower {
    position: relative;
    z-index: 1;
    width: clamp(96px, 14vw, 148px);
    height: clamp(96px, 14vw, 148px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    filter: drop-shadow(0 10px 22px rgba(22,22,22,0.06));
    will-change: transform;
    transform-origin: center center;
    animation: cp-heartbeat var(--cp-beat, 1150ms) cubic-bezier(0.4,0,0.2,1) infinite both;
}
/* Slim indeterminate loader — a quiet, intentional detail under the mark. */
.cp-loader {
    position: relative;
    width: clamp(120px, 16vw, 196px);
    height: 2px;
    border-radius: 2px;
    background: rgba(22, 22, 22, 0.10);
    overflow: hidden;
}
.cp-loader-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 42%;
    border-radius: 2px;
    background: var(--accent, #ff654d);
    transform: translateX(-120%);
    animation: cp-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes cp-slide {
    0%   { transform: translateX(-120%); }
    55%  { transform: translateX(80%); }
    100% { transform: translateX(260%); }
}
.cp-flower img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}
.cp-a11y {
    position: absolute;
    width: 1px; height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
}
/* Organic "lub-dub" heartbeat: a soft primary beat, a lighter echo, then rest */
@keyframes cp-heartbeat {
    0%   { transform: scale(1); }
    14%  { transform: scale(1.085); }
    28%  { transform: scale(0.995); }
    42%  { transform: scale(1.05); }
    56%  { transform: scale(1); }
    100% { transform: scale(1); }
}
/* Static canvas: show a calm, finished frame (no motion) */
.cp-static .cp-stage { opacity: 1; transform: none; }
.cp-static .cp-flower { animation: none; }
.cp-static .cp-orb { animation: none; }
.cp-static .cp-loader-fill { animation: none; transform: translateX(0); width: 46%; }
@media (prefers-reduced-motion: reduce) {
    .cp-flower { animation: none; }
    .cp-orb { animation: none; }
    .cp-loader-fill { animation: none; transform: translateX(0); width: 46%; }
    .cp-stage { transition-duration: 0.2s; }
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
