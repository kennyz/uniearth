#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建交互式世界地图的数据层。

输入:
  countries-110m.json   Natural Earth 110m 国界 TopoJSON (world-atlas)
  /tmp/mledoze.json     world-countries 元数据 (cca3/ccn3/首都/面积/语言/货币/中文名)
  /tmp/wb_pop.json      世界银行 SP.POP.TOTL 2023
  /tmp/wb_gdp.json      世界银行 NY.GDP.PCAP.CD 2023

输出:
  data.js               window.MAP_DATA = { meta, geo, countries }
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- TopoJSON 解码
def decode_topology(topo, eps=0.0, min_area=0.0):
    """把 TopoJSON 解成 {id, name, rings:[[lon,lat,...]]} 列表。

    eps / min_area 大于 0 时做 Douglas-Peucker 简化与碎岛过滤（最大环始终保留）。
    """
    tr = topo.get("transform")

    arcs = []
    for arc in topo["arcs"]:
        pts = []
        x = y = 0
        for p in arc:
            if tr:
                x += p[0]
                y += p[1]
            else:
                x, y = p[0], p[1]
            pts.append((x, y))
        arcs.append(pts)

    def arc_points(idx):
        if idx < 0:
            return list(reversed(arcs[~idx]))
        return arcs[idx]

    def ring_coords(ring_indices):
        out = []
        for i in ring_indices:
            pts = arc_points(i)
            if out:
                pts = pts[1:]  # 去掉与上一段重复的接点
            out.extend(pts)
        return out

    def tx(pt):
        if tr:
            return (pt[0] * tr["scale"][0] + tr["translate"][0],
                    pt[1] * tr["scale"][1] + tr["translate"][1])
        return pt

    features = []
    for g in topo["objects"]["countries"]["geometries"]:
        gtype = g["type"]
        props = g.get("properties") or {}
        if gtype == "Polygon":
            polygons = [g["arcs"]]
        elif gtype == "MultiPolygon":
            polygons = g["arcs"]
        else:
            continue

        rings = []
        for poly in polygons:
            for ring in poly:
                coords = [tx(p) for p in ring_coords(ring)]
                if len(coords) < 4:
                    continue
                flat = []
                last = None
                for lon, lat in coords:
                    lon = round(lon, 2)
                    lat = round(lat, 2)
                    if (lon, lat) == last:
                        continue
                    flat.append(lon)
                    flat.append(lat)
                    last = (lon, lat)
                for piece in split_antimeridian(flat):
                    if len(piece) >= 8:
                        rings.append(piece)

        if eps or min_area:
            rings = simplify_flat_rings(rings, eps, min_area)
        if rings:
            features.append({
                "id": g.get("id"),
                "name": props.get("name", ""),
                "rings": rings,
            })
    return features


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


def simplify_flat_rings(rings, eps=0.02, min_area=0.0005):
    """扁平环简化：碎岛按面积过滤，但每个国家至少保留最大的那个环。"""
    cand = []
    for flat in rings:
        pts = [(flat[i], flat[i + 1]) for i in range(0, len(flat) - 2, 2)]
        if len(pts) < 3:
            continue
        simp = rdp(pts, eps) if eps else pts
        if len(simp) < 3:
            simp = pts
        xs = [p[0] for p in simp]
        ys = [p[1] for p in simp]
        cand.append(((max(xs) - min(xs)) * (max(ys) - min(ys)), simp))
    cand.sort(key=lambda t: -t[0])
    out = []
    for i, (area, pts) in enumerate(cand):
        if i > 0 and min_area and area < min_area:
            continue
        flat = []
        for lon, lat in pts:
            flat.append(round(lon, 2))
            flat.append(round(lat, 2))
        if flat[0] != flat[-2] or flat[1] != flat[-1]:
            flat += [flat[0], flat[1]]
        out.append(flat)
    return out


