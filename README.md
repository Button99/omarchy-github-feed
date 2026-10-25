# GitHub Feed for Omarchy

A self-contained Omarchy bar widget that retrieves GitHub activity directly using Qt's HTTP client. No Rust executable, Cargo, GitHub CLI, or separate backend is required.

## Install

Requires the Quickshell-based Omarchy shell with plugin support. Older Waybar-based Omarchy versions are not supported.

Using Omarchy's plugin manager:

```bash
omarchy plugin add https://github.com/Button99/omarchy-github-feed.git --enable
```

Or install from a local checkout:

```bash
git clone https://github.com/Button99/omarchy-github-feed.git
cd omarchy-github-feed
./install.sh
```

The local installer validates and copies the plugin, backs up an existing installation, and enables the widget. Nothing is compiled. Update through `omarchy plugin update github.feed` for a plugin-manager installation; for a manually copied installation, pull this repository and rerun `./install.sh`.

When upgrading from the original plugin ID, replace the existing feed entry's `id` in `shell.json` with `github.feed` and install this version. Keep the other entry settings to preserve your username, filter, and limit. Remove the old ID from the enabled layout to avoid a duplicate widget. Existing token files and cached activity remain compatible.

## Choose your feed

**Public activity:** click the GitHub icon, enter your GitHub username, and press Enter. No token is required. To remember the username across shell restarts, set `username` in the widget settings below.

**Authenticated activity:** put a GitHub token in a file readable only by your user. The default path is `~/.config/omarchy/github-feed-token`. Create and open it using:

```bash
touch ~/.config/omarchy/github-feed-token
chmod 600 ~/.config/omarchy/github-feed-token
${EDITOR:-nano} ~/.config/omarchy/github-feed-token
```

Save only the token text. The widget watches the file and switches to the authenticated user's received feed. Fine-grained tokens can read the received-events endpoint without additional endpoint permissions; private activity availability still depends on the token's access and organization policies. See the [GitHub Events API](https://docs.github.com/en/rest/activity/events#list-events-received-by-the-authenticated-user).

Alternatively, the desktop shell can provide `GH_TOKEN` or `GITHUB_TOKEN`. Environment credentials take precedence over the token file. An export in a terminal does not change the environment of an already-running desktop shell.

Tokens are used in HTTP authorization headers and never copied into cache files or widget settings. This plugin does not read GitHub CLI credentials.

## Use

- Click the GitHub icon to open or close the feed.
- Choose **10**, **20**, or **50** displayed events.
- Type an exact `owner/repo` to filter locally, ignoring case; clear it for all repositories.
- Click an event to open its repository in your browser.
- Click **Refresh**, or middle-click the icon, to fetch again.
- Press **Escape** or click outside the popup to dismiss it.

The plugin requests up to three 100-event pages directly from `https://api.github.com`. It deduplicates event IDs and preserves feed order. Filters and display limits make no network requests. Unknown event types remain displayable.

GitHub's received-events stream does not reproduce every recommendation on the website. Activity can be delayed, and the available history is bounded by GitHub's API.

## Caching

Successful results are saved atomically under `${XDG_CACHE_HOME:-$HOME/.cache}/omarchy-github-feed/`. The plugin prepares this directory with mode `0700`; that filesystem setup is its only subprocess. All HTTP requests, JSON parsing, pagination, and cache contents are handled within the plugin.

Snapshots are separate for each public username or token fingerprint. Tokens themselves are not saved. The plugin restores snapshots after a shell restart, reuses them for five minutes, and retains the original save time if a refresh fails. Empty successful feeds also replace older snapshots. Partial or malformed responses never replace good data.

Refresh bypasses the five-minute cache while respecting a minimum one-minute interval and GitHub's polling/retry guidance. Requests have a 30-second overall timeout. There is no background poller. Failed cache-directory setup leaves an in-memory feed available; failed writes show an error.

The old Rust CLI cache is independent and is not imported. Remove this plugin's cache directory to clear its saved activity.

## Settings

Settings live inline on the widget entry in `~/.config/omarchy/shell.json`, under `bar.layout.right` or wherever you place it:

```json
{
  "id": "github.feed",
  "username": "Button99",
  "limit": 10,
  "repo": ""
}
```

`tokenFile` optionally overrides the credential-file path. UI username/filter/count changes last for the current shell session; configure the entry above for startup defaults. The previous `command` setting is no longer used.

Disable the widget:

```bash
omarchy plugin disable github.feed
```

## Development

```bash
node --test tests/*.test.cjs
omarchy plugin validate .
bash -n install.sh
```

Tests inject HTTP responses to cover public/authenticated requests, pagination, cancellation, rate limits, invalid responses, filtering, cache validation, URL validation, and credential fingerprints. They require no credentials or network connection.

QML startup and disk-cache reuse are also checked under a headless harness with a mocked transport. The layer-shell popup still needs visual verification in a live Omarchy session because headless Qt cannot supply the Wayland panel backend.
