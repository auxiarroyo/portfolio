/**
 * Single source of truth for the site's deployment shape.
 *
 * Shared by vite.config.ts, the prerender script and the asset rewriter, so the
 * base path is declared exactly once.
 *
 * ── Changing the repository name ────────────────────────────────────────────
 * GitHub Pages serves a project site from https://<user>.github.io/<repo>/, so
 * BASE must match the repo name. If you rename the repo:
 *   1. edit BASE below
 *   2. run `npm run rebase`  (rewrites the hardcoded asset paths in src/pages)
 *   3. run `npm run build`
 * If you later move the site to a user site or a custom domain served at the
 * domain root, set BASE = "/" and run the same two commands.
 */
export const BASE = "/portfolio/"

/** Site-wide metadata, harvested verbatim from the previously published site. */
export const SITE = {
    title: "Auxi Arroyo García",
    description:
        "Auxi Arroyo García is a Graphic Designer and Community Manager. This is her portfolio — a space for creative branding, visual storytelling, and digital strategy.",
    /** Content is Spanish-first; the in-page ES/EN switch updates this at runtime. */
    lang: "es",
    icon: "assets/favicon.svg",
    appleIcon: "assets/apple-touch-icon.png",
    ogImage: "assets/og-image.png",
    themeColor: "#f7f7f5",
}

/** Values wired on the Framer canvas, reused verbatim so pages render identically. */
const ACCENT = "#ff654d"
const LINKEDIN = "https://www.linkedin.com/in/auxiarroyo/"
const EMAIL = "carreque45@gmail.com"
/**
 * The Framer canvas pointed this at https://auxiarroyo.framer.website. It is now a
 * relative link to this site's own root, so nothing references Framer at runtime.
 */
const PORTFOLIO = "/"

/**
 * Every route in the site.
 *
 * `module`/`export` identify the page component; `props` are the exact property
 * values that were set on the Framer canvas, translated from control titles to
 * the component's real prop names.
 */
export const ROUTES = [
    {
        path: "/",
        module: "HomePage",
        export: "default",
        title: "Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            portfolioUrl: PORTFOLIO,
            contactUrl: "/contact",
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/about",
        module: "AboutPage",
        export: "default",
        title: "Sobre mí — Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            portfolioUrl: PORTFOLIO,
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/projects",
        module: "ProjectsPage",
        export: "default",
        title: "Proyectos — Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            portfolioUrl: PORTFOLIO,
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/contact",
        module: "ContactPage",
        export: "default",
        title: "Contacto — Auxi Arroyo García",
        props: {
            email: "auxiliadoraarroyo123@gmail.com",
            phone: "+34 640 147 444",
            location: "España",
            linkedinUrl: LINKEDIN,
            portfolioUrl: PORTFOLIO,
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/digital-garden",
        module: "DigitalGardenPage",
        export: "default",
        title: "Digital Garden — Auxi Arroyo García",
        props: { accent: ACCENT, defaultLanguage: "es" },
    },
    {
        path: "/for-fun",
        module: "ForFunPage",
        export: "default",
        title: "For Fun — Auxi Arroyo García",
        props: { email: EMAIL, accent: ACCENT, defaultLanguage: "es" },
    },
    {
        path: "/explicación-proyecto",
        module: "ProjectDetailPage",
        export: "default",
        title: "Explicación del proyecto — Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            projectsUrl: "/projects",
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/youicy",
        module: "YouicyPage",
        export: "default",
        title: "Youicy — Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            projectsUrl: "/projects",
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/nailing",
        module: "NailingPage",
        export: "default",
        title: "Nailing — Auxi Arroyo García",
        props: {
            email: EMAIL,
            linkedinUrl: LINKEDIN,
            projectsUrl: "/projects",
            accent: ACCENT,
            defaultLanguage: "es",
        },
    },
    {
        path: "/chroma",
        module: "CaseStudyPage",
        export: "ChromaPage",
        title: "Chroma — Auxi Arroyo García",
        props: {},
    },
    {
        path: "/the-neon-museum",
        module: "CaseStudyPage",
        export: "NeonMuseumPage",
        title: "The Neon Museum — Auxi Arroyo García",
        props: {},
    },
    {
        path: "/bokoba",
        module: "CaseStudyPage",
        export: "BokobaPage",
        title: "Bokoba — Auxi Arroyo García",
        props: {},
    },
    {
        path: "/charging-page",
        module: "ChargingPage",
        export: "default",
        title: "Auxi Arroyo García",
        props: {
            homeUrl: "/",
            beats: 3,
            accent: ACCENT,
            playOncePerSession: true,
        },
    },
]
