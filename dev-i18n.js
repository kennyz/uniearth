/** Language-switch regression checks. Run: node dev-i18n.js */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || '/tmp/verify/node/node_modules/jsdom');
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
async function load(target, query = '', saved = null, blocked = false) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const source = fs.readFileSync(path.join(__dirname, target), 'utf8').replace(/<script src="([^"]+)"><\/script>/g,
    (_, file) => '<script>' + fs.readFileSync(path.join(__dirname, file), 'utf8') + '</script>');
  const dom = new JSDOM(source, {
    url: 'https://uniearth.test/' + target + query, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (saved) w.localStorage.setItem('uniearth.language', saved);
      if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage blocked'); } });
    }
  });
  await new Promise(resolve => dom.window.addEventListener('load', resolve));
  check(errors.length === 0, 'Page loads without script errors: ' + errors.join('; '));
  return dom;
}
(async () => {
  for (const target of ['map.html', 'world-map.html']) {
    const dom = await load(target, '?metric=pop');
    const w = dom.window, d = w.document, map = w.__worldMap;
    const $ = selector => d.querySelector(selector);
    const click = selector => $(selector).click();
    check(d.documentElement.lang === 'en', 'English is the default');
    check(d.querySelector('[data-lang]').dataset.lang === 'en', 'English language option is first');
    click('[data-lang="zh"]');
    map.select('156');
    map.view.k = 3; map.view.x = -500; map.view.y = -200; map.applyView();
    map.hoverShape('156', 100, 100);
    const view = JSON.stringify(map.view);
    const transform = $('#world').getAttribute('transform');
    click('[data-lang="en"]');
    check(d.documentElement.lang === 'en', 'English document language');
    check($('#panel .sel-zh').textContent === 'China', 'Selected country name translated');
    check(!/[\u4e00-\u9fff]/.test($('#panel').textContent + $('#tooltip').textContent + $('.topbar').textContent), 'English UI has no Chinese text');
    check($('#tooltip').textContent.includes('Population density'), 'Visible tooltip refreshed');
    check(/Chinese yuan/i.test($('#tooltip').textContent), 'Currency translated');
    check($('#tooltip').textContent.includes('Chinese'), 'Language names translated');
    check($('#legend').textContent.includes('Quantiles'), 'Legend translated');
    check($('#panel').textContent.includes('1.41B'), 'English compact number units');
    check(JSON.stringify(map.view) === view && $('#world').getAttribute('transform') === transform, 'Zoom and pan preserved');
    check($('path.country[data-key="156"]').classList.contains('sel'), 'Country selection preserved');
    check(w.localStorage.getItem('uniearth.language') === 'en', 'Language preference persisted');
    check(w.location.search.includes('metric=pop') && w.location.search.includes('lang=en') && w.location.hash === '#156', 'Existing URL state preserved');
    check($('#language-switch [data-lang="en"]').getAttribute('aria-pressed') === 'true', 'Accessible toggle state');
    map.setMode('cn'); map.selectSub('440000'); map.hoverShape('440000', 100, 100);
    check($('#panel .sel-zh').textContent === 'Guangdong', 'Province translated');
    check($('#tooltip').textContent.includes('Guangzhou'), 'Province capital translated');
    check([...d.querySelectorAll('.labels text.show')].every(el => !/[\u4e00-\u9fff]/.test(el.textContent)), 'English map labels');
    click('[data-lang="zh"]');
    check(map.mapMode() === 'cn' && $('path.sub[data-key="440000"]').classList.contains('sel'), 'Province selection preserved during language switch');
    check($('#panel .sel-zh').textContent === '广东省' && $('#panel').textContent.includes('亿'), 'Chinese names and numbers restored');
    map.setMode('us'); map.selectSub('06');
    check($('#panel .sel-zh').textContent === '加利福尼亚州', 'Chinese state name');
    click('[data-lang="en"]');
    check($('#panel .sel-zh').textContent === 'California', 'English state name');
    for (const query of ['广东', 'Guangdong', 'California', 'CHN']) {
      $('#search').value = query; $('#search').dispatchEvent(new w.Event('input'));
      check(!!$('#suggest .item'), 'Bilingual search: ' + query);
    }
    $('#search').value = 'no-such-place-123'; $('#search').dispatchEvent(new w.Event('input'));
    check($('#suggest').textContent.includes('No matching'), 'English empty search state');
    map.setMode('cn'); click('[data-metric="gdp"]');
    check($('#rank').textContent.includes('No Province data'), 'English missing metric state');
    dom.window.close();
  }
  for (const [query, saved, blocked, expected] of [
    ['', 'en', false, 'en'], ['?lang=zh', 'en', false, 'zh'],
    ['?lang=en', null, true, 'en'], ['?lang=invalid', null, true, 'en'], ['', null, false, 'en'], ['', 'zh', false, 'zh']
  ]) {
    const dom = await load('map.html', query, saved, blocked);
    check(dom.window.__worldMap.language() === expected, 'URL preference / stored preference / blocked-storage fallback');
    dom.window.__worldMap.setLanguage(expected === 'en' ? 'zh' : 'en');
    check(dom.window.__worldMap.language() !== expected, 'Switch works with or without storage');
    dom.window.close();
  }
  console.log(`${checks} localization checks passed (including the offline bundle).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
