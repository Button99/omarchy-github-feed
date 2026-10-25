// Native HTTP orchestration. QML supplies XMLHttpRequest; tests inject transport.
function create(request, normalize, now) {
    now = now || Date.now;
    return {
        fetch: function(token, username, done) {
            var stopped = false, aborts = [], rows = [], seen = Object.create(null), nextAllowedAt = now() + 60000;
            function cancel() {
                stopped = true;
                aborts.forEach(function(abort) { if (abort) abort(); });
            }
            function finish(error, account) {
                if (stopped) return;
                stopped = true;
                done(error, { events: rows, account: account || username, nextAllowedAt: nextAllowedAt });
            }
            function get(path, callback) {
                aborts.push(request(path, token, function(response) {
                    if (stopped) return;
                    var poll = Number(response.pollInterval);
                    if (isFinite(poll) && poll > 0) nextAllowedAt = Math.max(nextAllowedAt, now() + poll * 1000);
                    if (response.status < 200 || response.status >= 300) {
                        var retry = Number(response.retryAfter);
                        var reset = Number(response.rateReset);
                        if (retry > 0) nextAllowedAt = Math.max(nextAllowedAt, now() + retry * 1000);
                        else if (response.retryAfter && isFinite(Date.parse(response.retryAfter)))
                            nextAllowedAt = Math.max(nextAllowedAt, Date.parse(response.retryAfter));
                        if ((response.status === 403 || response.status === 429) && reset > 0)
                            nextAllowedAt = Math.max(nextAllowedAt, reset * 1000);
                        var message = response.status === 401 ? "GitHub rejected the token. Check your credentials."
                            : response.status === 403 || response.status === 429 ? "GitHub denied this request or rate limited it. Check token permissions and try later."
                            : response.status ? "GitHub returned HTTP " + response.status + ". Try again later."
                            : "Could not connect to GitHub. Check your network connection.";
                        finish(message);
                        return;
                    }
                    try {
                        if (String(response.body).length > 5000000) throw new Error("GitHub response is too large.");
                        callback(JSON.parse(response.body));
                    } catch (_) { finish("GitHub returned an invalid activity response."); }
                }));
            }
            function page(account, number) {
                get("users/" + encodeURIComponent(account) + "/received_events?per_page=100&page=" + number, function(events) {
                    var normalized = normalize(events);
                    normalized.slice(0, 100).forEach(function(row) {
                        if (!row.id || !seen[row.id]) {
                            rows.push(row);
                            if (row.id) seen[row.id] = true;
                        }
                    });
                    if (events.length >= 100 && number < 3) page(account, number + 1);
                    else finish(null, account);
                });
            }
            if (token) get("user", function(user) {
                if (!user || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(user.login))
                    throw new Error("Invalid GitHub account");
                page(user.login, 1);
            });
            else if (/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(username)) page(username, 1);
            else finish("Set your GitHub username for public activity, or configure a GitHub token.");
            return cancel;
        }
    };
}
if (typeof module !== "undefined") module.exports = { create };
