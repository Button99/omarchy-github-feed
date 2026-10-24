import QtQuick
import QtQuick.Layouts
import QtQuick.Controls as Controls
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui
import "FeedModel.js" as Feed

Ui.Panel {
    id: root
    moduleName: "christos.github-feed"
    manageIpc: false
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property var events: []
    property string error: ""
    property string lastUpdated: ""
    property string feedSource: "live"
    property double lastAttempt: 0
    property bool busy: false
    property int displayLimit: Number(setting("limit", 10))
    property string repository: String(setting("repo", ""))
    readonly property var shownEvents: Feed.select(events, repository, displayLimit)
    readonly property color ink: Commons.Color.foreground

    function open() {
        controller.show()
        if (!lastAttempt || Date.now() - lastAttempt >= 60000) refresh()
    }

    function refresh(force) {
        if (busy) return
        var remaining = 60000 - (Date.now() - lastAttempt)
        if (remaining > 0) {
            error = "Please wait " + Math.ceil(remaining / 1000) + " seconds before refreshing."
            return
        }
        error = ""
        busy = true
        lastAttempt = Date.now()
        fetcher.command = [String(setting("command", decodeURIComponent(String(Qt.resolvedUrl("bin/github-feed")).replace(/^file:\/\//, "")))),
                           "check", "--limit", "300"].concat(force ? ["--refresh"] : [])
        fetcher.running = true
        watchdog.restart()
    }

    Process {
        id: fetcher
        stdout: StdioCollector { id: output; waitForEnd: true }
        stderr: StdioCollector { id: errors; waitForEnd: true }
        onExited: function(code) {
            watchdog.stop()
            root.busy = false
            if (code !== 0) {
                root.error = String(errors.text || "Could not retrieve the feed. Check gh auth login and your network.").slice(0, 700)
                return
            }
            try {
                root.events = Feed.parse(output.text)
                var status = Feed.cacheStatus(errors.text)
                root.feedSource = status.source
                root.lastUpdated = Qt.formatDateTime(new Date(status.savedAt), "d MMM HH:mm")
                root.error = status.warning.slice(0, 700)
            } catch (exception) {
                root.error = exception.message
            }
        }
    }

    Timer {
        id: watchdog
        interval: 30000
        onTriggered: {
            fetcher.running = false
            root.busy = false
            root.error = "Request timed out. Check your connection and try again."
        }
    }

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
