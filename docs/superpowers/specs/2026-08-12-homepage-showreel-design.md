# Homepage rebuild — locked showreel

**Date:** 2026-08-12
**Project:** Framer `RidtcSBaZOubrbe8J4y4` ("Copia prueba") — Auxi Arroyo García portfolio
**File touched:** `HomePage.tsx` (code component, page `/`)
**Reference:** https://urgent.agency/

## Goal

Replace the current scrolling homepage (editorial hero → moodboard carousel) with a
single locked screen: full-bleed project photography cycling behind the greeting,
with the site menu moved to the bottom. Modelled on urgent.agency's homepage.

## What the reference does

Read from its DOM, since its background videos never loaded in-browser:

- `body { overflow: hidden }`, page height == viewport height. No page scroll.
- Swiper carousel, one full-bleed video per project, advanced by a "Next" control.
- Per slide: small project name (14px) above a large tagline (43px, weight 500), bottom-left.
- Wordmark "Urgent.Agency" at 115px, weight 500, letter-spacing −2.56px, top of screen.
- Floating dark pill nav, bottom-centre. Active item = filled white pill, dark text.
- Background `#171717`, pure white text. Monochrome. Single typeface (Aeonik), weights 400/500.

## Decisions

| Question | Decision |
|---|---|
| Scope | Full structural rebuild — locked one-screen showreel |
| Slides | 5, one per project, using existing covers as-is |
| Advance | Auto every 5s. No Next button |
| Clickable | No. Slides are inert; work is reached via the nav |
| Greeting + CTA | Kept — becomes the page's mega type |
| ES / EN switch | Kept |
| Light / dark toggle | Kept. Light mode = pale scrim + near-black text, same photos |
| Intro loader + status pill | Kept, unchanged |
| Default language | Spanish |
| Accent | Coral `#ff654d` retained on the CTA |
| Progress indicator | None |

## Slides

Content already exists in `ProjectsPage.tsx`; reuse it verbatim so the homepage and
the Projects page never drift.

| # | Project | Category label (ES / EN) | Asset |
|---|---|---|---|
| 1 | Youicy | UX/UI · Product Design | `TEKuG4iwmIVaNvgghhuT4kVlp6g.svg` (1600×1000 flat vector) |
| 2 | Nailing | UX/UI · App móvil / Mobile App | `JyJznDuFATRiIbntuPj3mRwQkw.png` (4500×3000) |
| 3 | Chroma | Editorial · Print | `iE8mTwTJh2eFlAF9SpWoclrthcM.png` (~1500×1125) |
| 4 | The Neon Museum | Branding · Rebranding | `6uXPO81uvlYA2kRF8tPjYbGtzg.png` (681×480) |
| 5 | Bokobá | Branding · Packaging | `KyAuNTvy7aCNxOhDAFoDemtB1c8.gif` (1400×900, animated) |

**Known and accepted quality gaps:** slide 4 is 681×480 and will look soft at full
screen; slide 1 is flat vector and reads differently from the four photographs.
Accepted deliberately so all five projects appear. Swapping in higher-resolution art
later is a drop-in change to the `SLIDES` array.

## Layout

```
┌───────────────────────────────────────────────────────────┐
│ ◯ Auxi Arroyo García                    ☀/☾   ES / EN     │
│                                                           │
│   Hola, soy Auxi.                          ← mega type    │
│   Una Product & Brand Designer a la que                   │
│   le gusta hacer que lo bello funcione.                   │
│                                                           │
│   [ Hablemos → ]                           ← coral CTA    │
│                                                           │
│   Branding · Packaging                     ← caption,     │
│   Bokobá                          ◐           quiet       │
│        ( Inicio  Sobre mí  Proyectos  Jardín  Contacto )  │
└───────────────────────────────────────────────────────────┘
     full-bleed project image, crossfading every 5s
```

- The greeting takes the role the reference gives its wordmark. There is no separate
  giant name — the name stays small, top-left, beside the avatar.
- The caption is deliberately smaller than the reference's 43px so it does not compete
  with the greeting. It crossfades in sync with the image behind it.
- The nav pill moves from its current top position to bottom-centre. Elsewhere on
  the site the pill starts collapsed and opens on hover; here the links are the
  only thing on the page to click, so they stay open on desktop.
- The brand flower is kept above the greeting. It was not in the approved sketch,
  but it is an existing brand mark and removing it was never asked for.

### Status pill

The pill is fixed to the **bottom-left** — not bottom-right, as first assumed —
and is ~400px wide, so it landed on both the caption and the centred menu. On this
page only it is lifted clear of the whole bottom row (104px, 152px under 900px).

It is portalled to `<body>`, outside this component's tree, so the offset is driven
by an `aag-sr-mounted` class on `<html>`. That flag is separate from `aag-sr-on`,
which locks document scroll: the lock is live-site-only, while the offset must also
apply on the Framer canvas, where the pill would otherwise cover the caption.

### Alignment across breakpoints

| Width | Greeting | Caption | Menu |
|---|---|---|---|
| > 900px | left | left, same row as menu | centred |
| 600–900px | left | left, own row above menu | centred |
| < 600px | centred | centred | centred |

The caption never centres while the greeting is still left-aligned; they move together.

## Behaviour

- **Cycle:** 5s per slide, ~1.2s crossfade, infinite loop. A slow scale drift
  (1.0 → 1.06 over the slide's life) keeps a still image from feeling dead.
- **Scrim:** two stacked gradients — a left-weighted horizontal pass (0.93 → 0.24)
  where the greeting and caption sit, plus a lighter vertical pass for the top and
  bottom edges. Required — Nailing is near-white and Bokobá is bright cyan, so
  unscrimmed text would vanish. A purely vertical scrim was tried first and
  flattened the whole photograph into a wash; weighting it left keeps the right
  half of each image reading as an image. Below 600px the text centres, so the
  scrim reverts to a symmetric vertical gradient.
  Dark mode: black-based scrim, white text. Light mode: white-based scrim, near-black text.
- **Preloading:** all five images preloaded on mount so a crossfade never lands on a blank.
- **`prefers-reduced-motion`:** cycling stops on slide 1, no drift, no crossfade.
- **Static renderer:** renders slide 1 with no timers, so the Framer canvas and the
  published static HTML both show a stable frame.
- **Scroll lock:** `overflow: hidden` scoped to this page's root, undone on unmount so
  it cannot leak into other pages.

## Constraints

- Single file, `HomePage.tsx`. No other page changes.
- Nav markup, theme hook, language hook, intro loader and status pill are shared
  verbatim with the rest of the site — keep their class names and behaviour identical
  so the site still reads as one system.
- The moodboard carousel and its 12-image `MOOD` array are removed; the `Moodboard`
  component and its CSS go with them.

## Out of scope

- Any other page.
- Publishing. The change lands in the project; publishing is a separate call.
