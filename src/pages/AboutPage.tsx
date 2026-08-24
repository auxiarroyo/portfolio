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
   About page — Auxi Arroyo García
   Bilingual (ES / EN), responsive, accessible, self-contained code component.

   EDITABLE CONSTANTS ──────────────────────────────────────────────────────
   Replace the values below (or edit them from the Framer properties panel):
   - EMAIL           → your real email address (currently a placeholder)
   - LINKEDIN_URL    → your LinkedIn profile
   - PORTFOLIO_URL   → your portfolio site
   - Profile photo   → set the "Profile Photo" image control in the panel
   - Dates / copy    → all professional data lives in the EXPERIENCES /
                       EDUCATION / CONTENT objects further down this file
   ========================================================================== */

const EMAIL = "carreque45@gmail.com"
/* Public contact shown in the floating status pill (one-click copy) */
const FAB_EMAIL = "auxiliadoraarroyo123@gmail.com"
const LINKEDIN_URL = "https://www.linkedin.com/in/auxiarroyo/"
const PORTFOLIO_URL = "/"

/* Header avatar — circular portrait, uploaded to the project. The "Profile
   Photo" panel control still overrides this when set. */
const PROFILE_SRC =
    "/portfolio/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"
/* The avatar portrait is already a centred circular crop. */
const PROFILE_POSITION = "center"

/* Hero (left-column) portrait — rectangular photo shown in the rounded frame.
   Optimised from Auxi Arroyo.JPG. */
const HERO_PHOTO_SRC =
    "/portfolio/assets/EbtATpzLoarUNK8XvKuFYEWi8o.jpg"
/* The círculo portrait is already a centred circular crop. */
const HERO_PHOTO_POSITION = "center"

/* Personal logo (coral quatrefoil) — sits beside the name in the hero. */
const LOGO_SRC =
    "/portfolio/assets/VGeZrk4sKDih6EDNaKuAgI853FY.png"

/* ---------------------------------------------------------------------------
   PROFESSIONAL EXPERIENCE (structured data, paired ES / EN)
   ⤷ Company names, dates and company copy live here — edit freely.
--------------------------------------------------------------------------- */
interface ExpContent {
    position: string
    company: string
    period: string
    sector: string
    responsibilities: string[]
}
interface Experience {
    id: string
    img?: string
    es: ExpContent
    en: ExpContent
}

const EXPERIENCES: Experience[] = [
    {
        id: "taller-uxui",
        es: {
            position: "Diseñadora UX/UI",
            company: "Kibuu",
            period: "Junio 2025 – Septiembre 2025",
            sector: "Consultora especializada en comunicación, transformación digital y desarrollo de soluciones para empresas e instituciones.",
            responsibilities: [
                "Investigación de las necesidades y dificultades de pequeñas y medianas empresas.",
                "Diseño y mejora de experiencias digitales para herramientas de gestión.",
                "Colaboración con el equipo de desarrollo en Kibuu, una solución para la gestión de contenidos en pantallas digitales.",
                "Creación de flujos de usuario, arquitectura de información, wireframes y propuestas de interfaz.",
                "Testing, validación y documentación de mejoras.",
                "Diseño de manuales, infografías, recursos visuales y materiales de apoyo.",
            ],
        },
        en: {
            position: "UX/UI Designer",
            company: "Kibuu",
            period: "June 2025 – September 2025",
            sector: "A consultancy specialising in communication, digital transformation and business solutions.",
            responsibilities: [
                "Researched the needs and pain points of small and medium-sized businesses.",
                "Designed and improved digital experiences for management tools.",
                "Collaborated with the development team on Kibuu, a digital signage content management solution.",
                "Created user flows, information architecture, wireframes and interface proposals.",
                "Conducted testing, validation and documented improvements.",
                "Designed manuals, infographics and supporting visual materials.",
            ],
        },
    },
    {
        id: "taller-graphic",
        es: {
            position: "Diseñadora gráfica y creadora de contenido",
            company: "Taller Empresarial 2.0",
            period: "Junio 2025 – Septiembre 2025",
            sector: "Agencia y consultora de comunicación que trabaja con proyectos culturales, empresariales e institucionales.",
            responsibilities: [
                "Creación de contenidos para redes sociales.",
                "Diseño de piezas gráficas para campañas culturales e institucionales.",
                "Redacción de copies y programación de contenidos.",
                "Producción y edición de fotografía y vídeo.",
                "Apoyo en la comunicación de los Teatros de Córdoba y el Festival de la Guitarra.",
            ],
        },
        en: {
            position: "Graphic Designer & Content Creator",
            company: "Taller Empresarial 2.0",
            period: "June 2025 – September 2025",
            sector: "A communication agency and consultancy working with cultural, business and institutional projects.",
            responsibilities: [
                "Created social media content.",
                "Designed visual assets for cultural and institutional campaigns.",
                "Wrote copy and scheduled content.",
                "Produced and edited photography and video.",
                "Supported communications for Córdoba's theatres and the Guitar Festival.",
            ],
        },
    },
    {
        id: "magtel",
        es: {
            position: "Diseñadora gráfica",
            company: "Magtel",
            period: "Agosto 2024 – Mayo 2025",
            sector: "Compañía tecnológica y de ingeniería que desarrolla proyectos relacionados con infraestructuras, energía, telecomunicaciones y transformación digital.",
            responsibilities: [
                "Diseño de más de 50 piezas visuales.",
                "Creación de presentaciones corporativas y comerciales.",
                "Desarrollo de aproximadamente 40 mockups.",
                "Diseño y documentación de un manual visual.",
                "Apoyo gráfico a proyectos digitales.",
                "Coordinación con el equipo de desarrollo web.",
            ],
        },
        en: {
            position: "Graphic Designer",
            company: "Magtel",
            period: "August 2024 – May 2025",
            sector: "A technology and engineering company working in infrastructure, energy, telecommunications and digital transformation.",
            responsibilities: [
                "Designed more than 50 visual assets.",
                "Created corporate and commercial presentations.",
                "Produced approximately 40 mockups.",
                "Designed and documented a visual guidelines manual.",
                "Provided graphic support for digital projects.",
                "Collaborated with the web development team.",
            ],
        },
    },
    {
        id: "vidext",
        es: {
            position: "Especialista en marketing y diseño",
            company: "Vidext",
            period: "Septiembre 2023 – Enero 2024",
            sector: "Plataforma tecnológica de creación de vídeos mediante inteligencia artificial.",
            responsibilities: [
                "Creación de contenidos audiovisuales y piezas de marketing.",
                "Diseño de recursos visuales orientados a producto.",
                "Apoyo en estrategias de comunicación y retención.",
                "Adaptación de contenidos a distintos canales y públicos.",
                "Participación en iniciativas que contribuyeron a mejorar la retención de usuarios.",
            ],
        },
        en: {
            position: "Marketing & Design Specialist",
            company: "Vidext",
            period: "September 2023 – January 2024",
            sector: "A technology platform for creating videos using artificial intelligence.",
            responsibilities: [
                "Created audiovisual content and marketing assets.",
                "Designed product-focused visual resources.",
                "Supported communication and retention strategies.",
                "Adapted content for different audiences and channels.",
                "Contributed to initiatives aimed at improving user retention.",
            ],
        },
    },
    {
        id: "candela",
        es: {
            position: "Diseñadora gráfica y comunicación",
            company: "Candela Factoría",
            period: "Mayo 2023 – Agosto 2023",
            sector: "Estudio vinculado al diseño, la comunicación visual y los proyectos editoriales.",
            responsibilities: [
                "Diseño y maquetación de piezas editoriales.",
                "Organización visual de contenidos.",
                "Aplicación de jerarquía tipográfica.",
                "Preparación de materiales gráficos para diferentes formatos.",
            ],
        },
        en: {
            position: "Graphic Designer & Communication",
            company: "Candela Factoría",
            period: "May 2023 – August 2023",
            sector: "A studio focused on design, visual communication and editorial projects.",
            responsibilities: [
                "Designed and laid out editorial materials.",
                "Organised content visually.",
                "Applied typographic hierarchy.",
                "Prepared visual assets for different formats.",
            ],
        },
    },
    {
        id: "antonita",
        es: {
            position: "Community Manager y creadora de contenido",
            company: "Antoñita la Fantástica",
            period: "Septiembre 2022 – Enero 2023",
            sector: "Marca orientada a la comunicación digital, creación de contenidos y construcción de comunidad.",
            responsibilities: [
                "Planificación y creación de contenido para redes sociales.",
                "Grabación y edición de reels.",
                "Adaptación de tendencias al tono de la marca.",
                "Apoyo en la estrategia de comunidad y engagement.",
            ],
        },
        en: {
            position: "Community Manager & Content Creator",
            company: "Antoñita la Fantástica",
            period: "September 2022 – January 2023",
            sector: "A brand focused on digital communication, content creation and community building.",
            responsibilities: [
                "Planned and created social media content.",
                "Recorded and edited short-form videos.",
                "Adapted trends to the brand's tone of voice.",
                "Supported community and engagement strategy.",
            ],
        },
    },
    {
        id: "omibu",
        es: {
            position: "Especialista en inbound marketing",
            company: "Ómibu",
            period: "Febrero 2022 – Mayo 2022",
            sector: "Agencia especializada en estrategia digital, contenidos e inbound marketing.",
            responsibilities: [
                "Elaboración de seis planes de inbound marketing.",
                "Investigación de públicos y definición de contenidos.",
                "Apoyo en estrategias de captación y conversión.",
                "Organización de acciones y canales de comunicación.",
            ],
        },
        en: {
            position: "Inbound Marketing Specialist",
            company: "Ómibu",
            period: "February 2022 – May 2022",
            sector: "An agency specialising in digital strategy, content and inbound marketing.",
            responsibilities: [
                "Developed six inbound marketing plans.",
                "Researched audiences and defined content strategies.",
                "Supported acquisition and conversion strategies.",
                "Organised communication actions and channels.",
            ],
        },
    },
    {
        id: "esco",
        es: {
            position: "Creadora y editora de contenido audiovisual",
            company: "Alternativa Comunicación",
            period: "Octubre 2021 – Enero 2022",
            sector: "Agencia de comunicación especializada en contenido audiovisual y producción.",
            responsibilities: [
                "Producción y edición de aproximadamente 30 entrevistas en vídeo.",
                "Preparación de materiales audiovisuales.",
                "Organización y adaptación del contenido a distintos formatos.",
            ],
        },
        en: {
            position: "Audiovisual Content Creator & Editor",
            company: "Alternativa Comunicación",
            period: "October 2021 – January 2022",
            sector: "A communication agency specialising in audiovisual content and production.",
            responsibilities: [
                "Produced and edited approximately 30 video interviews.",
                "Prepared audiovisual materials.",
                "Organised and adapted content for different formats.",
            ],
        },
    },
    {
        id: "salmon",
        es: {
            position: "Diseño y curación de contenido",
            company: "The Salmon Factor",
            period: "2021",
            sector: "Agencia creativa y de comunicación digital.",
            responsibilities: [
                "Apoyo en la gestión de redes sociales.",
                "Creación y adaptación de contenidos.",
                "Investigación de tendencias.",
                "Organización de publicaciones digitales.",
            ],
        },
        en: {
            position: "Design & Content Curation",
            company: "The Salmon Factor",
            period: "2021",
            sector: "A creative and digital communication agency.",
            responsibilities: [
                "Supported social media management.",
                "Created and adapted content.",
                "Researched trends.",
                "Organised digital publications.",
            ],
        },
    },
    {
        id: "box",
        es: {
            position: "Community Manager",
            company: "Box Digital",
            period: "2020",
            sector: "Empresa especializada en producción, gestión y distribución de contenidos audiovisuales.",
            responsibilities: [
                "Control de calidad de piezas audiovisuales.",
                "Revisión de archivos y contenidos.",
                "Apoyo en tareas de producción y organización audiovisual.",
            ],
        },
        en: {
            position: "Community Manager",
            company: "Box Digital",
            period: "2020",
            sector: "A company specialising in the production, management and distribution of audiovisual content.",
            responsibilities: [
                "Performed quality control for audiovisual assets.",
                "Reviewed files and content.",
                "Supported audiovisual production and organisation tasks.",
            ],
        },
    },
]

/* Technologies used per role (brand names — never translated). Shown in the
   experience modal when present. Derived from each role's described work. */
const EXP_TECH: Record<string, string[]> = {
    "taller-uxui": ["Figma", "FigJam"],
    "taller-graphic": ["Photoshop", "Illustrator", "Premiere Pro", "Meta Business Suite"],
    magtel: ["Photoshop", "Illustrator", "InDesign", "Figma"],
    vidext: ["Premiere Pro", "After Effects", "Figma"],
    antonita: ["Premiere Pro", "Meta Business Suite", "Canva"],
    candela: ["InDesign", "Illustrator"],
    omibu: ["Mailchimp", "Metricool"],
    esco: ["Premiere Pro", "After Effects"],
    salmon: ["Meta Business Suite", "Canva", "Metricool"],
    box: [],
}

/* Key achievements per role (paired ES / EN). Derived from the real work and
   figures described in each role — no invented metrics. Shown in the modal. */
const EXP_ACHIEVEMENTS: Record<string, { es: string[]; en: string[] }> = {
    "taller-uxui": {
        es: [
            "Contribuí al diseño de Kibuu, una solución de gestión de contenidos para pantallas digitales.",
            "Definí flujos, arquitectura de información y wireframes que simplificaron la experiencia de uso.",
            "Documenté mejoras validadas mediante testing con usuarios.",
        ],
        en: [
            "Contributed to the design of Kibuu, a content-management solution for digital signage.",
            "Defined flows, information architecture and wireframes that simplified the experience.",
            "Documented improvements validated through user testing.",
        ],
    },
    "taller-graphic": {
        es: [
            "Produje piezas gráficas para campañas culturales e institucionales.",
            "Di apoyo a la comunicación de los Teatros de Córdoba y el Festival de la Guitarra.",
            "Gestioné la producción y edición de fotografía y vídeo.",
        ],
        en: [
            "Produced graphic assets for cultural and institutional campaigns.",
            "Supported communications for Córdoba's theatres and the Guitar Festival.",
            "Managed photography and video production and editing.",
        ],
    },
    magtel: {
        es: [
            "Diseñé más de 50 piezas visuales para proyectos corporativos.",
            "Desarrollé aproximadamente 40 mockups.",
            "Elaboré y documenté un manual visual de marca.",
        ],
        en: [
            "Designed more than 50 visual assets for corporate projects.",
            "Produced approximately 40 mockups.",
            "Created and documented a visual brand manual.",
        ],
    },
    vidext: {
        es: [
            "Creé contenidos audiovisuales y piezas de marketing orientadas a producto.",
            "Participé en iniciativas que ayudaron a mejorar la retención de usuarios.",
            "Adapté contenidos a distintos canales y audiencias.",
        ],
        en: [
            "Created audiovisual content and product-focused marketing assets.",
            "Took part in initiatives that helped improve user retention.",
            "Adapted content for different channels and audiences.",
        ],
    },
    antonita: {
        es: [
            "Planifiqué y creé contenido para redes sociales.",
            "Grabé y edité reels adaptando tendencias al tono de la marca.",
            "Apoyé la estrategia de comunidad y engagement.",
        ],
        en: [
            "Planned and created social media content.",
            "Recorded and edited reels, adapting trends to the brand's voice.",
            "Supported community and engagement strategy.",
        ],
    },
    candela: {
        es: [
            "Diseñé y maqueté piezas editoriales.",
            "Apliqué jerarquía tipográfica y organización visual del contenido.",
            "Preparé materiales gráficos para distintos formatos.",
        ],
        en: [
            "Designed and laid out editorial pieces.",
            "Applied typographic hierarchy and visual content organisation.",
            "Prepared graphic materials for different formats.",
        ],
    },
    omibu: {
        es: [
            "Elaboré seis planes de inbound marketing.",
            "Investigué públicos y definí estrategias de contenido.",
            "Apoyé acciones de captación y conversión.",
        ],
        en: [
            "Developed six inbound marketing plans.",
            "Researched audiences and defined content strategies.",
            "Supported acquisition and conversion actions.",
        ],
    },
    esco: {
        es: [
            "Produje y edité aproximadamente 30 entrevistas en vídeo.",
            "Preparé y adapté materiales audiovisuales a distintos formatos.",
        ],
        en: [
            "Produced and edited approximately 30 video interviews.",
            "Prepared and adapted audiovisual materials for different formats.",
        ],
    },
    salmon: {
        es: [
            "Apoyé la gestión de redes sociales.",
            "Creé y adapté contenidos e investigué tendencias.",
            "Organicé el calendario de publicaciones.",
        ],
        en: [
            "Supported social media management.",
            "Created and adapted content and researched trends.",
            "Organised the publishing schedule.",
        ],
    },
    box: {
        es: [
            "Realicé control de calidad de piezas audiovisuales.",
            "Revisé archivos y di apoyo a las tareas de producción.",
        ],
        en: [
            "Performed quality control of audiovisual assets.",
            "Reviewed files and supported production tasks.",
        ],
    },
}

/* Skills developed per role (paired ES / EN). Inferred from the discipline and
   tools of each position. Shown in the modal. */
const EXP_SKILLS: Record<string, { es: string[]; en: string[] }> = {
    "taller-uxui": {
        es: ["Investigación UX", "Arquitectura de información", "Wireframing", "Diseño de interfaz", "Testing y validación"],
        en: ["UX research", "Information architecture", "Wireframing", "Interface design", "Testing & validation"],
    },
    "taller-graphic": {
        es: ["Diseño gráfico", "Creación de contenido", "Copywriting", "Fotografía y vídeo"],
        en: ["Graphic design", "Content creation", "Copywriting", "Photography & video"],
    },
    magtel: {
        es: ["Diseño de marca", "Presentaciones", "Sistemas visuales", "Maquetación"],
        en: ["Brand design", "Presentations", "Visual systems", "Layout"],
    },
    vidext: {
        es: ["Motion y vídeo", "Marketing de producto", "Diseño visual", "Comunicación"],
        en: ["Motion & video", "Product marketing", "Visual design", "Communication"],
    },
    antonita: {
        es: ["Community management", "Edición de vídeo", "Estrategia de contenido"],
        en: ["Community management", "Video editing", "Content strategy"],
    },
    candela: {
        es: ["Diseño editorial", "Tipografía", "Maquetación"],
        en: ["Editorial design", "Typography", "Layout"],
    },
    omibu: {
        es: ["Inbound marketing", "Estrategia de contenidos", "Investigación de audiencias"],
        en: ["Inbound marketing", "Content strategy", "Audience research"],
    },
    esco: {
        es: ["Producción audiovisual", "Edición de vídeo", "Organización de contenido"],
        en: ["Audiovisual production", "Video editing", "Content organisation"],
    },
    salmon: {
        es: ["Redes sociales", "Creación de contenido", "Investigación de tendencias"],
        en: ["Social media", "Content creation", "Trend research"],
    },
    box: {
        es: ["Control de calidad", "Producción audiovisual", "Organización"],
        en: ["Quality control", "Audiovisual production", "Organisation"],
    },
}

