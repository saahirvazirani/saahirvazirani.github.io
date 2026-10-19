const SUBSTACK_FEED_URL = "https://saahirvazirani.substack.com/feed";
const SUBSTACK_PROFILE_URL = "https://substack.com/@saahirvazirani";
const SUBSTACK_FALLBACK_POSTS = [
  {
    title: "Coming soon",
    link: "https://saahirvazirani.substack.com/p/coming-soon",
    date: "Jan 27, 2025",
    excerpt: "This is Saahir's Substack.",
  },
];

function substackText(value) {
  const documentFragment = new DOMParser().parseFromString(value || "", "text/html");
  return (documentFragment.body.textContent || "").replace(/\s+/g, " ").trim();
}

function substackValue(element, tagName) {
  const child = element.getElementsByTagName(tagName)[0];
  return child ? child.textContent.trim() : "";
}

function substackExcerpt(item) {
  const encoded = item.getElementsByTagNameNS("*", "encoded")[0];
  const description = encoded || item.getElementsByTagName("description")[0];
  const text = substackText(description ? description.textContent : "");
  return text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
}

function substackDate(item) {
  const rawDate = substackValue(item, "pubDate") || substackValue(item, "published");
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function renderSubstackPosts(container, posts) {
  container.replaceChildren();

  posts.forEach((post) => {
    const article = document.createElement("article");
    article.className = "substack-post";

    const date = document.createElement("p");
    date.className = "post-date";
    date.textContent = post.date;
    article.append(date);

    const heading = document.createElement("h3");
    const link = document.createElement("a");
    link.href = post.link;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = post.title;
    heading.append(link);
    article.append(heading);

    if (post.excerpt) {
      const excerpt = document.createElement("p");
      excerpt.textContent = post.excerpt;
      article.append(excerpt);
    }

    container.append(article);
  });
}

function renderSubstackFallback(container) {
  renderSubstackPosts(container, SUBSTACK_FALLBACK_POSTS);

  const note = document.createElement("p");
  note.className = "substack-fallback";
  note.innerHTML =
    `Read more on <a href="${SUBSTACK_PROFILE_URL}" target="_blank" rel="noreferrer">Substack</a>.`;
  container.append(note);
}

async function loadSubstackPosts(container, limit = 5) {
  if (!container) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(SUBSTACK_FEED_URL, { mode: "cors", signal: controller.signal });
    if (!response.ok) throw new Error(`Substack feed returned ${response.status}`);

    const xml = new DOMParser().parseFromString(await response.text(), "text/xml");
    if (xml.querySelector("parsererror")) throw new Error("Substack feed could not be parsed");

    const posts = [...xml.querySelectorAll("item, entry")]
      .map((item) => ({
        title: substackValue(item, "title"),
        link: substackValue(item, "link") || item.querySelector("link")?.getAttribute("href") || "",
        date: substackDate(item),
        excerpt: substackExcerpt(item),
      }))
      .filter((post) => post.title && post.link)
      .slice(0, limit);

    if (!posts.length) throw new Error("Substack feed contained no posts");
    renderSubstackPosts(container, posts);
  } catch (error) {
    renderSubstackFallback(container);
  } finally {
    clearTimeout(timeout);
  }
}

window.loadSubstackPosts = loadSubstackPosts;
