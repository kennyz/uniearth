#!/usr/bin/env python3
"""Create the share card with the site's Natural Earth data and brand palette.

Requires Pillow: python3 -m pip install Pillow
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1200, 630
FONT_DIR = Path("/System/Library/Fonts/Supplemental")


def font(size, bold=False):
    names = [FONT_DIR / ("Arial Bold.ttf" if bold else "Arial.ttf"),
             Path("/usr/share/fonts/truetype/dejavu") / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")]
    for candidate in names:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    raise RuntimeError("Install Arial or DejaVu Sans to generate the share image")


def main():
    image = Image.new("RGB", (WIDTH, HEIGHT), "#050a18")
    draw = ImageDraw.Draw(image)
    cx, cy, radius = 920, 320, 237
    # A subtle globe gradient, with no web font or remote image dependency.
    for r in range(radius + 32, 0, -1):
        if r > radius:
            color = (6, 14, 32)
        else:
            light = 1 - r / radius
            color = (int(9 + 7 * light), int(24 + 16 * light), int(52 + 30 * light))
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill=color)

    lon0, lat0 = math.radians(93), math.radians(18)

    def project(lon, lat):
        lon, lat = math.radians(lon)-lon0, math.radians(lat)
        return (math.cos(lat)*math.sin(lon),
                math.cos(lat0)*math.sin(lat)-math.sin(lat0)*math.cos(lat)*math.cos(lon),
                math.sin(lat0)*math.sin(lat)+math.cos(lat0)*math.cos(lat)*math.cos(lon))

    def pixel(p):
        return cx + radius*p[0], cy - radius*p[1]

    for axis in ("latitude", "longitude"):
        for fixed in (range(-60, 90, 30) if axis == "latitude" else range(-180, 180, 30)):
            line = []
            for variable in (range(-180, 181, 2) if axis == "latitude" else range(-90, 91, 2)):
                point = project(variable, fixed) if axis == "latitude" else project(fixed, variable)
                if point[2] >= 0:
                    line.append(pixel(point))
                else:
                    if len(line) > 1:
                        draw.line(line, fill="#1e365a", width=1)
                    line = []
            if len(line) > 1:
                draw.line(line, fill="#1e365a", width=1)

    topology = json.loads((ROOT / "countries-110m.json").read_text())
    transform = topology["transform"]
    arcs = []
    for arc in topology["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x, y = x+dx, y+dy
            points.append((x*transform["scale"][0]+transform["translate"][0],
                           y*transform["scale"][1]+transform["translate"][1]))
        arcs.append(points)
    for geometry in topology["objects"]["countries"]["geometries"]:
        polygons = [geometry["arcs"]] if geometry["type"] == "Polygon" else geometry["arcs"]
        for polygon in polygons:
            # The card is an illustration; only draw outer rings.
            ring = []
            for index in polygon[0]:
                points = arcs[index] if index >= 0 else list(reversed(arcs[~index]))
                ring.extend(points if not ring else points[1:])
            points = [project(*p) for p in ring]
            visible = []
            for a, b in zip(points[-1:]+points[:-1], points):
                if (a[2] >= 0) != (b[2] >= 0):
                    t = a[2]/(a[2]-b[2])
                    p = [a[i]+t*(b[i]-a[i]) for i in range(3)]
                    norm = math.hypot(p[0], p[1])
                    p[0], p[1] = p[0]/norm, p[1]/norm
                    visible.append(pixel(p))
                if b[2] >= 0:
                    visible.append(pixel(b))
            if len(visible) > 2:
                draw.polygon(visible, fill="#325794")
                draw.line(visible + visible[:1], fill="#7698ce", width=1)
    draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), outline="#587fba", width=1)
    draw.ellipse((cx-radius-17, cy-radius-17, cx+radius+17, cy+radius+17), outline="#192c4b", width=1)

    # Match the existing globe logo and brand typography.
    draw.ellipse((66, 59, 100, 93), outline="#a7c8ff", width=2)
    draw.ellipse((77, 59, 89, 93), outline="#a7c8ff", width=2)
    draw.line((68, 70, 98, 70), fill="#a7c8ff", width=2)
    draw.line((68, 82, 98, 82), fill="#a7c8ff", width=2)
    draw.text((115, 52), "UniEarth", font=font(38, True), fill="#e9f2ff")
    draw.text((64, 180), "One map.", font=font(76, True), fill="#e9f2ff")
    draw.text((64, 266), "Our planet.", font=font(76, True), fill="#a7c8ff")
    draw.text((68, 388), "Explore geography. Compare data.", font=font(26), fill="#afc1de")
    draw.text((68, 432), "World  /  China  /  United States", font=font(21), fill="#8399bc")
    draw.line((68, 543, 630, 543), fill="#1c2c48", width=1)
    draw.text((68, 564), "INTERACTIVE WORLD MAP", font=font(17), fill="#8399bc")
    output = ROOT / "assets/social-preview.png"
    image.save(output, optimize=True)
    print(f"{output.name}: {output.stat().st_size / 1024:.1f} KB, {WIDTH} × {HEIGHT}")


if __name__ == "__main__":
    main()
