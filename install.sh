#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
plugin_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/plugins/github.feed"
command -v omarchy >/dev/null
omarchy plugin validate "$project_dir"
if [[ "$project_dir" != "$plugin_dir" ]]; then
    if [[ -e "$plugin_dir" ]]; then
        cp -a -- "$plugin_dir" "$plugin_dir.backup-$(date +%s)"
    fi
    mkdir -p -- "$plugin_dir"
    cp -- "$project_dir"/{manifest.json,BarWidget.qml,FeedModel.js,FeedClient.js} "$plugin_dir/"
fi
omarchy-shell shell rescanPlugins
omarchy plugin enable github.feed
printf 'Installed GitHub Feed. Click the GitHub icon and enter your username, or configure a token.\n'
