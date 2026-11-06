# JMS Dark for Jira & Confluence

A Firefox extension that gives self-hosted **Jira** and **Confluence**
(Server / Data Center) a dark, One Dark–style theme.

Atlassian Cloud and newer Data Center releases ship their own dark mode; this
is for the older Server / Data Center versions that don't. It has been written
against **Jira 8.x** and **Confluence 7.x**.

## Install

Download the signed `.xpi` from the
[Releases](https://github.com/jollymonsterstudio/jms-dark/releases) page and
open it in Firefox (or `about:addons` → gear → *Install Add-on From File…*).
Firefox 140+ on desktop, 142+ on Android.

## Use

1. Open your Jira or Confluence site.
2. Click the **JMS Dark** toolbar icon → **Enable on this site**, and allow
   access when Firefox asks. The extension only ever gets access to sites you
   enable this way.
3. The page turns dark immediately; future visits are themed from the first paint.

The popup also switches the theme between **Dark**, **Follow system** and
**Off**, and lists enabled sites so you can remove them (which also revokes the
site permission).

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
| `src/content.js` | Toggles `html.jd-on` from the chosen mode; styles TinyMCE editor iframes |
| `src/popup/` | Enable/remove sites, choose mode |
| `themes/base.css` | Palette variables, page chrome, AUI components, forms |
| `themes/content.css` | Rendered wiki markup shared by Jira and Confluence |
| `themes/jira.css` | Jira screens, scoped to `body#jira` |
| `themes/confluence.css` | Confluence screens, scoped to `body#com-atlassian-confluence` |

Every rule is scoped under `html.jd-on`, so switching the theme off just
removes that class. The extension collects no data and makes no network
requests; it stores only the mode and the list of enabled sites, locally.

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

[MIT](LICENSE) © Jolly Monster Studio. Colour palette after
[One Dark](https://github.com/atom/atom/tree/master/packages/one-dark-syntax) (MIT).
Not affiliated with or endorsed by Atlassian.
