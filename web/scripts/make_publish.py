"""Turn the single-file build into the page the Artifact tool publishes.

The host wraps the page in its own doctype, head and body, so this keeps only
what sits inside our head (title, viewport-fit meta, font links, the theme
script, the inlined app script and CSS) and the root div.

usage: python3 scripts/make_publish.py dist-single/index.html ../publish/ap-fact-check-redesign.html
"""
import re
import sys

src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding="utf-8").read()

start = html.index("<title>")
end = html.index("</head>")
head = html[start:end].rstrip()
head = re.sub(r"<title>.*?</title>", "<title>AP Fact Check Redesign</title>", head, count=1, flags=re.S)

body = re.search(r"<body[^>]*>(.*)</body>", html, flags=re.S).group(1).strip()
assert body == '<div id="root"></div>', body[:200]

page = head + "\n" + body + "\n"
assert page.startswith("<title>")
assert "<!doctype" not in page.lower()[:200] and "<html" not in page.lower()[:5000]
open(out, "w", encoding="utf-8").write(page)
print(f"{out}: {len(page) // 1024} KB")
