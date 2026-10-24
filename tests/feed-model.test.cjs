const { test } = require('node:test');
const assert = require('node:assert/strict');
const Feed = require('../FeedModel.js');

test('parses CLI output, handles empty feeds and rejects incompatible data', () => {
    const rows = Feed.parse('TIME\tACTOR\tEVENT\tREPOSITORY\n2026-10-24T12:00:00Z\talice\tWatchEvent\towner/repo\n');
    assert.equal(rows[0].actor, 'alice');
    assert.equal(rows[0].repo, 'owner/repo');
    assert.deepEqual(Feed.parse('No matching activity found in the available feed.\n'), []);
    assert.deepEqual(Feed.parse(''), []);
    assert.throws(() => Feed.parse('not valid output'));
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

test('uses fixed GitHub repository URLs and supports unknown event types', () => {
    assert.equal(Feed.repositoryUrl('owner/repo'), 'https://github.com/owner/repo');
    for (const repo of ['https://evil.test', '../repo', 'owner/repo?x=1', 'owner/repo/extra']) {
        assert.equal(Feed.repositoryUrl(repo), '');
    }
    assert.equal(Feed.action('FutureEvent'), 'Future in');
});

test('cache metadata preserves snapshot time and stale warnings', () => {
    assert.deepEqual(Feed.cacheStatus('Feed cache: cache; saved_at=100\n'), {
        source: 'cache', savedAt: 100000, warning: ''
    });
    const stale = Feed.cacheStatus('Feed cache: stale; saved_at=100\nNetwork unavailable. Showing saved activity.\n');
    assert.equal(stale.source, 'stale');
    assert.equal(stale.savedAt, 100000);
    assert.match(stale.warning, /Network unavailable/);
});
