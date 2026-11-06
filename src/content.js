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
 */
(() => {
  "use strict";

  // The popup can inject this into an open tab that the registered script
  // later also reaches; only run once per frame.
  if (window.__jmsDarkLoaded) return;
  window.__jmsDarkLoaded = true;

  const CLASS_ON = "jd-on";
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

  const isActive = () => mode === "on" || (mode === "system" && darkQuery.matches);
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
  }

  // At document_start <html> may not exist yet, and page scripts sometimes
  // rewrite html.className. Re-apply in both cases.
  function guardRootClass() {
    const watchRoot = (root) =>
      new MutationObserver(() => applyClass()).observe(root, { attributes: true, attributeFilter: ["class"] });
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
  }

  // 1. Optimistic: dark immediately (One Dark defaults from base.css).
  applyClass();
  guardRootClass();

  // 2. Correct mode and palette from storage.
  api.storage.local.get([MODE_KEY, T.KEYS.theme, T.KEYS.custom]).then((data) => {
    readSettings(data);
    update();
  }, update);

  // 3. React to popup / options changes and OS theme changes live.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!(MODE_KEY in changes) && !(T.KEYS.theme in changes) && !(T.KEYS.custom in changes)) return;
    api.storage.local.get([MODE_KEY, T.KEYS.theme, T.KEYS.custom]).then((data) => {
      readSettings(data);
      update();
    });
  });
  darkQuery.addEventListener("change", () => {
    if (mode === "system") update();
  });

  if (window === window.top && document.documentElement) startFrameWatcher();
})();
