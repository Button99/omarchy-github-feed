const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Feed = require('../FeedModel.js');

const event = { id: '1', created_at: '2026-10-24T12:00:00Z', actor: { login: 'alice' }, type: 'FutureEvent', repo: { name: 'owner/repo' } };

test('normalizes GitHub JSON, including empty feeds and unknown event types', () => {
    const rows = Feed.normalize([event]);
    assert.equal(rows[0].actor, 'alice');
    assert.equal(rows[0].repo, 'owner/repo');
    assert.equal(rows[0].type, 'FutureEvent');
    assert.deepEqual(Feed.normalize([]), []);
    assert.throws(() => Feed.normalize({ message: 'bad' }));
    assert.throws(() => Feed.normalize([{ ...event, actor: null }]));
    assert.throws(() => Feed.normalize([{ ...event, created_at: 'bad date' }]));
});

test('filters before limiting while preserving order', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ repo: i < 5 ? 'other/repo' : 'owner/repo', id: i }));
    assert.equal(Feed.select(rows, '', 10).length, 10);
    assert.equal(Feed.select(rows, '', 20).length, 20);
    assert.equal(Feed.select(rows, '', 50).length, 30);
    const selected = Feed.select(rows, ' OWNER/REPO ', 10);
    assert.equal(selected.length, 10);
    assert.equal(selected[0].id, 5);
    assert.deepEqual(Feed.select(rows, 'missing/repo', 10), []);
});

test('uses fixed GitHub repository URLs and validates usernames', () => {
    assert.equal(Feed.repositoryUrl('owner/repo'), 'https://github.com/owner/repo');
    for (const repo of ['https://evil.test', '../repo', 'owner/repo?x=1', 'owner/repo/extra']) assert.equal(Feed.repositoryUrl(repo), '');
    assert.equal(Feed.action('FutureEvent'), 'Future in');
    assert.equal(Feed.validUsername('Button99'), true);
    for (const name of ['', '../bad', 'user?x=1', 'a'.repeat(40)]) assert.equal(Feed.validUsername(name), false);
});

test('credential fingerprints match SHA-256 including multi-block and Unicode inputs', () => {
    for (const token of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(500), 'γειά']) {
        assert.equal(Feed.fingerprint(token), crypto.createHash('sha256').update(token).digest('hex'));
    }
    assert.notEqual(Feed.identity('first', ''), Feed.identity('second', ''));
    assert.equal(Feed.identity('', 'Button99'), 'public-button99');
});

test('cache rejects mismatched identities, corruption, future timestamps and invalid rows', () => {
    const cache = { version: 1, key: 'public-user', savedAt: 100, events: Feed.normalize([event]) };
    assert.equal(Feed.readCache(JSON.stringify(cache), cache.key, 200).savedAt, 100);
    assert.equal(Feed.readCache(JSON.stringify(cache), 'other', 200), null);
    assert.equal(Feed.readCache(JSON.stringify(cache), cache.key, 50), null);
    assert.equal(Feed.readCache('broken', cache.key, 200), null);
    assert.equal(Feed.readCache(JSON.stringify({ ...cache, events: [{}] }), cache.key, 200), null);
    assert.deepEqual(Feed.readCache(JSON.stringify({ ...cache, events: [] }), cache.key, 200).events, []);
});
