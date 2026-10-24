// Pure functions shared by the QML view and Node tests.
function decodeField(value) {
    return value.replace(/\\([\\tnr])/g, function(_, character) {
        return { "\\": "\\", t: "\t", n: "\n", r: "\r" }[character];
    });
}

function parse(text) {
    var rows = [];
    String(text).split(/\r?\n/).forEach(function(line) {
        if (!line || line === "TIME\tACTOR\tEVENT\tREPOSITORY"
                || line === "No matching activity found in the available feed.") return;
        var parts = line.split("\t");
        if (parts.length !== 4 || !/^\d{4}-\d{2}-\d{2}T/.test(parts[0]))
            throw new Error("Unexpected feed output. Rebuild the Rust CLI.");
        rows.push({ time: parts[0], actor: decodeField(parts[1]),
                    type: decodeField(parts[2]), repo: decodeField(parts[3]) });
    });
    return rows;
}

function select(rows, repo, limit) {
    var query = String(repo || "").trim().toLowerCase();
    return rows.filter(function(row) {
        return !query || row.repo.toLowerCase() === query;
    }).slice(0, Math.max(0, Number(limit) || 0));
}

function action(type) {
    var labels = { WatchEvent: "starred", ForkEvent: "forked", PushEvent: "pushed to",
        ReleaseEvent: "release activity in", PullRequestEvent: "pull request activity in",
        IssuesEvent: "issue activity in", IssueCommentEvent: "commented in",
        CreateEvent: "created a ref in", DeleteEvent: "deleted a ref in",
        PublicEvent: "made public", PullRequestReviewEvent: "reviewed a pull request in" };
    return labels[type] || type.replace(/Event$/, "") + " in";
}

function repositoryUrl(repo) {
    var parts = String(repo).split("/");
    if (parts.length !== 2 || !parts.every(function(part) {
        return /^[A-Za-z0-9_.-]+$/.test(part) && part !== "." && part !== "..";
    })) return "";
    return "https://github.com/" + parts.map(encodeURIComponent).join("/");
}

function cacheStatus(stderr) {
    var text = String(stderr || "");
    var match = text.match(/^Feed cache: (live|cache|stale); saved_at=(\d+)$/m);
    return {
        source: match ? match[1] : "live",
        savedAt: match ? Number(match[2]) * 1000 : Date.now(),
        warning: text.replace(/^Feed cache: .*\n?/m, "").trim()
    };
}

if (typeof module !== "undefined") module.exports = { parse, select, action, repositoryUrl, cacheStatus };
