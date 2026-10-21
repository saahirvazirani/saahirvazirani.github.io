import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, localPosts, postCard, render } from '../scripts/build.mjs';
import { merge, parseFeed, readSnapshot, root, sync } from '../scripts/substack.mjs';

const old = { title: 'Old', link: 'https://saahirvazirani.substack.com/p/old', date: '2020-01-01T00:00:00.000Z', excerpt: 'old' };

test('sync merges feed updates without losing old entries and strips unsafe HTML', () => {
  const feed = `<rss><channel><item><title>New &amp; news</title><link>https://saahirvazirani.substack.com/p/new?utm=one</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b><script>bad()</script></p>]]></description></item></channel></rss>`;
  const merged = merge([old], parseFeed(feed));
  assert.equal(merged.length, 2);
  assert.equal(merged[0].excerpt, 'Hello world');
  assert.equal(merged[0].link, 'https://saahirvazirani.substack.com/p/new');
});

test('rejects malformed, empty, unsafe, and foreign feeds', () => {
  for (const xml of ['<rss>', '<rss><channel/></rss>', '<!DOCTYPE rss [<!ENTITY x "foo">]><rss/>', '<rss><channel><item><title>x</title><link>javascript:alert(1)</link><pubDate>2024-01-01</pubDate></item></channel></rss>']) {
    assert.throws(() => parseFeed(xml));
  }
});

test('failed fetch retains a usable snapshot and missing snapshot fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'writing-test-'));
  try {
    const path = join(dir, 'snapshot.json');
    await writeFile(path, JSON.stringify([old]));
    await sync({ path, fetchFeed: async () => { throw new Error('offline'); } });
  assert.deepEqual(await readSnapshot(path), merge([old]));
    await assert.rejects(sync({ path: join(dir, 'missing.json'), fetchFeed: async () => { throw new Error('offline'); } }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('full bodies keep safe formatting and images; excerpt-only updates cannot erase them', () => {
  const full = parseFeed(`<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>A &amp; B</title><link>https://saahirvazirani.substack.com/p/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><content:encoded><![CDATA[<p>First <strong>bold</strong></p><p>Second paragraph</p><img src="https://example.com/photo.jpg" onerror="bad()"><img src="javascript:bad()"><script>bad()</script>]]></content:encoded></item></channel></rss>`)[0];
  assert.equal(full.title, 'A & B');
  assert.equal(full.excerpt, 'First bold Second paragraph');
  assert.equal(full.contentType, 'full');
  assert.match(full.body, /<strong>bold<\/strong>/);
  assert.match(full.body, /Second paragraph/);
  assert.match(full.body, /src="https:\/\/example.com\/photo.jpg"/);
  assert.doesNotMatch(full.body, /onerror|javascript:|<script>/);
  const short = parseFeed(`<rss><channel><item><title>A &amp; B</title><link>https://saahirvazirani.substack.com/p/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description>Only an excerpt</description></item></channel></rss>`)[0];
  assert.equal(short.contentType, 'excerpt');
  assert.equal(merge([full], [short])[0].body, full.body);
  assert.equal(merge([full], [short])[0].contentType, 'full');
});

test('output is escaped and script links are removed', () => {
  const html = postCard({ title: '<img onerror=x>', slug: 'test', body: ['<script>bad</script>'] }, { full: true });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.throws(() => postCard({ title: 'x', slug: 'x', body: [], links: [{ url: 'javascript:alert(1)' }] }, { full: true }));
  assert.throws(() => render('<div id="x"></div><div id="x"></div>', { x: '' }));
});

test('build renders source templates and nested post pages without browser feed', async () => {
  await build();
  const post = (await localPosts())[0];
  const home = await readFile(join(root, 'dist/index.html'), 'utf8');
  const index = await readFile(join(root, 'dist/blogs.html'), 'utf8');
  const article = await readFile(join(root, 'dist/blog', post.slug, 'index.html'), 'utf8');
  for (const page of [home, index, article]) {
    assert.doesNotMatch(page, /loadSubstackPosts|blogs\/substack\.js|blogs\/posts\.js/);
  }
  assert.match(home, /Coming soon/);
  assert.match(index, /Coming soon/);
  assert.ok(home.includes(`blog/${post.slug}/`));
  assert.ok(index.includes(`blog/${post.slug}/`));
  assert.ok(article.includes('href="/styles.css?'));
  assert.ok(article.includes('href="#page-title"'));
  assert.ok(article.includes(post.body[0]));
  assert.match(article, /rel="canonical"/);
  assert.match(article, /property="og:title"/);
  const substack = (await readSnapshot()).find(entry => entry.link.endsWith('/coming-soon'));
  const substackPage = await readFile(join(root, 'dist/blog/substack-coming-soon/index.html'), 'utf8');
  assert.ok(substackPage.includes(substack.body));
  if (substack.contentType === 'excerpt') assert.match(substackPage, /Excerpt from Substack/);
  assert.ok((await readFile(join(root, 'dist/assets/fonts/manrope.ttf'))).length > 0);
});
