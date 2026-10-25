const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('manual reinstall preserves configuration and hides backups from plugin discovery', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'github-feed-install-'));
    try {
        const bin = path.join(home, 'bin');
        fs.mkdirSync(bin);
        for (const name of ['omarchy', 'omarchy-shell']) {
            fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        }
        const configuration = path.join(home, '.config/omarchy');
        fs.mkdirSync(configuration, { recursive: true });
        const configFile = path.join(configuration, 'shell.json');
        fs.writeFileSync(configFile, '{"custom":"preserve"}');
        const run = () => spawnSync('/bin/bash', ['install.sh'], {
            cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
            env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, 'other-config'), PATH: `${bin}:${process.env.PATH}` }
        });
        assert.equal(run().status, 0);
        const plugins = path.join(configuration, 'plugins');
        const installed = path.join(plugins, 'github.feed');
        assert.equal(JSON.parse(fs.readFileSync(path.join(installed, 'manifest.json'))).id, 'github.feed');
        fs.writeFileSync(path.join(installed, 'local-note.txt'), 'keep in backup');
        assert.equal(run().status, 0);
        const entries = fs.readdirSync(plugins);
        assert.deepEqual(entries.filter(name => !name.startsWith('.')), ['github.feed']);
        const backup = entries.find(name => name.startsWith('.github.feed.backup.'));
        assert.ok(backup);
        assert.equal(fs.readFileSync(path.join(plugins, backup, 'local-note.txt'), 'utf8'), 'keep in backup');
        assert.equal(fs.readFileSync(configFile, 'utf8'), '{"custom":"preserve"}');
    } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
