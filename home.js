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
  "featureTitle": "Explore with clarity.",
  "featureIntro": "Real geography. Essential data.",
  "feature1Title": "Explore every scale.",
  "feature1Body": "Move between the world, Chinese provinces and US states.",
  "feature1Link": "Explore maps",
  "feature2Title": "See differences through data.",
  "feature2Body": "Compare population, area, density, GDP and GDP per capita.",
  "feature2Link": "Compare data",
  "feature3Title": "Search. Zoom. Discover.",
  "feature3Body": "Find places, switch projections and reveal details as you explore.",
  "feature3Link": "Start exploring",
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
  "featureTitle": "清晰探索世界。",
  "featureIntro": "真实地理，核心数据。",
  "feature1Title": "从全球，深入到区域。",
  "feature1Body": "在世界、中国省级区域和美国各州之间自由切换探索。",
  "feature1Link": "探索多层地图",
  "feature2Title": "让地区差异一目了然。",
  "feature2Body": "通过色阶与榜单，对比人口、面积、密度、GDP 和人均 GDP。",
  "feature2Link": "比较数据",
  "feature3Title": "搜索、缩放、自由发现。",
  "feature3Body": "快速定位地点、切换投影，并在交互中查看详细信息。",
  "feature3Link": "开始探索",
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