/* ---------------------------------------------------------------------------
   EDUCATION (paired ES / EN). School names are not translated.
   Note: "Google UX Design" certificate and "Additional training" were removed
   per the latest content pass.
--------------------------------------------------------------------------- */
interface EduItem {
    title: string
    org: string
    period: string
    topics: string[]
    skills: string[]
    projects: string[]
    knowledge: string
}
interface Education {
    id: string
    img?: string
    es: EduItem
    en: EduItem
}
const EDUCATION: Education[] = [
    {
        id: "emprendeuco",
        es: {
            title: "Programa EmprendeUCO",
            org: "Universidad de Córdoba",
            period: "2026",
            topics: ["Emprendimiento e innovación", "Modelos de negocio", "Validación de ideas", "Desarrollo de producto"],
            skills: ["Pensamiento emprendedor", "Estrategia", "Validación"],
            projects: ["Desarrollo y validación de una idea de negocio."],
            knowledge: "Mentalidad emprendedora aplicada al diseño de productos y servicios.",
        },
        en: {
            title: "EmprendeUCO Programme",
            org: "University of Córdoba",
            period: "2026",
            topics: ["Entrepreneurship and innovation", "Business models", "Idea validation", "Product development"],
            skills: ["Entrepreneurial thinking", "Strategy", "Validation"],
            projects: ["Development and validation of a business idea."],
            knowledge: "An entrepreneurial mindset applied to designing products and services.",
        },
    },
    {
        id: "labasad",
        es: {
            title: "Máster en Diseño Gráfico y Entornos Digitales",
            org: "LABASAD",
            period: "2023–2024",
            topics: ["Diseño gráfico y sistemas visuales", "Diseño de interfaces y experiencia de usuario", "Producto y entornos digitales", "Tipografía y branding"],
            skills: ["Diseño UX/UI", "Sistemas de diseño", "Prototipado", "Dirección visual"],
            projects: ["Proyectos de diseño digital y branding aplicados a casos reales."],
            knowledge: "Una base sólida para conectar la comunicación visual con el diseño de producto digital.",
        },
        en: {
            title: "Master's Degree in Graphic Design and Digital Environments",
            org: "LABASAD",
            period: "2023–2024",
            topics: ["Graphic design and visual systems", "Interface design and user experience", "Digital products and environments", "Typography and branding"],
            skills: ["UX/UI design", "Design systems", "Prototyping", "Visual direction"],
            projects: ["Digital design and branding projects applied to real cases."],
            knowledge: "A solid foundation for connecting visual communication with digital product design.",
        },
    },
    {
        id: "esco-master",
        es: {
            title: "Máster en Marketing y Publicidad",
            org: "ESCO",
            period: "2021–2022",
            topics: ["Estrategia de marketing", "Publicidad y comunicación", "Marketing digital", "Analítica y audiencias"],
            skills: ["Estrategia", "Comunicación", "Marketing de contenidos"],
            projects: ["Planes de marketing y campañas de comunicación."],
            knowledge: "Visión estratégica para conectar diseño, contenido y objetivos de negocio.",
        },
        en: {
            title: "Master's Degree in Marketing and Advertising",
            org: "ESCO",
            period: "2021–2022",
            topics: ["Marketing strategy", "Advertising and communication", "Digital marketing", "Analytics and audiences"],
            skills: ["Strategy", "Communication", "Content marketing"],
            projects: ["Marketing plans and communication campaigns."],
            knowledge: "A strategic view for connecting design, content and business goals.",
        },
    },
    {
        id: "us-grado",
        es: {
            title: "Grado en Comunicación Audiovisual",
            org: "Universidad de Sevilla",
            period: "2017–2021",
            topics: ["Narrativa audiovisual", "Producción y edición", "Comunicación y medios", "Fotografía y lenguaje visual"],
            skills: ["Producción audiovisual", "Storytelling", "Edición"],
            projects: ["Proyectos audiovisuales y de comunicación."],
            knowledge: "Fundamentos de comunicación y lenguaje visual que sostienen mi manera de diseñar.",
        },
        en: {
            title: "Bachelor's Degree in Audiovisual Communication",
            org: "University of Seville",
            period: "2017–2021",
            topics: ["Audiovisual narrative", "Production and editing", "Communication and media", "Photography and visual language"],
            skills: ["Audiovisual production", "Storytelling", "Editing"],
            projects: ["Audiovisual and communication projects."],
            knowledge: "Communication and visual-language fundamentals that underpin the way I design.",
        },
    },
]

