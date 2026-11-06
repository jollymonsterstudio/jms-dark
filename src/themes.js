/*
 * JMS Dark — colour themes.
 *
 * A theme is a flat map of palette tokens → CSS colours. Each token becomes a
 * `--jd-<token>` custom property that every rule in themes/*.css reads, so a
 * theme never needs its own stylesheet. One Dark is also baked into base.css
 * as the fallback, which is why it is the default.
 *
 * Shared by the content script, popup and options page (loaded as a plain
 * script; exposes globalThis.JMS_THEMES).
 */
(() => {
  "use strict";
  if (globalThis.JMS_THEMES) return;

  /** Editable tokens, grouped for the theme editor. */
  const TOKENS = [
    { group: "Surfaces", items: [
      ["bg", "Page background"],
      ["bg-alt", "Sidebars, menus, dialogs"],
      ["bg-deep", "Inputs, code, top bar"],
      ["surface", "Cards, table headers, panels"],
      ["hover", "Hover"],
      ["select", "Selected row / card"],
      ["border", "Border"],
      ["border-hi", "Strong border"],
    ] },
    { group: "Text", items: [
      ["text", "Body text"],
      ["text-hi", "Headings, emphasis"],
      ["text-dim", "Secondary text"],
      ["text-faint", "Placeholders, comments"],
    ] },
    { group: "Accents", items: [
      ["blue", "Links"],
      ["blue-hi", "Link hover"],
      ["accent", "Primary button"],
      ["accent-hi", "Primary button hover"],
      ["on-accent", "Text on primary button"],
      ["green", "Success, strings"],
      ["yellow", "Warning, notes"],
      ["red", "Error, deletions"],
      ["purple", "Keywords"],
      ["cyan", "Info, preprocessor"],
      ["orange", "Inline code, numbers"],
      ["image-bg", "Behind transparent images"],
    ] },
  ];

  const TOKEN_IDS = TOKENS.flatMap((g) => g.items.map(([id]) => id));

  const BUILT_IN = {
    "one-dark": {
      name: "One Dark",
      builtIn: true,
      colors: {
        "bg": "#282c34", "bg-alt": "#21252b", "bg-deep": "#1b1d23", "surface": "#2c313a",
        "hover": "#353b45", "select": "#3a4a66", "border": "#3e4451", "border-hi": "#4b5263",
        "text": "#abb2bf", "text-hi": "#dcdfe4", "text-dim": "#8b929e", "text-faint": "#5c6370",
        "blue": "#61afef", "blue-hi": "#8cc4f5", "accent": "#3d6fd1", "accent-hi": "#4f80df",
        "on-accent": "#ffffff", "green": "#98c379", "yellow": "#e5c07b", "red": "#e06c75",
        "purple": "#c678dd", "cyan": "#56b6c2", "orange": "#d19a66", "image-bg": "#ffffff",
      },
    },
    // Ethan Schoonover's Solarized (MIT): base03/02 backgrounds, base0/1 text.
    "solarized-dark": {
      name: "Solarized Dark",
      builtIn: true,
      colors: {
        "bg": "#002b36", "bg-alt": "#04313d", "bg-deep": "#00212b", "surface": "#073642",
        "hover": "#0b3f4c", "select": "#11505f", "border": "#16444f", "border-hi": "#285663",
        "text": "#93a1a1", "text-hi": "#eee8d5", "text-dim": "#839496", "text-faint": "#586e75",
        "blue": "#268bd2", "blue-hi": "#5ba7e0", "accent": "#268bd2", "accent-hi": "#3a99dc",
        "on-accent": "#fdf6e3", "green": "#859900", "yellow": "#b58900", "red": "#dc322f",
        "purple": "#6c71c4", "cyan": "#2aa198", "orange": "#cb4b16", "image-bg": "#fdf6e3",
      },
    },
  };

  const DEFAULT_THEME = "one-dark";
  const KEYS = { theme: "theme", custom: "customThemes" };

  /** All themes: built-ins plus the user's custom ones ({ id: {name, colors} }). */
  function allThemes(custom) {
    return { ...BUILT_IN, ...(custom && typeof custom === "object" ? custom : {}) };
  }

  /** Resolve an id to a complete colour map (missing tokens fall back to One Dark). */
  function resolve(id, custom) {
    const theme = allThemes(custom)[id] ?? BUILT_IN[DEFAULT_THEME];
    return { ...BUILT_IN[DEFAULT_THEME].colors, ...theme.colors };
  }

  const COLOR_RE = /^#[0-9a-f]{3,8}$|^(rgb|hsl)a?\([\d\s.,%/+-]+\)$/i;

  /** CSS declaring every token as a custom property under `selector`. */
  function toCss(colors, selector) {
    const decls = TOKEN_IDS
      .filter((t) => COLOR_RE.test(String(colors[t] ?? "")))
      .map((t) => `  --jd-${t}: ${colors[t]};`)
      .join("\n");
    return `${selector} {\n${decls}\n}`;
  }

  /** Validate an imported theme object; returns {name, colors} or throws. */
  function sanitize(input) {
    if (!input || typeof input !== "object") throw new Error("Theme must be a JSON object");
    const name = String(input.name ?? "").trim().slice(0, 40);
    if (!name) throw new Error("Theme needs a name");
    const src = input.colors && typeof input.colors === "object" ? input.colors : {};
    const colors = {};
    for (const t of TOKEN_IDS) {
      if (src[t] == null) continue;
      if (!COLOR_RE.test(String(src[t]))) throw new Error(`Invalid colour for "${t}": ${src[t]}`);
      colors[t] = String(src[t]);
    }
    return { name, colors: { ...BUILT_IN[DEFAULT_THEME].colors, ...colors } };
  }

  globalThis.JMS_THEMES = { TOKENS, TOKEN_IDS, BUILT_IN, DEFAULT_THEME, KEYS, allThemes, resolve, toCss, sanitize };
})();
