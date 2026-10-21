"""Run with python3 tests/content_test.py. No external dependencies required."""

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "archive/site-2026-10-20"


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
    def test_all_homepage_information_preserved(self):
        before = ContentParser((BACKUP / "index.html").read_text())
        after = ContentParser((ROOT / "index.html").read_text())
        self.assertFalse(Counter(before.blocks) - Counter(after.blocks))

    def test_all_existing_links_preserved(self):
        for file in ("index.html", "blogs.html"):
            before = ContentParser((BACKUP / file).read_text())
            after = ContentParser((ROOT / file).read_text())
            self.assertFalse(Counter(before.links) - Counter(after.links), file)

    def test_existing_blog_content_unchanged(self):
        file = "blogs/posts.js"
        current = (ROOT / file).read_text().replace('    slug: "how-getting-rejected-from-nearly-every-college-club-was-a-good-thing-pt-1",\n', '')
        self.assertEqual(current, (BACKUP / file).read_text())

    def test_no_duplicate_ids_and_valid_local_anchors(self):
        for file in ("index.html", "blogs.html"):
            page = ContentParser((ROOT / file).read_text())
            self.assertEqual(len(page.ids), len(set(page.ids)))
            for link in page.links:
                if link.startswith("#"):
                    self.assertIn(link[1:], page.ids)


if __name__ == "__main__":
    unittest.main()
