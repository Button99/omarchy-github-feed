#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cli_dir="${GITHUB_FEED_PROJECT:-$project_dir/../github-feed}"
plugin_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/plugins/christos.github-feed"
command -v gh >/dev/null
command -v omarchy >/dev/null
if [[ ! -f "$cli_dir/Cargo.toml" ]]; then
    printf 'Rust CLI checkout missing at %s. Clone https://github.com/Button99/github-feed.git there or set GITHUB_FEED_PROJECT.\n' "$cli_dir" >&2
    exit 1
fi
if [[ "$project_dir" == "$plugin_dir" ]]; then
    printf 'Run this installer from a separate source checkout, outside the installed plugin directory.\n' >&2
    exit 1
fi
cargo build --release --locked --target-dir "$cli_dir/target" --manifest-path "$cli_dir/Cargo.toml"
omarchy plugin validate "$project_dir"
if [[ -e "$plugin_dir" ]]; then
    cp -a -- "$plugin_dir" "$plugin_dir.backup-$(date +%s)"
fi
mkdir -p -- "$plugin_dir/bin"
cp -- "$project_dir"/{manifest.json,BarWidget.qml,FeedModel.js} "$plugin_dir/"
install -m 755 -- "$cli_dir/target/release/github-feed" "$plugin_dir/bin/github-feed"
omarchy-shell shell rescanPlugins
omarchy plugin enable christos.github-feed
printf 'Installed GitHub Feed. Click the GitHub icon in your bar.\n'
