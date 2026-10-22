# zobrochat — Z Ink note

This is the retired Z Chat app: `index.html` redirects immediately and
`chat.html` after 6 seconds, both to `https://z-chat.men`. `app.js`, `chat.js`,
`firebase-config.js` and `sw.js` are the unreferenced remains of the old app and
are left alone.

The two pages were restyled to **Z Ink** (`.opencode/skills/z-ink` in
`TheZverse`). `node .opencode/skills/z-ink/zcheck.mjs .` → **24/24 identity
rules**, clean, with three deliberate deviations:

| decision | why |
| --- | --- |
| **Accent blue 262 / .18** — the Z Chat hue | this page is Z Chat's old face; giving it a different hue would make the hand-off look like a different product |
| **Dark only** (no `:root[data-theme="light"]`) | the old app shipped no theme switch, so there is nothing to flip to; the family already has dark-only tools (Z Slides, Z Games, Z Console) |
| **Self-hosted fonts** (no Google Fonts `<link>`) | a redirect page must not leak a visitor's IP to Google — the same reason Z Chat self-hosts `public/fonts` |

Everything else is the canonical sheet: the four-step 275 surface ladder, one
radius root, one easing curve, the global touch layer, safe-area insets, and a
splash card (`--radius-3xl` + `--theme-shadow-lift`) under a single accent glow.

The icon and manifest colours are the computed sRGB of
`oklch(.66 .18 262)` = `#528dff` and `oklch(.145 .008 275)` = `#090a0e` — icon
and manifest files are outside the CSS token sheet, so they carry literals on
purpose (brand mark + pre-theme paint).
