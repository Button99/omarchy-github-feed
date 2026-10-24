# GitHub Feed for Omarchy

A native Omarchy shell bar widget that uses the separate `github-feed` Rust CLI to display your received GitHub activity.

## Install

Requires the Quickshell-based Omarchy shell with plugin support, Rust/Cargo, and GitHub CLI. This does not target older Waybar-based Omarchy versions.

Clone both repositories next to each other, then run the installer:

```bash
gh auth login --hostname github.com
git clone https://github.com/Button99/github-feed.git
git clone https://github.com/Button99/omarchy-github-feed.git
cd omarchy-github-feed
./install.sh
```

By default, the installer builds the CLI from `../github-feed`. Set `GITHUB_FEED_PROJECT=/absolute/path/to/github-feed` to use another checkout.

The installer builds the Rust executable, validates the plugin manifest, copies the plugin and binary into `~/.config/omarchy/plugins/christos.github-feed/`, and enables it in the bar. Existing plugin files are backed up before replacement. Stock Omarchy files are never edited.

To update, pull both checkouts and rerun the installer. This first release uses the build-and-install flow above; `omarchy plugin add` alone does not build the Rust backend.

## Use

- Click the GitHub icon to open or close the feed.
- Choose **10**, **20**, or **50** displayed events.
- Type an exact `owner/repo` to filter locally, ignoring case; clear the field for all repositories.
- Click an event to open its repository in your browser.
- Click **Refresh**, or middle-click the icon, to fetch again.
- Press **Escape** or click outside the popup to dismiss it.

The widget loads up to 300 available events through `github-feed check --limit 300`. Changing filters or display count makes no network requests. Opening the popup checks the CLI cache if at least a minute has passed since the previous attempt. There is no background poller. Requests time out after 30 seconds, refreshes are limited to once per minute per widget instance, and failed refreshes retain the last successful results.

GitHub's received-events stream does not reproduce every recommendation on the website's feed. Activity may be delayed, and history is bounded by GitHub's API. Event descriptions are intentionally general where the CLI does not expose payload details.

## Settings

Settings live inline on the widget entry in `~/.config/omarchy/shell.json`, under `bar.layout.right` (or wherever you move it):

```json
{
  "id": "christos.github-feed",
  "limit": 10,
  "repo": "",
  "command": "/absolute/path/to/github-feed"
}
```

`command` is optional; the default is the installed `bin/github-feed`. It must be an executable path, not a shell command with flags. The widget passes arguments directly, without invoking a shell. UI filter/count changes last for the current shell session; edit the entry to set startup defaults.

The GitHub CLI login must be available to the desktop shell's user. No token is stored in the plugin, and no additional login flow is introduced. The Rust CLI saves the complete fetched snapshot under `${XDG_CACHE_HOME:-~/.cache}/github-feed/github.com-ACCOUNT.tsv`, with private file permissions and atomic replacement. Snapshots are reused for five minutes and are shared between CLI and plugin. The Refresh button bypasses the activity cache. Failed activity fetches fall back to the saved snapshot and display a warning with its original timestamp.

Account identity is resolved first using `gh api user --cache 24h`. Offline fallback requires that identity lookup to succeed (including through gh's HTTP cache); a new login or expired identity cache may still need a connection. Logging out does not erase saved files. Remove the `github-feed` cache directory to clear saved activity.

Disable the widget:

```bash
omarchy plugin disable christos.github-feed
```

## Development checks

From the `omarchy-github-feed` folder:

```bash
node --test tests/feed-model.test.cjs
omarchy plugin validate .
bash -n install.sh
```

The JavaScript tests cover parsing, display limits, repository filtering, unknown event types, and browser URL validation. Rust tests cover CLI behavior using a fake `gh` executable.

The plugin's data handling was also loaded with a mock feed under a headless QML harness. Its layer-shell popup still needs visual verification in a live Omarchy session; headless Qt cannot provide the Wayland panel backend.
