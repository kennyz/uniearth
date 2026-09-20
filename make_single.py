#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inline the map, shared theme, data and scripts into an offline HTML file."""
import os
import re
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


def main():
    html = read("map.html")
    html = re.sub(
        r'<link rel="stylesheet" href="([^"?]+)(?:\?[^\"]*)?">',
        lambda m: "<style>\n" + read(m[1]) + "\n</style>", html)
    html = re.sub(
        r'<script src="([^"?]+)(?:\?[^\"]*)?"></script>',
        lambda m: "<script>\n" + read(m[1]) + "\n</script>", html)
    html = re.sub(
        r'<link rel="icon" type="image/svg\+xml" href="([^"?]+)(?:\?[^\"]*)?">',
        lambda m: '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + quote(read(m[1])) + '">', html)
    assert '<script src=' not in html and 'rel="stylesheet"' not in html, "Inlining failed"
    out = os.path.join(HERE, "world-map.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("world-map.html  %.1f KB" % (os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
