/* Landing page localization shares the map's saved language preference. */
(function () {
  'use strict';
  var language = window.MAP_I18N.initialLanguage();
  var english = {
  "skip": "Skip to content",
  "language": "Interface language",
  "metrics": "Product metrics",
  "openMap": "Open map",
  "tagline": "One map. Rediscover our Earth.",
  "start": "Start exploring",
  "viewFeatures": "View key features",
  "access": "No sign-up. Just open and explore.",
  "earthAlt": "Earth centered on Asia, showing real continental outlines and a geographic grid",
  "planetCaption": "All our differences. One shared planet.",
  "metricCountries": "Countries & territories",
  "metricRegions": "Provincial & state regions",
  "metricScale": "Map detail",
  "metricPrecision": "Coordinate precision",
  "featureTitle": "Everything you need to explore.",
  "featureIntro": "Fast, focused and built around real geographic data.",
  "feature1Title": "Explore from global to local.",
  "feature1Body": "Move seamlessly between the world, Chinese provinces and US states with fluid zoom, search and selection.",
  "feature1Link": "Explore the map",
  "feature2Title": "Compare places through data.",
  "feature2Body": "Visualize population, area, density, total GDP and GDP per capita through color scales and rankings.",
  "feature2Link": "Compare key indicators",
  "feature3Title": "Open, bilingual and offline-ready.",
  "feature3Body": "No account needed. Use the complete experience in English or Chinese, and keep exploring from a single offline file.",
  "feature3Link": "Open the offline-ready map",
  "footer": "One planet. A wider perspective.",
  "footerLink": "The world is yours to explore",
  "heroEyebrow": "ONE PLANET. ENDLESS PERSPECTIVES.",
  "heroLine1": "A new way to",
  "heroLine2": "explore",
  "heroLine3": "our planet.",
  "heroLabel": "UniEarth — A new way to explore our planet.",
  "planetLabel": "OUR SHARED HOME",
  "planetIndex": "01 — EARTH",
  "discoverEyebrow": "01 / KEY FEATURES"
};
  var chinese = {
  "skip": "跳至主要内容",
  "language": "界面语言",
  "openMap": "打开地图",
  "tagline": "用全新的方式，探索共同的家园。",
  "start": "开始探索",
  "viewFeatures": "查看关键特性",
  "access": "无需注册，在浏览器中即刻探索",
  "earthAlt": "以亚洲为中心的地球，呈现真实大陆轮廓与经纬网",
  "planetCaption": "所有不同，都在同一个地球。",
  "metrics": "产品关键指标",
  "metricCountries": "国家与地区",
  "metricRegions": "省级及州级区域",
  "metricScale": "地图细节比例",
  "metricPrecision": "坐标精度",
  "featureTitle": "探索世界所需的一切。",
  "featureIntro": "快速、专注，并以真实地理数据为基础。",
  "feature1Title": "从全球深入到地方。",
  "feature1Body": "在世界、中国省级区域和美国州级区域之间顺畅切换，并支持缩放、搜索与选择。",
  "feature1Link": "探索地图",
  "feature2Title": "用数据比较不同地区。",
  "feature2Body": "通过色阶和榜单查看人口、面积、密度、国内生产总值与人均国内生产总值。",
  "feature2Link": "比较关键指标",
  "feature3Title": "开放、双语、支持离线。",
  "feature3Body": "无需账户，可完整使用中文或英文界面，也可通过单文件版本离线探索。",
  "feature3Link": "打开可离线保存的地图",
  "footer": "一个地球。更多理解。",
  "footerLink": "世界，等你探索",
  "heroEyebrow": "同一个地球，无限种视角。",
  "heroLine1": "一张地图，",
  "heroLine2": "重新认识",
  "heroLine3": "我们的地球。",
  "heroLabel": "UniEarth — 一张地图，重新认识我们的地球。",
  "planetLabel": "我们共同的家园",
  "planetIndex": "01 — 地球",
  "discoverEyebrow": "01 / 关键特性"
};
  var nodes = document.querySelectorAll('[data-copy], [data-label], [data-alt]');
  var description = document.querySelector('meta[name="description"]');
  function render() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = language === 'en' ? english.heroLabel : chinese.heroLabel;
    nodes.forEach(function (node) {
      var key = node.dataset.copy || node.dataset.label || node.dataset.alt;
      var value = language === 'en' ? (english[key] || chinese[key]) : chinese[key];
      if (node.dataset.label) node.setAttribute('aria-label', value);
      else if (node.dataset.alt) node.alt = value;
      else node.textContent = value;
    });
    document.querySelectorAll('[data-lang]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.lang === language));
      button.textContent = language === 'en' ? (button.dataset.lang === 'en' ? 'EN' : 'ZH') : (button.dataset.lang === 'en' ? '英' : '中');
      button.setAttribute('aria-label', language === 'en' ? (button.dataset.lang === 'en' ? 'English' : 'Chinese') : (button.dataset.lang === 'en' ? '英语' : '中文'));
    });
    document.querySelectorAll('[data-map-link]').forEach(function (link) {
      var url = new URL(link.getAttribute('href'), location.href);
      url.searchParams.set('lang', language);
      // Relative links keep the page usable when opened directly from disk.
      link.setAttribute('href', url.pathname.split('/').pop() + url.search + url.hash);
    });
    description.content = language === 'en'
      ? 'UniEarth — A new way to explore our planet. Discover geography and public data. Make knowledge more accessible and our world easier to understand.'
      : 'UniEarth — 一张地图，重新认识我们的地球。探索地理与公开数据，让知识更易获取，让世界更易理解。';
  }
  document.querySelector('.language-switch').addEventListener('click', function (event) {
    var button = event.target.closest('[data-lang]');
    if (!button) return;
    language = button.dataset.lang;
    try { localStorage.setItem('uniearth.language', language); } catch (e) {}
    try {
      var url = new URL(location.href);
      url.searchParams.set('lang', language);
      history.replaceState(null, '', url);
    } catch (e) { /* Direct file previews can restrict history. */ }
    render();
  });
  render();
})();
