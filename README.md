# UniEarth

**UniEarth — A new way to explore our planet.**  
一张地图，重新认识我们的地球。

## 页面

- `index.html`：品牌首页，包含关键指标、核心特征、中英文切换与地图入口。
- `map.html`：交互地图的多文件入口，覆盖世界、中国省级和美国州级地图。
- `world-map.html`：可直接离线打开的单文件地图版本。

默认使用英语；手动切换后记住语言偏好。首页每次只显示一种语言，地图地名不再并列显示双语。也支持 `?lang=zh` / `?lang=en`。地图品牌标志可返回首页。两种语言下均可搜索中英文地名和国家 ISO 代码。

## 开发

运行 `python3 -m http.server 8765 --bind 127.0.0.1`，在浏览器打开 `http://127.0.0.1:8765/`。

修改地图源文件后运行 `python3 make_single.py` 更新单文件版本；首页使用独立的 `home.css` 和 `home.js`；首页与地图共用 `theme.css` 中的品牌 Logo 样式和深空蓝色板。

首页动态地球由 `home-globe.js` 将 Natural Earth 50m 国界数据映射到 WebGL 球面；`assets/earth.svg` 是基于 Natural Earth 110m 数据生成的静态后备，可用 `python3 build_home_globe.py` 重新生成。两种实现均使用仓库内数据，无需外部地图服务。

验证：`node dev-i18n.js` 检查地图语言切换及离线版本，`node dev-smoke.js` 检查地图交互。测试依赖 jsdom，可通过 `JSDOM_PATH` 指定其安装路径。

## SEO

正式地址为 `https://uniearth.org/`，统一配置在 `seo-config.json`。首页与地图页包含独立的标题、描述、Open Graph / Twitter 分享卡片和 JSON-LD；中英文切换会同步元信息。分享图片为 `assets/social-preview.png`（1200 × 630）。

修改 SEO 配置后运行：

```sh
python3 build_seo.py
python3 make_single.py
```

换域名时运行 `python3 build_seo.py --site-url https://新域名/`，再重新生成离线地图。站点也可部署到子路径；爬虫读取的 `robots.txt` 仍需放在域名根目录。生成器不填写猜测的域名，也不伪造更新时间、评分或流量数据。

`sitemap.xml` 只列出首页与在线地图；`index.html`、地图参数和 `world-map.html` 通过 canonical 合并到相应主页面。不要在 robots.txt 中屏蔽离线地图或脚本，否则搜索引擎无法读取 canonical 或渲染页面。地图语言仍在同一 URL 上动态切换，本次未添加独立语言页面或 hreflang。

部署时包含 `seo.js`、`robots.txt`、`sitemap.xml` 和分享图片。上线后检查这些地址均返回正常内容，并在 Google Search Console / Bing Webmaster Tools 中提交 `https://uniearth.org/sitemap.xml`；用 URL 检查确认规范页面和渲染内容。收录、排名及 Core Web Vitals 需要在正式部署后验证。

分享图片可运行 `python3 build_social_preview.py` 重新生成，需要 Pillow 与 Arial（macOS）或 DejaVu Sans（Linux）字体。SEO 验证运行 `node dev-seo.js`，同样通过 `JSDOM_PATH` 指定 jsdom 路径。
