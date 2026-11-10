(() => {
  "use strict";
  const api = globalThis.browser ?? globalThis.chrome;
  const MODE_KEY = "mode";
  const SITES_KEY = "sites";

  const $ = (id) => document.getElementById(id);
  const radios = document.querySelectorAll('input[name="mode"]');
  const patternFor = (origin) => `${origin}/*`;

  let tab = null; // { id, origin } of the active http(s) tab, if any

  function showError(msg) {
    $("error").hidden = !msg;
    $("error").textContent = msg ?? "";
  }

  async function getSites() {
    const data = await api.storage.local.get(SITES_KEY);
    return Array.isArray(data[SITES_KEY]) ? data[SITES_KEY] : [];
  }

  async function setSites(sites) {
    await api.storage.local.set({ [SITES_KEY]: sites });
    await api.runtime.sendMessage({ type: "sync" });
  }

  async function detectTab() {
    const [active] = await api.tabs.query({ active: true, currentWindow: true });
    if (!active?.url) return null;
    let url;
    try {
      url = new URL(active.url);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { id: active.id, origin: url.origin };
  }

  async function enableCurrent() {
    showError(null);
    // Firefox may close the popup while the permission prompt is open, so the
    // background script finishes the job (save site, register, theme the tab)
    // when the grant arrives. Tell it what we're asking for first — without
    // awaiting, because permissions.request must run inside the click gesture.
    api.runtime.sendMessage({ type: "pending", origin: tab.origin, tabId: tab.id }).catch(() => {});
    const granted = await api.permissions.request({ origins: [patternFor(tab.origin)] });
    if (!granted) {
      showError("Permission was not granted, so the theme can't run on this site.");
      return;
    }
    // Popup survived: make sure it's applied (idempotent with the background path).
    await api.runtime.sendMessage({ type: "granted", origin: tab.origin, tabId: tab.id });
    await render();
  }

  async function removeSite(origin) {
    showError(null);
    await setSites((await getSites()).filter((s) => s !== origin));
    try {
      await api.permissions.remove({ origins: [patternFor(origin)] });
    } catch {
      // already gone
    }
    if (tab?.origin === origin) await api.runtime.sendMessage({ type: "uninject", tabId: tab.id });
    await render();
  }

  async function render() {
    const sites = await getSites();

    // Current site panel
    const btn = $("site-btn");
    btn.hidden = true;
    btn.onclick = null;
    const takeover = $("takeover-btn");
    takeover.hidden = true;
    takeover.onclick = null;
    if (!tab) {
      $("site").textContent = "Not a web page";
      $("site-hint").textContent = "Open your Jira or Confluence tab, then click the icon again.";
    } else {
      $("site").textContent = tab.origin;
      const enabled = sites.includes(tab.origin);
      const permitted = enabled && (await api.permissions.contains({ origins: [patternFor(tab.origin)] }));
      if (enabled && permitted) {
        $("site-hint").textContent = "Enabled on this site.";
        const status = await api.tabs.sendMessage(tab.id, { type: "jd-status" }).catch(() => null);
        if (status?.overriding) {
          $("site-hint").textContent = "Enabled on this site, in place of the site's own dark filter.";
          takeover.textContent = "Use the site's dark filter instead";
          takeover.hidden = false;
          takeover.onclick = async () => {
            await api.tabs.sendMessage(tab.id, { type: "jd-restore" }).catch(() => null);
            await render();
          };
        } else if (status?.foreignDark) {
          $("site-hint").textContent =
            status.kind === "app" ? `Paused: ${status.foreignDark} is on. Switch it off and use JMS Dark? (You can switch it back with that app's own toggle.)`
            : status.kind === "filter" ? `Paused: the site's own stylesheet inverts this page in dark mode. Cancel that here and use JMS Dark?`
            : `Paused: this page is already dark (${status.foreignDark}). Turn that off to use JMS Dark.`;
          if (status.canTakeOver) {
            takeover.textContent = "Use JMS Dark instead";
            takeover.hidden = false;
            takeover.onclick = async () => {
              showError(null);
              const res = await api.tabs.sendMessage(tab.id, { type: "jd-takeover" }).catch(() => null);
              if (!res?.ok) showError("Couldn't switch the site's dark theme off. Use its own toggle instead.");
              else if (status.kind === "app") window.close(); // the page reloads
              else setTimeout(() => render(), 300);
            };
          }
        }
      } else {
        $("site-hint").textContent = enabled
          ? "Site is saved but its permission was revoked."
          : "Your browser will ask for access to this site only.";
        btn.textContent = enabled ? "Grant access" : "Enable on this site";
        btn.hidden = false;
        btn.onclick = () => enableCurrent().catch((e) => showError(String(e?.message ?? e)));
      }
    }

    // Enabled sites list
    const list = $("sites");
    list.replaceChildren();
    $("no-sites").hidden = sites.length > 0;
    for (const origin of sites) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = origin.replace(/^https:\/\//, "");
      name.title = origin;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "link";
      rm.textContent = "Remove";
      rm.addEventListener("click", () => removeSite(origin).catch((e) => showError(String(e?.message ?? e))));
      li.append(name, rm);
      list.appendChild(li);
    }
  }

  // Theme mode
  api.storage.local.get(MODE_KEY).then((data) => {
    const mode = data?.[MODE_KEY] ?? "on";
    radios.forEach((r) => { r.checked = r.value === mode; });
  });
  radios.forEach((r) =>
    r.addEventListener("change", () => {
      if (r.checked) api.storage.local.set({ [MODE_KEY]: r.value });
    })
  );

  // Colour theme
  const T = globalThis.JMS_THEMES;
  async function renderThemes() {
    const data = await api.storage.local.get([T.KEYS.theme, T.KEYS.custom]);
    const themes = T.allThemes(data[T.KEYS.custom]);
    const current = themes[data[T.KEYS.theme]] ? data[T.KEYS.theme] : T.DEFAULT_THEME;
    const select = $("theme");
    select.replaceChildren(
      ...Object.entries(themes).map(([id, t]) => {
        const o = document.createElement("option");
        o.value = id;
        o.textContent = t.builtIn ? t.name : `${t.name} (custom)`;
        o.selected = id === current;
        return o;
      })
    );
  }
  $("theme").addEventListener("change", (e) => api.storage.local.set({ [T.KEYS.theme]: e.target.value }));
  $("edit-themes").addEventListener("click", () => {
    api.runtime.openOptionsPage();
    window.close();
  });
  renderThemes();

  $("ver").textContent = `v${api.runtime.getManifest().version}`;
  detectTab()
    .then((t) => { tab = t; })
    .finally(() => render().catch((e) => showError(String(e?.message ?? e))));
})();
