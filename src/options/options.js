(() => {
  "use strict";
  const api = globalThis.browser ?? globalThis.chrome;
  const T = globalThis.JMS_THEMES;
  const $ = (id) => document.getElementById(id);

  let custom = {};        // { id: { name, colors } }
  let activeId = T.DEFAULT_THEME;
  let selectedId = T.DEFAULT_THEME;
  let saveTimer = null;

  const themes = () => T.allThemes(custom);
  const selected = () => themes()[selectedId] ?? T.BUILT_IN[T.DEFAULT_THEME];
  const isBuiltIn = (id) => Boolean(T.BUILT_IN[id]);

  function flash(text, kind = "ok") {
    const m = $("msg");
    m.hidden = !text;
    m.textContent = text ?? "";
    m.className = `msg ${kind}`;
  }

  async function load() {
    const data = await api.storage.local.get([T.KEYS.theme, T.KEYS.custom]);
    custom = data[T.KEYS.custom] && typeof data[T.KEYS.custom] === "object" ? data[T.KEYS.custom] : {};
    activeId = themes()[data[T.KEYS.theme]] ? data[T.KEYS.theme] : T.DEFAULT_THEME;
    if (!themes()[selectedId]) selectedId = activeId;
  }

  function saveCustom(immediate = false) {
    clearTimeout(saveTimer);
    const write = () => api.storage.local.set({ [T.KEYS.custom]: custom });
    if (immediate) return write();
    saveTimer = setTimeout(write, 200);
    return Promise.resolve();
  }

  // ---------- Theme list ----------
  function renderList() {
    const list = $("theme-list");
    list.replaceChildren();
    for (const [id, theme] of Object.entries(themes())) {
      const colors = T.resolve(id, custom);
      const li = document.createElement("li");
      li.className = id === selectedId ? "selected" : "";
      const sw = document.createElement("span");
      sw.className = "swatches";
      for (const t of ["bg", "surface", "text", "blue", "green", "purple"]) {
        const i = document.createElement("i");
        i.style.background = colors[t];
        sw.appendChild(i);
      }
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = theme.name;
      li.append(sw, name);
      if (id === activeId) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "in use";
        li.appendChild(tag);
      }
      li.addEventListener("click", () => {
        selectedId = id;
        flash(null);
        render();
      });
      list.appendChild(li);
    }
  }

  // ---------- Editor ----------
  const toHex6 = (c) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
    if (!m) return "#000000";
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return `#${h.toLowerCase()}`;
  };

  function setColor(token, value) {
    custom[selectedId].colors[token] = value;
    renderPreview();
    renderList();
    saveCustom();
  }

  function renderTokens() {
    const box = $("tokens");
    box.replaceChildren();
    const colors = T.resolve(selectedId, custom);
    const readOnly = isBuiltIn(selectedId);
    for (const { group, items } of T.TOKENS) {
      const g = document.createElement("div");
      g.className = "group";
      const h = document.createElement("h2");
      h.textContent = group;
      g.appendChild(h);
      for (const [token, label] of items) {
        const row = document.createElement("div");
        row.className = "token";
        const picker = document.createElement("input");
        picker.type = "color";
        picker.value = toHex6(colors[token]);
        picker.disabled = readOnly;
        picker.id = `c-${token}`;
        const lab = document.createElement("label");
        lab.htmlFor = picker.id;
        lab.textContent = label;
        const code = document.createElement("small");
        code.textContent = `--jd-${token}`;
        lab.appendChild(code);
        const text = document.createElement("input");
        text.type = "text";
        text.value = colors[token];
        text.readOnly = readOnly;
        text.spellcheck = false;
        text.setAttribute("aria-label", `${label} value`);
        picker.addEventListener("input", () => {
          text.value = picker.value;
          setColor(token, picker.value);
        });
        text.addEventListener("change", () => {
          const v = text.value.trim();
          try {
            T.sanitize({ name: "x", colors: { [token]: v } });
          } catch (e) {
            flash(e.message, "error");
            text.value = T.resolve(selectedId, custom)[token];
            return;
          }
          flash(null);
          picker.value = toHex6(v);
          setColor(token, v);
        });
        row.append(picker, lab, text);
        g.appendChild(row);
      }
      box.appendChild(g);
    }
  }

  function renderPreview() {
    let style = $("pv-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "pv-style";
      document.head.appendChild(style);
    }
    style.textContent = T.toCss(T.resolve(selectedId, custom), "#preview");
  }

  function renderHead() {
    const readOnly = isBuiltIn(selectedId);
    $("name").value = selected().name;
    $("name").readOnly = readOnly;
    $("readonly-note").hidden = !readOnly;
    $("delete").disabled = readOnly;
    $("use").disabled = selectedId === activeId;
    $("use").textContent = selectedId === activeId ? "In use" : "Use this theme";
  }

  function render() {
    renderList();
    renderHead();
    renderTokens();
    renderPreview();
  }

  // ---------- Actions ----------
  $("name").addEventListener("input", () => {
    if (isBuiltIn(selectedId)) return;
    custom[selectedId].name = $("name").value.trim().slice(0, 40) || "Untitled";
    renderList();
    saveCustom();
  });

  $("use").addEventListener("click", async () => {
    await saveCustom(true);
    activeId = selectedId;
    await api.storage.local.set({ [T.KEYS.theme]: activeId });
    render();
    flash(`"${selected().name}" is now in use.`);
  });

  function addTheme(theme) {
    const id = `custom-${Date.now().toString(36)}`;
    custom[id] = theme;
    selectedId = id;
    return saveCustom(true).then(render);
  }

  $("new-theme").addEventListener("click", () => {
    const base = selected();
    addTheme({ name: `${base.name} copy`, colors: { ...T.resolve(selectedId, custom) } })
      .then(() => flash("Copy created — edit the colours on the right."));
  });

  $("delete").addEventListener("click", async () => {
    if (isBuiltIn(selectedId)) return;
    if (!confirm(`Delete "${selected().name}"?`)) return;
    delete custom[selectedId];
    if (activeId === selectedId) {
      activeId = T.DEFAULT_THEME;
      await api.storage.local.set({ [T.KEYS.theme]: activeId });
    }
    selectedId = activeId;
    await saveCustom(true);
    render();
    flash("Theme deleted.");
  });

  $("export").addEventListener("click", async () => {
    const json = JSON.stringify({ name: selected().name, colors: T.resolve(selectedId, custom) }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      flash("Theme JSON copied to the clipboard.");
    } catch {
      $("import-text").value = json;
      $("import-text").closest("details").open = true;
      flash("Theme JSON is in the Import box — copy it from there.");
    }
  });

  $("import-btn").addEventListener("click", () => {
    let theme;
    try {
      theme = T.sanitize(JSON.parse($("import-text").value));
    } catch (e) {
      flash(`Import failed: ${e.message}`, "error");
      return;
    }
    addTheme(theme).then(() => {
      $("import-text").value = "";
      flash(`Imported "${theme.name}".`);
    });
  });

  // Keep in sync if the popup switches theme while this page is open.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(T.KEYS.theme in changes)) return;
    load().then(() => {
      renderList();
      renderHead();
    });
  });

  load().then(() => {
    selectedId = activeId;
    render();
  });
})();
