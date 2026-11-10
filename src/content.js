/*
 * JMS Dark — content script.
 *
 * All theme rules in themes/*.css are scoped under `html.jd-on`, so this script
 * only has to decide whether that class is present. It runs at document_start in
 * every frame; the class is added immediately (assumes "on") to avoid a white
 * flash, then corrected once the stored mode has been read.
 *
 * Rich-text editors (TinyMCE in Jira and Confluence) live in about:blank iframes
 * whose documents are rebuilt by the editor after load, which drops any styles
 * the browser injected. The top frame therefore re-styles those iframes itself.
 *
 * If the page is already dark by other means (the site's own dark-theme app, or
 * a user style that inverts the whole page), the theme stands down: two dark
 * themes on top of each other, or an inverted dark theme, end up unreadable.
 */
(() => {
  "use strict";

  // The popup can inject this into an open tab that the registered script
  // later also reaches; only run once per frame.
  if (window.__jmsDarkLoaded) return;
  window.__jmsDarkLoaded = true;

  const CLASS_ON = "jd-on";
  const CLASS_NOFILTER = "jd-nofilter"; // cancels a site's own page-inverting filter
  const OVERRIDE_KEY = "overrideFilter"; // origins where the user chose JMS Dark over the site's filter
  const EDITOR_STYLE_ID = "jd-editor-style";
  const PALETTE_STYLE_ID = "jd-palette";
  const MODE_KEY = "mode"; // "on" | "off" | "system"
  const DEFAULT_MODE = "on";

  const api = globalThis.browser ?? globalThis.chrome;
  const T = globalThis.JMS_THEMES; // src/themes.js, loaded first
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  let mode = DEFAULT_MODE;
  let themeId = T.DEFAULT_THEME;
  let customThemes = {};
  let foreignDark = null; // why another dark theme is active, or null
  let takeoverCookie = null; // cookie that switches that theme off, if we know one
  let pageFilter = false; // the foreign dark theme is a CSS filter we can cancel
  let overrideFilter = false; // user chose to cancel this site's filter

  const wanted = () => mode === "on" || (mode === "system" && darkQuery.matches);
  const isActive = () => wanted() && !foreignDark;

  /**
   * Another dark theme already on this page:
   * - "Dark Theme for Confluence" (Porzelt): server adds <meta name="porzelt-darktheme-active">
   *   and body.porzelt-darktheme-active when the user has it switched on;
   * - anything that applies a CSS filter (e.g. invert) to <html> or <body>.
   */
  function detectForeignDark() {
    const doc = document;
    takeoverCookie = null;
    pageFilter = false;
    if (doc.querySelector('meta[name="porzelt-darktheme-active"]') ||
        doc.body?.classList.contains("porzelt-darktheme-active")) {
      const jira = doc.body?.id === "jira";
      // The app's own toggle stores the user's choice in this cookie and reloads.
      takeoverCookie = jira ? "com.porzelt.jira.darktheme.active" : "com.porzelt.confluence.darktheme.active";
      return `the site's Dark Theme for ${jira ? "Jira" : "Confluence"} app`;
    }
    // When the user overrides the filter our own CSS cancels it, so don't measure.
    if (overrideFilter) return null;
    for (const el of [doc.documentElement, doc.body]) {
      if (!el) continue;
      const f = getComputedStyle(el).filter;
      if (f && f !== "none") {
        pageFilter = true;
        return "a page filter (" + f + ")";
      }
    }
    return null;
  }

  function checkForeignDark() {
    const was = foreignDark;
    foreignDark = detectForeignDark();
    if (foreignDark !== was) update();
  }

  function watchForeignDark() {
    checkForeignDark();
    document.addEventListener("DOMContentLoaded", checkForeignDark, { once: true });
    window.addEventListener("load", checkForeignDark, { once: true });
    [1000, 3000].forEach((ms) => setTimeout(checkForeignDark, ms));
    const observeBody = () => {
      if (!document.body) return;
      new MutationObserver(checkForeignDark).observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    };
    if (document.body) observeBody();
    else document.addEventListener("DOMContentLoaded", observeBody, { once: true });
  }
  const colors = () => T.resolve(themeId, customThemes);

  // Styles for the editable body inside TinyMCE iframes. That is a separate
  // document, so it gets its own copy of the palette on :root (see editorCss).
  const EDITOR_RULES = `
    html, body, body#tinymce, body.mce-content-body {
      background: var(--jd-bg) !important;
      color: var(--jd-text) !important;
      color-scheme: dark;
    }
    body.mce-content-body p, body.mce-content-body li, body.mce-content-body td,
    body.mce-content-body th, body.mce-content-body div, body.mce-content-body span:not([style*="color"]) {
      color: var(--jd-text);
    }
    body.mce-content-body h1, body.mce-content-body h2, body.mce-content-body h3,
    body.mce-content-body h4, body.mce-content-body h5, body.mce-content-body h6 {
      color: var(--jd-text-hi) !important;
    }
    body.mce-content-body a { color: var(--jd-blue) !important; }
    body.mce-content-body table, body.mce-content-body td, body.mce-content-body th {
      border-color: var(--jd-border) !important;
    }
    body.mce-content-body th, body.mce-content-body .confluenceTh,
    body.mce-content-body .highlight-grey { background-color: var(--jd-surface) !important; }
    body.mce-content-body td, body.mce-content-body .confluenceTd { background-color: transparent; }
    body.mce-content-body pre, body.mce-content-body code, body.mce-content-body tt {
      background-color: var(--jd-bg-deep) !important;
      color: var(--jd-orange) !important;
    }
    /* Confluence macro placeholders in the editor */
    body.mce-content-body table.wysiwyg-macro,
    body.mce-content-body table.wysiwyg-macro td,
    body.mce-content-body .wysiwyg-macro-body {
      background-color: var(--jd-bg-alt) !important;
      border-color: var(--jd-border-hi) !important;
    }
    body.mce-content-body table.wysiwyg-macro { background-image: none !important; }
    body.mce-content-body ::selection { background: var(--jd-select); }
  `;

  const editorCss = () => T.toCss(colors(), ":root") + EDITOR_RULES;

  /**
   * Put the active palette on this document. `:root.jd-on` outranks the
   * One Dark defaults declared on `html.jd-on` in base.css, whatever the order.
   */
  function applyPalette(doc = document) {
    const root = doc.documentElement;
    if (!root) return;
    let style = doc.getElementById(PALETTE_STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = PALETTE_STYLE_ID;
      root.appendChild(style); // <head> may not exist yet at document_start
    }
    const css = T.toCss(colors(), ":root.jd-on");
    if (style.textContent !== css) style.textContent = css;
  }

  function applyClass(doc = document) {
    const root = doc.documentElement;
    if (!root) return;
    if (root.classList.contains(CLASS_ON) !== isActive()) root.classList.toggle(CLASS_ON, isActive());
    const nofilter = isActive() && overrideFilter;
    if (root.classList.contains(CLASS_NOFILTER) !== nofilter) root.classList.toggle(CLASS_NOFILTER, nofilter);
  }

  // At document_start <html> may not exist yet, and page scripts sometimes
  // rewrite html.className. Re-apply in both cases.
  function guardRootClass() {
    const watchRoot = (root) =>
      new MutationObserver(() => { applyClass(); checkForeignDark(); })
        .observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    if (document.documentElement) {
      watchRoot(document.documentElement);
      return;
    }
    const waiter = new MutationObserver(() => {
      if (!document.documentElement) return;
      waiter.disconnect();
      applyClass();
      applyPalette();
      watchRoot(document.documentElement);
      if (window === window.top) startFrameWatcher();
    });
    waiter.observe(document, { childList: true });
  }

  function isEditorDocument(doc) {
    const body = doc?.body;
    return Boolean(body && (body.id === "tinymce" || body.classList.contains("mce-content-body")));
  }

  function styleEditorFrame(iframe) {
    let doc;
    try {
      doc = iframe.contentDocument;
    } catch {
      return; // cross-origin
    }
    if (!doc?.documentElement || !isEditorDocument(doc)) return;
    let style = doc.getElementById(EDITOR_STYLE_ID);
    if (!isActive()) {
      style?.remove();
      return;
    }
    if (!style) {
      style = doc.createElement("style");
      style.id = EDITOR_STYLE_ID;
    }
    const css = editorCss();
    if (style.textContent !== css) style.textContent = css;
    // Re-append so it stays last in the cascade after the editor adds its own sheets.
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  function watchFrame(iframe) {
    if (iframe.dataset.jdWatched) return;
    iframe.dataset.jdWatched = "1";
    const run = () => styleEditorFrame(iframe);
    iframe.addEventListener("load", run);
    // TinyMCE builds the body some time after the iframe appears.
    [0, 100, 300, 800, 2000, 5000].forEach((ms) => setTimeout(run, ms));
  }

  function restyleAllFrames() {
    document.querySelectorAll("iframe").forEach(styleEditorFrame);
  }

  function startFrameWatcher() {
    const scan = (node) => {
      if (node instanceof HTMLIFrameElement) watchFrame(node);
      else if (node instanceof Element) node.querySelectorAll("iframe").forEach(watchFrame);
    };
    new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(scan);
    }).observe(document.documentElement, { childList: true, subtree: true });
    scan(document.documentElement);
  }

  function update() {
    applyClass();
    applyPalette();
    if (window === window.top) restyleAllFrames();
  }

  function readSettings(data) {
    const m = data?.[MODE_KEY];
    mode = m === "on" || m === "off" || m === "system" ? m : DEFAULT_MODE;
    themeId = typeof data?.[T.KEYS.theme] === "string" ? data[T.KEYS.theme] : T.DEFAULT_THEME;
    customThemes = data?.[T.KEYS.custom] ?? {};
    const overrides = data?.[OVERRIDE_KEY];
    overrideFilter = Array.isArray(overrides) && overrides.includes(location.origin);
  }

  const SETTINGS = [MODE_KEY, T.KEYS.theme, T.KEYS.custom, OVERRIDE_KEY];

  // 1. Optimistic: dark immediately (One Dark defaults from base.css).
  applyClass();
  guardRootClass();
  watchForeignDark();

  /**
   * Switch the site's own dark-theme app off for this user, exactly as its own
   * toggle does (same cookie, same 365-day lifetime, path=/), then reload.
   */
  async function setOverride(on) {
    const data = await api.storage.local.get(OVERRIDE_KEY);
    const list = (Array.isArray(data[OVERRIDE_KEY]) ? data[OVERRIDE_KEY] : []).filter((o) => o !== location.origin);
    if (on) list.push(location.origin);
    await api.storage.local.set({ [OVERRIDE_KEY]: list }); // onChanged re-applies in every frame
  }

  function takeOver() {
    if (pageFilter) {
      setOverride(true);
      return true;
    }
    if (!takeoverCookie) return false;
    const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
    document.cookie = `${takeoverCookie}=false;expires=${expires};path=/`;
    setTimeout(() => location.reload(), 50);
    return true;
  }

  // The popup asks whether the theme is paused on this page, and can ask us to take over.
  api.runtime.onMessage?.addListener((msg, _sender, reply) => {
    if (window !== window.top) return;
    if (msg?.type === "jd-status") {
      reply({ wanted: wanted(), active: isActive(), foreignDark,
        canTakeOver: Boolean(takeoverCookie) || pageFilter, kind: pageFilter ? "filter" : takeoverCookie ? "app" : null,
        overriding: overrideFilter });
    } else if (msg?.type === "jd-takeover") {
      reply({ ok: takeOver() });
    } else if (msg?.type === "jd-restore") {
      setOverride(false).then(() => reply({ ok: true }));
      return true;
    }
  });

  // 2. Correct mode and palette from storage.
  api.storage.local.get(SETTINGS).then((data) => {
    readSettings(data);
    checkForeignDark();
    update();
  }, update);

  // 3. React to popup / options changes and OS theme changes live.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!SETTINGS.some((k) => k in changes)) return;
    api.storage.local.get(SETTINGS).then((data) => {
      readSettings(data);
      checkForeignDark();
      update();
    });
  });
  darkQuery.addEventListener("change", () => {
    if (mode === "system") update();
  });

  if (window === window.top && document.documentElement) startFrameWatcher();
})();
