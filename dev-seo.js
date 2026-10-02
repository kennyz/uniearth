/** SEO integration checks. Run with the same JSDOM_PATH as dev-i18n.js. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || '/tmp/verify/node/node_modules/jsdom');
const root = __dirname;
const base = JSON.parse(fs.readFileSync(path.join(root, 'seo-config.json'), 'utf8')).site_url;
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function meta(doc, selector) { return doc.querySelector(selector)?.getAttribute('content'); }

function staticChecks(file, canonical) {
  const dom = new JSDOM(read(file));
  const doc = dom.window.document;
  check(doc.querySelectorAll('h1').length === 1, file + ': one static H1');
  check(doc.querySelectorAll('link[rel="canonical"]').length === 1, file + ': one canonical');
  check(doc.querySelector('link[rel="canonical"]').getAttribute('href') === canonical, file + ': canonical URL');
  check(meta(doc, 'meta[property="og:url"]') === canonical, file + ': sharing URL');
  check(meta(doc, 'meta[name="description"]').length > 80, file + ': useful static description');
  check(doc.title === meta(doc, 'meta[property="og:title"]'), file + ': static search/share titles agree');
  check(meta(doc, 'meta[name="robots"]').includes('index,follow'), file + ': crawlable');
  check(meta(doc, 'meta[property="og:image"]') === base + 'assets/social-preview.png', file + ': absolute share image');
  check(meta(doc, 'meta[name="twitter:card"]') === 'summary_large_image', file + ': large image card');
  const data = JSON.parse(doc.querySelector('#seo-structured-data').textContent);
  check(data['@context'] === 'https://schema.org', file + ': schema context');
  check(data['@graph'].find(item => item['@type'] === 'WebPage').url === canonical, file + ': schema URL');
  for (const element of doc.querySelectorAll('script[src], link[rel="stylesheet"], img[src]')) {
    const url = (element.getAttribute('src') || element.getAttribute('href')).split('?')[0];
    check(fs.existsSync(path.join(root, url)), file + ': resource exists ' + url);
  }
  if (file !== 'index.html') {
    check(data['@graph'].some(item => item['@type'] === 'WebApplication' && item.isAccessibleForFree), file + ': actual free map application');
    check(!!doc.querySelector('noscript'), file + ': no-script explanation');
  }
  if (file === 'world-map.html') {
    check(!doc.querySelector('script[src], link[rel="stylesheet"]'), 'Offline bundle has no script or style dependencies');
  }
  dom.window.close();
}

async function load(file, query, saved, blocked = false) {
  const scripts = [];
  let source = read(file).replace(/<script src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
    scripts.push(read(src.split('?')[0]));
    return '';
  });
  source = source.replace('</body>', scripts.map(script => '<script>' + script + '</script>').join('\n') + '</body>');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(source, {
    url: base + file + query, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      if (saved) window.localStorage.setItem('uniearth.language', saved);
      if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    }
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  check(errors.length === 0, file + ': no runtime errors ' + errors.join('; '));
  return dom;
}

function localizedChecks(dom, language, canonical) {
  const doc = dom.window.document;
  const description = meta(doc, 'meta[name="description"]');
  check(doc.documentElement.lang === (language === 'zh' ? 'zh-CN' : 'en'), 'Document language matches interface');
  check(doc.title === meta(doc, 'meta[property="og:title"]') && doc.title === meta(doc, 'meta[name="twitter:title"]'), 'Localized search/share titles agree');
  check(description === meta(doc, 'meta[property="og:description"]') && description === meta(doc, 'meta[name="twitter:description"]'), 'Localized descriptions agree');
  check(/[\u4e00-\u9fff]/.test(description) === (language === 'zh'), 'Description language matches interface');
  check(meta(doc, 'meta[property="og:locale"]') === (language === 'zh' ? 'zh_CN' : 'en_US'), 'Sharing locale updated');
  check(doc.querySelector('link[rel="canonical"]').href === canonical, 'Language and map query parameters keep a stable canonical');
  check(meta(doc, 'meta[property="og:url"]') === canonical, 'Sharing URL remains canonical');
  const page = JSON.parse(doc.querySelector('#seo-structured-data').textContent)['@graph'].find(item => item['@type'] === 'WebPage');
  check(page.name === doc.title && page.description === description && page.inLanguage === doc.documentElement.lang, 'Structured data matches displayed language');
}

(async () => {
  check(base === 'https://uniearth.org/', 'Configured official production URL');
  staticChecks('index.html', base);
  staticChecks('map.html', base + 'map.html');
  staticChecks('world-map.html', base + 'map.html');
  const xml = new JSDOM(read('sitemap.xml'), { contentType: 'text/xml' });
  const urls = [...xml.window.document.querySelectorAll('loc')].map(node => node.textContent);
  check(JSON.stringify(urls) === JSON.stringify([base, base + 'map.html']), 'Sitemap lists only main online pages');
  check(!xml.window.document.querySelector('lastmod'), 'No invented sitemap modification dates');
  xml.window.close();
  const robots = read('robots.txt');
  check(robots.includes('Sitemap: ' + base + 'sitemap.xml') && robots.includes('Allow: /') && !robots.includes('Disallow:'), 'Robots allows rendering and points to sitemap');
  const png = fs.readFileSync(path.join(root, 'assets/social-preview.png'));
  check(png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'Sharing PNG dimensions');
  check(png.length < 150 * 1024, 'Share image stays lightweight');
  for (const file of ['index.html', 'map.html', 'world-map.html']) {
    const canonical = base + (file === 'index.html' ? '' : 'map.html');
    const dom = await load(file, '?mode=cn&metric=density&lang=zh#440000', 'en');
    localizedChecks(dom, 'zh', canonical);
    dom.window.document.querySelector('[data-lang="en"]').click();
    localizedChecks(dom, 'en', canonical);
    check(dom.window.location.search.includes('mode=cn') && dom.window.location.search.includes('metric=density') && dom.window.location.hash === '#440000', 'Language switch preserves deep link state');
    dom.window.close();
  }
  for (const [query, saved, blocked, expected] of [
    ['', null, false, 'en'], ['', 'zh', false, 'zh'], ['?lang=en', 'zh', false, 'en'], ['?lang=zh', null, true, 'zh']
  ]) {
    const dom = await load('index.html', query, saved, blocked);
    localizedChecks(dom, expected, base);
    check([...dom.window.document.querySelectorAll('[data-map-link]')].every(link => link.search.includes('lang=' + expected)), 'Homepage links preserve language');
    dom.window.close();
  }
  console.log(`${checks} SEO integration checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
