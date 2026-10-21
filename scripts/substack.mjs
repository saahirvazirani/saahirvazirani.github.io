import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';
import { parseFragment } from 'parse5';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const snapshotPath = join(root, 'blogs/substack-snapshot.json');
export const feedUrl = 'https://saahirvazirani.substack.com/feed';

function text(value) {
  if (typeof value !== 'string') throw new Error('Expected text');
  const fragment = parseFragment(sanitizeBody(value));
  const blocks = new Set(['p', 'br', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'figure', 'figcaption', 'hr', 'pre']);
  function extract(node) {
    if (node.nodeName === '#text') return node.value;
    const content = (node.childNodes || []).map(extract).join('');
    return blocks.has(node.tagName) ? ` ${content} ` : content;
  }
  return extract(fragment).replace(/\s+/g, ' ').trim();
}

function sanitizeBody(value) {
  if (typeof value !== 'string') throw new Error('Invalid post body');
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'a', 'img', 'figure', 'figcaption', 'hr', 'pre', 'code'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    exclusiveFilter: frame => frame.tag === 'a' && /^https:\/\/saahirvazirani\.substack\.com\/subscribe(?:[/?#]|$)/i.test(frame.attribs.href || '')
  });
}

export function normalize(post) {
  if (!post || typeof post !== 'object') throw new Error('Invalid post');
  const title = text(post.title);
  const url = new URL(post.link);
  if (!title || url.protocol !== 'https:' || url.hostname !== 'saahirvazirani.substack.com' || url.port || url.username || url.password || !url.pathname.startsWith('/p/')) throw new Error('Invalid Substack post URL or title');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '');
  const date = new Date(post.date);
  if (!post.date || Number.isNaN(date.getTime())) throw new Error('Invalid post date');
  const contentType = post.contentType === 'full' ? 'full' : 'excerpt';
  const body = sanitizeBody(post.body ?? post.excerpt ?? '');
  let excerpt = text(post.excerpt || body);
  if (excerpt.length > 220) excerpt = excerpt.slice(0, 217).trimEnd() + '...';
  return { title, link: url.href, date: date.toISOString(), excerpt, body, contentType };
}

export function merge(...groups) {
  const byLink = new Map();
  for (const group of groups) {
    if (!Array.isArray(group)) throw new Error('Invalid snapshot');
    for (const post of group) {
      const entry = normalize(post);
      const previous = byLink.get(entry.link);
      if (previous?.contentType === 'full' && entry.contentType !== 'full') {
        entry.body = previous.body;
        entry.contentType = 'full';
      }
      byLink.set(entry.link, entry);
    }
  }
  return [...byLink.values()].sort((a, b) => b.date.localeCompare(a.date) || a.link.localeCompare(b.link));
}

export async function readSnapshot(path = snapshotPath) {
  const posts = merge(JSON.parse(await readFile(path, 'utf8')));
  if (!posts.length) throw new Error('Snapshot contains no posts');
  return posts;
}

export function parseFeed(xml) {
  if (Buffer.byteLength(xml) > 5_000_000 || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid or unsafe feed XML');
  const data = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const items = data?.rss?.channel?.item;
  if (!items) throw new Error('Feed contains no posts');
  const posts = (Array.isArray(items) ? items : [items]).map(item => {
    const full = typeof item['content:encoded'] === 'string' && item['content:encoded'].trim();
    const body = full || item.description || '';
    return normalize({ title: item.title, link: item.link, date: item.pubDate, body, excerpt: body, contentType: full ? 'full' : 'excerpt' });
  });
  if (!posts.length) throw new Error('Feed contains no posts');
  return merge(posts);
}

export async function writeSnapshot(posts, path = snapshotPath) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(posts, null, 2) + '\n');
  await rename(temp, path);
}

export async function sync({ path = snapshotPath, fetchFeed = fetch } = {}) {
  const baseline = await readSnapshot(path);
  let posts;
  try {
    const response = await fetchFeed(feedUrl, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'PersonalWebsiteBuild/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    posts = merge(baseline, parseFeed(xml));
    console.log(`Substack sync: ${posts.length} retained posts`);
  } catch (error) {
    console.warn(`Substack sync failed; using ${baseline.length} snapshot posts: ${error.message}`);
    return baseline;
  }
  await writeSnapshot(posts, path);
  return posts;
}
