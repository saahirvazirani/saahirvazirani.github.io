"""Run with python3 tests/content_test.py. No external dependencies required."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "archive/site-2026-10-20"
SITE_PAGES = ("index.html", "research.html", "work.html", "about.html", "blogs.html")


class ContentParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.links = []
        self.blocks = []
        self.ids = []
        self.current = None
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "a":
            self.links.append(attrs.get("href"))
        if tag in ("p", "summary", "h1", "h2", "h3"):
            self.current = (attrs.get("class", ""), [])

    def handle_data(self, data):
        if self.current:
            self.current[1].append(data)

    def handle_endtag(self, tag):
        if tag in ("p", "summary", "h1", "h2", "h3") and self.current:
            name, chunks = self.current
            if name != "section-index":
                block = " ".join("".join(chunks).split())
                self.blocks.append(block.removesuffix(" View original"))
            self.current = None


class ContentTests(unittest.TestCase):
    def test_all_homepage_information_preserved_across_site(self):
        before = ContentParser((BACKUP / "index.html").read_text())
        after = ContentParser("".join((ROOT / file).read_text() for file in SITE_PAGES))
        self.assertFalse(Counter(before.blocks) - Counter(after.blocks))

    def test_all_existing_external_links_preserved(self):
        before = ContentParser("".join((BACKUP / file).read_text() for file in ("index.html", "blogs.html")))
        after = ContentParser("".join((ROOT / file).read_text() for file in SITE_PAGES))
        external = lambda links: [link for link in links if link and ("://" in link or link.startswith("mailto:"))]
        self.assertFalse(Counter(external(before.links)) - Counter(external(after.links)))

    def test_existing_blog_content_unchanged(self):
        file = "blogs/posts.js"
        current = (ROOT / file).read_text().replace('    slug: "how-getting-rejected-from-nearly-every-college-club-was-a-good-thing-pt-1",\n', '')
        self.assertEqual(current, (BACKUP / file).read_text())

    def test_no_duplicate_ids_and_valid_local_anchors(self):
        for file in SITE_PAGES:
            page = ContentParser((ROOT / file).read_text())
            self.assertEqual(len(page.ids), len(set(page.ids)))
            for link in page.links:
                if link.startswith("#"):
                    self.assertIn(link[1:], page.ids)

    def test_primary_pages_have_consistent_navigation(self):
        expected = {"index.html", "research.html", "work.html", "about.html", "blogs.html"}
        for file in SITE_PAGES:
            page = ContentParser((ROOT / file).read_text())
            local_pages = {link.split("#", 1)[0] for link in page.links if link and link.endswith(".html")}
            self.assertTrue(expected - {file} <= local_pages | {file}, file)
            source = (ROOT / file).read_text()
            self.assertEqual(source.count('aria-current="page"'), 1, file)


if __name__ == "__main__":
    unittest.main()
