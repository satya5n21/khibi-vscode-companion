import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ALL_EXPRESSIONS,
    discoverCharacters,
    isPathInside,
    resolveCharacter
} from '@khibi/shared';

let root: string;

function writePack(id: string, manifest: unknown, files: string[] = []): string {
    const dir = path.join(root, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify(manifest));
    for (const f of files) {
        fs.writeFileSync(path.join(dir, f), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    }
    return dir;
}

describe('Character packs', () => {
    before(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'khibi-packs-'));
    });
    after(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('discovers valid svg and images packs', () => {
        writePack('vec', { name: 'Vec', type: 'svg', svg: 'a.svg' }, ['a.svg']);
        writePack(
            'pics',
            { name: 'Pics', type: 'images', expressions: { normal: 'n.svg' } },
            ['n.svg']
        );
        const { packs } = discoverCharacters([{ dir: root, source: 'user' }]);
        const ids = packs.map((p) => p.id);
        assert.ok(ids.includes('vec'));
        assert.ok(ids.includes('pics'));
    });

    it('rejects packs without a readable "normal" image, bad ids and path traversal', () => {
        writePack('no-normal', { name: 'X', type: 'images', expressions: { happy: 'h.svg' } }, ['h.svg']);
        writePack('escape', { name: 'E', type: 'images', expressions: { normal: '../x.svg' } });
        writePack('Bad Id', { name: 'B', type: 'svg', svg: 'a.svg' }, ['a.svg']);
        const { packs, errors } = discoverCharacters([{ dir: root, source: 'user' }]);
        const ids = packs.map((p) => p.id);
        assert.ok(!ids.includes('no-normal'));
        assert.ok(!ids.includes('escape'));
        assert.ok(!ids.includes('Bad Id'));
        assert.ok(errors.length >= 3);
    });

    it('fills every expression through the fallback chain', () => {
        writePack(
            'sparse',
            {
                name: 'Sparse',
                type: 'images',
                expressions: {
                    normal: 'n.svg',
                    happy: { src: ['h1.svg', 'h2.svg'], fps: 10, motion: 'jump' },
                    sad: 's.svg'
                }
            },
            ['n.svg', 'h1.svg', 'h2.svg', 's.svg']
        );
        const pack = discoverCharacters([{ dir: root, source: 'user' }]).packs.find(
            (p) => p.id === 'sparse'
        );
        assert.ok(pack);
        const resolved = resolveCharacter(pack);
        assert.ok(resolved.expressions);
        for (const expr of ALL_EXPRESSIONS) {
            assert.ok(resolved.expressions[expr].frames.length > 0, `${expr} missing`);
        }
        // celebrating -> excited -> happy
        assert.deepEqual(
            resolved.expressions.celebrating.frames,
            resolved.expressions.happy.frames
        );
        assert.equal(resolved.expressions.happy.fps, 10);
        assert.equal(resolved.expressions.happy.motion, 'jump');
        // worried -> sad
        assert.deepEqual(resolved.expressions.worried.frames, resolved.expressions.sad.frames);
        // thinking -> normal
        assert.deepEqual(resolved.expressions.thinking.frames, resolved.expressions.normal.frames);
        assert.match(resolved.expressions.normal.frames[0], /^khibi-char:\/\/sparse\/n\.svg$/);
    });

    it('lets a later root override an earlier pack with the same id', () => {
        const other = fs.mkdtempSync(path.join(os.tmpdir(), 'khibi-packs2-'));
        try {
            fs.mkdirSync(path.join(other, 'vec'));
            fs.writeFileSync(
                path.join(other, 'vec', 'character.json'),
                JSON.stringify({ name: 'Vec Override', type: 'svg', svg: 'b.svg' })
            );
            fs.writeFileSync(path.join(other, 'vec', 'b.svg'), '<svg/>');
            const { packs } = discoverCharacters([
                { dir: root, source: 'builtin' },
                { dir: other, source: 'user' }
            ]);
            const vec = packs.find((p) => p.id === 'vec');
            assert.equal(vec?.name, 'Vec Override');
            assert.equal(vec?.source, 'user');
        } finally {
            fs.rmSync(other, { recursive: true, force: true });
        }
    });

    it('works without character.json by reading mood-named images', () => {
        const dir = path.join(root, 'auto-hero');
        fs.mkdirSync(dir);
        for (const f of ['auto-hero-normal.png', 'auto-hero-happy.webp', 'auto-hero-happy.png', 'notes.txt', 'sad.png', 'random.png']) {
            fs.writeFileSync(path.join(dir, f), 'x');
        }
        const pack = discoverCharacters([{ dir: root, source: 'user' }]).packs.find(
            (p) => p.id === 'auto-hero'
        );
        assert.ok(pack);
        assert.equal(pack.name, 'Auto Hero');
        assert.equal(pack.manifest.expressions?.normal, 'auto-hero-normal.png');
        assert.equal(pack.manifest.expressions?.happy, 'auto-hero-happy.webp'); // webp preferred
        assert.equal(pack.manifest.expressions?.sad, 'sad.png');
        assert.equal(pack.manifest.expressions?.thinking, undefined);
    });

    it('ignores folders that have neither a manifest nor a normal image', () => {
        const dir = path.join(root, 'stray-folder');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'happy.png'), 'x');
        const { packs, errors } = discoverCharacters([{ dir: root, source: 'user' }]);
        assert.ok(!packs.some((p) => p.id === 'stray-folder'));
        assert.ok(!errors.some((e) => e.startsWith('stray-folder')));
    });

    it('isPathInside blocks paths outside the pack', () => {
        const dir = path.join(root, 'vec');
        assert.equal(isPathInside(dir, path.join(dir, 'a.svg')), true);
        assert.equal(isPathInside(dir, path.join(root, 'pics', 'n.svg')), false);
        assert.equal(isPathInside(dir, path.join(dir, 'missing.svg')), false);
    });
});
