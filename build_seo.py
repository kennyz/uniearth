#!/usr/bin/env python3
"""Build static SEO metadata from the real deployment URL, without placeholders."""
import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent
PAGES = {
    "index.html": {
        "path": "",
        "title": "Interactive World Map & Geography Data | UniEarth",
        "description": "Explore the world, Chinese provinces and US states with UniEarth. Compare population, area, density and GDP on an interactive map. Free, with no sign-up.",
    },
    "map.html": {
        "path": "map.html",
        "title": "World Map — Population, Area & GDP | UniEarth",
        "description": "Search countries, Chinese provinces and US states on an interactive world map. Compare population, area, density, GDP and GDP per capita with UniEarth.",
    },
}


def normalize_site_url(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or any(c.isspace() for c in value)):
        raise ValueError("site_url must be an absolute HTTPS deployment URL without credentials, query or fragment")
    return value.rstrip("/") + "/"


def meta(key, value, attribute="name"):
    return f'<meta {attribute}="{key}" content="{html.escape(value, quote=True)}">'


def metadata(page, base):
    tags = [
        meta("robots", "index,follow,max-image-preview:large"),
        meta("og:type", "website", "property"),
        meta("og:site_name", "UniEarth", "property"),
        meta("og:title", page["title"], "property"),
        meta("og:description", page["description"], "property"),
        meta("og:locale", "en_US", "property"),
        meta("og:locale:alternate", "zh_CN", "property"),
        meta("twitter:card", "summary_large_image"),
        meta("twitter:title", page["title"]),
        meta("twitter:description", page["description"]),
    ]
    # Relative previews remain useful locally. Production URLs only come from config.
    image = (base or "") + "assets/social-preview.png"
    tags += [
        meta("og:image", image, "property"),
        meta("og:image:width", "1200", "property"),
        meta("og:image:height", "630", "property"),
        meta("og:image:type", "image/png", "property"),
        meta("og:image:alt", "UniEarth interactive world map and geography data", "property"),
        meta("twitter:image", image),
        meta("twitter:image:alt", "UniEarth interactive world map and geography data"),
    ]
    if base:
        canonical = base + page["path"]
        tags += [
            f'<link rel="canonical" href="{html.escape(canonical, quote=True)}">',
            meta("og:url", canonical, "property"),
        ]
        website_id = base + "#website"
        graph = [{
            "@type": "WebSite", "@id": website_id, "url": base,
            "name": "UniEarth", "inLanguage": ["en", "zh-CN"],
        }, {
            "@type": "WebPage", "@id": canonical + "#webpage",
            "url": canonical, "name": page["title"],
            "description": page["description"], "inLanguage": "en",
            "isPartOf": {"@id": website_id}, "image": image,
        }]
        if page["path"] == "map.html":
            graph[1]["mainEntity"] = {"@id": canonical + "#app"}
            graph.append({
                "@type": "WebApplication", "@id": canonical + "#app",
                "url": canonical, "name": page["title"],
                "description": page["description"], "inLanguage": "en",
                "applicationCategory": "EducationalApplication",
                "operatingSystem": "Any", "browserRequirements": "Requires JavaScript",
                "isAccessibleForFree": True,
                "featureList": ["World, China province and US state maps", "Bilingual place search", "Population, area, density and GDP comparison", "Multiple map projections"],
            })
        data = json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False, indent=2)
        data = data.replace("<", "\\u003c")
        tags.append('<script type="application/ld+json" id="seo-structured-data">\n' + data + '\n</script>')
    return "<!-- SEO:START -->\n" + "\n".join(tags) + "\n<!-- SEO:END -->"


def build(base):
    for filename, page in PAGES.items():
        path = ROOT / filename
        source = path.read_text(encoding="utf-8")
        source, count = re.subn(r"<!-- SEO:START -->.*?<!-- SEO:END -->", lambda _: metadata(page, base), source, flags=re.S)
        if count != 1:
            raise ValueError(f"Expected one SEO block in {filename}, got {count}")
        path.write_text(source, encoding="utf-8")
    robots = "User-agent: *\nAllow: /\n"
    sitemap_path = ROOT / "sitemap.xml"
    if base:
        robots += "\nSitemap: " + base + "sitemap.xml\n"
        ns = "http://www.sitemaps.org/schemas/sitemap/0.9"
        ET.register_namespace("", ns)
        urlset = ET.Element("{" + ns + "}urlset")
        for page in PAGES.values():
            url = ET.SubElement(urlset, "{" + ns + "}url")
            ET.SubElement(url, "{" + ns + "}loc").text = base + page["path"]
        ET.indent(urlset, space="  ")
        ET.ElementTree(urlset).write(sitemap_path, encoding="utf-8", xml_declaration=True)
    elif sitemap_path.exists():
        # Do not silently remove an existing deployment sitemap.
        raise ValueError("sitemap.xml exists but site_url is missing; configure the deployment URL")
    (ROOT / "robots.txt").write_text(robots, encoding="utf-8")
    if not base:
        print("Production URL not configured: canonical, og:url, JSON-LD and sitemap omitted. Set site_url in seo-config.json, then rerun.")
    else:
        print("SEO built for " + base)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-url", help="Real HTTPS deployment URL; saved in seo-config.json")
    args = parser.parse_args()
    config_path = ROOT / "seo-config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    value = args.site_url or config.get("site_url")
    base = normalize_site_url(value) if value else None
    if args.site_url:
        config["site_url"] = base
        config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    build(base)


if __name__ == "__main__":
    main()
