/* Keep search and sharing metadata in step with the visible interface language. */
(function () {
  'use strict';
  var copy = {
    home: {
      en: {
        title: 'Interactive World Map & Geography Data | UniEarth',
        description: 'Explore the world, Chinese provinces and US states with UniEarth. Compare population, area, density and GDP on an interactive map. Free, with no sign-up.'
      },
      zh: {
        title: '世界地图与地理数据探索 | UniEarth',
        description: '用 UniEarth 交互式世界地图探索国家与地区、中国省级行政区和美国各州，比较人口、面积、人口密度、GDP 与人均 GDP。支持中英文搜索、多种地图投影和缩放，无需注册即可使用。'
      }
    },
    map: {
      en: {
        title: 'World Map — Population, Area & GDP | UniEarth',
        description: 'Search countries, Chinese provinces and US states on an interactive world map. Compare population, area, density, GDP and GDP per capita with UniEarth.'
      },
      zh: {
        title: '交互式世界地图：人口、面积与 GDP | UniEarth',
        description: '在 UniEarth 交互式世界地图中搜索国家、中国省份和美国各州，查看人口、面积、人口密度、GDP 与人均 GDP，切换等地球、墨卡托和等距圆柱投影，自由缩放并比较地区数据。'
      }
    }
  };
  function set(selector, value) {
    var element = document.querySelector(selector);
    if (element) element.setAttribute('content', value);
  }
  window.UNIEARTH_SEO = {
    update: function (page, language) {
      var locale = language === 'zh' ? 'zh' : 'en';
      var text = copy[page][locale];
      document.title = text.title;
      set('meta[name="description"]', text.description);
      set('meta[property="og:title"]', text.title);
      set('meta[property="og:description"]', text.description);
      set('meta[property="og:locale"]', locale === 'zh' ? 'zh_CN' : 'en_US');
      set('meta[property="og:locale:alternate"]', locale === 'zh' ? 'en_US' : 'zh_CN');
      set('meta[name="twitter:title"]', text.title);
      set('meta[name="twitter:description"]', text.description);
      var heading = document.getElementById('map-title');
      var summary = document.getElementById('map-summary');
      if (heading) heading.textContent = locale === 'zh' ? '交互式世界地图' : 'Interactive world map';
      if (summary) summary.textContent = text.description;
      var schema = document.getElementById('seo-structured-data');
      if (schema) {
        var data = JSON.parse(schema.textContent);
        data['@graph'].forEach(function (item) {
          if (item['@type'] === 'WebPage' || item['@type'] === 'WebApplication') {
            item.name = text.title;
            item.description = text.description;
            item.inLanguage = locale === 'zh' ? 'zh-CN' : 'en';
          }
        });
        schema.textContent = JSON.stringify(data);
      }
    }
  };
})();
