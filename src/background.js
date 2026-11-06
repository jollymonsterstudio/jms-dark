/*
 * JMS Dark — background script.
 *
 * Keeps one dynamic content-script registration covering every site the user
 * has enabled (stored as origins under `sites`) and still holds a host
 * permission for. Re-registered on startup, on storage changes and whenever
 * the user grants or revokes a permission in about:addons.
 */
"use strict";

const api = globalThis.browser ?? globalThis.chrome;

const SCRIPT_ID = "jms-dark";
const SITES_KEY = "sites";

const THEME_CSS = ["themes/base.css", "themes/content.css", "themes/jira.css", "themes/confluence.css"];
const CONTENT_JS = ["src/content.js"];

const patternFor = (origin) => `${origin}/*`;

async function enabledSites() {
  const data = await api.storage.local.get(SITES_KEY);
  return Array.isArray(data[SITES_KEY]) ? data[SITES_KEY] : [];
}

async function permittedPatterns() {
  const out = [];
  for (const origin of await enabledSites()) {
    const pattern = patternFor(origin);
    if (await api.permissions.contains({ origins: [pattern] })) out.push(pattern);
  }
  return out;
}

let syncing = Promise.resolve();

function sync() {
  // Serialise: overlapping unregister/register calls race in Firefox.
  syncing = syncing.then(doSync, doSync);
  return syncing;
}

async function doSync() {
  try {
    await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    // not registered yet
  }
  const matches = await permittedPatterns();
  if (matches.length === 0) return;
  await api.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches,
      css: THEME_CSS,
      js: CONTENT_JS,
      runAt: "document_start",
      allFrames: true,
    },
  ]);
}

/** Theme an already-open tab without waiting for a reload. */
async function injectIntoTab(tabId) {
  const target = { tabId, allFrames: true };
  await api.scripting.insertCSS({ target, files: THEME_CSS });
  await api.scripting.executeScript({ target, files: CONTENT_JS });
}

/** Undo injectIntoTab (used when a site is removed). */
async function removeFromTab(tabId) {
  const target = { tabId, allFrames: true };
  try {
    await api.scripting.removeCSS({ target, files: THEME_CSS });
  } catch {
    // permission already gone
  }
}

/*
 * Enabling a site: the popup announces { origin, tabId } as "pending", then
 * asks Firefox for the permission. When the grant lands (permissions.onAdded,
 * or a "granted" message if the popup is still open) we save the site,
 * re-register and theme the open tab. Both paths are idempotent.
 */
let pending = null;
const applied = new Set(); // tabIds already injected for the current grant

let granting = Promise.resolve();

function completeGrant(origin, tabId) {
  // Serialised so the onAdded and "granted" paths can't double-add the site.
  granting = granting.then(() => doCompleteGrant(origin, tabId), () => doCompleteGrant(origin, tabId));
  return granting;
}

async function doCompleteGrant(origin, tabId) {
  const data = await api.storage.local.get(SITES_KEY);
  const sites = Array.isArray(data[SITES_KEY]) ? data[SITES_KEY] : [];
  if (!sites.includes(origin)) await api.storage.local.set({ [SITES_KEY]: [...sites, origin] });
  await sync();
  if (tabId != null && !applied.has(tabId)) {
    applied.add(tabId);
    try {
      await injectIntoTab(tabId);
    } catch {
      // tab closed or navigated away; the registration covers the next load
    }
  }
}

api.permissions.onAdded.addListener((perms) => {
  if (pending && perms.origins?.includes(patternFor(pending.origin))) {
    const { origin, tabId } = pending;
    pending = null;
    completeGrant(origin, tabId);
  }
});

api.runtime.onMessage.addListener((msg) => {
  switch (msg?.type) {
    case "pending":
      pending = { origin: msg.origin, tabId: msg.tabId };
      applied.delete(msg.tabId);
      return undefined;
    case "granted":
      pending = null;
      return completeGrant(msg.origin, msg.tabId).then(() => ({ ok: true }));
    case "sync":
      return sync().then(() => ({ ok: true }));
    case "uninject":
      return removeFromTab(msg.tabId).then(() => ({ ok: true }));
    default:
      return undefined;
  }
});

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && SITES_KEY in changes) sync();
});
api.permissions.onAdded.addListener(sync);
api.permissions.onRemoved.addListener(sync);
api.runtime.onStartup.addListener(sync);
api.runtime.onInstalled.addListener(sync);
sync();