/* ---------------------------------------------------------------------------
   TOOLS — official monochrome (white) brand logos rendered on dark tiles,
   with hover tooltips. `path` is a Simple Icons (CC0) glyph on a 0 0 24 24
   viewBox, filled with currentColor; `name` is the tooltip label.
--------------------------------------------------------------------------- */
const TOOLS: { name: string; path: string }[] = [
    { name: "Figma", path: "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z" },
    { name: "FigJam", path: "M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.014-4.49-4.49S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.02 3.019 3.02h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V8.981H8.148zM8.172 24c-2.489 0-4.515-2.014-4.515-4.49s2.014-4.49 4.49-4.49h4.588v4.441c0 2.503-2.047 4.539-4.563 4.539zm-.024-7.51a3.023 3.023 0 0 0-3.019 3.019c0 1.665 1.365 3.019 3.044 3.019 1.705 0 3.093-1.376 3.093-3.068v-2.97H8.148zm7.704 0h-.098c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h.098c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.49-4.49 4.49zm-.097-7.509c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h.098c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-.098z" },
    { name: "Adobe Photoshop", path: "M9.85 8.42c-.37-.15-.77-.21-1.18-.2-.26 0-.49 0-.68.01-.2-.01-.34 0-.41.01v3.36c.14.01.27.02.39.02h.53c.39 0 .78-.06 1.15-.18.32-.09.6-.28.82-.53.21-.25.31-.59.31-1.03.01-.31-.07-.62-.23-.89-.17-.26-.41-.46-.7-.57zM19.75.3H4.25C1.9.3 0 2.2 0 4.55v14.899c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm-7.391 11.65c-.399.56-.959.98-1.609 1.22-.68.25-1.43.34-2.25.34-.24 0-.4 0-.5-.01s-.24-.01-.43-.01v3.209c.01.07-.04.131-.11.141H5.52c-.08 0-.12-.041-.12-.131V6.42c0-.07.03-.11.1-.11.17 0 .33 0 .56-.01.24-.01.49-.01.76-.02s.56-.01.87-.02c.31-.01.61-.01.91-.01.82 0 1.5.1 2.06.31.5.17.96.45 1.34.82.32.32.57.71.73 1.14.149.42.229.85.229 1.3.001.86-.199 1.57-.6 2.13zm7.091 3.89c-.28.4-.671.709-1.12.891-.49.209-1.09.318-1.811.318-.459 0-.91-.039-1.359-.129-.35-.061-.7-.17-1.02-.32-.07-.039-.121-.109-.111-.189v-1.74c0-.029.011-.07.041-.09.029-.02.06-.01.09.01.39.23.8.391 1.24.49.379.1.779.15 1.18.15.38 0 .65-.051.83-.141.16-.07.27-.24.27-.42 0-.141-.08-.27-.24-.4-.16-.129-.489-.279-.979-.471-.51-.18-.979-.42-1.42-.719-.31-.221-.569-.51-.761-.85-.159-.32-.239-.67-.229-1.021 0-.43.12-.84.341-1.21.25-.4.619-.72 1.049-.92.469-.239 1.059-.349 1.769-.349.41 0 .83.03 1.24.09.3.04.59.12.86.23.039.01.08.05.1.09.01.04.02.08.02.12v1.63c0 .04-.02.08-.05.1-.09.02-.14.02-.18 0-.3-.16-.62-.27-.96-.34-.37-.08-.74-.13-1.12-.13-.2-.01-.41.02-.601.07-.129.03-.24.1-.31.2-.05.08-.08.18-.08.27s.04.18.101.26c.09.11.209.2.34.27.229.12.47.23.709.33.541.18 1.061.43 1.541.73.33.209.6.49.789.83.16.318.24.67.23 1.029.011.471-.129.94-.389 1.331z" },
    { name: "Adobe Illustrator", path: "M10.53 10.73c-.1-.31-.19-.61-.29-.92-.1-.31-.19-.6-.27-.89-.08-.28-.15-.54-.22-.78h-.02c-.09.43-.2.86-.34 1.29-.15.48-.3.98-.46 1.48-.14.51-.29.98-.44 1.4h2.54c-.06-.211-.14-.46-.23-.721-.09-.269-.18-.559-.27-.859zM19.75.3H4.25C1.9.3 0 2.2 0 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zM14.7 16.83h-2.091c-.069.01-.139-.04-.159-.11l-.82-2.38H7.91l-.76 2.35c-.02.09-.1.15-.19.141H5.08c-.11 0-.14-.061-.11-.18L8.19 7.38c.03-.1.06-.21.1-.33.04-.21.06-.43.06-.65-.01-.05.03-.1.08-.11h2.59c.08 0 .12.03.13.08l3.65 10.3c.03.109 0 .16-.1.16zm3.4-.15c0 .11-.039.16-.129.16H16.01c-.1 0-.15-.061-.15-.16v-7.7c0-.1.041-.14.131-.14h1.98c.09 0 .129.05.129.14v7.7zm-.209-9.03c-.231.24-.571.37-.911.35-.33.01-.65-.12-.891-.35-.23-.25-.35-.58-.34-.92-.01-.34.12-.66.359-.89.242-.23.562-.35.892-.35.391 0 .689.12.91.35.22.24.34.56.33.89.01.34-.11.67-.349.92z" },
    { name: "Adobe InDesign", path: "M4.25.3C1.9.3 0 2.2 0 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm11.31 5.13h2.03c.05-.01.09.03.1.07v9.54c0 .18.01.38.02.6.02.21.03.41.04.58 0 .07-.03.13-.1.16-.52.22-1.07.38-1.63.48-.5.09-1.02.14-1.54.14-.74.01-1.48-.14-2.15-.45-.63-.29-1.15-.77-1.51-1.36-.37-.61-.55-1.37-.55-2.28-.01-.74.18-1.47.55-2.11.38-.65.93-1.19 1.59-1.55.7-.39 1.54-.58 2.53-.58.05 0 .12 0 .21.01s.19.01.31.02V5.54c0-.07.03-.11.1-.11zm-8.93.86h1.95c.06-.01.12.03.13.1.01.01.01.02.01.03v10.26c0 .11-.05.16-.14.16H6.62c-.09 0-.13-.05-.13-.16V6.42c0-.09.05-.13.14-.13zm8.23 4.24c-.39 0-.78.08-1.13.26-.34.17-.63.42-.85.74-.22.32-.33.75-.33 1.27-.01.35.05.7.17 1.03.1.27.25.51.45.71.19.18.42.32.68.4.27.09.55.13.83.13.15 0 .29-.01.42-.02.13.01.25-.01.36-.05v-4.4c-.09-.02-.18-.04-.27-.05-.11-.01-.22-.02-.33-.02z" },
    { name: "Adobe After Effects", path: "M8.54 10.73c-.1-.31-.19-.61-.29-.92s-.19-.6-.27-.89c-.08-.28-.15-.54-.22-.78h-.02c-.09.43-.2.86-.34 1.29-.15.48-.3.98-.46 1.48-.13.51-.29.98-.44 1.4h2.54c-.06-.21-.14-.46-.23-.72-.09-.27-.18-.56-.27-.86zm8.58-.29c-.55-.03-1.07.26-1.33.76-.12.23-.19.47-.22.72h2.109c.26 0 .45 0 .57-.01.08-.01.16-.03.23-.08v-.1c0-.13-.021-.25-.061-.37-.178-.56-.708-.94-1.298-.92zM19.75.3H4.25C1.9.3 0 2.2 0 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm-7.04 16.511h-2.09c-.07.01-.14-.041-.16-.11l-.82-2.4H5.92l-.76 2.36c-.02.09-.1.15-.19.14H3.09c-.11 0-.14-.06-.11-.18L6.2 7.39c.03-.1.06-.19.1-.31.04-.21.06-.43.06-.65-.01-.05.03-.1.08-.11h2.59c.07 0 .12.03.13.08l3.65 10.25c.03.11.001.161-.1.161zm7.851-3.991c-.021.189-.031.33-.041.42-.01.07-.069.13-.14.13-.06 0-.17.01-.33.021-.159.02-.35.029-.579.029-.23 0-.471-.04-.73-.04h-3.17c.039.31.14.62.31.89.181.271.431.48.729.601.4.17.841.26 1.281.25.35-.011.699-.04 1.039-.11.311-.039.61-.119.891-.23.05-.039.08-.02.08.08v1.531c0 .039-.01.08-.021.119-.021.03-.04.051-.069.07-.32.14-.65.24-1 .3-.471.09-.94.13-1.42.12-.761 0-1.4-.12-1.92-.35-.49-.211-.921-.541-1.261-.95-.319-.39-.55-.83-.69-1.31-.14-.471-.209-.961-.209-1.461 0-.539.08-1.07.25-1.59.16-.5.41-.96.75-1.37.33-.4.739-.72 1.209-.95.471-.23 1.03-.31 1.67-.31.531-.01 1.06.09 1.55.31.41.18.77.45 1.05.8.26.34.47.72.601 1.14.129.4.189.81.189 1.22 0 .24-.01.45-.019.64z" },
    { name: "Adobe Premiere Pro", path: "M10.15 8.42a2.93 2.93 0 00-1.18-.2 13.9 13.9 0 00-1.09.02v3.36l.39.02h.53c.39 0 .78-.06 1.15-.18.32-.09.6-.28.82-.53.21-.25.31-.59.31-1.03a1.45 1.45 0 00-.93-1.46zM19.75.3H4.25A4.25 4.25 0 000 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3zm-7.09 11.65c-.4.56-.96.98-1.61 1.22-.68.25-1.43.34-2.25.34l-.5-.01-.43-.01v3.21a.12.12 0 01-.11.14H5.82c-.08 0-.12-.04-.12-.13V6.42c0-.07.03-.11.1-.11l.56-.01.76-.02.87-.02.91-.01c.82 0 1.5.1 2.06.31.5.17.96.45 1.34.82.32.32.57.71.73 1.14.15.42.23.85.23 1.3 0 .86-.2 1.57-.6 2.13zm6.82-3.15v1.95c0 .08-.05.11-.16.11a4.35 4.35 0 00-1.92.37c-.19.09-.37.21-.51.37v5.1c0 .1-.04.14-.13.14h-1.97a.14.14 0 01-.16-.12v-5.58l-.01-.75-.02-.78c0-.23-.02-.45-.04-.68a.1.1 0 01.07-.11h1.78c.1 0 .18.07.2.16a3.03 3.03 0 01.13.92c.3-.35.67-.64 1.08-.86a3.1 3.1 0 011.52-.39c.07-.01.13.04.14.11v.04z" },
    { name: "Adobe XD", path: "M4.25.3C1.9.3 0 2.2 0 4.55v14.9c0 2.35 1.9 4.25 4.25 4.25h15.5c2.35 0 4.25-1.9 4.25-4.25V4.55C24 2.2 22.1.3 19.75.3Zm14.07 5.13h2.03c.05-.01.09.03.1.07v9.54c0 .18.01.38.02.6.02.21.03.41.04.58 0 .07-.03.13-.1.16-.52.22-1.07.38-1.63.48-.51.09-1.02.14-1.54.14-.74.01-1.48-.14-2.15-.45-.63-.29-1.15-.77-1.51-1.36-.37-.61-.55-1.37-.55-2.28a4.107 4.107 0 0 1 2.14-3.66c.7-.39 1.54-.58 2.53-.58.05 0 .12 0 .21.01s.19.01.31.02V5.54c0-.07.03-.11.1-.11zM3.68 6.3h2.27c.05 0 .1.01.14.02.04.02.07.05.1.09.19.43.41.86.64 1.29.24.43.47.85.72 1.27.24.42.46.84.67 1.27h.02c.21-.44.43-.87.65-1.29.22-.42.45-.84.68-1.26.23-.42.45-.85.67-1.26.01-.04.03-.08.06-.1a.19.19 0 0 1 .13-.02h2.11c.05-.01.1.02.11.07.01.01-.01.05-.03.07l-3 4.95 3.2 5.25c.02.04.03.08.02.12-.01.04-.05.01-.11.02h-2.29c-.16 0-.27-.01-.34-.11-.21-.42-.43-.83-.64-1.25-.21-.41-.44-.83-.68-1.26-.24-.43-.48-.86-.72-1.3h-.02c-.21.43-.44.86-.67 1.29-.23.43-.46.86-.68 1.28-.23.42-.46.85-.69 1.26-.04.1-.12.11-.23.11h-2.2c-.04 0-.07.02-.07-.03a.14.14 0 0 1 .02-.11l3.11-5.1L3.6 6.44c-.03-.04-.04-.08-.02-.1.02-.03.06-.04.1-.04zm13.94 4.23c-.39 0-.78.08-1.13.26-.34.17-.63.42-.85.74-.22.32-.33.75-.33 1.27-.01.35.05.7.17 1.03.1.27.25.51.45.71.19.18.42.32.68.4.27.09.55.13.83.13.15 0 .29-.01.42-.02.13.01.24-.01.36-.05v-4.4c-.09-.02-.18-.04-.27-.05-.11-.01-.22-.02-.33-.02Z" },
    { name: "Canva", path: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zM6.962 7.68c.754 0 1.337.549 1.405 1.2.069.583-.171 1.097-.822 1.406-.343.171-.48.172-.549.069-.034-.069 0-.137.069-.206.617-.514.617-.926.548-1.508-.034-.378-.308-.618-.583-.618-1.2 0-2.914 2.674-2.674 4.629.103.754.549 1.646 1.509 1.646.308 0 .65-.103.96-.24.5-.264.799-.47 1.097-.8-.073-.885.704-2.046 1.851-2.046.515 0 .926.205.96.583.068.514-.377.582-.514.582s-.378-.034-.378-.17c-.034-.138.309-.07.275-.378-.035-.206-.24-.274-.446-.274-.72 0-1.131.994-1.029 1.611.035.275.172.549.447.549.205 0 .514-.31.617-.755.068-.308.343-.514.583-.514.102 0 .17.034.205.171v.138c-.034.137-.137.548-.102.651 0 .069.034.171.17.171.092 0 .436-.18.777-.459.117-.59.253-1.298.253-1.357.034-.24.137-.48.617-.48.103 0 .171.034.205.171v.138l-.136.617c.445-.583 1.097-.994 1.508-.994.172 0 .309.102.309.274 0 .103 0 .274-.069.446-.137.377-.309.96-.412 1.474 0 .137.035.274.207.274.171 0 .685-.206 1.096-.754l.007-.004c-.002-.068-.007-.134-.007-.202 0-.411.035-.754.104-.994.068-.274.411-.514.617-.514.103 0 .205.069.205.171 0 .035 0 .103-.034.137-.137.446-.24.857-.24 1.269 0 .24.034.582.102.788 0 .034.035.069.07.069.068 0 .548-.445.89-1.028-.308-.206-.48-.549-.48-.96 0-.72.446-1.097.858-1.097.343 0 .617.24.617.72 0 .308-.103.65-.274.96h.102a.77.77 0 0 0 .584-.24.293.293 0 0 1 .134-.117c.335-.425.83-.74 1.41-.74.48 0 .924.205.959.582.068.515-.378.618-.515.618l-.002-.002c-.138 0-.377-.035-.377-.172 0-.137.309-.068.274-.376-.034-.206-.24-.275-.446-.275-.686 0-1.13.891-1.028 1.611.034.275.171.583.445.583.206 0 .515-.308.652-.754.068-.274.343-.514.583-.514.103 0 .17.034.205.171 0 .069 0 .206-.137.652-.17.308-.171.48-.137.617.034.274.171.48.309.583.034.034.068.102.068.102 0 .069-.034.138-.137.138-.034 0-.068 0-.103-.035-.514-.205-.72-.548-.789-.891-.205.24-.445.377-.72.377-.445 0-.89-.411-.96-.926a1.609 1.609 0 0 1 .075-.649c-.203.13-.422.203-.623.203h-.17c-.447.652-.927 1.098-1.27 1.303a.896.896 0 0 1-.377.104c-.068 0-.171-.035-.205-.104-.095-.152-.156-.392-.193-.667-.481.527-1.145.805-1.453.805-.343 0-.548-.206-.582-.55v-.376c.102-.754.377-1.2.377-1.337a.074.074 0 0 0-.069-.07c-.24 0-1.028.824-1.166 1.373l-.103.445c-.068.309-.377.515-.582.515-.103 0-.172-.035-.206-.172v-.137l.046-.233c-.435.31-.87.508-1.075.508-.308 0-.48-.172-.514-.412-.206.274-.445.412-.754.412-.352 0-.696-.24-.862-.593-.244.275-.523.553-.852.764-.48.309-1.028.549-1.68.549-.582 0-1.097-.309-1.371-.583-.412-.377-.651-.96-.686-1.509-.205-1.68.823-3.84 2.4-4.8.378-.205.755-.343 1.132-.343zm9.77 3.291c-.104 0-.172.172-.172.343 0 .274.137.583.309.755a1.74 1.74 0 0 0 .102-.583c0-.343-.137-.515-.24-.515z" },
    { name: "WordPress", path: "M21.469 6.825c.84 1.537 1.318 3.3 1.318 5.175 0 3.979-2.156 7.456-5.363 9.325l3.295-9.527c.615-1.54.82-2.771.82-3.864 0-.405-.026-.78-.07-1.11m-7.981.105c.647-.03 1.232-.105 1.232-.105.582-.075.514-.93-.067-.899 0 0-1.755.135-2.88.135-1.064 0-2.85-.15-2.85-.15-.585-.03-.661.855-.075.885 0 0 .54.061 1.125.09l1.68 4.605-2.37 7.08L5.354 6.9c.649-.03 1.234-.1 1.234-.1.585-.075.516-.93-.065-.896 0 0-1.746.138-2.874.138-.2 0-.438-.008-.69-.015C4.911 3.15 8.235 1.215 12 1.215c2.809 0 5.365 1.072 7.286 2.833-.046-.003-.091-.009-.141-.009-1.06 0-1.812.923-1.812 1.914 0 .89.513 1.643 1.06 2.531.411.72.89 1.643.89 2.977 0 .915-.354 1.994-.821 3.479l-1.075 3.585-3.9-11.61.001.014zM12 22.784c-1.059 0-2.081-.153-3.048-.437l3.237-9.406 3.315 9.087c.024.053.05.101.078.149-1.12.393-2.325.609-3.582.609M1.211 12c0-1.564.336-3.05.935-4.39L7.29 21.709C3.694 19.96 1.212 16.271 1.211 12M12 0C5.385 0 0 5.385 0 12s5.385 12 12 12 12-5.385 12-12S18.615 0 12 0" },
    { name: "Elementor", path: "M12 0C5.372 0 0 5.372 0 12c0 6.626 5.372 12 12 12s12-5.372 12-12c0-6.626-5.372-12-12-12ZM9 17H7V7H9Zm8 0H11V15h6Zm0-4H11V11h6Zm0-4H11V7h6Z" },
    { name: "HTML5", path: "M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z" },
    { name: "CSS3", path: "M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm17.09 4.413L5.41 4.41l.213 2.622 10.125.002-.255 2.716h-6.64l.24 2.573h6.182l-.366 3.523-2.91.804-2.956-.81-.188-2.11h-2.61l.29 3.855L12 19.288l5.373-1.53L18.59 4.414z" },
    { name: "Mailchimp", path: "M11.267 0C6.791-.015-1.82 10.246 1.397 12.964l.79.669a3.88 3.88 0 0 0-.22 1.792c.084.84.518 1.644 1.22 2.266.666.59 1.542.964 2.392.964 1.406 3.24 4.62 5.228 8.386 5.34 4.04.12 7.433-1.776 8.854-5.182.093-.24.488-1.316.488-2.267 0-.956-.54-1.352-.885-1.352-.01-.037-.078-.286-.172-.586-.093-.3-.19-.51-.19-.51.375-.563.382-1.065.332-1.35-.053-.353-.2-.653-.496-.964-.296-.311-.902-.63-1.753-.868l-.446-.124c-.002-.019-.024-1.053-.043-1.497-.014-.32-.042-.822-.197-1.315-.186-.668-.508-1.253-.911-1.627 1.112-1.152 1.806-2.422 1.804-3.511-.003-2.095-2.576-2.729-5.746-1.416l-.672.285A678.22 678.22 0 0 0 12.7.504C12.304.159 11.817.002 11.267 0zm.073.873c.166 0 .322.019.465.058.297.084 1.28 1.224 1.28 1.224s-1.826 1.013-3.52 2.426c-2.28 1.757-4.005 4.311-5.037 7.082-.811.158-1.526.618-1.963 1.253-.261-.218-.748-.64-.834-.804-.698-1.326.761-3.902 1.781-5.357C5.834 3.44 9.37.867 11.34.873zm3.286 3.273c.04-.002.06.05.028.074-.143.11-.299.26-.413.414a.04.04 0 0 0 .031.064c.659.004 1.587.235 2.192.574.041.023.012.103-.034.092-.915-.21-2.414-.369-3.97.01-1.39.34-2.45.863-3.224 1.426-.04.028-.086-.023-.055-.06.896-1.035 1.999-1.935 2.987-2.44.034-.018.07.019.052.052-.079.143-.23.447-.278.678-.007.035.032.063.062.042.615-.42 1.684-.868 2.622-.926zm3.023 3.205l.056.001a.896.896 0 0 1 .456.146c.534.355.61 1.216.638 1.845.015.36.059 1.229.074 1.478.034.571.184.651.487.751.17.057.33.098.563.164.706.198 1.125.4 1.39.658.157.162.23.333.253.497.083.608-.472 1.36-1.942 2.041-1.607.746-3.557.935-4.904.785l-.471-.053c-1.078-.145-1.693 1.247-1.046 2.201.417.615 1.552 1.015 2.688 1.015 2.604 0 4.605-1.111 5.35-2.072a.987.987 0 0 0 .06-.085c.036-.055.006-.085-.04-.054-.608.416-3.31 2.069-6.2 1.571 0 0-.351-.057-.672-.182-.255-.1-.788-.344-.853-.891 2.333.72 3.801.039 3.801.039a.072.072 0 0 0 .042-.072.067.067 0 0 0-.074-.06s-1.911.283-3.718-.378c.197-.64.72-.408 1.51-.345a11.045 11.045 0 0 0 3.647-.394c.818-.234 1.892-.697 2.727-1.356.281.618.38 1.299.38 1.299s.219-.04.4.073c.173.106.299.326.213.895-.176 1.063-.628 1.926-1.387 2.72a5.714 5.714 0 0 1-1.666 1.244c-.34.18-.704.334-1.087.46-2.863.935-5.794-.093-6.739-2.3a3.545 3.545 0 0 1-.189-.522c-.403-1.455-.06-3.2 1.008-4.299.065-.07.132-.153.132-.256 0-.087-.055-.179-.102-.243-.374-.543-1.669-1.466-1.409-3.254.187-1.284 1.31-2.189 2.357-2.135.089.004.177.01.266.015.453.027.85.085 1.223.1.625.028 1.187-.063 1.853-.618.225-.187.405-.35.71-.401.028-.005.092-.028.215-.028zm.022 2.18a.42.42 0 0 0-.06.005c-.335.054-.347.468-.228 1.04.068.32.187.595.32.765.175-.02.343-.022.498 0 .089-.205.104-.557.024-.942-.112-.535-.261-.872-.554-.868zm-3.66 1.546a1.724 1.724 0 0 0-1.016.326c-.16.117-.311.28-.29.378.008.032.031.056.088.063.131.015.592-.217 1.122-.25.374-.023.684.094.923.2.239.104.386.173.443.113.037-.038.026-.11-.031-.204-.118-.192-.36-.387-.618-.497a1.601 1.601 0 0 0-.621-.129zm4.082.81c-.171-.003-.313.186-.317.42-.004.236.131.43.303.432.172.003.314-.185.318-.42.004-.236-.132-.429-.304-.432zm-3.58.172c-.05 0-.102.002-.155.008-.311.05-.483.152-.593.247-.094.082-.152.173-.152.237a.075.075 0 0 0 .075.076c.07 0 .228-.063.228-.063a1.98 1.98 0 0 1 1.001-.104c.157.018.23.027.265-.026.01-.016.022-.049-.01-.1-.063-.103-.311-.269-.66-.275zm2.26.4c-.127 0-.235.051-.283.148-.075.154.035.363.246.466.21.104.443.063.52-.09.075-.155-.035-.364-.246-.467a.542.542 0 0 0-.237-.058zm-11.635.024c.048 0 .098 0 .149.003.73.04 1.806.6 2.052 2.19.217 1.41-.128 2.843-1.449 3.069-.123.02-.248.029-.374.026-1.22-.033-2.539-1.132-2.67-2.435-.145-1.44.591-2.548 1.894-2.811.117-.024.252-.04.398-.042zm-.07.927a1.144 1.144 0 0 0-.847.364c-.38.418-.439.988-.366 1.19.027.073.07.094.1.098.064.008.16-.039.22-.2a1.2 1.2 0 0 0 .017-.052 1.58 1.58 0 0 1 .157-.37.689.689 0 0 1 .955-.199c.266.174.369.5.255.81-.058.161-.154.469-.133.721.043.511.357.717.64.738.274.01.466-.143.515-.256.029-.067.005-.107-.011-.125-.043-.053-.113-.037-.18-.021a.638.638 0 0 1-.16.022.347.347 0 0 1-.294-.148c-.078-.12-.073-.3.013-.504.011-.028.025-.058.04-.092.138-.308.368-.825.11-1.317-.195-.37-.513-.602-.894-.65a1.135 1.135 0 0 0-.138-.01z" },
    { name: "Meta Business Suite", path: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" },
    { name: "Google Analytics", path: "M22.84 2.9982v17.9987c.0086 1.6473-1.3197 2.9897-2.967 2.9984a2.9808 2.9808 0 01-.3677-.0208c-1.528-.226-2.6477-1.5558-2.6105-3.1V3.1204c-.0369-1.5458 1.0856-2.8762 2.6157-3.1 1.6361-.1915 3.1178.9796 3.3093 2.6158.014.1201.0208.241.0202.3619zM4.1326 18.0548c-1.6417 0-2.9726 1.331-2.9726 2.9726C1.16 22.6691 2.4909 24 4.1326 24s2.9726-1.3309 2.9726-2.9726-1.331-2.9726-2.9726-2.9726zm7.8728-9.0098c-.0171 0-.0342 0-.0513.0003-1.6495.0904-2.9293 1.474-2.891 3.1256v7.9846c0 2.167.9535 3.4825 2.3505 3.763 1.6118.3266 3.1832-.7152 3.5098-2.327.04-.1974.06-.3983.0593-.5998v-8.9585c.003-1.6474-1.33-2.9852-2.9773-2.9882z" },
    { name: "Google Workspace", path: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" },
    { name: "Notion", path: "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" },
    { name: "Slack", path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" },
    { name: "Jira", path: "M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z" },
    { name: "Trello", path: "M21.147 0H2.853A2.86 2.86 0 000 2.853v18.294A2.86 2.86 0 002.853 24h18.294A2.86 2.86 0 0024 21.147V2.853A2.86 2.86 0 0021.147 0zM10.34 17.287a.953.953 0 01-.953.953h-4a.954.954 0 01-.954-.953V5.38a.953.953 0 01.954-.953h4a.954.954 0 01.953.953zm9.233-5.467a.944.944 0 01-.953.947h-4a.947.947 0 01-.953-.947V5.38a.953.953 0 01.953-.953h4a.954.954 0 01.953.953z" },
    { name: "Miro", path: "M17.392 0H13.9L17 4.808 10.444 0H6.949l3.102 6.3L3.494 0H0l3.05 8.131L0 24h3.494L10.05 6.985 6.949 24h3.494L17 5.494 13.899 24h3.493L24 3.672 17.392 0z" },
    { name: "Framer", path: "M4 0h16v8h-8zM4 8h8l8 8H4zM4 16h8v8z" },
    { name: "Visual Studio Code", path: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" },
    { name: "ChatGPT", path: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" },
    { name: "Claude", path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
    { name: "Gemini", path: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" },
]

/* Official brand colours per tool — the monochrome glyphs are tinted to each
   brand's colour and shown on light cards. Any unmatched name falls back to a
   neutral ink so the layout is always safe. */
const TOOL_COLORS: Record<string, string> = {
    "Figma": "#F24E1E",
    "FigJam": "#A259FF",
    "Adobe Photoshop": "#31A8FF",
    "Photoshop": "#31A8FF",
    "Adobe Illustrator": "#FF9A00",
    "Illustrator": "#FF9A00",
    "Adobe InDesign": "#FF3366",
    "InDesign": "#FF3366",
    "Adobe After Effects": "#9999FF",
    "After Effects": "#9999FF",
    "Adobe Premiere Pro": "#9999FF",
    "Premiere Pro": "#9999FF",
    "Adobe XD": "#FF61F6",
    "Canva": "#00C4CC",
    "WordPress": "#21759B",
    "Elementor": "#92003B",
    "HTML5": "#E34F26",
    "CSS3": "#1572B6",
    "Mailchimp": "#D8A800",
    "Meta Business Suite": "#0081FB",
    "Google Analytics": "#E8710A",
    "Google Workspace": "#4285F4",
    "Notion": "#111111",
    "Slack": "#4A154B",
    "Jira": "#0052CC",
    "Trello": "#0079BF",
    "Miro": "#D8A400",
    "Framer": "#0055FF",
    "Visual Studio Code": "#007ACC",
    "ChatGPT": "#0DA37F",
    "Claude": "#D97757",
    "Gemini": "#1C69FF",
}
const TOOL_INK = "#1a1a17"

/* ---------------------------------------------------------------------------
   CERTIFICATES — infinite monochrome marquee of certificate providers.
   Placeholder wordmarks for now; drop-in real B/W logo files later by adding
   a `src` to any entry (the component renders the image instead of the text).
--------------------------------------------------------------------------- */
const LOGOS: { name: string; src?: string; big?: boolean }[] = [
    { name: "Adobe", src: "/portfolio/assets/CtbVBDhBotXnKJtHKhMtcUqOY.png", big: true },
    { name: "Google", src: "data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDEzOS45IDQ0IiBzdHlsZT0iZW5hYmxlLWJhY2tncm91bmQ6bmV3IDAgMCAxMzkuOSA0NDsiIHhtbDpzcGFjZT0icHJlc2VydmUiPgogPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KICAuc3Qwe2ZpbGw6IzQyODVGNDt9Cgkuc3Qxe2ZpbGw6I0VBNDMzNTt9Cgkuc3Qye2ZpbGw6I0ZCQkMwNTt9Cgkuc3Qze2ZpbGw6IzM0QTg1Mzt9CiA8L3N0eWxlPgogPGc+CiAgPHBhdGggY2xhc3M9InN0MCIgZD0iTTE3LjUsMTUuN3Y0LjdoMTEuM2MtMC4zLDIuNi0xLjIsNC42LTIuNiw1LjljLTEuNiwxLjYtNC4yLDMuNC04LjcsMy40Yy02LjksMC0xMi4zLTUuNi0xMi4zLTEyLjUKCQlTMTAuNSw0LjcsMTcuNSw0LjdjMy43LDAsNi41LDEuNSw4LjUsMy40bDMuMy0zLjNDMjYuNSwyLjEsMjIuNywwLDE3LjUsMEM4LDAsMCw3LjcsMCwxNy4yczgsMTcuMiwxNy41LDE3LjJjNS4xLDAsOS0xLjcsMTItNC44CgkJYzMuMS0zLjEsNC4xLTcuNSw0LjEtMTFjMC0xLjEtMC4xLTIuMS0wLjItMi45SDE3LjV6Ij4KICA8L3BhdGg+CiAgPHBhdGggY2xhc3M9InN0MSIgZD0iTTQ3LjYsMTEuOGMtNi4xLDAtMTEuMiw0LjctMTEuMiwxMS4xYzAsNi40LDUsMTEuMSwxMS4yLDExLjFTNTguOCwyOS40LDU4LjgsMjMKCQlDNTguOCwxNi41LDUzLjgsMTEuOCw0Ny42LDExLjh6IE00Ny42LDI5LjdjLTMuNCwwLTYuMy0yLjgtNi4zLTYuN2MwLTQsMi45LTYuNyw2LjMtNi43YzMuNCwwLDYuMywyLjcsNi4zLDYuNwoJCUM1My45LDI2LjksNTEsMjkuNyw0Ny42LDI5Ljd6Ij4KICA8L3BhdGg+CiAgPHBhdGggY2xhc3M9InN0MCIgZD0iTTEwMi4zLDE0LjNoLTAuMmMtMS4xLTEuMy0zLjItMi41LTUuOS0yLjVjLTUuNiwwLTEwLjQsNC44LTEwLjQsMTEuMWMwLDYuMiw0LjgsMTEuMSwxMC40LDExLjEKCQljMi43LDAsNC44LTEuMiw1LjktMi41aDAuMnYxLjZjMCw0LjItMi4zLDYuNS01LjksNi41Yy0zLDAtNC44LTIuMS01LjYtNGwtNC4yLDEuOGMxLjIsMi45LDQuNSw2LjYsOS45LDYuNgoJCWM1LjcsMCwxMC42LTMuNCwxMC42LTExLjZ2LTIwaC00LjZWMTQuM3ogTTk2LjcsMjkuN2MtMy40LDAtNS45LTIuOS01LjktNi43YzAtMy45LDIuNi02LjcsNS45LTYuN2MzLjMsMCw1LjksMi45LDUuOSw2LjgKCQlDMTAyLjcsMjYuOSwxMDAuMSwyOS43LDk2LjcsMjkuN3oiPgogIDwvcGF0aD4KICA8cGF0aCBjbGFzcz0ic3QyIiBkPSJNNzIuNSwxMS44Yy02LjEsMC0xMS4yLDQuNy0xMS4yLDExLjFjMCw2LjQsNSwxMS4xLDExLjIsMTEuMVM4My43LDI5LjQsODMuNywyMwoJCUM4My43LDE2LjUsNzguNywxMS44LDcyLjUsMTEuOHogTTcyLjUsMjkuN2MtMy40LDAtNi4zLTIuOC02LjMtNi43YzAtNCwyLjktNi43LDYuMy02LjdzNi4zLDIuNyw2LjMsNi43CgkJQzc4LjgsMjYuOSw3NS45LDI5LjcsNzIuNSwyOS43eiI+CiAgPC9wYXRoPgogIDxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0xMTAuOCwwLjVoNC44djMzLjZoLTQuOFYwLjV6Ij4KICA8L3BhdGg+CiAgPHBhdGggY2xhc3M9InN0MSIgZD0iTTEzMC40LDI5LjdjLTIuNSwwLTQuMi0xLjEtNS40LTMuNGwxNC45LTYuMWwtMC41LTEuM2MtMC45LTIuNS0zLjgtNy4xLTkuNS03LjFjLTUuNywwLTEwLjUsNC41LTEwLjUsMTEuMQoJCWMwLDYuMiw0LjcsMTEuMSwxMSwxMS4xYzUuMSwwLDgtMy4xLDkuMy00LjlsLTMuOC0yLjVDMTM0LjYsMjguNSwxMzIuOSwyOS43LDEzMC40LDI5LjdMMTMwLjQsMjkuN3ogTTEzMC4xLDE2YzIsMCwzLjcsMSw0LjIsMi40CgkJbC0xMCw0LjJDMTI0LjIsMTgsMTI3LjYsMTYsMTMwLjEsMTZ6Ij4KICA8L3BhdGg+CiA8L2c+Cjwvc3ZnPg==" },
    { name: "McKinsey & Company", src: "data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4bWxuczp4PSJuc19leHRlbmQ7IiB4bWxuczppPSJuc19haTsiIHhtbG5zOmdyYXBoPSJuc19ncmFwaHM7IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB4PSIwcHgiIHk9IjBweCIgdmlld0JveD0iMCAwIDE3MS41IDUzLjMiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDE3MS41IDUzLjM7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KIDxtZXRhZGF0YT4KICA8c2Z3IHhtbG5zPSJuc19zZnc7Ij4KICAgPHNsaWNlcz4KICAgPC9zbGljZXM+CiAgIDxzbGljZVNvdXJjZUJvdW5kcyBib3R0b21MZWZ0T3JpZ2luPSJ0cnVlIiBoZWlnaHQ9IjUzLjMiIHdpZHRoPSIxNzEuNSIgeD0iMTE0LjUiIHk9Ii0yMjYuOCI+CiAgIDwvc2xpY2VTb3VyY2VCb3VuZHM+CiAgPC9zZnc+CiA8L21ldGFkYXRhPgogPGc+CiAgPGc+CiAgIDxwYXRoIGQ9Ik0yLjUsMi41QzIuNSwyLjEsMS40LDEsMSwxSDBWMGg1LjhsNiwxNS4xaDAuMUwxOC4yLDBoNS4ydjFoLTFjLTAuNCwwLTEuNSwxLjEtMS41LDEuNXYxNWMwLDAuNCwxLjIsMS41LDEuNSwxLjVoMXYxCgkJCWgtNy43di0xaDFjMC40LDAsMS41LTEuMSwxLjUtMS41VjIuOUwxMSwyMC4zTDMuNywyLjZ2MTQuOGMwLDAuNCwxLjIsMS41LDEuNSwxLjVoMXYxSDB2LTFoMWMwLjQsMCwxLjUtMS4xLDEuNS0xLjVWMi41eiI+CiAgIDwvcGF0aD4KICAgPHBhdGggZD0iTTMxLjksMTEuNGMwLjQtMiwwLTMuOC0yLjItMy44Yy0yLjYsMC0zLjgsMi4xLTMuOCw1LjFjMCwyLjksMS44LDUuMyw0LjgsNS4zYzIuMiwwLDMuMi0wLjgsNC4xLTIuM2gwLjgKCQkJYy0wLjgsMi44LTIuNiw0LjYtNS44LDQuNmMtMy42LDAtNS45LTMuMS01LjktNi43YzAtNC4yLDIuOC02LjksNi4yLTYuOWMyLDAsMy40LDAuNiw0LjYsMS44bC0xLjksMi45TDMxLjksMTEuNHoiPgogICA8L3BhdGg+CiAgIDxwYXRoIGQ9Ik01OCwzLjljMSwwLDEuNy0wLjcsMS43LTEuN1M1OC45LDAuNiw1OCwwLjZjLTEsMC0xLjcsMC42LTEuNywxLjZTNTcsMy45LDU4LDMuOSI+CiAgIDwvcGF0aD4KICAgPHBhdGggZD0iTTc2LjMsMTljLTAuNCwwLTEuNC0wLjktMS40LTEuNHYtNy4yYzAtMi4yLTEuNi0zLjctMy42LTMuN2MtMi4zLDAtMy41LDEuMy01LjEsMi45TDY1LjcsN2gtNC4xdjFoMC44CgkJCWMwLjQsMCwxLjQsMSwxLjQsMS40djguM2MwLDAuNC0xLDEuNC0xLjQsMS40aC0wLjhoLTAuOGMtMC40LDAtMS40LTAuOS0xLjQtMS40VjdoLTQuNnYxaDAuOEM1Niw4LDU3LDguOSw1Nyw5LjN2OC4zCgkJCWMwLDAuNC0xLDEuNC0xLjQsMS40aC0wLjhoLTAuN2MtMC40LDAtMi0xLjItMi40LTEuN2wtNy05LjNsNC45LTUuMkM0OS45LDIuNSw1MS44LDEsNTIuMiwxaDFWMGgtNy4ydjFoMWMwLjQsMCwxLjUsMS40LDEuMiwxLjcKCQkJbC03LjEsOFYyLjVjMC0wLjQsMS4yLTEuNSwxLjUtMS41aDFWMGgtNy44djFoMWMwLjQsMCwxLjUsMS4xLDEuNSwxLjV2MTVjMCwwLjQtMS4yLDEuNS0xLjUsMS41aC0xdjFoNy44di0xaC0xCgkJCWMtMC40LDAtMS41LTEuMS0xLjUtMS41di01LjNsMi0yLjJsNi45LDEwaDQuOWg2LjloNi44di0xaC0wLjdjLTAuNCwwLTEuNC0wLjktMS40LTEuNFYxMWMwLTAuOSwyLjQtMi43LDQuMi0yLjcKCQkJYzEuNCwwLDIuMSwxLDIuMSwyLjJ2Ny4xYzAsMC40LTEsMS40LTEuNCwxLjRoLTAuN3YxSDc3di0xSDc2LjN6Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNNzguNywxNS40YzAsMS4yLDEuOCwzLjgsNC42LDMuOGMxLjYsMCwyLjUtMC42LDIuNS0xLjhjMC0xLjUtMS4zLTEuOS0yLjQtMi40Yy0wLjktMC40LTEuNi0wLjctMi43LTEuMgoJCQljLTEuNi0wLjctMi43LTEuOC0yLjctMy41YzAtMi4zLDEuNC0zLjcsMy45LTMuN2MxLjQsMCwyLjIsMC43LDMuMiwwLjdjMC40LDAsMC42LTAuMSwwLjctMC40aDAuN3Y0aC0wLjhjMC0xLjEtMS41LTMuMy0zLjktMy4zCgkJCWMtMS41LDAtMi4yLDAuNy0yLjIsMS43YzAsMS4xLDAuOCwxLjUsMi4xLDIuMWMxLDAuNCwxLjcsMC43LDIuOCwxLjJjMS40LDAuNSwzLDEuNywzLDMuOGMwLDIuNS0xLjcsMy45LTQuMSwzLjkKCQkJYy0xLjYsMC0yLjYtMC44LTMuNy0wLjhjLTAuNSwwLTAuNywwLjEtMSwwLjRoLTAuNnYtNC42SDc4Ljd6Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNODguMiwxMy41YzAtMy44LDIuNi02LjgsNi02LjhjMi45LDAsNC42LDIsNC43LDQuNmwwLjEsMC45bC04LjYsMC43YzAsMi42LDEuOCw1LjIsNC43LDUuMmMyLjIsMCwzLjItMC44LDQtMi4zaDAuOAoJCQljLTAuOSwyLjgtMi41LDQuNi01LjYsNC42QzkwLjYsMjAuMyw4OC4yLDE3LjEsODguMiwxMy41IE05Ni43LDExLjRjMC4yLTEuOC0wLjEtMy43LTIuNi0zLjdjLTIuNywwLTMuOCwyLjItMy44LDQuMkw5Ni43LDExLjR6Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNMTAxLjIsOS40QzEwMSw5LDk5LjgsOCw5OS41LDhoLTAuNlY3aDYuOXYxSDEwNWMtMC40LDAtMS4yLDAuOS0xLjIsMS40bDMsNi45bDMtNi45YzAtMC41LTAuOC0xLjQtMS4xLTEuNGgtMC44VjdoNS4ydjEKCQkJaC0wLjZjLTAuMywwLTEuMiwxLTEuNSwxLjRsLTQuNCwxMGwtMy4zLDcuMmwtMS4yLTAuNWwzLjUtNy4xTDEwMS4yLDkuNHoiPgogICA8L3BhdGg+CiAgIDxwYXRoIGQ9Ik0zOC42LDMwLjNjMCwxLjYsMS4xLDIuOSwyLjgsMy41YzIuNiwyLjgsNS43LDUuNyw4LjQsOC4xYzAuOC0xLjMsMS0yLjYsMS00LjNjMC0xLjgtMS4yLTIuOS0zLjItM3YtMWg3LjF2MUg1NAoJCQljLTAuNCwwLTEuOCwxLjYtMS44LDIuMmMtMC4xLDEuNy0wLjUsMy44LTEuOCw1LjZjMS41LDEuMywyLjksMi40LDQuMSwzLjJoMS4ydjFoLTIuMmMtMS45LDAtMy4zLTAuNS01LTIKCQkJYy0xLjYsMS41LTMuNiwyLjQtNi42LDIuNGMtMy4yLDAtNi4zLTIuNC02LjMtNS45YzAtMi44LDEuNC00LjgsMy4yLTYuMWMtMS0xLjItMS42LTIuNC0xLjYtNC4yYzAtMi45LDEuOS00LjQsNC44LTQuNAoJCQljMS44LDAsMi44LDAuNiwzLjYsMC42YzAuNCwwLDAuNywwLDAuOS0wLjRoMC45djQuN2gtMC45YzAtMS4zLTItNC00LjYtNEMzOS45LDI3LjQsMzguNiwyOC41LDM4LjYsMzAuMyBNMzcuNywzOS45CgkJCWMwLDIuOSwzLDUuNiw1LjksNS42YzEuOCwwLDMuMi0wLjUsNC4zLTEuM2MtMi45LTIuNS02LjEtNS42LTguNi04LjVDMzguMywzNi43LDM3LjcsMzcuOCwzNy43LDM5LjkiPgogICA8L3BhdGg+CiAgIDxwYXRoIGQ9Ik03Ni4yLDMzLjhjMC0yLjEtMi4zLTYuMi02LjEtNi4yYy0zLjUsMC01LjUsMS45LTUuOSw2LjRjLTAuMSwxLjgtMC4xLDMuMywwLjEsNS4xYzAuMywzLjUsMi43LDYuNCw2LjgsNi40CgkJCWMzLjUsMCw1LjEtMS41LDYuNC00LjFoMWMtMS4zLDMuNi00LjEsNS43LTguMSw1LjdjLTUuNywwLTkuNC00LjctOS40LTEwLjRjMC01LjcsMy4zLTEwLjMsOC45LTEwLjNjMi4xLDAsMy41LDAuOSw1LDAuOQoJCQljMC42LDAsMC45LTAuMiwxLjItMC41SDc3djcuMUg3Ni4yeiI+CiAgIDwvcGF0aD4KICAgPHBhdGggZD0iTTc5LjksNDAuMmMwLTQuMiwzLTYuOCw2LjQtNi44YzMuNCwwLDYuNCwyLjYsNi40LDYuOGMwLDQuMi0zLDYuOS02LjQsNi45QzgyLjksNDcuMSw3OS45LDQ0LjQsNzkuOSw0MC4yIE05MC4yLDQyLjQKCQkJYzAuMi0xLjMsMC4yLTMuMSwwLTQuNGMtMC4yLTIuMS0xLjQtMy41LTMuOC0zLjVjLTIuMywwLTMuNSwxLjQtMy44LDMuNWMtMC4yLDEuMy0wLjIsMy4xLDAsNC40YzAuMywyLDEuNCwzLjUsMy44LDMuNQoJCQlDODguOCw0NS44LDkwLDQ0LjQsOTAuMiw0Mi40Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNMTEzLjgsNDQuM2MwLDAuNCwxLDEuNCwxLjQsMS40aDAuNnYxaC02LjV2LTFoMC43YzAuNCwwLDEuNC0wLjksMS40LTEuNHYtNy4yYzAtMS4zLTAuNi0yLjEtMi0yLjEKCQkJYy0xLjcsMC0zLjgsMS42LTMuOCwyLjV2Ni44YzAsMC40LDEsMS40LDEuNCwxLjRoMC43djFoLTYuNnYtMWgwLjdjMC40LDAsMS40LTAuOSwxLjQtMS40di03LjJjMC0xLjMtMC43LTIuMS0yLjEtMi4xCgkJCWMtMS43LDAtMy44LDEuNy0zLjgsMi42djYuN2MwLDAuNCwxLDEuNCwxLjQsMS40aDAuN3YxaC02LjZ2LTFoMC43YzAuNCwwLDEuNC0wLjksMS40LTEuNHYtOC4zYzAtMC40LTEtMS40LTEuNC0xLjRoLTAuN3YtMWg0CgkJCWwwLjUsMi41YzEuNS0xLjYsMi40LTIuOCw0LjctMi44YzEuNywwLDMuMiwwLjksMy40LDIuN2MxLjYtMS42LDIuNi0yLjcsNC44LTIuN2MxLjksMCwzLjUsMS4zLDMuNSwzLjdWNDQuM3oiPgogICA8L3BhdGg+CiAgIDxwYXRoIGQ9Ik0xMTkuNiwzMy43bDAuNCwyLjdjMS4xLTIuMSwyLjUtMyw0LjctM2MzLjIsMCw1LjEsMi43LDUuMSw2LjZzLTIuMiw3LTUuMyw3Yy0yLjMsMC0zLjUtMC45LTQuNC0yLjZ2Ni4yCgkJCWMwLDAuNCwxLDEuNCwxLjQsMS40aDAuOXYxaC02Ljl2LTFoMC45YzAuNCwwLDEuNC0wLjksMS40LTEuNFYzNi4xYzAtMC40LTEtMS40LTEuNC0xLjRoLTAuOXYtMUgxMTkuNnogTTEyMC4xLDM4LjR2My40CgkJCWMwLDIsMS42LDMuOCwzLjgsMy44YzIuMiwwLDMuMy0xLjQsMy41LTMuNWMwLjItMS4yLDAuMi0yLjcsMC0zLjljLTAuMy0yLjEtMS40LTMuNC0zLjMtMy40QzEyMS45LDM0LjksMTIwLjcsMzYuNCwxMjAuMSwzOC40Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNMTU4LDQ1LjdjLTAuNCwwLTEuNC0wLjktMS40LTEuNHYtNy4yYzAtMi4yLTEuNi0zLjctMy42LTMuN2MtMi4zLDAtMy41LDEuMy01LjEsMi45bC0wLjUtMi43aC00LjF2MWgwLjgKCQkJYzAuNCwwLDEuNCwxLDEuNCwxLjR2OC4zYzAsMC40LTEsMS40LTEuNCwxLjRoLTAuOGgtMC44Yy0wLjQsMC0xLjQtMC45LTEuNC0xLjR2LTcuMWMwLTIuNi0yLjEtMy45LTQuOS0zLjljLTIuNiwwLTQuMSwwLjktNS4yLDIKCQkJbDEuNywyLjZoMC45Yy0xLTIuMi0wLjItMy42LDItMy42YzIuMywwLDMuMSwxLDMsMi45bDAsMS42bC0zLjMsMC43Yy0xLjgsMC40LTQuMiwxLjMtNC4yLDMuOWMwLDIuMSwxLjUsMy41LDMuMywzLjUKCQkJYzEuOSwwLDMuMy0xLjUsNC4zLTIuOWwwLjMsMi42aDQuMmg2Ljh2LTFoLTAuN2MtMC40LDAtMS40LTAuOS0xLjQtMS40di02LjZjMC0wLjksMi40LTIuNyw0LjItMi43YzEuNCwwLDIuMSwxLDIuMSwyLjJ2Ny4xCgkJCWMwLDAuNC0xLDEuNC0xLjQsMS40SDE1MnYxaDYuNnYtMUgxNTh6IE0xMzguNyw0Mi45Yy0wLjUsMS0xLjksMi4zLTMuMiwyLjNjLTEuMywwLTIuMS0xLTIuMS0yLjFjMC0xLjMsMC41LTIuMiwyLjItMi42bDMuMS0wLjgKCQkJVjQyLjl6Ij4KICAgPC9wYXRoPgogICA8cGF0aCBkPSJNMTU5LjYsMzYuMmMtMC4yLTAuNC0xLjMtMS41LTEuNy0xLjVoLTAuNnYtMWg2Ljl2MWgtMC44Yy0wLjQsMC0xLjIsMC45LTEuMiwxLjRsMyw2LjlsMy02LjljMC0wLjUtMC44LTEuNC0xLjEtMS40aC0wLjgKCQkJdi0xaDUuMnYxaC0wLjZjLTAuMywwLTEuMiwxLTEuNSwxLjRsLTQuNCwxMGwtMy4zLDcuMmwtMS4yLTAuNWwzLjUtNy4xTDE1OS42LDM2LjJ6Ij4KICAgPC9wYXRoPgogIDwvZz4KIDwvZz4KPC9zdmc+" },
    { name: "Domestika", src: "/portfolio/assets/DL8jgkbtSHZ4dBqE0dXnf0sz56I.png" },
]

/* ---------------------------------------------------------------------------
   CERTIFICATE DETAILS — opened in a modal when a provider logo is clicked.
   Bilingual. Each provider lists its completed courses / certificates /
   training. Starter content — edit the items to match your exact credentials.
--------------------------------------------------------------------------- */
type CertItem = { title: string; meta?: string }
type CertContent = { blurb: string; items: CertItem[] }
const CERT_DETAILS: Record<string, { es: CertContent; en: CertContent }> = {
    Adobe: {
        es: {
            blurb: "Formación y práctica continuada en la suite de Adobe aplicada a diseño gráfico, editorial y de producto.",
            items: [
                { title: "Photoshop — Retoque e imagen digital", meta: "Herramienta" },
                { title: "Illustrator — Vector, logotipos y sistemas de marca", meta: "Herramienta" },
                { title: "InDesign — Maquetación y diseño editorial", meta: "Herramienta" },
                { title: "After Effects — Fundamentos de motion", meta: "Herramienta" },
            ],
        },
        en: {
            blurb: "Ongoing training and hands-on practice across the Adobe suite applied to graphic, editorial and product design.",
            items: [
                { title: "Photoshop — Retouching & digital imaging", meta: "Tool" },
                { title: "Illustrator — Vector, logos & brand systems", meta: "Tool" },
                { title: "InDesign — Layout & editorial design", meta: "Tool" },
                { title: "After Effects — Motion fundamentals", meta: "Tool" },
            ],
        },
    },
    Google: {
        es: {
            blurb: "Google UX Design Professional Certificate — programa de 7 cursos sobre el proceso completo de diseño UX.",
            items: [
                { title: "Foundations of User Experience (UX) Design", meta: "Curso 1" },
                { title: "Start the UX Design Process: Empathize, Define, Ideate", meta: "Curso 2" },
                { title: "Build Wireframes and Low-Fidelity Prototypes", meta: "Curso 3" },
                { title: "Conduct UX Research and Test Early Concepts", meta: "Curso 4" },
                { title: "Create High-Fidelity Designs and Prototypes in Figma", meta: "Curso 5" },
            ],
        },
        en: {
            blurb: "Google UX Design Professional Certificate — a 7-course program covering the end-to-end UX design process.",
            items: [
                { title: "Foundations of User Experience (UX) Design", meta: "Course 1" },
                { title: "Start the UX Design Process: Empathize, Define, Ideate", meta: "Course 2" },
                { title: "Build Wireframes and Low-Fidelity Prototypes", meta: "Course 3" },
                { title: "Conduct UX Research and Test Early Concepts", meta: "Course 4" },
                { title: "Create High-Fidelity Designs and Prototypes in Figma", meta: "Course 5" },
            ],
        },
    },
    "McKinsey & Company": {
        es: {
            blurb: "McKinsey Forward — programa de desarrollo profesional en resolución de problemas, mentalidad y comunicación.",
            items: [
                { title: "Resolución de problemas estructurada", meta: "Módulo" },
                { title: "Adaptabilidad y resiliencia", meta: "Módulo" },
                { title: "Comunicar con impacto", meta: "Módulo" },
                { title: "Mentalidad digital y colaboración", meta: "Módulo" },
            ],
        },
        en: {
            blurb: "McKinsey Forward — a professional-development program in problem solving, mindset and communication.",
            items: [
                { title: "Structured problem solving", meta: "Module" },
                { title: "Adaptability & resilience", meta: "Module" },
                { title: "Communicating with impact", meta: "Module" },
                { title: "Digital mindset & collaboration", meta: "Module" },
            ],
        },
    },
    Domestika: {
        es: {
            blurb: "Cursos de diseño, branding e ilustración cursados en Domestika.",
            items: [
                { title: "Branding y diseño de identidad visual", meta: "Curso" },
                { title: "Diseño editorial y composición", meta: "Curso" },
                { title: "Ilustración y color", meta: "Curso" },
                { title: "UX/UI y prototipado", meta: "Curso" },
            ],
        },
        en: {
            blurb: "Design, branding and illustration courses completed on Domestika.",
            items: [
                { title: "Branding & visual identity design", meta: "Course" },
                { title: "Editorial design & composition", meta: "Course" },
                { title: "Illustration & colour", meta: "Course" },
                { title: "UX/UI & prototyping", meta: "Course" },
            ],
        },
    },
}

/* ---------------------------------------------------------------------------
   DESIGN-PHILOSOPHY IMAGE CAROUSEL — draggable, auto-playing, infinite.
   Places, objects and moments only: the portraits (Fotos 5, 7, 10 and 11) now
   live in the "Nice to meet you" gallery above and are deliberately not
   repeated here, so no photo appears twice on the page.
--------------------------------------------------------------------------- */
const PHILOSOPHY_IMAGES: { src?: string; alt?: string }[] = [
    { src: "/portfolio/assets/S5JZRYpwur6Kve2TV4ESYARMs.jpg", alt: "Foto 1" },
    { src: "/portfolio/assets/vfPvLCHzfHQ8lfG7uZZeDDU.jpg", alt: "Foto 2" },
    { src: "/portfolio/assets/2wbvYeAPvI2DVKI6OGMCQiTTbR8.jpg", alt: "Foto 3" },
    { src: "/portfolio/assets/FL5nYqJ6wXKZiEZEEeyWZsuYBpg.jpg", alt: "Foto 4" },
    { src: "/portfolio/assets/lsvpJw7kwNHDheTPfFPjEVml3E.jpg", alt: "Foto 6" },
    { src: "/portfolio/assets/2uTnyYRui7O1vM1yYzipX7pdc.jpg", alt: "Foto 8" },
    { src: "/portfolio/assets/1gk8n9yga84ciQ9s0IbmWe473T8.jpg", alt: "Foto 9" },
    { src: "/portfolio/assets/ZwOzKTesBAN9fHla1POafKF2c.jpg", alt: "Foto 12" },
    { src: "/portfolio/assets/CzQJVwoIOeWwU1Mn0gLDM1miow.jpg", alt: "Foto 13" },
    { src: "/portfolio/assets/06FreWvlMhalIy8DNqkUY1X0aBw.jpg", alt: "Foto 14" },
    { src: "/portfolio/assets/H1qliyU9a7F9lFr1xT1cpIrEO4.jpg", alt: "Foto 15" },
    { src: "/portfolio/assets/ZOxcraSCOtjFPGPXBp0eXnsTUo0.jpg", alt: "Foto 16" },
]

/* ---------------------------------------------------------------------------
   UI COPY + list content (single source of truth per language)
--------------------------------------------------------------------------- */
const CONTENT = {
    es: {
        htmlLang: "es",
        nav: { home: "Inicio", projects: "Proyectos", experience: "Experiencia", skills: "Skills", about: "Sobre mí", garden: "Jardín digital", contact: "Contacto" },
        menuLabel: "Abrir menú",
        langAria: "Cambiar idioma",
        name: "Auxi Arroyo García",
        role: "Diseñadora UX/UI",
        location: "España",
        aboutParagraphs: [
            "Hola, soy Auxi Arroyo García, diseñadora UX/UI y diseñadora visual especializada en convertir necesidades, ideas e información compleja en experiencias digitales claras, funcionales y visualmente coherentes.",
            "Mi recorrido comenzó en la comunicación audiovisual y el marketing digital. Con el tiempo, descubrí que lo que más me interesaba no era solamente comunicar una idea, sino entender cómo las personas interactúan con ella, qué dificultades encuentran y cómo el diseño puede facilitarles el camino.",
            "Esta evolución me llevó hacia el diseño gráfico y, posteriormente, al diseño UX/UI. Actualmente combino investigación, arquitectura de información, diseño de interfaces, estrategia de contenidos y comunicación visual.",
            "No entiendo el diseño como una cuestión meramente estética. Para mí, diseñar significa investigar, ordenar, cuestionar y tomar decisiones conscientes para construir productos comprensibles, accesibles y útiles.",
        ],
        experienceHeading: "Mi experiencia profesional",
        educationHeading: "Mi formación",
        viewAll: "Ver toda la experiencia",
        viewLess: "Ver menos",
        cardHint: "Ver detalle",
        modalAbout: "Sobre la empresa",
        modalRole: "Mi rol",
        modalResponsibilities: "Responsabilidades principales",
        modalAchievements: "Logros",
        modalTech: "Tecnologías",
        modalSkills: "Habilidades desarrolladas",
        eduTopics: "Temas principales",
        eduSkills: "Habilidades adquiridas",
        eduProjects: "Proyectos",
        eduKnowledge: "Conocimientos",
        skillWhat: "En qué consiste",
        skillWhere: "Dónde lo he desarrollado",
        skillExamples: "Ejemplos",
        skillImpact: "Impacto",
        close: "Cerrar",
        logosLabel: "Certificados",
        eduViewAll: "Ver toda la formación",
        skillsHeading: "Skills que convierten la estrategia en experiencias claras",
        toolsLabel: "Herramientas",
        skills: [
            "Diseño centrado en el usuario",
            "Investigación UX",
            "Arquitectura de información",
            "Prototipado de baja y alta fidelidad",
            "Diseño de interfaces",
            "Diseño responsive",
            "Accesibilidad digital",
            "Pensamiento estratégico",
        ],
        valuesHeading: "Cómo entiendo el diseño",
        valuesText: "Cuestionar forma parte de mi manera de trabajar. Antes de diseñar una solución necesito entender qué problema existe, quién lo está experimentando y qué información necesita para avanzar. Mi experiencia en comunicación, marketing y diseño me permite observar un producto desde distintos ángulos y conectar las necesidades de las personas con los objetivos del proyecto.",
        valuesLabel: "Valores",
        values: ["Curiosidad", "Honestidad", "Claridad", "Sensibilidad", "Pensamiento crítico", "Atención al detalle"],
        challengesTitle: "Retos que disfruto",
        challengesText: "Los proyectos que más me gustan empiezan siendo un lío y terminan siendo simples.",
        challengesList: [
            { t: "Convertir la complejidad en claridad", d: "Ordenar sistemas confusos en experiencias evidentes." },
            { t: "Diseñar sistemas que escalan", d: "Componentes y reglas que crecen sin romperse." },
            { t: "Cuidar el detalle y el ritmo", d: "Tipografía, espacio y movimiento que se sienten bien." },
        ],
        inspirationTitle: "De dónde saco ideas",
        inspirationText: "Colecciono referencias, libros, cine y trabajo de otros diseñadores. Los guardo en mi jardín digital.",
        inspirationCta: "Explorar mi jardín digital",
        inspirationChips: ["Libros", "Cine", "Diseñadores", "Carteles", "Portfolios"],
        comingSoon: { title: "Próximamente", text: "Estoy preparando esta sección con calma. Vuelve pronto para verla." },
        contactSmall: "¿Tienes un proyecto, una oportunidad o una idea en mente?",
        contactBig: "HABLEMOS",
        email: "Email",
        linkedin: "LinkedIn",
        portfolio: "Portfolio",
        backToTop: "Volver arriba",
        rights: "Todos los derechos reservados.",
        fab: {
            label: "Estado y contacto",
            status: "Disponible",
            copy: "Copiar email",
            copied: "¡Copiado!",
        },
        ui2: {
            profileAria: "Perfil de Auxi Arroyo",
            handle: "@auxiarroyo",
            message: "Escríbeme",
            seeProjects: "Ver proyectos",
            statExp: "Experiencias",
            statEdu: "Formaciones",
            statTools: "Herramientas",
            statSkills: "Skills",
            statCerts: "Certificados",
            available: "Disponible para proyectos",
            tabs: {
                overview: "Resumen",
                experience: "Experiencia",
                education: "Formación",
                skills: "Skills",
                certifications: "Certificados",
                challenges: "Retos",
                inspiration: "Inspiración",
                projects: "Proyectos",
                contact: "Contacto",
            },
            overviewTitle: "Encantada de conocerte",
            certsTitle: "Certificados y herramientas",
            certsText: "Formaciones y herramientas con las que trabajo cada día.",
            projectsTitle: "Mira lo que he creado",
            projectsText: "Casos de estudio, branding y producto digital — todo en un solo lugar.",
            projectsCta: "Ver proyectos",
            contactTitle: "Hablemos",
            contactText: "¿Tienes un proyecto, una oportunidad o una idea? Escríbeme y lo vemos.",
        },
    },
    en: {
        htmlLang: "en",
        nav: { home: "Home", projects: "Projects", experience: "Experience", skills: "Skills", about: "About", garden: "Digital Garden", contact: "Contact" },
        menuLabel: "Open menu",
        langAria: "Change language",
        name: "Auxi Arroyo García",
        role: "UX/UI Designer",
        location: "Spain",
        aboutParagraphs: [
            "Hi, I'm Auxi Arroyo García, a UX/UI and visual designer focused on transforming needs, ideas and complex information into clear, functional and visually coherent digital experiences.",
            "My professional journey began in audiovisual communication and digital marketing. Over time, I realised that I was not only interested in communicating an idea, but also in understanding how people interact with it, what difficulties they encounter and how design can make their journey easier.",
            "This evolution led me towards graphic design and, later, UX/UI design. Today, I combine research, information architecture, interface design, content strategy and visual communication.",
            "I do not see design as something purely aesthetic. To me, designing means researching, organising, questioning and making conscious decisions to build understandable, accessible and useful products.",
        ],
        experienceHeading: "Professional experience",
        educationHeading: "Education",
        viewAll: "View all experience",
        viewLess: "View less",
        cardHint: "View details",
        modalAbout: "About the company",
        modalRole: "My role",
        modalResponsibilities: "Key responsibilities",
        modalAchievements: "Achievements",
        modalTech: "Technologies",
        modalSkills: "Skills developed",
        eduTopics: "Main topics",
        eduSkills: "Skills acquired",
        eduProjects: "Projects",
        eduKnowledge: "Knowledge gained",
        skillWhat: "What it involves",
        skillWhere: "Where I developed it",
        skillExamples: "Examples",
        skillImpact: "Impact",
        close: "Close",
        logosLabel: "Certificates",
        eduViewAll: "View all education",
        skillsHeading: "Skills that turn strategy into clear experiences",
        toolsLabel: "Tools",
        skills: [
            "User-centred design",
            "UX research",
            "Information architecture",
            "Low & high-fidelity prototyping",
            "Interface design",
            "Responsive design",
            "Digital accessibility",
            "Strategic thinking",
        ],
        valuesHeading: "How I approach design",
        valuesText: "Questioning is part of the way I work. Before designing a solution, I need to understand the problem, who is experiencing it and what information they need to move forward. My background in communication, marketing and design allows me to look at a product from different perspectives and connect people's needs with project goals.",
        valuesLabel: "Values",
        values: ["Curiosity", "Honesty", "Clarity", "Sensitivity", "Critical thinking", "Attention to detail"],
        challengesTitle: "Challenges I enjoy",
        challengesText: "The projects I love most start messy and end up simple.",
        challengesList: [
            { t: "Turning complexity into clarity", d: "Ordering confusing systems into obvious experiences." },
            { t: "Designing systems that scale", d: "Components and rules that grow without breaking." },
            { t: "Caring for detail and rhythm", d: "Type, space and motion that just feel right." },
        ],
        inspirationTitle: "Where I find ideas",
        inspirationText: "I collect references, books, film and other designers' work. I keep them in my digital garden.",
        inspirationCta: "Explore my digital garden",
        inspirationChips: ["Books", "Film", "Designers", "Posters", "Portfolios"],
        comingSoon: { title: "Coming soon", text: "I'm putting this section together. Check back soon to see it." },
        contactSmall: "Have a project, opportunity or idea in mind?",
        contactBig: "LET'S TALK",
        email: "Email",
        linkedin: "LinkedIn",
        portfolio: "Portfolio",
        backToTop: "Back to top",
        rights: "All rights reserved.",
        fab: {
            label: "Status and contact",
            status: "Open to Work",
            copy: "Copy email",
            copied: "Copied!",
        },
        ui2: {
            profileAria: "Auxi Arroyo's profile",
            handle: "@auxiarroyo",
            message: "Message me",
            seeProjects: "See projects",
            statExp: "Experiences",
            statEdu: "Training",
            statTools: "Tools",
            statSkills: "Skills",
            statCerts: "Certificates",
            available: "Available for projects",
            tabs: {
                overview: "Overview",
                experience: "Experience",
                education: "Education",
                skills: "Skills",
                certifications: "Certificates",
                challenges: "Challenges",
                inspiration: "Inspiration",
                projects: "Projects",
                contact: "Contact",
            },
            overviewTitle: "Nice to meet you",
            certsTitle: "Certificates & tools",
            certsText: "The training and the tools I work with every day.",
            projectsTitle: "See what I've made",
            projectsText: "Case studies, branding and digital product — all in one place.",
            projectsCta: "See projects",
            contactTitle: "Let's talk",
            contactText: "Got a project, an opportunity or an idea? Write to me and let's explore it.",
        },
    },
} as const

type Lang = "es" | "en"

const SECTION = { about: "sobre-mi", experience: "experiencia", skills: "skills", contact: "contacto" }

/* ---------------------------------------------------------------------------
   Small monochrome line-icons for the skills list (cycled).
--------------------------------------------------------------------------- */
const SKILL_ICON_PATHS = [
    "M12 3a9 9 0 1 0 .001 18.001A9 9 0 0 0 12 3Zm0 4v5l3 2", // target/clock
    "M4 7h16M4 12h10M4 17h7", // list / IA
    "M3 5h7v7H3zM14 5h7v4h-7zM14 13h7v6h-7zM3 15h7v4H3z", // grid / wireframe
    "M4 17V9l4-4 4 4 4-4 4 4v8", // flow
    "M12 5c-5 0-8 5-8 7s3 7 8 7 8-5 8-7-3-7-8-7Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z", // eye / research
    "M5 12l4 4L19 6", // check / validation
    "M4 6h16v12H4zM4 10h16", // interface
    "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3Z", // strategy / star
    "M7 8h10M7 12h10M7 16h6M5 4h14v16H5z", // content / doc
]

/* ---------------------------------------------------------------------------
   UX SKILLS — each row opens a modal. Content is written in truthful, general
   terms; personalise the `examples` with your own project names when ready.
--------------------------------------------------------------------------- */
interface SkillDetail {
    name: string
    what: string
    where: string
    examples: string[]
    impact: string
}
const SKILL_DETAILS: { es: SkillDetail; en: SkillDetail }[] = [
    {
        es: {
            name: "Diseño centrado en el usuario",
            what: "Diseñar poniendo a las personas usuarias en el centro de cada decisión, partiendo de sus necesidades reales.",
            where: "En el diseño de herramientas de gestión y productos digitales, investigando antes de proponer soluciones.",
            examples: ["Definición de flujos a partir de necesidades reales de usuario.", "Validación de decisiones mediante testing."],
            impact: "Productos más claros, útiles y fáciles de adoptar.",
        },
        en: {
            name: "User-centred design",
            what: "Designing with people at the centre of every decision, starting from their real needs.",
            where: "While designing management tools and digital products, researching before proposing solutions.",
            examples: ["Defining flows from real user needs.", "Validating decisions through testing."],
            impact: "Clearer, more useful products that are easier to adopt.",
        },
    },
    {
        es: {
            name: "Investigación UX",
            what: "Entender el problema, a las personas que lo viven y el contexto antes de diseñar.",
            where: "En proyectos donde investigué necesidades y dificultades de pequeñas y medianas empresas.",
            examples: ["Investigación de necesidades y puntos de dolor.", "Documentación de hallazgos para el equipo."],
            impact: "Decisiones de diseño fundamentadas y no basadas en suposiciones.",
        },
        en: {
            name: "UX research",
            what: "Understanding the problem, the people who live it and the context before designing.",
            where: "In projects where I researched the needs and pain points of small and medium businesses.",
            examples: ["Researching needs and pain points.", "Documenting findings for the team."],
            impact: "Design decisions grounded in evidence rather than assumptions.",
        },
    },
    {
        es: {
            name: "Arquitectura de información",
            what: "Ordenar y estructurar contenidos e interfaces para que sean fáciles de entender y recorrer.",
            where: "Al definir flujos y estructura en herramientas de gestión de contenidos.",
            examples: ["Creación de flujos de usuario y mapas de contenido.", "Organización de secciones y navegación."],
            impact: "Interfaces más intuitivas y con menos fricción.",
        },
        en: {
            name: "Information architecture",
            what: "Structuring content and interfaces so they are easy to understand and navigate.",
            where: "When defining flows and structure in content-management tools.",
            examples: ["Creating user flows and content maps.", "Organising sections and navigation."],
            impact: "More intuitive interfaces with less friction.",
        },
    },
    {
        es: {
            name: "Prototipado de baja y alta fidelidad",
            what: "Materializar ideas en wireframes y prototipos para probarlas y comunicarlas.",
            where: "En el diseño de interfaces y propuestas para productos digitales.",
            examples: ["Wireframes para validar estructura.", "Prototipos de alta fidelidad para testing."],
            impact: "Ideas validadas antes de invertir en desarrollo.",
        },
        en: {
            name: "Low & high-fidelity prototyping",
            what: "Turning ideas into wireframes and prototypes to test and communicate them.",
            where: "While designing interfaces and proposals for digital products.",
            examples: ["Wireframes to validate structure.", "High-fidelity prototypes for testing."],
            impact: "Ideas validated before investing in development.",
        },
    },
    {
        es: {
            name: "Diseño de interfaces",
            what: "Diseñar interfaces claras, coherentes y visualmente cuidadas.",
            where: "En propuestas de interfaz para herramientas de gestión y productos digitales.",
            examples: ["Diseño de pantallas y componentes.", "Coherencia visual y jerarquía."],
            impact: "Experiencias más agradables y fáciles de usar.",
        },
        en: {
            name: "Interface design",
            what: "Designing clear, consistent and visually refined interfaces.",
            where: "In interface proposals for management tools and digital products.",
            examples: ["Designing screens and components.", "Visual consistency and hierarchy."],
            impact: "More pleasant and usable experiences.",
        },
    },
    {
        es: {
            name: "Diseño responsive",
            what: "Diseñar para que la experiencia funcione bien en cualquier tamaño de pantalla.",
            where: "Al adaptar interfaces y contenidos a distintos dispositivos.",
            examples: ["Adaptación de layouts a móvil, tablet y escritorio.", "Priorización de contenido por contexto."],
            impact: "Una experiencia consistente en todos los dispositivos.",
        },
        en: {
            name: "Responsive design",
            what: "Designing so the experience works well at any screen size.",
            where: "When adapting interfaces and content to different devices.",
            examples: ["Adapting layouts to mobile, tablet and desktop.", "Prioritising content by context."],
            impact: "A consistent experience across all devices.",
        },
    },
    {
        es: {
            name: "Accesibilidad digital",
            what: "Diseñar productos que puedan usar el mayor número de personas posible.",
            where: "Integrando criterios de accesibilidad en el diseño de interfaces.",
            examples: ["Contraste y jerarquía legibles.", "Estados de foco y navegación por teclado."],
            impact: "Productos más inclusivos y usables para todas las personas.",
        },
        en: {
            name: "Digital accessibility",
            what: "Designing products that as many people as possible can use.",
            where: "Integrating accessibility criteria into interface design.",
            examples: ["Readable contrast and hierarchy.", "Focus states and keyboard navigation."],
            impact: "More inclusive, usable products for everyone.",
        },
    },
    {
        es: {
            name: "Pensamiento estratégico",
            what: "Conectar las necesidades de las personas con los objetivos del proyecto.",
            where: "Gracias a mi recorrido en comunicación, marketing y diseño.",
            examples: ["Observar un producto desde distintos ángulos.", "Alinear diseño, contenido y negocio."],
            impact: "Decisiones de diseño con propósito y visión de conjunto.",
        },
        en: {
            name: "Strategic thinking",
            what: "Connecting people's needs with the goals of the project.",
            where: "Thanks to my background in communication, marketing and design.",
            examples: ["Looking at a product from different angles.", "Aligning design, content and business."],
            impact: "Purposeful design decisions with the bigger picture in mind.",
        },
    },
]

/* ---------------------------------------------------------------------------
   PROFILE STATISTICS — five separate readings of the archive, each counted
   from the data above rather than typed by hand, so the header can never
   disagree with what the tabs actually contain. Tools, Skills and Certificates
   are deliberately three distinct figures, not one merged "skills" number.
--------------------------------------------------------------------------- */
const CERTIFICATE_COUNT = Object.values(CERT_DETAILS).reduce(
    (total, provider) => total + provider.es.items.length,
    0
)
const PROFILE_STATS: {
    key: string
    value: number
    labelKey: "statExp" | "statEdu" | "statTools" | "statSkills" | "statCerts"
}[] = [
    { key: "exp", value: EXPERIENCES.length, labelKey: "statExp" },
    { key: "edu", value: EDUCATION.length, labelKey: "statEdu" },
    { key: "tools", value: TOOLS.length, labelKey: "statTools" },
    { key: "skills", value: SKILL_DETAILS.length, labelKey: "statSkills" },
    { key: "certs", value: CERTIFICATE_COUNT, labelKey: "statCerts" },
]

/* ---------------------------------------------------------------------------
   Reveal-on-scroll wrapper (respects reduced motion, safe on static canvas)
--------------------------------------------------------------------------- */
function Reveal({
    children,
    delay = 0,
    style,
    className,
    id,
    tag = "div",
}: {
    children: ReactNode
    delay?: number
    style?: CSSProperties
    className?: string
    id?: string
    tag?: "div" | "section" | "li" | "article"
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
            { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
        )
        obs.observe(el)
        const fallback = window.setTimeout(() => {
            if (!settled) setShown(true)
        }, 800)
        return () => {
            obs.disconnect()
            window.clearTimeout(fallback)
        }
    }, [isStatic])

    const Tag = tag as any
    return (
        <Tag
            ref={ref as any}
            id={id}
            className={className}
            style={{
                ...style,
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : "translateY(16px)",
                transition: `opacity 0.6s ease ${delay}s, transform 0.6s cubic-bezier(0.22,0.61,0.36,1) ${delay}s`,
            }}
        >
            {children}
        </Tag>
    )
}

/* ---------------------------------------------------------------------------
   Design-philosophy image carousel — infinite, auto-playing, drag to scroll.
   Lightweight: a single rAF loop translates the track; wraps for infinite loop;
   pointer drag pauses autoplay and offsets the track. Respects reduced motion
   and the static canvas renderer.
--------------------------------------------------------------------------- */
function PhotoCarousel({
    images,
    reduceMotionRef,
}: {
    images: { src?: string; alt?: string }[]
    reduceMotionRef: { current: boolean }
}) {
    const isStatic = useIsStaticRenderer()
    const trackRef = useRef<HTMLDivElement | null>(null)
    const offsetRef = useRef(0)
    const setWidthRef = useRef(0)
    const draggingRef = useRef(false)
    const movedRef = useRef(false)
    const startXRef = useRef(0)
    const startOffsetRef = useRef(0)
    const rafRef = useRef(0)

    const slides = images.length > 0 ? [...images, ...images] : []

    useEffect(() => {
        if (isStatic || typeof window === "undefined") return
        const track = trackRef.current
        if (!track) return

        const measure = () => {
            setWidthRef.current = track.scrollWidth / 2
        }
        measure()

        const SPEED = 0.35 // px per frame — slow, premium
        const tick = () => {
            const w = setWidthRef.current || 1
            if (!draggingRef.current && !reduceMotionRef.current) {
                offsetRef.current -= SPEED
            }
            if (offsetRef.current <= -w) offsetRef.current += w
            if (offsetRef.current > 0) offsetRef.current -= w
            track.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`
            rafRef.current = window.requestAnimationFrame(tick)
        }
        rafRef.current = window.requestAnimationFrame(tick)

        window.addEventListener("resize", measure)
        return () => {
            window.cancelAnimationFrame(rafRef.current)
            window.removeEventListener("resize", measure)
        }
    }, [isStatic, images.length, reduceMotionRef])

    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = true
        movedRef.current = false
        startXRef.current = e.clientX
        startOffsetRef.current = offsetRef.current
        try {
            e.currentTarget.setPointerCapture(e.pointerId)
        } catch (err) {
            /* ignore */
        }
    }
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return
        const dx = e.clientX - startXRef.current
        if (Math.abs(dx) > 3) movedRef.current = true
        offsetRef.current = startOffsetRef.current + dx
        const track = trackRef.current
        if (track) track.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`
    }
    const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = false
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch (err) {
            /* ignore */
        }
    }

    if (slides.length === 0) return null

    return (
        <div
            className="aag-photocar"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={endDrag}
            role="group"
            aria-label="Design philosophy gallery"
        >
            <div className="aag-photocar-track" ref={trackRef}>
                {slides.map((img, i) => (
                    <div className="aag-photocar-item" key={i} aria-hidden={i >= images.length}>
                        {img.src ? (
                            <img src={img.src} alt={img.alt || ""} loading="lazy" decoding="async" draggable={false} />
                        ) : (
                            <span className="aag-photocar-ph">{img.alt}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ==========================================================================
   MAIN COMPONENT
   @framerSupportedLayoutWidth any-prefer-fixed
   @framerSupportedLayoutHeight auto
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

interface AboutPageProps {
    profileImage?: { src?: string; srcSet?: string; alt?: string }
    email?: string
    linkedinUrl?: string
    portfolioUrl?: string
    accent?: string
    defaultLanguage?: Lang
    style?: CSSProperties
}

/* ---------------------------------------------------------------------------
   CUSTOM ICON SET (from the project's Iconos) + "Nice to meet you" gallery.
   This gallery is portraits only — the four photos of Auxi that used to sit in
   the lower philosophy carousel (Fotos 5, 7, 10 and 11). Everything else
   (places, objects, moments) stays in that carousel; nothing is shown twice.
--------------------------------------------------------------------------- */
const GALLERY: string[] = [
    "/portfolio/assets/elmWo6V87sktLAuc86LJRzZK1g.jpg", // Foto 5
    "/portfolio/assets/i0DI8ZzQFIPfwCpa2tkQzeGUDg.jpg", // Foto 7
    "/portfolio/assets/h8c86hEkWihIAPYnQq2I8VzTxY.jpg", // Foto 10
    "/portfolio/assets/EGazJ8dZDogyddKsKyLM9WtWE.jpg",  // Foto 11
]

/* Horizontal images used as elegant card banners on Experience / Education
   (a per-card `img` on the data wins; otherwise these cycle as a fallback). */
const EXP_IMAGES: string[] = [
    "/portfolio/assets/m7YPXSHxqMQfqy0LqjPvQR60Ew.jpg",
    "/portfolio/assets/UQnLyAkaIlNnebuU0146RU6hMzk.jpg",
    "/portfolio/assets/8JQsufSMs6IDpA3j7xWsNPMBKI.jpg",
    "/portfolio/assets/i0DI8ZzQFIPfwCpa2tkQzeGUDg.jpg",
    "/portfolio/assets/9rr6CF5bCn2hJiZG4hubsbEmV4M.jpg",
]
const EDU_IMAGES: string[] = [
    "/portfolio/assets/EGazJ8dZDogyddKsKyLM9WtWE.jpg",
    "/portfolio/assets/HiCBfYljtFme6saAnqLlJs9nLK8.jpg",
    "/portfolio/assets/2t2B5gPUOamsIlklxHvREITjP8s.jpg",
    "/portfolio/assets/ey7P3z6KnVTxuKdvyBsfbZ78ZM.jpg",
]

/* ESCO — the school behind both the Alternativa Comunicación placement and the
   Marketing & Advertising master's. A single asset is shared by the Experience
   and Education cards so the two instances are pixel-identical. */
const ESCO_LOGO = "/portfolio/assets/Bno3V3qU5v0sreJHlzEjlYYlc7U.png"

/* Brand logos per experience / education id. Rendered "contain" on a uniform
   tile so every entry aligns identically and aspect ratio is preserved. Any id
   without a logo falls back to a clean wordmark, keeping the layout uniform. */
const EXP_LOGOS: Record<string, string> = {
    "taller-uxui": "/portfolio/assets/5Ii8ibv7mBCMR87q4iN7mp8w7Ps.png",
    "taller-graphic": "/portfolio/assets/DOZYT5sI592n1qf9XvBP7CIm7Q.png",
    magtel: "/portfolio/assets/OaNZw9n5Dpog8MiZMvUaiQsbuY.webp",
    vidext: "/portfolio/assets/vdauw3Pf5XPjvH5FUDaz1H3GI.svg",
    candela: "/portfolio/assets/UuNWb0hJSyrZNGZwemJZTvcqo.png",
    antonita: "/portfolio/assets/Gp6BEQFNdyW9r8iDmYZtEnTc7VY.png",
    omibu: "/portfolio/assets/Uy2CwA9X3DPFHVYZgp15wnVb9Do.webp",
    esco: ESCO_LOGO,
    salmon: "/portfolio/assets/6Q9TI2pJPjHWiXRd0UHXTThqg.png",
    box: "/portfolio/assets/NgxnIAFPtELhAj34ukqAj71xH8.png",
}
const EDU_LOGOS: Record<string, string> = {
    emprendeuco: "/portfolio/assets/6NeY482OJDHCqHlZSXgHy8E6Fo.png",
    labasad: "/portfolio/assets/ETkgQJJiFd03QTzWjktHmtOHI.svg",
    "esco-master": ESCO_LOGO,
    "us-grado": "/portfolio/assets/j6dhYiRRljLfZPzPQqF9vLM1Vo.png",
}

/* A few marks are supplied as full-bleed brand cards (a wordmark reversed out
   of a solid colour). Painting the tile with that same colour turns the frame
   into the brand card itself: the complete logo stays visible and centred with
   even breathing room, instead of floating as a coloured rectangle inside a
   white box. Everything else keeps the neutral tile. */
const LOGO_TILE_BG: Record<string, string> = {
    salmon: "#00384b",
    box: "#f52c1e",
}

type AXIconName = "star" | "location" | "eye" | "briefcase" | "compass" | "document" | "flag" | "heart"
const AX_ICONS: Record<AXIconName, ReactNode> = {
    star: (
        <path d="M11.1169 3.66283C11.4929 2.95492 12.5073 2.95492 12.8833 3.66283L14.8393 7.34568C14.9838 7.61783 15.2458 7.80813 15.5493 7.8615L19.6563 8.58374C20.4458 8.72256 20.7592 9.68727 20.2021 10.2636L17.304 13.262C17.0898 13.4835 16.9898 13.7915 17.0328 14.0966L17.6151 18.2258C17.727 19.0195 16.9063 19.6157 16.1861 19.264L12.4389 17.4343C12.162 17.299 11.8382 17.299 11.5613 17.4343L7.81412 19.264C7.09384 19.6157 6.27321 19.0195 6.38513 18.2258L6.96739 14.0966C7.01042 13.7915 6.91037 13.4835 6.69621 13.262L3.79806 10.2636C3.24098 9.68727 3.55444 8.72256 4.34389 8.58374L8.45093 7.8615C8.75442 7.80813 9.01636 7.61782 9.1609 7.34568L11.1169 3.66283Z" fill="currentColor"/>
    ),
    location: (
        <>
            <path d="M12 3C7.58172 3 4 6.58172 4 11V11.3274C4 13.013 4.53207 14.646 5.50638 16H5.5L5.52299 16.023C5.72211 16.2976 5.9395 16.5607 6.1744 16.8103C6.52837 17.1864 12 21.5 12 21.5C12.7985 21.0933 17.174 17.5026 17.8256 16.8103C18.063 16.5581 18.2824 16.2921 18.4833 16.0143L18.5 16H18.4936C19.4679 14.646 20 13.013 20 11.3274V11C20 6.58172 16.4183 3 12 3Z" fill="currentColor"/>
            <path d="M15.25 11C15.25 9.20507 13.7949 7.75 12 7.75C10.2051 7.75 8.75 9.20507 8.75 11C8.75 12.7949 10.2051 14.25 12 14.25C13.7949 14.25 15.25 12.7949 15.25 11Z" fill="var(--icon-hole,#f7f7f5)"/>
        </>
    ),
    eye: (
        <>
            <path d="M12 9.75C10.7574 9.75 9.75 10.7574 9.75 12C9.75 13.2426 10.7574 14.25 12 14.25C13.2426 14.25 14.25 13.2426 14.25 12C14.25 10.7574 13.2426 9.75 12 9.75Z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 5.5C9.38223 5.5 7.02801 6.55139 5.33162 7.85335C4.48232 8.50519 3.78544 9.22913 3.29649 9.93368C2.81686 10.6248 2.5 11.3515 2.5 12C2.5 12.6485 2.81686 13.3752 3.29649 14.0663C3.78544 14.7709 4.48232 15.4948 5.33162 16.1466C7.02801 17.4486 9.38223 18.5 12 18.5C14.6178 18.5 16.972 17.4486 18.6684 16.1466C19.5177 15.4948 20.2146 14.7709 20.7035 14.0663C21.1831 13.3752 21.5 12.6485 21.5 12C21.5 11.3515 21.1831 10.6248 20.7035 9.93368C20.2146 9.22913 19.5177 8.50519 18.6684 7.85335C16.972 6.55139 14.6178 5.5 12 5.5ZM8.25 12C8.25 9.92893 9.92893 8.25 12 8.25C14.0711 8.25 15.75 9.92893 15.75 12C15.75 14.0711 14.0711 15.75 12 15.75C9.92893 15.75 8.25 14.0711 8.25 12Z" fill="currentColor"/>
        </>
    ),
    briefcase: (
        <>
            <path fillRule="evenodd" clipRule="evenodd" d="M7.25009 5.4612V6.88179L5.55616 7.01852C4.35848 7.1152 3.38151 8.01697 3.18943 9.20309C3.14768 9.46088 3.10972 9.71911 3.07553 9.97772C3.05857 10.1061 3.127 10.2303 3.244 10.2857L3.32106 10.3222C8.74976 12.8926 15.2504 12.8926 20.6791 10.3222L20.7562 10.2857C20.8732 10.2303 20.9416 10.1061 20.9246 9.97773C20.8905 9.71912 20.8525 9.46088 20.8107 9.20309C20.6187 8.01697 19.6417 7.1152 18.444 7.01852L16.7501 6.88179V5.4612C16.7501 4.59495 16.1163 3.85906 15.2597 3.73056L14.0398 3.54757C12.6875 3.34474 11.3126 3.34474 9.96041 3.54757L8.7405 3.73056C7.88384 3.85906 7.25009 4.59495 7.25009 5.4612ZM13.8173 5.03098C12.6126 4.85027 11.3876 4.85027 10.1829 5.03098L8.96301 5.21396C8.84063 5.23232 8.75009 5.33745 8.75009 5.4612V6.77621C10.915 6.65219 13.0852 6.65219 15.2501 6.77621V5.4612C15.2501 5.33745 15.1596 5.23232 15.0372 5.21396L13.8173 5.03098Z" fill="currentColor"/>
            <path d="M21.1184 12.0709C21.1109 11.9308 20.9643 11.8432 20.836 11.9C15.265 14.3667 8.73513 14.3667 3.16421 11.9C3.03591 11.8432 2.88923 11.9308 2.88177 12.0709C2.78 13.9823 2.88255 15.9019 3.18943 17.7969C3.38151 18.983 4.35848 19.8848 5.55616 19.9815L7.42808 20.1326C10.4711 20.3782 13.529 20.3782 16.5721 20.1326L18.444 19.9815C19.6417 19.8848 20.6187 18.983 20.8107 17.7969C21.1176 15.9019 21.2202 13.9823 21.1184 12.0709Z" fill="currentColor"/>
        </>
    ),
    compass: (
        <>
            <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" fill="var(--icon-hole,#f7f7f5)"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM15.3775 8.01521L10.0785 9.35387C9.72216 9.44389 9.44391 9.72214 9.35389 10.0785L8.01527 15.3775C7.92255 15.7446 8.25549 16.0775 8.6225 15.9848L13.9215 14.6461C14.2779 14.5561 14.5561 14.2779 14.6462 13.9215L15.9848 8.62244C16.0775 8.25542 15.7446 7.92249 15.3775 8.01521Z" fill="currentColor"/>
        </>
    ),
    document: (
        <>
            <path d="M6 3.5A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h9A2.5 2.5 0 0 0 17.5 18V9h-4A1.5 1.5 0 0 1 12 7.5v-4H6Z" fill="currentColor"/>
            <path d="M13.5 3.9V7a.5.5 0 0 0 .5.5h3.1L13.5 3.9Z" fill="currentColor"/>
        </>
    ),
    flag: (
        <path d="M6 3a1 1 0 0 1 1 1v.35l1.62-.27a8 8 0 0 1 4.3.42 6 6 0 0 0 3.86.25l1.7-.44A1 1 0 0 1 19.7 5.24l-1.3 5.05a1.5 1.5 0 0 1-1.08 1.08l-1.2.3a6 6 0 0 1-3.86-.25 8 8 0 0 0-4.3-.42L7 11.2V21a1 1 0 0 1-2 0V4a1 1 0 0 1 1-1Z" fill="currentColor"/>
    ),
    heart: (
        <path d="M12 20.3s-6.9-4.35-9.2-8.3C1.1 8.9 2.4 5.4 5.6 4.6c1.9-.48 3.8.28 4.9 1.8l1.5 2 1.5-2c1.1-1.52 3-2.28 4.9-1.8 3.2.8 4.5 4.3 2.8 7.4-2.3 3.95-9.2 8.3-9.2 8.3Z" fill="currentColor"/>
    ),
}
function AXIcon({ name, size = 22 }: { name: AXIconName; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            {AX_ICONS[name]}
        </svg>
    )
}

/* Horizontal image gallery — prev / next, smooth crossfade, responsive */
function HeroGallery({ label, prevLabel, nextLabel }: { label: string; prevLabel: string; nextLabel: string }) {
    const [i, setI] = useState(0)
    const go = useCallback((n: number) => setI(((n % GALLERY.length) + GALLERY.length) % GALLERY.length), [])
    return (
        <div className="aag-gallery" role="group" aria-label={label}>
            <button
                type="button"
                className="aag-gallery-stage"
                onClick={() => go(i + 1)}
                aria-label={nextLabel}
            >
                {GALLERY.map((src, idx) => (
                    <img
                        key={idx}
                        src={src}
                        alt=""
                        className={"aag-gallery-img" + (idx === i ? " is-active" : "")}
                        loading={idx < 2 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                    />
                ))}
                {/* discreet inline arrows — stopPropagation so they don't also advance */}
                <span
                    className="aag-gallery-nav aag-gallery-nav--prev"
                    role="button"
                    tabIndex={0}
                    aria-label={prevLabel}
                    onClick={(e) => { e.stopPropagation(); go(i - 1) }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); go(i - 1) } }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                </span>
                <span
                    className="aag-gallery-nav aag-gallery-nav--next"
                    role="button"
                    tabIndex={0}
                    aria-label={nextLabel}
                    onClick={(e) => { e.stopPropagation(); go(i + 1) }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); go(i + 1) } }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </span>
            </button>
        </div>
    )
}

/**
 * About page — Auxi Arroyo García
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

export default function AboutPage(props: AboutPageProps) {
    const {
        profileImage,
        email = EMAIL,
        linkedinUrl = LINKEDIN_URL,
        portfolioUrl = PORTFOLIO_URL,
        accent = "#ff654d",
        defaultLanguage = "es",
    } = props

    const isStatic = useIsStaticRenderer()
    const portalHost = usePortalHost(accent)

    /* ---- language state + persistence ---- */
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
                    if (typeof window !== "undefined") window.localStorage.setItem("aag-about-lang", next)
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

    const scrollToId = useCallback((id: string) => {
        if (typeof document === "undefined") return
        const el = document.getElementById(id)
        if (!el) return
        const behavior: ScrollBehavior = reduceMotionRef.current ? "auto" : "smooth"
        el.scrollIntoView({ behavior, block: "start" })
    }, [])

    const handleNav = useCallback(
        (id: string) => {
            setNavOpen(false)
            scrollToId(id)
        },
        [scrollToId]
    )

    /* ---- experience: expand + modal ---- */
    const [expanded, setExpanded] = useState(false)
    const INITIAL_COUNT = 3
    const visibleExperiences = expanded ? EXPERIENCES : EXPERIENCES.slice(0, INITIAL_COUNT)

    /* ---- education: expand ---- */
    const [eduExpanded, setEduExpanded] = useState(false)
    const EDU_INITIAL = 3
    const visibleEducation = eduExpanded ? EDUCATION : EDUCATION.slice(0, EDU_INITIAL)

    /* ---- archive-style tabs (Instagram story highlights) ---- */
    type TabKey =
        | "overview"
        | "experience"
        | "education"
        | "skills"
        | "certifications"
        | "challenges"
        | "inspiration"
        | "projects"
        | "contact"
    const [activeTab, setActiveTab] = useState<TabKey>("overview")
    const panelsRef = useRef<HTMLDivElement | null>(null)
    const selectTab = useCallback((k: TabKey) => {
        setActiveTab(k)
        setNavOpen(false)
        if (typeof window !== "undefined" && panelsRef.current) {
            const top = panelsRef.current.getBoundingClientRect().top + window.scrollY - 120
            window.scrollTo({ top: Math.max(0, top), behavior: reduceMotionRef.current ? "auto" : "smooth" })
        }
    }, [])

    type ModalKind = "exp" | "edu" | "skill" | "cert"
    const [modal, setModal] = useState<{ type: ModalKind; index: number } | null>(null)
    const [modalShown, setModalShown] = useState(false)
    const prevFocusRef = useRef<HTMLElement | null>(null)
    const dialogRef = useRef<HTMLDivElement | null>(null)
    const closeBtnRef = useRef<HTMLButtonElement | null>(null)

    const openModal = useCallback((type: ModalKind, index: number) => {
        if (typeof document !== "undefined") {
            prevFocusRef.current = document.activeElement as HTMLElement
        }
        setModal({ type, index })
    }, [])

    const closeModal = useCallback(() => {
        if (reduceMotionRef.current || isStatic) {
            setModalShown(false)
            setModal(null)
            return
        }
        setModalShown(false)
        window.setTimeout(() => setModal(null), 170)
    }, [isStatic])

    /* modal side-effects: enter animation, scroll lock, focus trap, ESC */
    useEffect(() => {
        if (modal === null || typeof document === "undefined") return

        const enter = window.setTimeout(() => setModalShown(true), 10)

        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"

        const focusTimer = window.setTimeout(() => {
            if (closeBtnRef.current) closeBtnRef.current.focus({ preventScroll: true })
        }, 20)

        const getFocusable = (): HTMLElement[] => {
            const node = dialogRef.current
            if (!node) return []
            return Array.from(
                node.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
                )
            ).filter((el) => el.offsetParent !== null || el === document.activeElement)
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault()
                closeModal()
                return
            }
            if (e.key === "Tab") {
                const focusable = getFocusable()
                if (focusable.length === 0) return
                const first = focusable[0]
                const last = focusable[focusable.length - 1]
                const current = document.activeElement as HTMLElement
                if (e.shiftKey) {
                    if (current === first || !dialogRef.current?.contains(current)) {
                        e.preventDefault()
                        last.focus()
                    }
                } else {
                    if (current === last || !dialogRef.current?.contains(current)) {
                        e.preventDefault()
                        first.focus()
                    }
                }
            }
        }

        document.addEventListener("keydown", onKeyDown)
        return () => {
            window.clearTimeout(enter)
            window.clearTimeout(focusTimer)
            document.removeEventListener("keydown", onKeyDown)
            document.body.style.overflow = prevOverflow
            const prev = prevFocusRef.current
            if (prev && typeof prev.focus === "function") prev.focus()
        }
    }, [modal, closeModal])

    /* ---- resolve the active modal's content by type ---- */
    const expItem = modal?.type === "exp" ? EXPERIENCES[modal.index] : null
    const expData = expItem ? expItem[lang] : null
    const eduItem = modal?.type === "edu" ? EDUCATION[modal.index] : null
    const eduData = eduItem ? eduItem[lang] : null
    const skillData = modal?.type === "skill" ? SKILL_DETAILS[modal.index]?.[lang] ?? null : null
    const certLogo = modal?.type === "cert" ? LOGOS[modal.index] : null
    const certData = certLogo ? CERT_DETAILS[certLogo.name]?.[lang] ?? null : null

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

    /* ---- contact target: the email inbox ---- */
    const contactHref = `mailto:${email}`

    /* ---- nav items config (switch the archive tabs) ---- */
    const navItems: { key: string; label: string; href: string; current?: boolean }[] = [
        { key: "home", label: t.nav.home, href: "/" },
        { key: "about", label: t.nav.about, href: "/about", current: true },
        { key: "projects", label: t.nav.projects, href: "/projects" },
        { key: "garden", label: t.nav.garden, href: "/digital-garden" },
    ]

    /* ---- tab / story-highlight config ---- */
    const TABS: { key: TabKey; icon: AXIconName; label: string }[] = [
        { key: "overview", icon: "eye", label: t.ui2.tabs.overview },
        { key: "experience", icon: "briefcase", label: t.ui2.tabs.experience },
        { key: "education", icon: "compass", label: t.ui2.tabs.education },
        { key: "skills", icon: "star", label: t.ui2.tabs.skills },
        { key: "certifications", icon: "document", label: t.ui2.tabs.certifications },
        { key: "challenges", icon: "flag", label: t.ui2.tabs.challenges },
    ]

    /* Profile photo: panel control wins, otherwise the uploaded default.
       The circular header avatar and the rectangular hero portrait have
       separate defaults but share the same panel override. */
    const photoSrc = profileImage && profileImage.src ? profileImage.src : PROFILE_SRC
    const photoSrcSet = profileImage && profileImage.srcSet ? profileImage.srcSet : undefined
    const heroPhotoSrc = profileImage && profileImage.src ? profileImage.src : HERO_PHOTO_SRC
    const heroPhotoSrcSet = profileImage && profileImage.srcSet ? profileImage.srcSet : undefined

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
            {/* ===================== NAVIGATION ===================== */}
            {/* Compact by default (avatar + name + typing dots). Expands on
                hover / keyboard focus on pointer devices, and on tap (the dots
                button) on touch devices. */}
            <div className="aag-nav-wrap">
                <nav className={`aag-nav ${navOpen ? "is-open" : ""}`} aria-label={t.nav.about}>
                    <SiteLink href="/">
                    <a
                        className="aag-brand"
                        href="/"
                        aria-label={`${t.name} — ${t.nav.home}`}
                    >
                        <span className="aag-avatar" aria-hidden="true">
                            <img src={photoSrc} srcSet={photoSrcSet} alt="" loading="eager" decoding="async" />
                        </span>
                        <span className="aag-brand-name">{t.name}</span>
                    </a>
                    </SiteLink>

                    <div className="aag-nav-right">
                        {/* collapsible reveal: links + language switch */}
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

                        {/* typing-indicator dots (also the tap toggle on touch) */}
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

            {/* ===================== CONTENT ===================== */}
            <main
                className="aag-main"
                style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s ease" }}
            >
                {/* ---------- INSTAGRAM-STYLE PROFILE HEADER ---------- */}
                <header className="aag-ig" aria-labelledby="aag-about-heading">
                    <Reveal className="aag-ig-top">
                        <div className="aag-ig-avatar-ring">
                            <span className="aag-ig-avatar">
                                <img
                                    src={heroPhotoSrc}
                                    srcSet={heroPhotoSrcSet}
                                    alt={`${t.name} — ${t.role}`}
                                    loading="eager"
                                    decoding="async"
                                    style={{ objectPosition: HERO_PHOTO_POSITION }}
                                />
                            </span>
                        </div>

                        <div className="aag-ig-meta">
                            <div className="aag-ig-headline">
                                <h1 id="aag-about-heading" className="aag-ig-name">
                                    {t.name}
                                    <span className="aag-ig-verified" aria-hidden="true"><Flower size={26} /></span>
                                </h1>
                            </div>

                            <p className="aag-ig-role">{t.role}</p>

                            {/* Every figure is derived from the data further up this file, so
                                the header can never drift out of sync with the archive tabs.
                                Tools, Skills and Certificates stay three separate readings. */}
                            <ul className="aag-ig-stats" aria-label={t.ui2.profileAria}>
                                {PROFILE_STATS.map((stat) => (
                                    <li key={stat.key}>
                                        <b>{stat.value}</b>
                                        <span>{t.ui2[stat.labelKey]}</span>
                                    </li>
                                ))}
                            </ul>

                            <div className="aag-ig-bio">
                                <p className="aag-ig-loc">
                                    <span className="aag-ig-pin" aria-hidden="true"><AXIcon name="location" size={15} /></span>
                                    {t.location}
                                    <span className="aag-ig-sep" aria-hidden="true">·</span>
                                    <span className="aag-ig-avail">
                                        <span className="aag-ig-live" aria-hidden="true" />
                                        {t.ui2.available}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </Reveal>

                    {/* Story highlights = archive-style section tabs */}
                    <div className="aag-hl" role="tablist" aria-label={t.ui2.profileAria} ref={panelsRef}>
                        {TABS.map((tb) => (
                            <button
                                key={tb.key}
                                type="button"
                                role="tab"
                                id={`aag-tab-${tb.key}`}
                                aria-selected={activeTab === tb.key}
                                aria-controls={`aag-panel-${tb.key}`}
                                className={`aag-hl-item ${activeTab === tb.key ? "is-active" : ""}`}
                                onClick={() => selectTab(tb.key)}
                            >
                                <span className="aag-hl-ring">
                                    <AXIcon name={tb.icon} size={26} />
                                </span>
                                <span className="aag-hl-label">{tb.label}</span>
                            </button>
                        ))}
                    </div>
                </header>

                {/* ---------- OVERVIEW PANEL ---------- */}
                {activeTab === "overview" && (
                    <section
                        className="aag-panel aag-panel--overview"
                        id="aag-panel-overview"
                        role="tabpanel"
                        aria-labelledby="aag-tab-overview"
                    >
                        <div className="aag-overview-grid">
                            <Reveal className="aag-prose">
                                <h2 className="aag-panel-title">{t.ui2.overviewTitle}</h2>
                                <div className="aag-lead">
                                    {t.aboutParagraphs.map((p, i) => (
                                        <p key={i}>{p}</p>
                                    ))}
                                </div>
                            </Reveal>
                            <Reveal className="aag-overview-side" delay={0.06}>
                                <HeroGallery
                                    label={lang === "es" ? "Galería de imágenes" : "Image gallery"}
                                    prevLabel={lang === "es" ? "Anterior" : "Previous"}
                                    nextLabel={lang === "es" ? "Siguiente" : "Next"}
                                />
                            </Reveal>
                        </div>
                    </section>
                )}

                {/* ---------- EXPERIENCE PANEL ---------- */}
                {activeTab === "experience" && (
                <section className="aag-panel" id="aag-panel-experience" role="tabpanel" aria-labelledby="aag-tab-experience">
                    <div className="aag-panel-single">
                        <div className="aag-col">
                            <ul className="aag-card-list" role="list">
                                {visibleExperiences.map((item, index) => {
                                    const d = item[lang]
                                    return (
                                        <Reveal key={item.id} tag="li" delay={Math.min(index, 4) * 0.03}>
                                            <button
                                                type="button"
                                                className="aag-card aag-exp-card aag-card--media"
                                                onClick={() => openModal("exp", index)}
                                                aria-haspopup="dialog"
                                            >
                                                <span
                                                    className="aag-card-media aag-card-logo"
                                                    aria-hidden="true"
                                                    style={LOGO_TILE_BG[item.id] ? { background: LOGO_TILE_BG[item.id], borderColor: LOGO_TILE_BG[item.id] } : undefined}
                                                >
                                                    {EXP_LOGOS[item.id] ? (
                                                        <img
                                                            src={EXP_LOGOS[item.id]}
                                                            alt={d.company}
                                                            loading="lazy"
                                                            decoding="async"
                                                            draggable={false}
                                                        />
                                                    ) : (
                                                        <span className="aag-logo-word">{d.company}</span>
                                                    )}
                                                </span>
                                                <span className="aag-card-main">
                                                    <span className="aag-card-title">{d.position}</span>
                                                    <span className="aag-card-company">{d.company}</span>
                                                    <span className="aag-card-period">{d.period}</span>
                                                </span>
                                                <span className="aag-card-cta" aria-hidden="true">
                                                    <span className="aag-card-hint">{t.cardHint}</span>
                                                    <span className="aag-card-arrow">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M5 12h14M13 6l6 6-6 6" />
                                                        </svg>
                                                    </span>
                                                </span>
                                            </button>
                                        </Reveal>
                                    )
                                })}
                            </ul>
                            {EXPERIENCES.length > INITIAL_COUNT && (
                                <div className="aag-viewall-wrap">
                                    <button
                                        type="button"
                                        className="aag-viewall"
                                        onClick={() => setExpanded((v) => !v)}
                                        aria-expanded={expanded}
                                    >
                                        {expanded ? t.viewLess : t.viewAll}
                                        <span className={`aag-viewall-chevron ${expanded ? "up" : ""}`} aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {/* ---------- EDUCATION PANEL ---------- */}
                {activeTab === "education" && (
                <section className="aag-panel" id="aag-panel-education" role="tabpanel" aria-labelledby="aag-tab-education">
                    <div className="aag-panel-single">
                        <div className="aag-col">
                            <ul className="aag-card-list" role="list">
                                {visibleEducation.map((item, index) => {
                                    const d = item[lang]
                                    return (
                                        <Reveal key={item.id} tag="li" delay={Math.min(index, 4) * 0.03}>
                                            <button
                                                type="button"
                                                className="aag-card aag-edu-card aag-card--media"
                                                onClick={() => openModal("edu", index)}
                                                aria-haspopup="dialog"
                                            >
                                                <span className={`aag-card-media aag-card-logo${item.id === "emprendeuco" ? " aag-card-logo--lg" : ""}`} aria-hidden="true">
                                                    {EDU_LOGOS[item.id] ? (
                                                        <img
                                                            src={EDU_LOGOS[item.id]}
                                                            alt={d.org}
                                                            loading="lazy"
                                                            decoding="async"
                                                            draggable={false}
                                                        />
                                                    ) : (
                                                        <span className="aag-logo-word">{d.org}</span>
                                                    )}
                                                </span>
                                                <span className="aag-edu-main">
                                                    <span className="aag-edu-title">{d.title}</span>
                                                    <span className="aag-edu-org">{d.org}</span>
                                                    <span className="aag-edu-period">{d.period || " "}</span>
                                                </span>
                                                <span className="aag-card-cta" aria-hidden="true">
                                                    <span className="aag-card-hint">{t.cardHint}</span>
                                                    <span className="aag-card-arrow">
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M5 12h14M13 6l6 6-6 6" />
                                                        </svg>
                                                    </span>
                                                </span>
                                            </button>
                                        </Reveal>
                                    )
                                })}
                            </ul>
                            {EDUCATION.length > EDU_INITIAL && (
                                <div className="aag-viewall-wrap">
                                    <button
                                        type="button"
                                        className="aag-viewall"
                                        onClick={() => setEduExpanded((v) => !v)}
                                        aria-expanded={eduExpanded}
                                    >
                                        {eduExpanded ? t.viewLess : t.eduViewAll}
                                        <span className={`aag-viewall-chevron ${eduExpanded ? "up" : ""}`} aria-hidden="true" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                )}

                {/* ---------- CERTIFICATIONS PANEL ---------- */}
                {activeTab === "certifications" && (
                <section className="aag-panel" id="aag-panel-certifications" role="tabpanel" aria-labelledby="aag-tab-certifications">
                    <Reveal delay={0.05}>
                        <ul className="aag-cert-grid" role="list">
                            {LOGOS.map((logo, i) => (
                                <li className="aag-cert" key={i}>
                                    <button
                                        type="button"
                                        className="aag-cert-btn"
                                        onClick={() => openModal("cert", i)}
                                        aria-haspopup="dialog"
                                        aria-label={lang === "es" ? `Ver certificados de ${logo.name}` : `View ${logo.name} certificates`}
                                    >
                                        {logo.src ? (
                                            <img src={logo.src} alt={logo.name} loading="lazy" decoding="async" />
                                        ) : (
                                            <span className="aag-cert-word">{logo.name}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                </section>
                )}

                {/* ---------- CHALLENGES PANEL (Coming Soon) ---------- */}
                {activeTab === "challenges" && (
                <section className="aag-panel" id="aag-panel-challenges" role="tabpanel" aria-labelledby="aag-tab-challenges">
                    <Reveal className="aag-soon-wrap">
                        <div className="aag-soon">
                            <span className="aag-soon-badge">
                                <span className="aag-soon-dot" aria-hidden="true" />
                                {t.ui2.tabs.challenges}
                            </span>
                            <h2 className="aag-soon-title">{t.comingSoon.title}</h2>
                            <p className="aag-soon-text">{t.comingSoon.text}</p>
                        </div>
                    </Reveal>
                </section>
                )}

                {/* ---------- SKILLS PANEL ---------- */}
                {activeTab === "skills" && (
                <section className="aag-panel aag-panel--skills" id="aag-panel-skills" role="tabpanel" aria-labelledby="aag-tab-skills">
                    {/* Two stacked blocks rather than two side-by-side columns: Skills and
                        Tools are separate readings, so they get separate full-width bands
                        and the page simply continues downward on every screen size. The
                        ability list itself splits into two columns from tablet up so it
                        never turns into one very long ribbon. */}
                    <div className="aag-skills-stack">
                        <Reveal className="aag-skills-block">
                            <p className="aag-tools-label">{t.ui2.tabs.skills}</p>
                            <ul className="aag-skill-list" role="list">
                                {SKILL_DETAILS.map((skill, i) => (
                                    <li key={i} className="aag-skill-item" role="listitem">
                                        <button
                                            type="button"
                                            className="aag-skill-row"
                                            onClick={() => openModal("skill", i)}
                                            aria-haspopup="dialog"
                                        >
                                            <span className="aag-skill-badge" aria-hidden="true">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d={SKILL_ICON_PATHS[i % SKILL_ICON_PATHS.length]} />
                                                </svg>
                                            </span>
                                            <span className="aag-skill-copy">
                                                <span className="aag-skill-text">{skill[lang].name}</span>
                                                <span className="aag-skill-what">{skill[lang].what}</span>
                                            </span>
                                            <span className="aag-skill-arrow" aria-hidden="true">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M9 6l6 6-6 6" />
                                                </svg>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </Reveal>

                        <Reveal className="aag-skills-block" delay={0.05}>
                            <p className="aag-tools-label">{t.toolsLabel}</p>
                            <ul className="aag-tools-list" role="list">
                                {TOOLS.map((tool) => (
                                    <li key={tool.name} className="aag-tool">
                                        <span
                                            className="aag-tool-tile"
                                            tabIndex={0}
                                            role="img"
                                            aria-label={tool.name}
                                            style={{ color: TOOL_COLORS[tool.name] || TOOL_INK }}
                                        >
                                            <svg
                                                className="aag-tool-logo"
                                                viewBox="0 0 24 24"
                                                width="22"
                                                height="22"
                                                fill="currentColor"
                                                aria-hidden="true"
                                                focusable="false"
                                            >
                                                <path d={tool.path} />
                                            </svg>
                                        </span>
                                        <span className="aag-tool-tip" aria-hidden="true">
                                            {tool.name}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Reveal>
                    </div>
                </section>
                )}

                {/* ---------- DESIGN PHILOSOPHY (part of Overview) ---------- */}
                {activeTab === "overview" && (
                <section className="aag-panel aag-panel--values" aria-labelledby="aag-values-heading">
                    <Reveal className="aag-values-inner">
                        <h2 id="aag-values-heading" className="aag-panel-title">
                            {t.valuesHeading}
                        </h2>
                        <p className="aag-values-text">{t.valuesText}</p>
                    </Reveal>
                    <Reveal delay={0.06}>
                        <PhotoCarousel images={PHILOSOPHY_IMAGES} reduceMotionRef={reduceMotionRef} />
                    </Reveal>
                </section>
                )}

                {/* ---------- CONTACT / FOOTER ---------- */}
                <div className="aag-footer-shell">
                    <footer className="aag-section aag-footer" id={SECTION.contact}>
                    <div className="aag-footer-top">
                        <Reveal>
                            <p className="aag-footer-small">{t.contactSmall}</p>
                        </Reveal>
                    </div>

                    <Reveal>
                        <SiteLink href={contactHref}>
                        <a
                            className="aag-footer-big-link"
                            href={contactHref}
                            aria-label={`${t.contactBig} — ${email}`}
                        >
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
                            <a
                                className="aag-social"
                                href={`mailto:${email}`}
                                aria-label={t.email}
                                title={t.email}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                                    <path d="M4 7l8 6 8-6" />
                                </svg>
                            </a>
                            <a
                                className="aag-social"
                                href={linkedinUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t.linkedin}
                                title={t.linkedin}
                            >
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

            {/* ===================== DETAIL MODAL (exp · edu · skill) ===================== */}
            {/* Portalled into body so position:fixed resolves against the window,
                not against Framer's clipped page frame. */}
            {portalHost && modal && (expData || eduData || skillData || certData) && createPortal(
                <div
                    className="aag-modal-overlay"
                    style={{
                        opacity: modalShown ? 1 : 0,
                        pointerEvents: modalShown ? "auto" : "none",
                    }}
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) closeModal()
                    }}
                >
                    <div
                        className="aag-modal"
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="aag-modal-title"
                        style={{
                            opacity: modalShown ? 1 : 0,
                            transform: modalShown ? "scale(1)" : "scale(0.96)",
                        }}
                    >
                        <div className="aag-modal-head">
                            <div>
                                <h2 id="aag-modal-title" className="aag-modal-title">
                                    {expData ? expData.company : eduData ? eduData.title : certData ? certLogo?.name : skillData?.name}
                                </h2>
                                {certData && (
                                    <p className="aag-modal-sub">
                                        {lang === "es" ? "Cursos, certificados y formación" : "Courses, certificates & training"}
                                    </p>
                                )}
                                {expData && (
                                    <p className="aag-modal-sub">
                                        {expData.position}
                                        {expData.period ? ` · ${expData.period}` : ""}
                                    </p>
                                )}
                                {eduData && (
                                    <p className="aag-modal-sub">
                                        {eduData.org}
                                        {eduData.period ? ` · ${eduData.period}` : ""}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                className="aag-modal-close-icon"
                                ref={closeBtnRef}
                                onClick={closeModal}
                                aria-label={t.close}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                                    <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                            </button>
                        </div>

                        <div className="aag-modal-body">
                            {/* ---- experience ---- */}
                            {expData && expItem && (
                                <>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.modalAbout}</p>
                                        <p className="aag-modal-text">{expData.sector}</p>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.modalResponsibilities}</p>
                                        <ul className="aag-modal-resp" role="list">
                                            {expData.responsibilities.map((r, i) => (
                                                <li key={i}>{r}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    {(EXP_ACHIEVEMENTS[expItem.id]?.[lang] || []).length > 0 && (
                                        <div className="aag-modal-block">
                                            <p className="aag-modal-label">{t.modalAchievements}</p>
                                            <ul className="aag-modal-resp" role="list">
                                                {(EXP_ACHIEVEMENTS[expItem.id]?.[lang] || []).map((a, i) => (
                                                    <li key={i}>{a}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(EXP_TECH[expItem.id] || []).length > 0 && (
                                        <div className="aag-modal-block">
                                            <p className="aag-modal-label">{t.modalTech}</p>
                                            <ul className="aag-modal-tech" role="list">
                                                {(EXP_TECH[expItem.id] || []).map((tech, i) => (
                                                    <li key={i} className="aag-tech-chip">{tech}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(EXP_SKILLS[expItem.id]?.[lang] || []).length > 0 && (
                                        <div className="aag-modal-block">
                                            <p className="aag-modal-label">{t.modalSkills}</p>
                                            <ul className="aag-modal-tech" role="list">
                                                {(EXP_SKILLS[expItem.id]?.[lang] || []).map((s, i) => (
                                                    <li key={i} className="aag-tech-chip">{s}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ---- education ---- */}
                            {eduData && (
                                <>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.eduTopics}</p>
                                        <ul className="aag-modal-resp" role="list">
                                            {eduData.topics.map((r, i) => (
                                                <li key={i}>{r}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.eduSkills}</p>
                                        <ul className="aag-modal-tech" role="list">
                                            {eduData.skills.map((s, i) => (
                                                <li key={i} className="aag-tech-chip">{s}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    {eduData.projects.length > 0 && (
                                        <div className="aag-modal-block">
                                            <p className="aag-modal-label">{t.eduProjects}</p>
                                            <ul className="aag-modal-resp" role="list">
                                                {eduData.projects.map((p, i) => (
                                                    <li key={i}>{p}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.eduKnowledge}</p>
                                        <p className="aag-modal-text">{eduData.knowledge}</p>
                                    </div>
                                </>
                            )}

                            {/* ---- skill ---- */}
                            {skillData && (
                                <>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.skillWhat}</p>
                                        <p className="aag-modal-text">{skillData.what}</p>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.skillWhere}</p>
                                        <p className="aag-modal-text">{skillData.where}</p>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.skillExamples}</p>
                                        <ul className="aag-modal-resp" role="list">
                                            {skillData.examples.map((e, i) => (
                                                <li key={i}>{e}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">{t.skillImpact}</p>
                                        <p className="aag-modal-text">{skillData.impact}</p>
                                    </div>
                                </>
                            )}

                            {/* ---- certificate ---- */}
                            {certData && (
                                <>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-text">{certData.blurb}</p>
                                    </div>
                                    <div className="aag-modal-block">
                                        <p className="aag-modal-label">
                                            {lang === "es" ? "Cursos y certificados" : "Courses & certificates"}
                                        </p>
                                        <ul className="aag-cert-items" role="list">
                                            {certData.items.map((it, i) => (
                                                <li key={i} className="aag-cert-item">
                                                    <span className="aag-cert-item-title">{it.title}</span>
                                                    {it.meta && <span className="aag-cert-item-meta">{it.meta}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="aag-modal-foot">
                            <button type="button" className="aag-modal-close-text" onClick={closeModal}>
                                {t.close}
                            </button>
                        </div>
                    </div>
                </div>,
                portalHost
            )}

            {/* ===================== BACK TO TOP + STATUS PILL ===================== */}
            {portalHost && createPortal(
                <>
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

addPropertyControls(AboutPage, {
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
   STYLES
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
.aag-card-list { margin-top: 32px; display: flex; flex-direction: column; gap: 16px; }
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
    /* Uniform card height so every title/label lines up at the same vertical
       rhythm across the whole list, regardless of how many text lines it has. */
    min-height: clamp(100px, 12vw, 132px);
    cursor: pointer;
    transition: transform 0.24s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.24s ease, border-color 0.24s ease;
}
.aag-exp-card:hover, .aag-edu-card:hover,
.aag-exp-card:focus-visible, .aag-edu-card:focus-visible {
    transform: translateY(-2px);
    box-shadow: var(--shadow);
    border-color: #d3d3cc;
}
.aag-card-main { flex: 1; display: grid; grid-template-rows: 2.6em auto auto; align-content: center; gap: 5px; min-width: 0; text-align: left; }
.aag-card-title { align-self: center; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.aag-card-company { font-size: 14px; color: var(--muted); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aag-card-period { font-size: 13px; color: var(--muted); opacity: 0.85; line-height: 1.3; margin-top: 1px; min-height: 1.3em; }
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
.aag-edu-main { flex: 1; display: grid; grid-template-rows: 2.6em auto auto; align-content: center; gap: 5px; min-width: 0; text-align: left; }
.aag-edu-title { align-self: center; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.aag-edu-org { font-size: 14px; color: var(--muted); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aag-edu-period { font-size: 13px; color: var(--muted); opacity: 0.85; line-height: 1.3; min-height: 1.3em; }
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
.aag-logo--big { height: 48px; }
.aag-logo-word {
    font-size: 21px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #2a2a2a;
    white-space: nowrap;
}

/* ---------- SKILLS ---------- */
.aag-skills { padding-top: clamp(70px, 9vw, 130px); scroll-margin-top: 96px; }
/* Skills and Tools are stacked bands, each the full width of the panel. */
.aag-skills-stack { display: flex; flex-direction: column; gap: clamp(40px, 6vw, 72px); }
.aag-skills-block { min-width: 0; }
.aag-skills-block .aag-tools-label { margin-bottom: 18px; }
.aag-skills-title {
    font-size: clamp(30px, 3.6vw, 46px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.08;
}
.aag-tools { margin-top: 34px; }
.aag-tools-label { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.aag-tools-list { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 12px; }
/* The tool tiles are a free-flowing wrap: they fill the row available and drop
   to the next one on their own, so the block never has to be squeezed. */
.aag-skills-block .aag-tools-list { margin-top: 0; gap: clamp(10px, 1.2vw, 14px); }
.aag-tool { position: relative; display: inline-flex; }
.aag-tool-tile {
    width: 46px; height: 46px;
    border-radius: 13px;
    background: #ffffff;
    border: 1px solid var(--border);
    /* colour is set inline per tool and inherited by the glyph (fill:currentColor) */
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.2s ease, border-color 0.2s ease;
}
.aag-tool-tile:hover, .aag-tool-tile:focus-visible { transform: translateY(-3px); box-shadow: var(--shadow); border-color: #d9d9d2; }
.aag-tool-logo { width: 22px; height: 22px; display: block; }
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
/* Two columns of ability cards on desktop and tablet landscape — the eight
   items read as a compact block instead of one long single-file list. Capped
   at two on purpose: a third column would squeeze each card past comfortable
   reading width. One column once there is genuinely no room for two. */
.aag-skill-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
}
@media (max-width: 760px) {
    .aag-skill-list { grid-template-columns: minmax(0, 1fr); }
}
.aag-skill-item { border-bottom: none; min-width: 0; }
/* Modern cards — each skill is a self-contained card with a one-line descriptor. */
.aag-skill-row {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 15px;
    padding: 17px 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    cursor: pointer;
    text-align: left;
    color: var(--text);
    transition: background 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease, transform 0.24s cubic-bezier(0.22,0.61,0.36,1);
}
.aag-skill-row:hover, .aag-skill-row:focus-visible {
    box-shadow: var(--shadow);
    border-color: #d9d9d2;
    transform: translateY(-2px);
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
.aag-skill-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-top: 1px; }
.aag-skill-text { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; }
.aag-skill-what { font-size: 13px; color: var(--muted); line-height: 1.45; }
.aag-skill-arrow {
    flex-shrink: 0;
    color: var(--muted);
    display: inline-flex;
    margin-top: 8px;
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
.aag-values-text { margin-top: 40px; font-size: clamp(17px, 1.8vw, 20px); line-height: 1.65; color: #333; max-width: 780px; }
.aag-values-list { margin-top: 44px; display: flex; flex-wrap: wrap; gap: 10px; }
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
    width: clamp(260px, 32vw, 360px);
    aspect-ratio: 4 / 5;
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
    max-height: 86dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
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
@media (max-width: 1024px) {
    .aag-root { --pad: 32px; }
    .aag-hero-grid { grid-template-columns: minmax(260px, 340px) 1fr; gap: 40px; }
    .aag-two-col { gap: 32px; }
    /* Tablet, landscape included: the page becomes one main column and simply
       keeps going downward instead of squeezing the desktop side-by-side
       structure into a narrower frame. */
    .aag-overview-grid { grid-template-columns: 1fr; gap: clamp(30px, 5vw, 48px); }
    .aag-gallery { position: static; }
    .aag-gallery-stage { aspect-ratio: 4 / 5; max-width: 480px; margin: 0 auto; }
    .aag-gallery-nav { opacity: 0.92; }
}
@media (max-width: 820px) {
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
    .aag-photocar-item { width: clamp(280px, 46vw, 380px); }
}
/* Breakpoint 2 (Tablet) only — pull the typing dots next to the name and
   slightly shrink them. Excludes phone (<=480) and desktop (>=821). */
@media (min-width: 481px) and (max-width: 820px) {
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
    .aag-photocar-item { width: clamp(260px, 78vw, 340px); }
    .aag-tool-tile { width: 42px; height: 42px; }
}

/* ============ Instagram-style profile header + archive tabs ============ */
.aag-ig { width: 100%; max-width: var(--maxw); margin: 0 auto; padding: 100px var(--pad) 0; }
.aag-ig-top { display: flex; align-items: center; gap: clamp(24px, 5vw, 60px); }
.aag-ig-avatar-ring {
    flex-shrink: 0;
    width: clamp(140px, 22vw, 208px);
    height: clamp(140px, 22vw, 208px);
    border-radius: 50%;
    padding: 4px;
    background: conic-gradient(from 210deg, var(--accent), #ffb37a, #8b5cf6, #2f6df6, var(--accent));
    box-shadow: var(--shadow-sm);
}
.aag-ig-avatar {
    display: block; width: 100%; height: 100%;
    border-radius: 50%; overflow: hidden;
    border: 4px solid var(--surface); background: #e9e9e5;
}
.aag-ig-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.aag-ig-meta { flex: 1; min-width: 0; }
.aag-ig-headline { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 18px; }
.aag-ig-name { display: inline-flex; align-items: center; gap: 12px; font-size: clamp(26px, 3.4vw, 40px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.05; }
.aag-ig-verified { color: var(--accent); font-size: 0.6em; }
.aag-ig-actions { display: inline-flex; gap: 10px; flex-wrap: wrap; }
.aag-ig-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; padding: 0 18px; border-radius: 10px; background: rgba(0,0,0,0.05); color: var(--text); font-size: 14px; font-weight: 600; transition: background 0.2s ease, transform 0.16s ease, box-shadow 0.2s ease; }
.aag-ig-btn:hover { background: rgba(0,0,0,0.09); transform: translateY(-1px); }
.aag-ig-btn--primary { background: var(--accent); color: #fff; }
.aag-ig-btn--primary:hover { background: #f0503a; box-shadow: 0 8px 20px rgba(255,101,77,0.32); }
/* Five readings that wrap on their own terms: a row while there is room, then
   as many rows as the width allows. Nothing is forced onto a single line. */
.aag-ig-stats {
    display: flex;
    flex-wrap: wrap;
    column-gap: clamp(20px, 3.2vw, 42px);
    row-gap: 12px;
    margin-bottom: 26px;
    max-width: 680px;
}
.aag-ig-stats li { display: flex; align-items: baseline; gap: 7px; font-size: 15px; color: var(--muted); white-space: nowrap; }
.aag-ig-stats b { font-size: 19px; font-weight: 700; color: var(--text); }
.aag-ig-bio { max-width: 620px; }
.aag-ig-role {
    font-weight: 600;
    color: var(--muted);
    margin: -6px 0 22px;
    font-size: clamp(16px, 1.7vw, 20px);
    letter-spacing: -0.01em;
}
.aag-ig-loc { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 14px; color: var(--muted); }
.aag-ig-sep { opacity: 0.45; }
.aag-ig-avail { display: inline-flex; align-items: center; gap: 6px; color: var(--text); font-weight: 600; }
.aag-ig-live, .aag-info-live { width: 8px; height: 8px; border-radius: 50%; background: #12b886; display: inline-block; box-shadow: 0 0 0 0 rgba(18,184,134,0.5); animation: aag-pulse 2s infinite; }
@keyframes aag-pulse { 0% { box-shadow: 0 0 0 0 rgba(18,184,134,0.45); } 70% { box-shadow: 0 0 0 7px rgba(18,184,134,0); } 100% { box-shadow: 0 0 0 0 rgba(18,184,134,0); } }

.aag-hl { display: flex; gap: clamp(14px, 2.4vw, 30px); overflow-x: auto; padding: 30px 0 6px; margin-top: 30px; border-top: 1px solid var(--border); scrollbar-width: none; scroll-margin-top: 90px; -webkit-overflow-scrolling: touch; scroll-snap-type: x proximity; overscroll-behavior-x: contain; }
.aag-hl::-webkit-scrollbar { display: none; }
.aag-hl-item { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px; background: transparent; border: none; cursor: pointer; padding: 4px 2px; width: 76px; scroll-snap-align: center; }
/* Minimal nav circles — just a clean icon holder + label (no rotating/ring decoration) */
.aag-hl-ring { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--surface); border: 1px solid var(--border); color: var(--muted); transition: transform 0.24s ease, background 0.24s ease, border-color 0.24s ease, color 0.24s ease; }
.aag-hl-item:hover .aag-hl-ring { transform: translateY(-2px); border-color: #cfcfc7; color: var(--text); }
.aag-hl-item.is-active .aag-hl-ring { background: var(--accent); border-color: var(--accent); color: #fff; }
.aag-hl-emoji { line-height: 1; }
.aag-hl-label { font-size: 12.5px; font-weight: 600; color: var(--muted); letter-spacing: -0.01em; white-space: nowrap; transition: color 0.2s ease; }
.aag-hl-item.is-active .aag-hl-label { color: var(--text); }

.aag-panel { width: 100%; max-width: var(--maxw); margin: 0 auto; padding: clamp(30px, 4vw, 52px) var(--pad) clamp(44px, 6vw, 84px); animation: aag-panel-in 0.4s cubic-bezier(0.22,1,0.36,1) both; }
.aag-static .aag-panel { animation: none; }
@keyframes aag-panel-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.aag-panel-kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
.aag-panel-title { font-size: clamp(26px, 3.4vw, 40px); font-weight: 600; letter-spacing: -0.025em; line-height: 1.06; margin-bottom: 12px; }
.aag-panel-lead { font-size: clamp(16px, 1.7vw, 18px); color: var(--muted); max-width: 640px; line-height: 1.5; margin-bottom: 8px; }

.aag-overview-grid { display: grid; grid-template-columns: 1fr minmax(300px, 440px); gap: clamp(30px, 5vw, 68px); align-items: start; }
.aag-info-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 22px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 14px; position: sticky; top: 96px; }
.aag-info-row { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 500; color: var(--text); }
.aag-info-row > span[aria-hidden] { font-size: 17px; min-width: 20px; text-align: center; flex-shrink: 0; }

/* ---- Hero image gallery (replaces the info card) ---- */
.aag-gallery { position: sticky; top: 96px; display: block; }
.aag-gallery-stage {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 4 / 5;
    border-radius: 18px;
    overflow: hidden;
    background: #ececE8;
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    padding: 0;
    cursor: pointer;
}
.aag-gallery-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 0; transform: scale(1.03); transition: opacity 0.7s cubic-bezier(0.22,0.61,0.36,1), transform 3.5s ease-out; }
.aag-gallery-img.is-active { opacity: 1; transform: scale(1); }
.aag-static .aag-gallery-img { transition: none; transform: none; }
.aag-static .aag-gallery-img:first-child { opacity: 1; }
.aag-gallery-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 3;
    width: 34px; height: 34px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.5);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: var(--text);
    opacity: 0;
    cursor: pointer;
    transition: opacity 0.25s ease, background 0.2s ease;
}
.aag-gallery-nav--prev { left: 10px; }
.aag-gallery-nav--next { right: 10px; }
.aag-gallery-stage:hover .aag-gallery-nav,
.aag-gallery-stage:focus-visible .aag-gallery-nav,
.aag-gallery-nav:focus-visible { opacity: 0.92; }
.aag-gallery-nav:hover { background: #fff; }
.aag-gallery-count {
    position: absolute;
    left: 12px; bottom: 12px;
    z-index: 3;
    font-size: 12px; font-weight: 600; letter-spacing: 0.06em;
    color: #fff;
    background: rgba(0,0,0,0.32);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    padding: 4px 10px;
    border-radius: 999px;
}
@media (max-width: 820px) {
    .aag-overview-grid { grid-template-columns: 1fr; }
    .aag-gallery { position: static; }
    .aag-gallery-stage { aspect-ratio: 4 / 5; max-width: 460px; margin: 0 auto; }
    .aag-gallery-nav { opacity: 0.92; }
}

.aag-panel-single { max-width: 780px; }

.aag-cert-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin-top: 24px; }
.aag-cert { display: flex; align-items: stretch; justify-content: center; min-height: 96px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-sm); overflow: hidden; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.aag-cert:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: #d3d3cc; }
.aag-cert-btn { appearance: none; -webkit-appearance: none; background: transparent; border: none; margin: 0; font: inherit; color: inherit; box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 96px; padding: 20px; cursor: pointer; }
.aag-cert-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; border-radius: 14px; }
.aag-cert img { max-width: 100%; max-height: 54px; object-fit: contain; transition: transform 0.24s ease; }
.aag-cert:hover img { transform: scale(1.04); }
.aag-cert-word { font-weight: 700; color: var(--text); text-align: center; }
/* Certificate modal — list of courses / certificates / training */
.aag-cert-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.aag-cert-item { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 13px 15px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.aag-cert-item-title { font-size: 14px; font-weight: 500; color: var(--text); line-height: 1.4; }
.aag-cert-item-meta { flex-shrink: 0; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }

.aag-panel--cta { display: flex; justify-content: center; }
.aag-cta-card { width: 100%; max-width: 640px; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 26px; padding: clamp(36px, 5vw, 60px); box-shadow: var(--shadow); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.aag-cta-emoji { font-size: 44px; margin-bottom: 6px; }
.aag-cta-btn { height: 50px; padding: 0 26px; font-size: 16px; margin-top: 16px; border-radius: 12px; }

.aag-contact-links { display: flex; flex-direction: column; gap: 12px; max-width: 560px; margin-top: 24px; }
.aag-contact-link { display: flex; align-items: center; gap: 16px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow-sm); transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
.aag-contact-link:hover { transform: translateX(4px); box-shadow: var(--shadow); border-color: #cfcfc8; }
.aag-contact-ico { flex-shrink: 0; width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.05); font-size: 18px; font-weight: 700; color: var(--text); }
.aag-contact-ico--in { font-size: 15px; }
.aag-contact-t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.aag-contact-t b { font-size: 15px; font-weight: 700; }
.aag-contact-t span { font-size: 13.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aag-contact-arrow { color: var(--muted); font-size: 18px; transition: transform 0.2s ease, color 0.2s ease; }
.aag-contact-link:hover .aag-contact-arrow { color: var(--accent); transform: translateX(3px); }

.aag-panel--values { display: grid; grid-template-columns: minmax(0, 1fr); gap: 26px; }
.aag-panel--values > * { min-width: 0; max-width: 100%; }
.aag-values-inner { min-width: 0; }
.aag-values-text { overflow-wrap: break-word; }

/* ---- Experience / Education cards with a uniform brand-logo tile ----
   Every logo sits contained on an identical white tile with consistent padding,
   so aspect ratios are preserved and all entries align exactly the same. */
.aag-card--media .aag-card-media {
    flex-shrink: 0;
    width: clamp(96px, 13vw, 132px);
    height: clamp(66px, 8.5vw, 88px);
    border-radius: 12px;
    overflow: hidden;
    background: var(--logo-tile);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(9px, 1.1vw, 14px);
}
/* Treat the tile as a clipping mask: the artwork is scaled down to fit inside
   it, never up and never cropped, so every mark keeps its own proportions and
   sits optically centred with the same breathing room as its neighbours. */
.aag-card--media .aag-card-media img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center;
    display: block;
    transition: transform 0.4s ease;
}
.aag-card--media:hover .aag-card-media img, .aag-card--media:focus-visible .aag-card-media img { transform: scale(1.04); }
/* EmprendeUCO is a wide, airy lockup, so in a shared tile it reads much smaller
   than the other institution marks. Its artwork is trimmed to the logo itself
   and the tile padding is pulled right in, giving it real presence while the
   aspect ratio, centring and frame stay identical to its neighbours. */
.aag-card--media .aag-card-media.aag-card-logo--lg { padding: clamp(3px, 0.35vw, 5px); }
.aag-logo-word {
    font-size: clamp(13px, 1.4vw, 15px);
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.15;
    text-align: center;
    color: var(--fg, #1a1a17);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
@media (max-width: 520px) {
    .aag-card--media { gap: 12px; padding: 14px; }
    .aag-card--media .aag-card-media { width: 84px; height: 60px; padding: 9px; }
}

/* ---- Challenges panel ---- */
.aag-chal-grid { margin-top: clamp(26px, 4vw, 44px); display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(16px, 2vw, 24px); }
.aag-chal-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow-sm);
    padding: clamp(22px, 2.4vw, 30px);
    display: flex;
    flex-direction: column;
    transition: transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease, border-color 0.28s ease;
}
.aag-chal-card:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: #d3d3cc; }
.aag-chal-index { font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: var(--accent); margin-bottom: 16px; }
.aag-chal-title { font-size: clamp(18px, 1.9vw, 21px); font-weight: 600; letter-spacing: -0.015em; line-height: 1.18; margin-bottom: 10px; }
.aag-chal-text { font-size: 14.5px; line-height: 1.55; color: var(--muted); }
@media (max-width: 820px) { .aag-chal-grid { grid-template-columns: 1fr; } }

/* ---- Coming soon card ---- */
.aag-soon-wrap { margin-top: clamp(26px, 4vw, 44px); }
.aag-soon {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 22px;
    box-shadow: var(--shadow-sm);
    padding: clamp(44px, 6.5vw, 84px) clamp(24px, 4vw, 48px);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
}
.aag-soon-badge {
    display: inline-flex; align-items: center; gap: 9px;
    font-size: 12.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--muted);
}
.aag-soon-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent);
    animation: aag-soon-pulse 2.4s ease-out infinite;
}
.aag-static .aag-soon-dot { animation: none; }
@keyframes aag-soon-pulse {
    0% { box-shadow: 0 0 0 0 rgba(255,101,77,0.30); }
    70% { box-shadow: 0 0 0 9px rgba(255,101,77,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,101,77,0); }
}
.aag-soon-title { font-size: clamp(24px, 3vw, 34px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.12; margin-top: 4px; }
.aag-soon-text { font-size: 15px; line-height: 1.6; color: var(--muted); max-width: 460px; }

/* ---- Inspiration panel ---- */
.aag-insp { max-width: 720px; }
.aag-insp-chips { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 10px; }
.aag-insp-chip {
    font-size: 13.5px; font-weight: 600; color: #3a3a3a;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 8px 16px;
    transition: border-color 0.22s ease, color 0.22s ease, transform 0.22s ease;
}
.aag-insp-chip:hover { border-color: var(--accent); color: var(--accent); transform: translateY(-2px); }
.aag-insp-cta {
    margin-top: clamp(28px, 4vw, 40px);
    display: inline-flex; align-items: center; gap: 10px;
    height: 52px; padding: 0 26px;
    border-radius: 999px;
    background: var(--text); color: #fff;
    font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
    box-shadow: 0 12px 28px rgba(0,0,0,0.16);
    transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), background 0.22s ease, box-shadow 0.22s ease;
}
.aag-insp-cta:hover { transform: translateY(-2px); background: #000; box-shadow: 0 18px 38px rgba(0,0,0,0.22); }
.aag-insp-cta-arrow { display: inline-flex; transition: transform 0.22s ease; }
.aag-insp-cta:hover .aag-insp-cta-arrow { transform: translateX(4px); }

@media (max-width: 760px) {
    .aag-ig { padding-top: 88px; }
    .aag-ig-top { gap: 20px; align-items: flex-start; }
    .aag-ig-headline { flex-direction: column; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .aag-ig-stats { gap: 24px; margin-bottom: 14px; }
    .aag-overview-grid { grid-template-columns: 1fr; }
    .aag-info-card { position: static; }
    /* Tab strip: shrink rings and tighten gaps so more tabs read at once and the
       next one peeks past the edge, signalling the strip scrolls horizontally. */
    .aag-hl { gap: 14px; padding-top: 24px; margin-top: 24px; }
    .aag-hl-ring { width: 52px; height: 52px; font-size: 22px; }
    .aag-hl-item { width: 60px; }
    .aag-hl-label { font-size: 11.5px; }
}
@media (max-width: 480px) {
    .aag-ig-avatar-ring { width: 92px; height: 92px; }
    .aag-ig-stats b { font-size: 17px; }
    .aag-ig-actions { width: 100%; }
    .aag-ig-btn { flex: 1; }
    /* Edge-to-edge scroller with a little breathing room so the first/last tab
       never sits flush against the screen edge. */
    .aag-hl { gap: 12px; padding-left: 2px; padding-right: 2px; }
    .aag-hl-ring { width: 48px; height: 48px; font-size: 21px; }
    .aag-hl-item { width: 56px; gap: 6px; }
    .aag-hl-label { font-size: 11px; }
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
