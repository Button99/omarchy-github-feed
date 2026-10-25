import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui
import "FeedModel.js" as Feed
import "FeedClient.js" as Client

Ui.Panel {
    id: root
    moduleName: "github.feed"
    manageIpc: false
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property var events: []
    property string error: ""
    property string lastUpdated: ""
    property string feedSource: "live"
    property double nextAllowedAt: 0
    property double savedAt: 0
    property bool busy: false
    property int displayLimit: Number(setting("limit", 10))
    property string repository: String(setting("repo", ""))
    property string username: String(setting("username", ""))
    property string fileToken: ""
    readonly property string token: String(Quickshell.env("GH_TOKEN") || Quickshell.env("GITHUB_TOKEN") || fileToken).trim()
    readonly property string cacheKey: Feed.identity(token, username)
    readonly property string cacheDirectory: (Quickshell.env("XDG_CACHE_HOME") || Quickshell.env("HOME") + "/.cache") + "/omarchy-github-feed"
    property bool cacheInitialized: false
    property bool cacheEnabled: false
    property bool cacheLoaded: false
    property bool pendingRefresh: false
    property bool pendingForce: false
    property var cancelRequest: null
    readonly property var shownEvents: Feed.select(events, repository, displayLimit)
    readonly property color ink: Commons.Color.foreground

    onCacheKeyChanged: {
        if (cancelRequest) cancelRequest()
        watchdog.stop()
        busy = false
        events = []
        savedAt = 0
        lastUpdated = ""
        error = ""
        nextAllowedAt = 0
        cacheLoaded = false
        if (opened) {
            pendingRefresh = true
            pendingForce = false
            if (cacheInitialized && !cacheEnabled) refresh(false)
        }
    }

    function open() {
        controller.show()
        refresh(false)
    }

    function restoreCache(text) {
        var cached = Feed.readCache(text, cacheKey, Date.now())
        if (cached && cached.savedAt > savedAt) {
            events = cached.events
            savedAt = cached.savedAt
            nextAllowedAt = Math.max(nextAllowedAt, cached.nextAllowedAt)
            lastUpdated = Qt.formatDateTime(new Date(savedAt), "d MMM HH:mm")
            feedSource = "cache"
        }
        cacheLoaded = true
        if (pendingRefresh) {
            var force = pendingForce
            pendingRefresh = false
            Qt.callLater(function() { root.refresh(force) })
        }
    }

    function refresh(force) {
        if (busy) return
        if (!cacheKey) {
            error = "Enter your GitHub username for public activity, or put a token in " + credentials.path
            return
        }
        if (!cacheInitialized || (cacheEnabled && !cacheLoaded)) {
            pendingRefresh = true
            pendingForce = !!force
            return
        }
        if (!force && savedAt && Date.now() - savedAt < 300000) {
            feedSource = "cache"
            return
        }
        if (Date.now() < nextAllowedAt) {
            if (force) error = "Please wait " + Math.ceil((nextAllowedAt - Date.now()) / 1000) + " seconds before refreshing."
            return
        }
        error = ""
        busy = true
        nextAllowedAt = Date.now() + 60000
        watchdog.restart()
        var activeKey = cacheKey
        cancelRequest = Client.create(request, Feed.normalize).fetch(token, username, function(problem, result) {
            if (activeKey !== root.cacheKey) return
            watchdog.stop()
            root.busy = false
            root.nextAllowedAt = Math.max(root.nextAllowedAt, result.nextAllowedAt)
            if (problem) {
                root.error = problem
                root.feedSource = "stale"
                return
            }
            root.events = result.events
            root.savedAt = Date.now()
            root.lastUpdated = Qt.formatDateTime(new Date(root.savedAt), "d MMM HH:mm")
            root.feedSource = "live"
            if (root.cacheEnabled) cacheFile.setText(JSON.stringify({ version: 1, key: activeKey,
                savedAt: root.savedAt, nextAllowedAt: root.nextAllowedAt, events: root.events }))
        })
    }

    // Only GitHub's fixed HTTPS origin is used, including for pagination.
    function request(path, accessToken, callback) {
        var xhr = new XMLHttpRequest()
        var finished = false
        xhr.onreadystatechange = function() {
            if (finished || xhr.readyState !== XMLHttpRequest.DONE) return
            finished = true
            callback({ status: xhr.status, body: xhr.responseText,
                pollInterval: xhr.getResponseHeader("X-Poll-Interval"),
                retryAfter: xhr.getResponseHeader("Retry-After"),
                rateReset: xhr.getResponseHeader("X-RateLimit-Reset") })
        }
        xhr.open("GET", "https://api.github.com/" + path)
        xhr.setRequestHeader("User-Agent", "omarchy-github-feed/0.2.0")
        xhr.setRequestHeader("Accept", "application/vnd.github+json")
        xhr.setRequestHeader("X-GitHub-Api-Version", "2022-11-28")
        if (accessToken) xhr.setRequestHeader("Authorization", "Bearer " + accessToken)
        xhr.send()
        return function() { finished = true; xhr.abort() }
    }

    FileView {
        id: credentials
        path: String(root.setting("tokenFile", (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/omarchy/github-feed-token"))
        watchChanges: true
        printErrors: false
        onLoaded: root.fileToken = text().trim()
        onLoadFailed: root.fileToken = ""
        onFileChanged: reload()
    }

    // This subprocess only secures the cache directory. All network requests
    // and JSON processing are performed by this plugin, without external tools.
    Process {
        id: cacheSetup
        command: ["/bin/sh", "-c", 'umask 077; mkdir -p -- "$1" && chmod 700 -- "$1"', "github-feed-cache", root.cacheDirectory]
        running: true
        onExited: function(code) {
            root.cacheEnabled = code === 0
            root.cacheInitialized = true
            if (!root.cacheEnabled) {
                root.cacheLoaded = true
                if (root.pendingRefresh) {
                    var force = root.pendingForce
                    root.pendingRefresh = false
                    root.refresh(force)
                }
            }
        }
    }

    FileView {
        id: cacheFile
        path: root.cacheEnabled && root.cacheKey ? root.cacheDirectory + "/" + root.cacheKey + ".json" : ""
        atomicWrites: true
        printErrors: false
        onLoaded: root.restoreCache(text())
        onLoadFailed: root.restoreCache("")
        onSaveFailed: root.error = "Activity loaded, but the disk cache could not be saved."
    }

    Timer {
        id: watchdog
        interval: 30000
        onTriggered: {
            if (root.cancelRequest) root.cancelRequest()
            root.busy = false
            root.error = "Request timed out. Check your connection and try again."
            root.feedSource = "stale"
        }
    }
    Component.onDestruction: if (cancelRequest) cancelRequest()

    Ui.BarIconButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        text: ""
        tooltipText: "GitHub Feed"
        onPressed: function(mouseButton) {
            if (mouseButton === Qt.MiddleButton) root.refresh(true)
            else root.toggle()
        }
    }

    Ui.KeyboardPanel {
        id: popup
        anchorItem: button
        owner: root
        bar: root.bar
        open: root.opened
        focusTarget: content
        contentWidth: popup.fittedContentWidth(Style.space(540))
        contentHeight: popup.fittedContentHeight(Style.space(600))

        Item {
            id: content
            anchors.fill: parent
            focus: true
            Keys.onEscapePressed: root.close()

            ColumnLayout {
                anchors.fill: parent
                spacing: Style.space(12)

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "GitHub Feed"
                        color: root.ink
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body * 1.5
                        font.bold: true
                        Layout.fillWidth: true
                    }
                    Ui.Button {
                        text: root.busy ? "Loading…" : "Refresh"
                        enabled: !root.busy
                        focusable: true
                        onClicked: root.refresh(true)
                    }
                    Ui.Button { text: "×"; focusable: true; onClicked: root.close() }
                }

                Text {
                    text: "Activity from people and repositories you follow"
                    color: Commons.Color.muted
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                Ui.TextField {
                    Layout.fillWidth: true
                    visible: !root.token
                    placeholderText: "GitHub username (public activity)"
                    text: root.username
                    onAccepted: { root.username = text.trim(); root.refresh(false) }
                    Keys.onEscapePressed: root.close()
                }

                RowLayout {
                    Layout.fillWidth: true
                    Ui.TextField {
                        Layout.fillWidth: true
                        placeholderText: "Filter repository: owner/repo"
                        text: root.repository
                        onTextEdited: root.repository = text
                        Keys.onEscapePressed: root.close()
                    }
                    Repeater {
                        model: [10, 20, 50]
                        Ui.Button {
                            required property int modelData
                            text: String(modelData)
                            selected: root.displayLimit === modelData
                            focusable: true
                            onClicked: root.displayLimit = modelData
                        }
                    }
                }

                Text {
                    visible: root.error !== ""
                    text: root.error + (root.lastUpdated ? "\nShowing the last successful results." : "")
                    textFormat: Text.PlainText
                    color: root.ink
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                    wrapMode: Text.WrapAnywhere
                    Layout.fillWidth: true
                }

                ListView {
                    id: list
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    spacing: Style.space(6)
                    model: root.shownEvents
                    Controls.ScrollBar.vertical: Controls.ScrollBar {}
                    delegate: Ui.Button {
                        required property var modelData
                        width: list.width
                        clip: true
                        text: modelData.actor + " · " + Feed.action(modelData.type) + "\n"
                              + modelData.repo + " · " + modelData.time.replace("T", " ").replace("Z", " UTC")
                        leftAlign: true
                        focusable: true
                        onClicked: {
                            var url = Feed.repositoryUrl(modelData.repo)
                            if (url) Qt.openUrlExternally(url)
                        }
                    }
                    Text {
                        anchors.centerIn: parent
                        width: parent.width
                        visible: list.count === 0
                        text: root.busy ? "Retrieving activity…" : root.error ? "Feed unavailable" : "No matching activity"
                        color: Commons.Color.muted
                        font.family: Style.font.family
                        font.pixelSize: Style.font.body
                        horizontalAlignment: Text.AlignHCenter
                    }
                }

                Text {
                    text: root.shownEvents.length + " shown"
                          + (root.lastUpdated ? " · " + (root.feedSource === "live" ? "Updated " : "Cached ") + root.lastUpdated : "")
                          + " · GitHub activity can be delayed"
                    color: Commons.Color.muted
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body * 0.9
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
        }
    }
}