def split_antimeridian(flat):
    """把跨 180° 经线的环切成多段，避免投影后出现横贯全图的假边。"""
    pts = [(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]
    if not pts:
        return []
    pieces, cur = [], [pts[0]]
    for i in range(1, len(pts)):
        if abs(pts[i][0] - pts[i - 1][0]) > 180:
            if len(cur) >= 3:
                pieces.append(cur)
            cur = [pts[i]]
        else:
            cur.append(pts[i])
    if len(cur) >= 3:
        pieces.append(cur)

    out = []
    for piece in pieces:
        if len(piece) < 3:
            continue
        if piece[0] != piece[-1]:
            piece = piece + [piece[0]]
        flat_piece = []
        for lon, lat in piece:
            flat_piece.append(lon)
            flat_piece.append(lat)
        out.append(flat_piece)
    return out


# ---------------------------------------------------------------- 中文词典
LANG_ZH = {
    "eng": "英语", "zho": "汉语", "fra": "法语", "spa": "西班牙语", "ara": "阿拉伯语",
    "rus": "俄语", "por": "葡萄牙语", "deu": "德语", "jpn": "日语", "kor": "朝鲜语",
    "hin": "印地语", "ben": "孟加拉语", "ita": "意大利语", "nld": "荷兰语", "swe": "瑞典语",
    "nor": "挪威语", "dan": "丹麦语", "fin": "芬兰语", "pol": "波兰语", "ces": "捷克语",
    "slk": "斯洛伐克语", "hun": "匈牙利语", "ron": "罗马尼亚语", "bul": "保加利亚语",
    "ell": "希腊语", "tur": "土耳其语", "heb": "希伯来语", "fas": "波斯语", "urd": "乌尔都语",
    "tam": "泰米尔语", "tel": "泰卢固语", "mar": "马拉地语", "guj": "古吉拉特语",
    "kan": "卡纳达语", "mal": "马拉雅拉姆语", "pan": "旁遮普语", "sin": "僧伽罗语",
    "nep": "尼泊尔语", "mya": "缅甸语", "tha": "泰语", "khm": "高棉语", "lao": "老挝语",
    "vie": "越南语", "ind": "印尼语", "msa": "马来语", "tgl": "他加禄语", "swa": "斯瓦希里语",
    "amh": "阿姆哈拉语", "som": "索马里语", "hau": "豪萨语", "yor": "约鲁巴语",
    "zul": "祖鲁语", "afr": "南非荷兰语", "ukr": "乌克兰语", "bel": "白俄罗斯语",
    "lit": "立陶宛语", "lav": "拉脱维亚语", "est": "爱沙尼亚语", "slv": "斯洛文尼亚语",
    "hrv": "克罗地亚语", "srp": "塞尔维亚语", "bos": "波斯尼亚语", "mkd": "马其顿语",
    "sqi": "阿尔巴尼亚语", "kat": "格鲁吉亚语", "hye": "亚美尼亚语", "aze": "阿塞拜疆语",
    "kaz": "哈萨克语", "uzb": "乌兹别克语", "kir": "吉尔吉斯语", "tgk": "塔吉克语",
    "tuk": "土库曼语", "mon": "蒙古语", "bod": "藏语", "cym": "威尔士语", "gle": "爱尔兰语",
    "glg": "加利西亚语", "cat": "加泰罗尼亚语", "eus": "巴斯克语", "isl": "冰岛语",
    "mlt": "马耳他语", "ltz": "卢森堡语", "ber": "柏柏尔语", "tir": "提格里尼亚语",
    "orm": "奥罗莫语", "kin": "卢旺达语", "lug": "卢干达语", "sna": "绍纳语",
    "nde": "北恩德贝莱语", "tsn": "茨瓦纳语", "sot": "塞索托语", "ssw": "斯瓦蒂语",
    "ven": "文达语", "nbl": "南恩德贝莱语", "run": "基隆迪语", "nya": "齐切瓦语",
    "bem": "本巴语", "aka": "阿肯语", "ewe": "埃维语", "twi": "契维语", "fij": "斐济语",
    "sag": "桑戈语", "lin": "林加拉语", "kon": "刚果语", "lub": "卢巴语", "kwn": "宽亚马语",
    "her": "赫雷罗语", "nbl2": "南恩德贝莱语", "cal": "卡罗来纳语", "cha": "查莫罗语",
    "mah": "马绍尔语", "pau": "帕劳语", "gil": "基里巴斯语", "ton": "汤加语",
    "smo": "萨摩亚语", "niu": "纽埃语", "tvl": "图瓦卢语", "nau": "瑙鲁语",
    "bis": "比斯拉马语", "hmo": "希里莫图语", "tpi": "托克皮辛语", "mey": "哈桑尼亚语",
    "por2": "葡萄牙语", "grn": "瓜拉尼语", "aym": "艾马拉语", "que": "克丘亚语",
    "nno": "新挪威语", "nob": "挪威语", "roh": "罗曼什语", "gsw": "瑞士德语",
    "fao": "法罗语", "kal": "格陵兰语", "sme": "萨米语", "div": "迪维希语",
    "dzo": "宗喀语", "prs": "达利语", "pus": "普什图语", "snd": "信德语",
    "bal": "俾路支语", "swb": "科摩罗语", "mlg": "马尔加什语", "kir2": "基里巴斯语",
    "tet": "德顿语", "crs": "塞舌尔克里奥尔语", "mfe": "毛里求斯克里奥尔语",
    "zdj": "恩兹瓦尼语", "hat": "海地克里奥尔语", "jam": "牙买加土语",
    "kwn2": "宽亚马语", "toi": "汤加语", "loz": "洛齐语", "tum": "通布卡语",
    "sgn": "手语", "rar": "拉罗汤加语", "niu2": "纽埃语", "pih": "诺福克语",
    "roh2": "罗曼什语", "cnr": "黑山语", "smi": "萨米语", "vls": "弗拉芒语",
    "cat2": "加泰罗尼亚语", "ita2": "意大利语", "deu2": "德语", "fra2": "法语",
}

REGION_ZH = {
    "Africa": "非洲", "Americas": "美洲", "Asia": "亚洲", "Europe": "欧洲",
    "Oceania": "大洋洲", "Antarctic": "南极洲",
}
SUBRECION_ZH = {
    "Northern Africa": "北非", "Eastern Africa": "东非", "Middle Africa": "中非",
    "Southern Africa": "南部非洲", "Western Africa": "西非", "Caribbean": "加勒比地区",
    "Central America": "中美洲", "South America": "南美洲", "Northern America": "北美",
    "Central Asia": "中亚", "Eastern Asia": "东亚", "South-Eastern Asia": "东南亚",
    "Southern Asia": "南亚", "Western Asia": "西亚", "Eastern Europe": "东欧",
    "Northern Europe": "北欧", "Southern Europe": "南欧", "Western Europe": "西欧",
    "Australia and New Zealand": "澳大利亚与新西兰", "Melanesia": "美拉尼西亚",
    "Micronesia": "密克罗尼西亚", "Polynesia": "波利尼西亚",
}

CURRENCY_ZH = {
    "USD": "美元", "EUR": "欧元", "CNY": "人民币", "JPY": "日元", "GBP": "英镑",
    "KRW": "韩元", "INR": "印度卢比", "RUB": "俄罗斯卢布", "BRL": "巴西雷亚尔",
    "CAD": "加拿大元", "AUD": "澳大利亚元", "CHF": "瑞士法郎", "HKD": "港元",
    "SGD": "新加坡元", "MXN": "墨西哥比索", "ZAR": "南非兰特", "TRY": "土耳其里拉",
    "SAR": "沙特里亚尔", "AED": "阿联酋迪拉姆", "IDR": "印尼盾", "THB": "泰铢",
    "MYR": "马来西亚林吉特", "PHP": "菲律宾比索", "VND": "越南盾", "PLN": "波兰兹罗提",
    "SEK": "瑞典克朗", "NOK": "挪威克朗", "DKK": "丹麦克朗", "NZD": "新西兰元",
    "ARS": "阿根廷比索", "CLP": "智利比索", "COP": "哥伦比亚比索", "PEN": "秘鲁索尔",
    "EGP": "埃及镑", "NGN": "尼日利亚奈拉", "KES": "肯尼亚先令", "ETB": "埃塞俄比亚比尔",
    "PKR": "巴基斯坦卢比", "BDT": "孟加拉塔卡", "IRR": "伊朗里亚尔", "IQD": "伊拉克第纳尔",
    "ILS": "以色列新谢克尔", "UAH": "乌克兰格里夫纳", "CZK": "捷克克朗",
    "HUF": "匈牙利福林", "RON": "罗马尼亚列伊", "BGN": "保加利亚列弗",
    "HRK": "克罗地亚库纳", "ISK": "冰岛克朗", "KZT": "哈萨克斯坦坚戈",
    "UZS": "乌兹别克斯坦苏姆", "MNT": "蒙古图格里克", "NPR": "尼泊尔卢比",
    "LKR": "斯里兰卡卢比", "MMK": "缅甸缅元", "KHR": "柬埔寨瑞尔", "LAK": "老挝基普",
    "MOP": "澳门元", "TWD": "新台币", "CUP": "古巴比索", "DOP": "多米尼加比索",
    "GTQ": "危地马拉格查尔", "CRC": "哥斯达黎加科朗", "PAB": "巴拿马巴波亚",
    "UYU": "乌拉圭比索", "BOB": "玻利维亚诺", "PYG": "巴拉圭瓜拉尼",
    "VES": "委内瑞拉玻利瓦尔", "JMD": "牙买加元", "TTD": "特立尼达和多巴哥元",
    "BSD": "巴哈马元", "BBD": "巴巴多斯元", "XCD": "东加勒比元", "HTG": "海地古德",
    "MAD": "摩洛哥迪拉姆", "DZD": "阿尔及利亚第纳尔", "TND": "突尼斯第纳尔",
    "LYD": "利比亚第纳尔", "SDG": "苏丹镑", "SSP": "南苏丹镑", "GHS": "加纳塞地",
    "XOF": "西非法郎", "XAF": "中非法郎", "CDF": "刚果法郎", "AOA": "安哥拉宽扎",
    "ZMW": "赞比亚克瓦查", "ZWL": "津巴布韦元", "MWK": "马拉维克瓦查",
    "TZS": "坦桑尼亚先令", "UGX": "乌干达先令", "RWF": "卢旺达法郎",
    "BIF": "布隆迪法郎", "MZN": "莫桑比克梅蒂卡尔", "BWP": "博茨瓦纳普拉",
    "NAD": "纳米比亚元", "SZL": "斯威士兰里兰吉尼", "LSL": "莱索托洛蒂",
    "MUR": "毛里求斯卢比", "SCR": "塞舌尔卢比", "MGA": "马达加斯加阿里亚里",
    "KMF": "科摩罗法郎", "DJF": "吉布提法郎", "ERN": "厄立特里亚纳克法",
    "SOS": "索马里先令", "GMD": "冈比亚达拉西", "GNF": "几内亚法郎",
    "LRD": "利比里亚元", "SLE": "塞拉利昂利昂", "CVE": "佛得角埃斯库多",
    "MRU": "毛里塔尼亚乌吉亚", "STN": "圣多美多布拉", "AFN": "阿富汗尼",
    "AMD": "亚美尼亚德拉姆", "AZN": "阿塞拜疆马纳特", "GEL": "格鲁吉亚拉里",
    "BYN": "白俄罗斯卢布", "MDL": "摩尔多瓦列伊", "RSD": "塞尔维亚第纳尔",
    "MKD": "马其顿第纳尔", "ALL": "阿尔巴尼亚列克", "BAM": "波黑可兑换马克",
    "KGS": "吉尔吉斯斯坦索姆", "TJS": "塔吉克斯坦索莫尼", "TMT": "土库曼斯坦马纳特",
    "BDT2": "孟加拉塔卡", "BTN": "不丹努尔特鲁姆", "MVR": "马尔代夫拉菲亚",
    "BND": "文莱元", "PGK": "巴布亚新几内亚基那", "SBD": "所罗门群岛元",
    "VUV": "瓦努阿图瓦图", "FJD": "斐济元", "TOP": "汤加潘加", "WST": "萨摩亚塔拉",
    "GIP": "直布罗陀镑", "FKP": "福克兰群岛镑", "SHP": "圣赫勒拿镑",
}

MANUAL = {
    "Kosovo": {
        "zh": "科索沃", "en": "Kosovo", "cca2": "XK", "cca3": "XKX",
        "capital": "普里什蒂纳", "region": "欧洲", "subregion": "东南欧",
        "area": 10887, "pop": 1761985, "gdp": 5943, "gdpTotal": 10470000000,
        "languages": "阿尔巴尼亚语、塞尔维亚语", "currency": "欧元 (EUR €)",
    },
    "N. Cyprus": {
        "zh": "北塞浦路斯", "en": "Northern Cyprus", "cca2": "", "cca3": "",
        "capital": "北尼科西亚", "region": "欧洲", "subregion": "西亚",
        "area": 3355, "pop": 382836, "gdp": None, "gdpTotal": None,
        "languages": "土耳其语", "currency": "土耳其里拉 (TRY ₺)",
    },
    "Somaliland": {
        "zh": "索马里兰", "en": "Somaliland", "cca2": "", "cca3": "",
        "capital": "哈尔格萨", "region": "非洲", "subregion": "东非",
        "area": 176120, "pop": 5700000, "gdp": None, "gdpTotal": None,
        "languages": "索马里语、阿拉伯语", "currency": "索马里兰先令",
    },
}


def main():
    # 50m 分辨率：241 个国家/地区，含佛得角等 110m 里缺失的小国
    topo = json.load(open(os.path.join(HERE, "countries-50m.json"), encoding="utf-8"))
    geo = decode_topology(topo, eps=0.02, min_area=0.0005)

    raw = json.load(open("/tmp/mledoze.json", encoding="utf-8"))
    by_ccn3 = {}
    by_name = {}
    for c in raw:
        by_ccn3[str(c.get("ccn3", "")).rjust(3, "0")] = c
        by_name[(c["name"]["common"] or "").lower()] = c

    wb_pop = {r["countryiso3code"]: r["value"]
              for r in json.load(open("/tmp/wb_pop.json", encoding="utf-8"))[1]
              if r["value"] is not None}
    wb_gdp = {r["countryiso3code"]: r["value"]
              for r in json.load(open("/tmp/wb_gdp.json", encoding="utf-8"))[1]
              if r["value"] is not None}
    wb_gdptot = {r["countryiso3code"]: r["value"]
                 for r in json.load(open("/tmp/wb_gdptot.json", encoding="utf-8"))[1]
                 if r["value"] is not None}

    countries = {}
    out_geo = []
    matched = 0

    for feature in geo:
        fid = feature["id"]
        name = feature["name"]
        rec = None
        if fid and fid.rjust(3, "0") in by_ccn3:
            rec = by_ccn3[fid.rjust(3, "0")]
        elif name.lower() in by_name:
            rec = by_name[name.lower()]

        key = fid if fid else name

        if rec:
            matched += 1
            cca3 = rec.get("cca3", "")
            zh = (rec.get("translations", {}).get("zho", {}) or {}).get("common") \
                or rec["name"]["common"]
            langs = "、".join(LANG_ZH.get(k, v) for k, v in (rec.get("languages") or {}).items())
            curs = []
            for code, info in (rec.get("currencies") or {}).items():
                nm = CURRENCY_ZH.get(code, info.get("name", ""))
                sym = info.get("symbol", "")
                curs.append(f"{nm} ({code}{(' ' + sym) if sym else ''})")
            info = {
                "zh": zh,
                "en": rec["name"]["common"],
                "cca2": rec.get("cca2", ""),
                "cca3": cca3,
                "capital": "、".join(rec.get("capital") or []) or "—",
                "region": REGION_ZH.get(rec.get("region", ""), rec.get("region", "") or "—"),
                "subregion": SUBRECION_ZH.get(rec.get("subregion", ""),
                                              rec.get("subregion", "") or ""),
                "pop": wb_pop.get(cca3) or None,
                "area": rec.get("area") or None,
                "gdp": round(wb_gdp[cca3], 0) if cca3 in wb_gdp else None,
                "gdpTotal": round(wb_gdptot[cca3], 0) if cca3 in wb_gdptot else None,
                "languages": langs or "—",
                "currency": "；".join(curs) or "—",
                "flag": rec.get("flag", ""),
                "latlng": rec.get("latlng") or [],
                "borders": rec.get("borders") or [],
            }
        elif name in MANUAL:
            matched += 1
            info = dict(MANUAL[name])
            info.setdefault("flag", "")
            info.setdefault("borders", [])
            info.setdefault("latlng", [])
        else:
            info = {
                "zh": name, "en": name, "cca2": "", "cca3": "",
                "capital": "—", "region": "—", "subregion": "",
                "pop": None, "area": None, "gdp": None, "gdpTotal": None,
                "languages": "—", "currency": "—", "flag": "",
                "latlng": [], "borders": [],
            }

        countries[str(key)] = info
        out_geo.append({"id": str(key), "name": name, "rings": feature["rings"]})

    # 边境国家 cca3 -> 中文名，方便点击跳转
    cca3_zh = {v["cca3"]: v["zh"] for v in countries.values() if v["cca3"]}

    payload = {
        "meta": {
            "popYear": 2023,
            "gdpYear": 2023,
            "geoSource": "Natural Earth 50m (world-atlas)",
            "metaSource": "world-countries / mledoze",
            "statSource": "World Bank Open Data",
            "generated": "local build",
        },
        "cca3zh": cca3_zh,
        "geo": out_geo,
        "countries": countries,
    }

    out_path = os.path.join(HERE, "data.js")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("window.MAP_DATA=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    n_pts = sum(len(r) // 2 for g in out_geo for r in g["rings"])
    n_nodata = sum(1 for v in countries.values() if v["pop"] is None)
    print(f"geo features : {len(out_geo)}")
    print(f"matched meta : {matched}")
    print(f"points       : {n_pts}")
    print(f"no pop data  : {n_nodata}")
    print(f"data.js size : {os.path.getsize(out_path) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
