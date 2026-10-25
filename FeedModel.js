// Pure helpers shared by QML and tests.
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

function normalize(events) {
    if (!Array.isArray(events)) throw new Error("GitHub returned an invalid activity response.");
    return events.map(function(event) {
        if (!event || typeof event.created_at !== "string" || !isFinite(Date.parse(event.created_at))
                || !event.actor || typeof event.actor.login !== "string"
                || !event.repo || typeof event.repo.name !== "string" || typeof event.type !== "string")
            throw new Error("GitHub returned an invalid activity event.");
        return { id: String(event.id || ""), time: event.created_at,
            actor: event.actor.login, type: event.type, repo: event.repo.name };
    });
}

function validUsername(username) {
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(String(username || ""));
}

// SHA-256 for local credential-scoped cache keys. Credentials never enter a file.
function fingerprint(value) {
    var bytes = unescape(encodeURIComponent(value));
    var words = [];
    for (var i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] || 0) | bytes.charCodeAt(i) << (24 - i % 4 * 8);
    var bitLength = bytes.length * 8;
    words[bitLength >> 5] = (words[bitLength >> 5] || 0) | 0x80 << (24 - bitLength % 32);
    words[((bitLength + 64 >> 9) << 4) + 15] = bitLength;
    var hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    function rotate(n, count) { return n >>> count | n << (32 - count); }
    for (var offset = 0; offset < words.length; offset += 16) {
        var schedule = [], state = hash.slice();
        for (var j = 0; j < 64; j++) {
            if (j < 16) schedule[j] = words[offset + j] | 0;
            else {
                var x = schedule[j - 15], y = schedule[j - 2];
                schedule[j] = ((rotate(x,7) ^ rotate(x,18) ^ x >>> 3) + schedule[j - 16]
                    + (rotate(y,17) ^ rotate(y,19) ^ y >>> 10) + schedule[j - 7]) | 0;
            }
            var first = (state[7] + (rotate(state[4],6) ^ rotate(state[4],11) ^ rotate(state[4],25))
                + (state[4] & state[5] ^ ~state[4] & state[6]) + constants[j] + schedule[j]) | 0;
            var second = ((rotate(state[0],2) ^ rotate(state[0],13) ^ rotate(state[0],22))
                + (state[0] & state[1] ^ state[0] & state[2] ^ state[1] & state[2])) | 0;
            state = [(first + second) | 0, state[0], state[1], state[2], (state[3] + first) | 0, state[4], state[5], state[6]];
        }
        for (var k = 0; k < 8; k++) hash[k] = hash[k] + state[k] | 0;
    }
    return hash.map(function(word) { return ("00000000" + (word >>> 0).toString(16)).slice(-8); }).join("");
}

function identity(token, username) {
    return token ? "token-" + fingerprint(token) : validUsername(username) ? "public-" + username.toLowerCase() : "";
}

function readCache(text, key, now) {
    try {
        if (String(text).length > 5000000) return null;
        var cache = JSON.parse(text);
        if (cache.version !== 1 || cache.key !== key || typeof cache.savedAt !== "number"
                || cache.savedAt <= 0 || cache.savedAt > now || !Array.isArray(cache.events)
                || cache.events.length > 300) return null;
        if (!cache.events.every(function(row) {
            return row && typeof row.time === "string" && isFinite(Date.parse(row.time))
                && typeof row.actor === "string" && typeof row.type === "string" && typeof row.repo === "string";
        })) return null;
        cache.nextAllowedAt = typeof cache.nextAllowedAt === "number" && isFinite(cache.nextAllowedAt) ? cache.nextAllowedAt : 0;
        return cache;
    } catch (_) { return null; }
}

if (typeof module !== "undefined") module.exports = { select, action, repositoryUrl, normalize,
    validUsername, fingerprint, identity, readCache };
