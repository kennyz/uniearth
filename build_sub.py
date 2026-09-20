#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建省/州级下钻数据层（仅中国、美国）。

边界：中国省级 = 阿里 DataV 全国省级 GeoJSON；美国州级 = us-atlas states-10m TopoJSON
统计：Wikidata（wbgetentities，取最新年份的人口、面积、行政中心）

输入（/tmp）:
  cn_prov.json     DataV 100000_full.json
  us_states.json   us-atlas states-10m.json
  cn2.json / us2.json   SPARQL 结果（仅用来拿 QID 列表）
输出:
  data-sub.js      window.MAP_SUB
"""
import json
import math
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build import decode_topology  # 复用 TopoJSON 解码

UA = {"User-Agent": "UniEarth-map/1.0 (local build)"}


# ---------------------------------------------------------------- 名称归一
TRAD = {"東": "东", "寧": "宁", "貴": "贵", "銀": "银", "黃": "黄", "遼": "辽",
        "內": "内", "廣": "广", "陝": "陕", "雲": "云", "蘇": "苏", "臺": "台",
        "灣": "湾", "門": "门", "龍": "龙", "濱": "滨", "爾": "尔", "齊": "齐"}

SUFFIX = re.compile(r"(维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治区|省|市|州)$")


def simp(s):
    return "".join(TRAD.get(ch, ch) for ch in (s or ""))


def core(name):
    """广东省 / 山東省 / 内蒙古自治区 → 广东 / 山东 / 内蒙古"""
    s = simp(name)
    prev = None
    while prev != s:
        prev = s
        s = SUFFIX.sub("", s)
    return s


# ---------------------------------------------------------------- Wikidata
def wb_entities(qids):
    """批量取标签(zh/en) + P1082(人口,含时间) + P2046(面积) + P36(行政中心)"""
    out = {}
    qids = list(qids)
    for i in range(0, len(qids), 45):
        batch = qids[i:i + 45]
        url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
               "&props=labels|claims&languages=zh|en&ids=" + "|".join(batch))
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.load(r)
        for qid, ent in data.get("entities", {}).items():
            labels = ent.get("labels", {})
            claims = ent.get("claims", {})

            def num(prop):
                best = None
                for st in claims.get(prop, []):
                    dv = st.get("mainsnak", {}).get("datavalue")
                    if not dv or dv.get("type") != "quantity":
                        continue
                    val = float(dv["value"]["amount"].lstrip("+"))
                    year = 0
                    for q in st.get("qualifiers", {}).get("P585", []):
                        t = q.get("datavalue", {}).get("value", {}).get("time", "")
                        m = re.search(r"([+-]\d{4})", t)
                        if m:
                            year = abs(int(m.group(1)))
                    if best is None or year > best[1]:
                        best = (val, year)
                return best

            cap_q = None
            for st in claims.get("P36", []):
                dv = st.get("mainsnak", {}).get("datavalue")
                if dv:
                    cap_q = dv["value"]["id"]
                    break

            out[qid] = {
                "zh": simp((labels.get("zh") or {}).get("value", "")),
                "en": (labels.get("en") or {}).get("value", ""),
                "pop": num("P1082"),
                "area": (num("P2046") or (None, 0))[0],
                "capitalQ": cap_q,
            }
    return out


# ---------------------------------------------------------------- 几何简化
def rdp(points, eps):
    """Douglas-Peucker，points = [(lon,lat), ...]"""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        far, fi = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if seg == 0:
                dist = math.hypot(px - ax, py - ay)
            else:
                dist = abs(dy * px - dx * py + bx * ay - by * ax) / seg
            if dist > far:
                far, fi = dist, i
        if far > eps:
            keep[fi] = True
            stack.append((a, fi))
            stack.append((fi, b))
    return [p for p, k in zip(points, keep) if k]


def clean_rings(rings, eps=0.02, min_area=0.004):
    """rings: [[ [lon,lat], ... ], ...] → 扁平数组，简化 + 去掉碎岛"""
    out = []
    for ring in rings:
        pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
        if len(pts) < 4:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if (max(xs) - min(xs)) * (max(ys) - min(ys)) < min_area:
            continue
        s = rdp(pts, eps)
        if len(s) < 4:
            continue
        flat = []
        for lon, lat in s:
            flat.append(round(lon, 2))
            flat.append(round(lat, 2))
        flat += [flat[0], flat[1]]
        out.append(flat)
    return out


def geojson_rings(geom):
    t = geom["type"]
    polys = [geom["coordinates"]] if t == "Polygon" else geom["coordinates"]
    rings = []
    for poly in polys:
        for ring in poly:
            rings.append([(round(c[0], 4), round(c[1], 4)) for c in ring])
    return rings


def topo_rings(feature):
    """build.decode_topology 输出的是扁平 ring，这里转回坐标对"""
    return [[(feature["rings"][i][j], feature["rings"][i][j + 1])
             for j in range(0, len(feature["rings"][i]), 2)]
            for i in range(len(feature["rings"]))]


# ---------------------------------------------------------------- 中国省会
CN_CAPITAL = {
    "北京": "北京", "天津": "天津", "上海": "上海", "重庆": "重庆",
    "河北": "石家庄", "山西": "太原", "内蒙古": "呼和浩特", "辽宁": "沈阳",
    "吉林": "长春", "黑龙江": "哈尔滨", "江苏": "南京", "浙江": "杭州",
    "安徽": "合肥", "福建": "福州", "江西": "南昌", "山东": "济南",
    "河南": "郑州", "湖北": "武汉", "湖南": "长沙", "广东": "广州",
    "广西": "南宁", "海南": "海口", "四川": "成都", "贵州": "贵阳",
    "云南": "昆明", "西藏": "拉萨", "陕西": "西安", "甘肃": "兰州",
    "青海": "西宁", "宁夏": "银川", "新疆": "乌鲁木齐", "台湾": "台北",
    "香港": "香港", "澳门": "澳门",
}


def main():
    # ---------------- 中国
    qid_cn = [r["item"]["value"].rsplit("/", 1)[-1]
              for r in json.load(open("/tmp/cn2.json", encoding="utf-8"))["results"]["bindings"]]
    ent_cn = wb_entities(set(qid_cn))

    by_core = {}
    for qid, e in ent_cn.items():
        c = core(e["zh"] or e["en"])
        if not c or not e["pop"]:
            continue
        prev = by_core.get(c)
        if not prev or (e["pop"][1] > prev["pop"][1]):
            by_core[c] = e

    cn_geo = json.load(open("/tmp/cn_prov.json", encoding="utf-8"))
    cn_div = []
    miss_cn = []
    for f in cn_geo["features"]:
        p = f["properties"]
        name = (p.get("name") or "").strip()
        if not name:
            continue
        c = core(name)
        e = by_core.get(c)
        if not e:
            miss_cn.append(name)
        rings = clean_rings(geojson_rings(f["geometry"]))
        if not rings:
            continue
        center = p.get("centroid") or p.get("center") or [0, 0]
        cn_div.append({
            "id": str(p.get("adcode", name)),
            "name": name,
            "short": c,
            "full": simp(name),
            "en": e["en"] if e else "",
            "pop": int(e["pop"][0]) if e else None,
            "popYear": e["pop"][1] if e else None,
            "area": round(e["area"]) if e and e["area"] else None,
            "capital": CN_CAPITAL.get(c, ""),
            "center": [round(center[0], 3), round(center[1], 3)],
            "rings": rings,
        })
    cn_div.sort(key=lambda d: -(d["pop"] or 0))

    # ---------------- 美国
    qid_us = [r["item"]["value"].rsplit("/", 1)[-1]
              for r in json.load(open("/tmp/us2.json", encoding="utf-8"))["results"]["bindings"]]
    qid_us.append("Q61")  # 哥伦比亚特区
    ent_us = wb_entities(set(qid_us))

    cap_qids = [e["capitalQ"] for e in ent_us.values() if e["capitalQ"]]
    ent_cap = wb_entities(set(cap_qids))

    us_topo = json.load(open("/tmp/us_states.json", encoding="utf-8"))
    us_feats = decode_topology({"type": "Topology",
                                "transform": us_topo.get("transform"),
                                "arcs": us_topo["arcs"],
                                "objects": {"countries": us_topo["objects"]["states"]}})

    keep = {"01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15",
            "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27",
            "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39",
            "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53",
            "54", "55", "56"}  # 50 州 + DC，不含属地
    by_en = {}
    for qid, e in ent_us.items():
        if e["en"]:
            by_en[e["en"].lower()] = e
    # us-atlas 里 DC 叫 "District of Columbia"，而 Wikidata 标签是 "Washington, D.C."
    if "Q61" in ent_us:
        by_en["district of columbia"] = ent_us["Q61"]

    us_div = []
    miss_us = []
    for f in us_feats:
        fid = str(f["id"])
        if fid not in keep:
            continue
        name = f["name"]
        e = by_en.get(name.lower())
        if not e:
            miss_us.append(name)
        rings = clean_rings(topo_rings(f), eps=0.02)
        if not rings:
            continue
        # 用最大环的包围盒中心作为标签锚点
        big, big_area = None, -1
        for r in rings:
            xs = r[0::2]
            ys = r[1::2]
            a = (max(xs) - min(xs)) * (max(ys) - min(ys))
            if a > big_area:
                big_area = a
                big = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
        cap = ""
        if e and e["capitalQ"] and e["capitalQ"] in ent_cap:
            cap = ent_cap[e["capitalQ"]]["en"] or ent_cap[e["capitalQ"]]["zh"]
        us_div.append({
            "id": fid,
            "name": name,
            "short": name,
            "full": name,
            "zh": e["zh"] if e else "",
            "en": e["en"] if e else name,
            "pop": int(e["pop"][0]) if e and e["pop"] else None,
            "popYear": e["pop"][1] if e and e["pop"] else None,
            "area": round(e["area"]) if e and e["area"] else None,
            "capital": cap,
            "center": [round(big[0], 3), round(big[1], 3)],
            "rings": rings,
        })
    us_div.sort(key=lambda d: -(d["pop"] or 0))

    payload = {
        "meta": {
            "cnSource": "阿里云 DataV 全国省级边界 / Wikidata 统计",
            "usSource": "us-atlas states-10m / Wikidata 统计"
        },
        # view: 下钻时的取景框（美国不含阿拉斯加/夏威夷，保证本土看得清）
        "CHN": {"key": "156", "name": "中国", "level": "省", "unit": "个省级行政区",
                "view": [73, 17.5, 136, 54], "divisions": cn_div},
        "USA": {"key": "840", "name": "美国", "level": "州", "unit": "个州",
                "view": [-125.5, 23.5, -66.5, 50], "divisions": us_div},
    }

    out = os.path.join(HERE, "data-sub.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.MAP_SUB=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    pts = sum(len(r) // 2 for c in ("CHN", "USA") for d in payload[c]["divisions"] for r in d["rings"])
    print(f"中国省级: {len(cn_div)}  未匹配统计: {miss_cn}")
    print(f"美国州级: {len(us_div)}  未匹配统计: {miss_us}")
    print(f"坐标点  : {pts}")
    print(f"data-sub.js: {os.path.getsize(out)/1024:.1f} KB")


if __name__ == "__main__":
    main()
