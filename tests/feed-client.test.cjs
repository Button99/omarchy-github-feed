const { test } = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../FeedModel.js');
const Client = require('../FeedClient.js');

function events(count, offset = 0) {
    return Array.from({ length: count }, (_, i) => ({ id: String(offset + i), created_at: '2026-10-24T12:00:00Z', actor: { login: 'actor' }, type: 'WatchEvent', repo: { name: 'owner/repo' } }));
}
function mock(responses) {
    const paths = [], pending = [];
    const request = (path, token, callback) => {
        paths.push({ path, token });
        let aborted = false;
        pending.push(() => { if (!aborted) callback(responses.shift()); });
        return () => { aborted = true; };
    };
    return { paths, client: Client.create(request, Model.normalize, () => 1000), flush() { while (pending.length) pending.shift()(); } };
}
const ok = (data, headers = {}) => ({ status: 200, body: JSON.stringify(data), ...headers });

test('public mode fetches directly without credentials and stops on a short page', () => {
    const api = mock([ok(events(100)), ok(events(3, 100))]);
    let result;
    api.client.fetch('', 'Button99', (error, value) => { assert.equal(error, null); result = value; });
    api.flush();
    assert.equal(result.events.length, 103);
    assert.equal(api.paths.length, 2);
    assert.equal(api.paths[0].token, '');
    assert.match(api.paths[1].path, /page=2$/);
});

test('authenticated mode resolves account, deduplicates, caps pagination and obeys polling guidance', () => {
    const api = mock([ok({ login: 'account' }), ok(events(100), { pollInterval: '120' }), ok(events(100, 90)), ok(events(100, 190))]);
    let result;
    api.client.fetch('secret', 'ignored', (error, value) => { assert.equal(error, null); result = value; });
    api.flush();
    assert.equal(api.paths[0].path, 'user');
    assert.equal(api.paths.length, 4);
    assert.equal(result.events.length, 290);
    assert.equal(result.account, 'account');
    assert.equal(result.nextAllowedAt, 121000);
});

test('rate limits return retry time and no successful result', () => {
    const api = mock([{ status: 429, retryAfter: '180', rateReset: '250' }]);
    let problem, result;
    api.client.fetch('', 'account', (error, value) => { problem = error; result = value; });
    api.flush();
    assert.match(problem, /rate limited/);
    assert.equal(result.nextAllowedAt, 250000);
});

test('malformed or failed later pages do not yield successful partial history', () => {
    for (const response of [{ status: 503 }, { status: 200, body: 'invalid json' }, ok({ unexpected: true })]) {
        const api = mock([ok(events(100)), response]);
        let problem;
        api.client.fetch('', 'account', error => { problem = error; });
        api.flush();
        assert.equal(typeof problem, 'string');
    }
});

test('cancellation prevents stale replies and username validation prevents arbitrary endpoints', () => {
    const api = mock([ok(events(1))]);
    const cancel = api.client.fetch('', 'account', () => assert.fail('cancelled callback'));
    cancel();
    api.flush();
    const bad = mock([]);
    let problem;
    bad.client.fetch('', '../bad', error => { problem = error; });
    assert.match(problem, /username/);
    assert.equal(bad.paths.length, 0);
});
