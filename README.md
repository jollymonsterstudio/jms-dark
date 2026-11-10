# JMS Dark for Jira & Confluence

A Firefox extension that gives self-hosted **Jira** and **Confluence**
(Server / Data Center) a dark, One Dark–style theme.

Atlassian Cloud and newer Data Center releases ship their own dark mode; this
is for the older Server / Data Center versions that don't. It has been written
against **Jira 8.x** and **Confluence 7.x**.

## Install

Install it from Firefox Add-ons:
**[addons.mozilla.org/firefox/addon/jms-dark](https://addons.mozilla.org/firefox/addon/jms-dark/)**.
Firefox 140+ on desktop, 142+ on Android.

Signed `.xpi` files are also attached to some
[Releases](https://github.com/jollymonsterstudio/jms-dark/releases); open one in
Firefox (or `about:addons` → gear → *Install Add-on From File…*).

### Chrome / Edge

The same code runs in Chrome and Edge (121+). Build the package with
`python tools/build_chrome.py`, which writes `dist/jms-dark-<version>-chrome.zip`
with a Chrome manifest (service-worker background, no Firefox settings). Load
it unpacked from `chrome://extensions` (Developer mode → *Load unpacked*, using
the unzipped folder), or upload the zip to the Chrome Web Store.

## Use

1. Open your Jira or Confluence site.
2. Click the **JMS Dark** toolbar icon → **Enable on this site**, and allow
   access when Firefox asks. The extension only ever gets access to sites you
   enable this way.
3. The page turns dark immediately; future visits are themed from the first paint.

If the page is already dark by other means, JMS Dark pauses itself there and
the popup says why. This covers the *Dark Theme for Confluence* app being
switched on, or a user style that puts a `filter` (such as `invert`) on the page.

The popup also switches between **Dark**, **Follow system** and **Off**, picks
the colour theme, and lists enabled sites so you can remove them (which also
revokes the site permission).

## Themes

Built-in themes:

- **One Dark** (default)
- **Solarized Dark**
- **Catppuccin Mocha**
- **Monokai Pro**

Click **Edit…** in the popup (or *Preferences* in `about:addons`) to open the
theme editor. There you can:

- copy any theme with **New theme from selected** and change its 24 colours with
  a live preview; edits apply instantly to open tabs
- **Export JSON** to share a theme, and **Import JSON** to load one

A theme is just a name plus a colour map; any token you leave out falls back to
One Dark:

```json
{
  "name": "My theme",
  "colors": {
    "bg": "#1e1e1e", "bg-alt": "#252526", "bg-deep": "#181818", "surface": "#2d2d30",
    "text": "#cccccc", "text-hi": "#ffffff", "blue": "#4fc1ff", "accent": "#0e639c"
  }
}
```

Tokens: `bg`, `bg-alt`, `bg-deep`, `surface`, `hover`, `select`, `border`,
`border-hi`, `text`, `text-hi`, `text-dim`, `text-faint`, `blue`, `blue-hi`,
`accent`, `accent-hi`, `on-accent`, `green`, `yellow`, `red`, `purple`, `cyan`,
`orange`, `image-bg`. Each becomes a `--jd-<token>` CSS variable. Tinted
backgrounds (messages, cell highlights, diffs) are mixed from these, so they
follow the theme automatically.

To ship a new built-in theme, add it to `BUILT_IN` in `src/themes.js`.

## What's covered

- **Both:** header, menus, dialogs, forms, buttons, tabs, tables, messages,
  lozenges, tooltips, rendered wiki markup (tables and cell highlights,
  info/note/tip/warning macros, panels, code blocks with syntax colours), and
  the rich-text editor body.
- **Jira:** issue view, comments and history, issue navigator, agile boards and
  backlog, dashboards and gadgets, project sidebar, admin pages.
- **Confluence:** space sidebar and page tree, page header and metadata,
  comments and inline comments, editor chrome and macro browser, dashboard,
  search, page history diffs, space tools.

Plugin screens that hard-code light colours may still show light patches —
issues and PRs welcome.

## How it works

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest; host access is requested per site at runtime (`optional_host_permissions`) |
| `src/background.js` | Keeps one dynamic content-script registration for all enabled, permitted sites |
| `src/themes.js` | Built-in themes, token list, theme validation |
| `src/content.js` | Toggles `html.jd-on`, applies the selected palette, styles TinyMCE editor iframes |
| `src/popup/` | Enable/remove sites, choose mode and theme |
| `src/options/` | Theme editor (create, edit, import/export) |
| `themes/base.css` | Default (One Dark) palette, page chrome, AUI components, forms |
| `themes/content.css` | Rendered wiki markup shared by Jira and Confluence |
| `themes/jira.css` | Jira screens, scoped to `body#jira` |
| `themes/confluence.css` | Confluence screens, scoped to `body#com-atlassian-confluence` |

Every rule is scoped under `html.jd-on`, so switching the theme off just
removes that class. The extension collects no data and makes no network
requests; it stores only the mode, theme choice, custom themes and the list of enabled
sites, locally.

## Develop

```sh
npx web-ext run --source-dir .   # Firefox with the extension loaded
npx web-ext lint --source-dir .
```

## Sign (maintainers)

AMO API credentials come from the environment and are never committed:

```sh
export WEB_EXT_API_KEY=user:XXXXXXXX:XXX
export WEB_EXT_API_SECRET=...
# bump "version" in manifest.json first: AMO rejects a version it has already signed
npx web-ext sign --source-dir . --channel=unlisted --artifacts-dir dist
```

## License

[MIT](LICENSE) © Jolly Monster Studio. Colour palettes after
[One Dark](https://github.com/atom/atom/tree/master/packages/one-dark-syntax) (MIT)
[Solarized](https://ethanschoonover.com/solarized/) by Ethan Schoonover (MIT),
[Catppuccin](https://github.com/catppuccin/catppuccin) Mocha (MIT) and the
[Monokai Pro](https://monokai.pro/) palette by Monokai; this project is not
affiliated with or endorsed by their authors.
Not affiliated with or endorsed by Atlassian.

Screenshots in the AMO listing were taken on Atlassian's public
[jira.atlassian.com](https://jira.atlassian.com) and Apache's public
[cwiki.apache.org](https://cwiki.apache.org/confluence).
