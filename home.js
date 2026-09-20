/* Landing page localization shares the map's saved language preference. */
(function () {
  'use strict';
  var language = window.MAP_I18N.initialLanguage();
  var english = {
  "skip": "Skip to content",
  "nav": "Main navigation",
  "language": "Interface language",
  "scope": "Exploration scope",
  "navExplore": "Discover",
  "navPurpose": "Our purpose",
  "openMap": "Open map",
  "tagline": "One map. Rediscover our Earth.",
  "intro": "Start with a place. See a bigger world.",
  "start": "Start exploring",
  "why": "Why UniEarth",
  "access": "No sign-up. Just open and explore.",
  "earthAlt": "Earth centered on Asia, showing real continental outlines and a geographic grid",
  "planetCaption": "All our differences. One shared planet.",
  "scope1": "World · China · United States",
  "scope2": "Geography × Open data",
  "scope3": "Two languages. One world.",
  "keepExploring": "Discover more",
  "featureTitle": "See farther. Understand more.",
  "featureIntro": "A map is just the beginning.",
  "feature1Title": "From the world to a place.",
  "feature1Body": "Move between the world, Chinese provinces and US states. Zoom, search and select. Follow your curiosity wherever it leads.",
  "feature1Link": "Find your next coordinate",
  "feature2Title": "Put data in perspective.",
  "feature2Body": "Explore population, area, density and GDP. Make regional differences visible through color and rankings.",
  "feature2Link": "See the world differently",
  "feature3Title": "Less friction. More discovery.",
  "feature3Body": "No account needed. Switch between Chinese and English, or save the single-file map to keep exploring offline.",
  "feature3Link": "Open the offline-ready map",
  "purposeTitle1": "We share more",
  "purposeTitle2": "than a map.",
  "purposeIntro": "Everyone deserves the chance to understand our world. UniEarth aims to make public data approachable and distant places feel closer. Caring for our shared home starts with seeing it.",
  "purposeLink": "Let curiosity lead the way",
  "value1Title": "Bring knowledge within reach",
  "value1Body": "Make geographic exploration accessible for classrooms, independent learning and sharing public knowledge.",
  "value2Title": "Build understanding across differences",
  "value2Body": "Discover how people live and regions develop. Broaden perspectives with facts and connect through curiosity.",
  "value3Title": "Think beyond our own horizon",
  "value3Body": "Understand the connections between people and places, as a starting point for more thoughtful choices about our shared planet.",
  "footer": "One planet. A wider perspective.",
  "footerLink": "The world is yours to explore",
  "heroEyebrow": "ONE PLANET. ENDLESS PERSPECTIVES.",
  "heroLine1": "A new way to",
  "heroLine2": "explore",
  "heroLine3": "our planet.",
  "heroLabel": "UniEarth — A new way to explore our planet.",
  "planetLabel": "OUR SHARED HOME",
  "planetIndex": "01 — EARTH",
  "discoverEyebrow": "01 / A WORLD TO DISCOVER",
  "purposeEyebrow": "02 / BUILT FOR A SHARED WORLD"
};
  var chinese = {
  "skip": "跳至主要内容",
  "nav": "主导航",
  "navExplore": "探索方式",
  "navPurpose": "我们的初衷",
  "language": "界面语言",
  "openMap": "打开地图",
  "tagline": "用全新的方式，探索共同的家园。",
  "intro": "从一个地方出发，看见更大的世界。",
  "start": "开始探索",
  "why": "为什么是 UniEarth",
  "access": "无需注册，在浏览器中即刻探索",
  "earthAlt": "以亚洲为中心的地球，呈现真实大陆轮廓与经纬网",
  "planetCaption": "所有不同，都在同一个地球。",
  "scope": "探索范围",
  "scope1": "世界 · 中国 · 美国",
  "scope2": "地理视角 × 公开数据",
  "scope3": "中英文，自由切换",
  "keepExploring": "继续发现",
  "featureTitle": "看得更远，也看得更明白。",
  "featureIntro": "让地图成为理解世界的起点。",
  "feature1Title": "从全球，到地方。",
  "feature1Body": "在世界、中国省份与美国各州之间切换。缩放、搜索、选择，让每一次好奇都有方向。",
  "feature1Link": "寻找你的下一个坐标",
  "feature2Title": "让数据，有地理坐标。",
  "feature2Body": "通过人口、面积、密度与国内生产总值，发现地域差异。用着色和榜单，看见数字之间的联系。",
  "feature2Link": "换个角度看世界",
  "feature3Title": "让好奇，少一点门槛。",
  "feature3Body": "无需账户，中英文自由切换。也可保存单文件地图，在没有网络的地方继续探索。",
  "feature3Link": "打开可离线保存的地图",
  "purposeTitle1": "我们共享的，",
  "purposeTitle2": "不止一张地图。",
  "purposeIntro": "我们相信，理解世界的机会应该属于每个人。UniEarth 希望让公开数据走出表格，让遥远的地方走进日常，让对共同家园的关心，从看见开始。",
  "purposeLink": "带着好奇，重新出发",
  "value1Title": "让知识触手可及",
  "value1Body": "用直观、开放的探索方式，支持课堂学习、自主发现与公共知识传播。",
  "value2Title": "在差异中建立理解",
  "value2Body": "看见不同地区的人口与发展面貌，以事实拓宽视野，以好奇连接彼此。",
  "value3Title": "为共同的地球多想一步",
  "value3Body": "从身边到远方，理解人与地方的联系，为更有责任感的思考提供一个起点。",
  "footer": "一个地球。更多理解。",
  "footerLink": "世界，等你探索",
  "heroEyebrow": "同一个地球，无限种视角。",
  "heroLine1": "一张地图，",
  "heroLine2": "重新认识",
  "heroLine3": "我们的地球。",
  "heroLabel": "UniEarth — 一张地图，重新认识我们的地球。",
  "planetLabel": "我们共同的家园",
  "planetIndex": "01 — 地球",
  "discoverEyebrow": "01 / 发现更大的世界",
  "purposeEyebrow": "02 / 为共同的家园而建"
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
