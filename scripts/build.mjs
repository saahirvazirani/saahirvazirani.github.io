import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import { parse, parseFragment, serialize } from 'parse5';
import { root, readSnapshot } from './substack.mjs';
import sanitizeHtml from 'sanitize-html';

const dist = join(root, 'dist');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function slugify(value) {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new Error('Empty post slug');
  return slug;
}

export async function localPosts() {
  const context = { window: {} };
  vm.runInNewContext(await readFile(join(root, 'blogs/posts.js'), 'utf8'), context, { timeout: 1000 });
  const posts = context.window.BLOG_POSTS;
  if (!Array.isArray(posts)) throw new Error('BLOG_POSTS must be an array');
  const slugs = new Set();
  return posts.map(post => {
    if (typeof post.title !== 'string' || !post.title.trim() || !Array.isArray(post.body) || !post.body.every(p => typeof p === 'string')) throw new Error('Invalid local post');
    if (!post.slug) throw new Error('Each local post needs a permanent slug; assign one when adding it.');
    const slug = slugify(post.slug);
    if (slugs.has(slug)) throw new Error(`Duplicate post slug: ${slug}`);
    slugs.add(slug);
    return { ...post, slug };
  });
}

export function postCard(post, { full = false, latest = false } = {}) {
  const title = escapeHtml(post.title);
  const heading = full ? title : `<a href="blog/${post.slug}/">${title}</a>`;
  let html = `<article class="${latest ? 'latest-post' : 'blog-post'}"><p class="post-date">${escapeHtml(post.date || '')}</p><h3>${heading}</h3>`;
  if (post.summary) html += `<p class="blog-summary">${escapeHtml(post.summary)}</p>`;
  if (full) {
    html += post.body.map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const links = (post.links || []).map(item => {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid post link');
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`;
    });
    if (links.length) html += `<p class="blog-links">${links.join(' · ')}</p>`;
  }
  return html + '</article>';
}

function substackSlug(post) {
  return `substack-${slugify(new URL(post.link).pathname.slice(3))}`;
}

function plain(html) {
  return sanitizeHtml(html.replace(/<\/(?:p|div|li|h[1-6]|blockquote)>/gi, '$& '), { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function allPosts(local, substack) {
  const known = new Set(local.map(post => post.originalUrl).filter(Boolean).map(url => new URL(url).href.replace(/\/$/, '')));
  const entries = local.map(post => {
    if (post.originalUrl && !['http:', 'https:'].includes(new URL(post.originalUrl).protocol)) throw new Error('Invalid original publication URL');
    const links = (post.links || []).map(item => {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid post link');
      return `<a href="${escapeHtml(url.href)}" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`;
    });
    return { ...post, text: post.body.join(' '), html: post.body.map(p => `<p>${escapeHtml(p)}</p>`).join('') + (links.length ? `<p>${links.join(' · ')}</p>` : ''), source: post.originalUrl || '', sourceType: 'local' };
  });
  for (const post of substack) {
    if (known.has(post.link)) continue;
    entries.push({ ...post, slug: substackSlug(post), text: plain(post.body), html: post.body, source: post.link, sourceType: 'substack' });
  }
  const slugs = new Set();
  for (const entry of entries) {
    if (slugs.has(entry.slug)) throw new Error(`Duplicate post slug: ${entry.slug}`);
    slugs.add(entry.slug);
  }
  return entries.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

function excerpt(text, limit) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, limit).join(' ') + (words.length > limit ? '…' : '');
}

function listing(post, latest = false) {
  const short = post.text.split(/\s+/).filter(Boolean).length <= 600;
  const url = `blog/${post.slug}/`;
  const body = latest ? `<p>${escapeHtml(post.summary || excerpt(post.text, 45))}</p>` : short ? post.html : `<p>${escapeHtml(excerpt(post.text, 160))}</p>`;
  const label = post.contentType === 'excerpt' ? '<p>Excerpt from Substack</p>' : '';
  const read = !latest && !short ? `<p><a href="${url}">Read on this site</a></p>` : '';
  return `<article class="${latest ? 'latest-post' : 'blog-post'}"><p class="post-date">${escapeHtml(displayDate(post.date))}</p><h3><a href="${url}">${escapeHtml(post.title)}</a></h3>${label}${body}${read}</article>`;
}

function article(post) {
  const title = escapeHtml(post.title);
  const description = escapeHtml(post.summary || excerpt(post.text, 30));
  const canonical = `https://saahirvazirani.github.io/blog/${post.slug}/`;
  const source = post.source ? `<p><a href="${escapeHtml(post.source)}" rel="noopener noreferrer">Read the original publication</a></p>` : '';
  const label = post.contentType === 'excerpt' ? '<p class="blog-summary">Excerpt from Substack</p>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | Saahir Vazirani</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary"><meta name="theme-color" content="#080b12"><link rel="stylesheet" href="/styles.css?v=20261020"></head><body><a class="skip-link" href="#page-title">Skip to content</a><main class="page blog-page"><header class="site-header"><a class="site-name" href="/">Saahir Vazirani</a><nav aria-label="Primary navigation"><a href="/blogs.html">Writing</a><a href="/#research">Research</a><a href="/#work">Work</a><a href="/#contact">Contact</a></nav></header><section class="intro-block blog-intro article-intro"><p class="back-link"><a href="/blogs.html">Back to writing</a></p><h1 id="page-title" tabindex="-1">${title}</h1><p class="post-date">${escapeHtml(displayDate(post.date))}</p></section><article class="blog-post article-body">${label}${post.html}${source}</article><footer class="site-footer"><p><a href="/blogs.html">Back to writing</a> · <a href="mailto:vaziranisaahir@gmail.com">Email</a> · <a href="https://substack.com/@saahirvazirani">Substack</a></p></footer></main></body></html>`;
}

function substackCards(posts) {
  return posts.map(post => {
    const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(post.date));
    return `<article class="substack-post"><p class="post-date">${escapeHtml(date)}</p><h3><a href="blog/${substackSlug(post)}/">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(post.excerpt)}</p>${post.contentType === 'excerpt' ? '<p>Excerpt</p>' : ''}</article>`;
  }).join('');
}

function attr(node, name) { return node.attrs?.find(a => a.name === name)?.value; }
function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes || []) walk(child, callback);
}
function setContent(node, html) {
  node.childNodes = parseFragment(html).childNodes;
  for (const child of node.childNodes) child.parentNode = node;
}
export function render(source, replacements, { nested = false, title } = {}) {
  const doc = parse(source);
  const found = new Map();
  let head, titleNode;
  walk(doc, node => {
    if (node.tagName === 'head') head = node;
    if (node.tagName === 'title') titleNode = node;
    const id = attr(node, 'id');
    if (id && Object.hasOwn(replacements, id)) {
      if (found.has(id)) throw new Error(`Duplicate #${id}`);
      found.set(id, node);
    }
  });
  for (const [id, html] of Object.entries(replacements)) {
    if (!found.has(id)) throw new Error(`Missing #${id}`);
    setContent(found.get(id), html);
  }
  walk(doc, node => {
    if (!node.childNodes) return;
    node.childNodes = node.childNodes.filter(child => {
      if (child.tagName !== 'script') return true;
      const src = (attr(child, 'src') || '').split('?')[0];
      const content = child.childNodes?.map(c => c.value || '').join('') || '';
      return !['blogs/posts.js', 'blogs/substack.js'].includes(src) && !content.includes('loadSubstackPosts(');
    });
  });
  if (nested) {
    if (!head) throw new Error('Missing head');
    walk(doc, node => {
      for (const attribute of node.attrs || []) {
        if (['href', 'src'].includes(attribute.name) && attribute.value && !/^(?:#|\/|[a-z][a-z0-9+.-]*:)/i.test(attribute.value)) {
          attribute.value = `../../${attribute.value}`;
        }
      }
    });
    const style = parseFragment('<style>.blog-post img{max-width:100%;height:auto}.blog-post pre{overflow-x:auto}.blog-post figure{margin:2rem 0}</style>').childNodes[0];
    style.parentNode = head;
    head.childNodes.push(style);
  }
  if (title) {
    if (!titleNode) throw new Error('Missing title');
    setContent(titleNode, escapeHtml(`${title} | Saahir Vazirani`));
  }
  return serialize(doc);
}

export async function build() {
  const posts = await localPosts();
  const substack = await readSnapshot();
  const home = await readFile(join(root, 'index.html'), 'utf8');
  const blog = await readFile(join(root, 'blogs.html'), 'utf8');
  const entries = allPosts(posts, substack);
  const homeHtml = render(home, { 'latest-writing': entries.slice(0, 3).map(post => listing(post, true)).join('') || '<p>No posts yet.</p>', 'latest-substack': '' });
  const replacements = { 'blog-list': entries.map(post => listing(post)).join('') || '<p>No posts yet.</p>', 'substack-list': '' };
  const blogHtml = render(blog, replacements);
  const pages = entries.map(post => ({ slug: post.slug, html: article(post) }));
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  for (const file of ['styles.css', 'site.js', 'BLOG_TEMPLATE.md', 'assets']) await cp(join(root, file), join(dist, file), { recursive: true });
  await writeFile(join(dist, 'index.html'), homeHtml);
  await writeFile(join(dist, 'blogs.html'), blogHtml);
  for (const page of pages) {
    const directory = join(dist, 'blog', page.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), page.html);
  }
  console.log(`Built dist/ with ${posts.length} local posts and ${substack.length} Substack posts`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) await build();
