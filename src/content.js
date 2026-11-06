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
  const MODE_KEY = "mode"; // "on" | "off" | "system"
  const DEFAULT_MODE = "on";

  const api = globalThis.browser ?? globalThis.chrome;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  let mode = DEFAULT_MODE;

  const isActive = () => mode === "on" || (mode === "system" && darkQuery.matches);

  // Styles for the editable body inside TinyMCE iframes. Kept self-contained
  // (no CSS variables from the parent) because it lives in a separate document.
  const EDITOR_CSS = `
    html, body, body#tinymce, body.mce-content-body {
      background: #282c34 !important;
      color: #abb2bf !important;
      color-scheme: dark;
    }
    body.mce-content-body p, body.mce-content-body li, body.mce-content-body td,
    body.mce-content-body th, body.mce-content-body div, body.mce-content-body span:not([style*="color"]) {
      color: #abb2bf;
    }
    body.mce-content-body h1, body.mce-content-body h2, body.mce-content-body h3,
    body.mce-content-body h4, body.mce-content-body h5, body.mce-content-body h6 {
      color: #dcdfe4 !important;
    }
    body.mce-content-body a { color: #61afef !important; }
    body.mce-content-body table, body.mce-content-body td, body.mce-content-body th {
      border-color: #3e4451 !important;
    }
    body.mce-content-body th, body.mce-content-body .confluenceTh,
    body.mce-content-body .highlight-grey { background-color: #2c313a !important; }
    body.mce-content-body td, body.mce-content-body .confluenceTd { background-color: transparent; }
    body.mce-content-body pre, body.mce-content-body code, body.mce-content-body tt {
      background-color: #1b1d23 !important;
      color: #d19a66 !important;
    }
    /* Confluence macro placeholders in the editor */
    body.mce-content-body table.wysiwyg-macro,
    body.mce-content-body table.wysiwyg-macro td,
    body.mce-content-body .wysiwyg-macro-body {
      background-color: #21252b !important;
      border-color: #4b5263 !important;
    }
    body.mce-content-body table.wysiwyg-macro { background-image: none !important; }
    body.mce-content-body ::selection { background: #3e4f6e; }
  `;

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
      style.textContent = EDITOR_CSS;
    }
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
    if (window === window.top) restyleAllFrames();
  }

  // 1. Optimistic: dark immediately.
  applyClass();
  guardRootClass();

  // 2. Correct from storage.
  api.storage.local.get(MODE_KEY).then((data) => {
    const stored = data?.[MODE_KEY];
    if (stored === "on" || stored === "off" || stored === "system") mode = stored;
    update();
  }, update);

  // 3. React to popup changes and OS theme changes live.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(MODE_KEY in changes)) return;
    mode = changes[MODE_KEY].newValue ?? DEFAULT_MODE;
    update();
  });
  darkQuery.addEventListener("change", () => {
    if (mode === "system") update();
  });

  if (window === window.top && document.documentElement) startFrameWatcher();
})();
