#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
plugin_dir="$HOME/.config/omarchy/plugins/github.feed"
command -v omarchy >/dev/null
omarchy plugin validate "$project_dir"
if [[ "$project_dir" != "$plugin_dir" ]]; then
    if [[ -L "$plugin_dir" || ( -e "$plugin_dir" && ! -d "$plugin_dir" ) ]]; then
        printf 'Refusing to overwrite a symlink or non-directory at %s.\n' "$plugin_dir" >&2
        exit 1
    fi
    if [[ -d "$plugin_dir" ]]; then
        backup_dir=$(mktemp -d "${plugin_dir%/*}/.github.feed.backup.XXXXXXXX")
        cp -a -- "$plugin_dir/." "$backup_dir/"
    fi
    mkdir -p -- "$plugin_dir"
    cp -- "$project_dir"/{manifest.json,BarWidget.qml,FeedModel.js,FeedClient.js} "$plugin_dir/"
fi
omarchy-shell shell rescanPlugins
omarchy plugin enable github.feed
printf 'Installed GitHub Feed. Click the GitHub icon and enter your username, or configure a token.\n'
