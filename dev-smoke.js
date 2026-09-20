/**
 * DOM 冒烟测试：用 jsdom 真实执行页面脚本，检查地图渲染与交互逻辑。
 * 运行：node dev-smoke.js [map.html|world-map.html]   （需要 jsdom：npm i jsdom）
 */
const path = require('path');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require(
  process.env.JSDOM_PATH || '/tmp/verify/node/node_modules/jsdom');

const ROOT = __dirname;
const TARGET = process.argv[2] || 'map.html';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

console.log('测试文件：' + TARGET + '\n');
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, TARGET), 'utf8'), {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  url: 'file://' + path.join(ROOT, TARGET) + '?metric=pop&lang=zh',
  virtualConsole: vc,
  beforeParse(window) {
    // jsdom 没有 SVG 布局：给 getScreenCTM / DOMPoint 打桩
    window.SVGElement.prototype.getScreenCTM = function () {
      const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      m.inverse = () => m;
      return m;
    };
    if (!window.DOMPoint) {
      window.DOMPoint = class DOMPoint {
        constructor(x, y) { this.x = x; this.y = y; }
        matrixTransform() { return { x: this.x, y: this.y }; }
      };
    }
    // jsdom 未实现 Fullscreen API：打桩以验证全屏按钮逻辑
    Object.defineProperty(window.Document.prototype, 'fullscreenElement', {
      configurable: true,
      get() { return window.__fsEl || null; }
    });
    window.Element.prototype.requestFullscreen = function () {
      window.__fsEl = this;
      window.document.dispatchEvent(new window.Event('fullscreenchange'));
      return Promise.resolve();
    };
    window.Document.prototype.exitFullscreen = function () {
      window.__fsEl = null;
      window.document.dispatchEvent(new window.Event('fullscreenchange'));
      return Promise.resolve();
    };
  }
});

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra === undefined ? '' : String(extra) });
}

dom.window.addEventListener('load', () => setTimeout(run, 200));

function run() {
  const w = dom.window, doc = w.document;
  const $ = (s) => doc.querySelector(s), $$ = (s) => Array.from(doc.querySelectorAll(s));

  check('脚本无错误', errors.length === 0, errors.join(' | '));
  check('window.__worldMap 已导出', !!w.__worldMap);

  // 1. 国家路径
  const paths = $$('path.country');
  check('国家路径数 = 177', paths.length === 177, paths.length);
  const badD = paths.filter((p) => !/^M[-\d.]/.test(p.getAttribute('d') || ''));
  check('所有路径都有合法 d', badD.length === 0, badD.length + ' 条异常');
  const dLen = (paths[0].getAttribute('d') || '').length;
  check('路径非空且包含曲线点', dLen > 100, 'len=' + dLen);

  // 2. 布局范围（y 轴必须向下翻转：北半球在上）
  const shapes = w.__worldMap.shapes;
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  const byKey = {};
  shapes.forEach((s) => {
    byKey[s.key] = s;
    minX = Math.min(minX, s.cx); maxX = Math.max(maxX, s.cx);
    minY = Math.min(minY, s.cy); maxY = Math.max(maxY, s.cy);
  });
  check('布局在 viewBox 内', minX > -5 && maxX < 1005 && minY > -5 && maxY < 525,
    `x ${minX.toFixed(0)}..${maxX.toFixed(0)} y ${minY.toFixed(0)}..${maxY.toFixed(0)}`);
  // 格陵兰(304)应在俄罗斯(643)以北 → y 更小；澳大利亚(036)在南半球 → y 更大
  check('纬度方向正确（格陵兰在俄罗斯以北）', byKey['304'].cy < byKey['643'].cy,
    `GL ${byKey['304'].cy.toFixed(0)} < RU ${byKey['643'].cy.toFixed(0)}`);
  check('纬度方向正确（澳大利亚在南）', byKey['036'].cy > byKey['156'].cy,
    `AU ${byKey['036'].cy.toFixed(0)} > CN ${byKey['156'].cy.toFixed(0)}`);
  check('经度方向正确（美国在中国以东）', byKey['840'].cx < byKey['156'].cx,
    `US ${byKey['840'].cx.toFixed(0)} < CN ${byKey['156'].cx.toFixed(0)}`);

  // 3. 悬停卡片
  w.__worldMap.hoverShape('156', 400, 300);
  const tip = $('#tooltip');
  const tipHtml = tip.innerHTML;
  check('悬停显示卡片', tip.classList.contains('show'));
  check('卡片含国名中国', tipHtml.includes('中国'));
  check('卡片含人口数字', /人口\s*2023/.test(tipHtml) && /亿/.test(tipHtml));
  check('卡片含面积', tipHtml.includes('km²'));
  check('卡片含密度', tipHtml.includes('人口密度'));
  check('卡片含语言货币', tipHtml.includes('货币') && tipHtml.includes('语言'));
  check('悬停高亮路径', byKey['156'] && doc.querySelector('path[data-key="156"]').classList.contains('hot'));
  w.__worldMap.hoverShape(null);
  check('移出后卡片隐藏', !tip.classList.contains('show'));

  // 4. 点击选中 → 侧栏
  w.__worldMap.select('840', {});
  const panel = $('#panel').innerHTML;
  check('选中后侧栏显示美国', panel.includes('美国'));
  check('侧栏含人口/面积/密度三块', panel.includes('人 / km²') && panel.includes('占全球人口'));
  check('侧栏含 GDP 总量与占比', panel.includes('GDP 总量') && panel.includes('占全球 GDP'));
  check('侧栏含数据来源', panel.includes('World Bank'));
  check('选中样式生效', doc.querySelector('path[data-key="840"]').classList.contains('sel'));
  check('榜单渲染 10 行', $$('#rank .row').length === 10, $$('#rank .row').length);
  check('榜单第一名是人口最多的国家', /印度|中国/.test($('#rank .row').textContent), $('#rank .row').textContent.trim());
  check('榜单含 2 亿以上人口国家', $$('#rank .row').filter((r) => r.textContent.includes('亿')).length >= 2);

  // 5. 指标切换（分级着色）
  const areaBtn = doc.querySelector('[data-metric="area"]');
  areaBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const filled = $$('path.country').filter((p) => p.style.fill && p.style.fill !== '');
  check('面积模式给国家上色', filled.length > 150, filled.length);
  check('图例出现', $('#legend').classList.contains('open'));
  check('图例含分位数说明', $('#legend').textContent.includes('分位数'));
  doc.querySelector('[data-metric="pop"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const nodata = $$('path.country.nodata').length;
  check('缺人口数据的国家有兜底样式', nodata >= 1, nodata);
  check('人口模式图例显示单位', $('#legend').textContent.includes('人'));

  // 5b. GDP 指标
  const gdpBtn = doc.querySelector('[data-metric="gdpTotal"]');
  check('存在 GDP 着色指标按钮', !!gdpBtn, gdpBtn && gdpBtn.textContent);
  gdpBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const gdpFilled = $$('path.country').filter((p) => p.style.fill && p.style.fill !== '');
  check('GDP 模式给国家上色', gdpFilled.length > 140, gdpFilled.length);
  check('GDP 图例显示 美元', $('#legend').textContent.includes('美元'));
  check('GDP 图例数值用万亿量级', /万亿/.test($('#legend').textContent), $('#legend').textContent.replace(/\s+/g, ' ').slice(0, 90));
  check('GDP 榜单第一是美国', $('#rank .row').textContent.includes('美国'), $('#rank .row').textContent.trim());
  const usGdp = w.__worldMap.byKey['840'].info.gdpTotal;
  const cnGdp = w.__worldMap.byKey['156'].info.gdpTotal;
  check('GDP 数据量级正确（美国 20~30 万亿）', usGdp > 2e13 && usGdp < 3e13, (usGdp / 1e12).toFixed(2) + '万亿');
  check('GDP 数据量级正确（中国 15~20 万亿）', cnGdp > 1.5e13 && cnGdp < 2e13, (cnGdp / 1e12).toFixed(2) + '万亿');
  check('全球 GDP 合计 90~120 万亿', w.__worldMap.world.gdp > 9e13 && w.__worldMap.world.gdp < 1.2e14,
    (w.__worldMap.world.gdp / 1e12).toFixed(1) + '万亿');
  w.__worldMap.hoverShape('840', 400, 300);
  check('悬停卡片含 GDP 总量', $('#tooltip').textContent.includes('GDP 总量'));
  check('悬停卡片含占全球 GDP', $('#tooltip').textContent.includes('占全球 GDP'));
  w.__worldMap.hoverShape(null);
  doc.querySelector('[data-metric="pop"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // 5c. 标签（描边不随缩放放大 + 不重叠 + 只画视口内）
  const RL = w.__worldMap.renderLabels;
  const VM = w.__worldMap;
  // 把视图对准德国（中欧），模拟真实放大后的画面
  const centerOn = (key, k) => {
    const sh = VM.byKey[key];
    VM.view.k = k;
    VM.view.x = 500 - k * sh.cx;
    VM.view.y = 260 - k * sh.cy;
    VM.applyView();
  };
  centerOn('276', 3); const boxes3 = RL();
  centerOn('276', 8); const boxes8 = RL();
  centerOn('276', 20); const boxes20 = RL();
  check('放大后出现国家名标签（中欧 k=8）', boxes8.length >= 5, boxes8.length + ' 个');
  check('标签数量受控', boxes20.length <= 60, boxes20.length);
  check('只给视口内的国家挂标签', boxes8.every((b) =>
    b.x > -400 && b.x < 1400 && b.y > -400 && b.y < 900), boxes8.length + ' 个均在视口附近');
  const sample = $('.labels text.show');
  const fsAttr = parseFloat(sample.style.fontSize);
  const swAttr = parseFloat(sample.style.strokeWidth);
  check('标签字号换算成屏幕像素（不随缩放膨胀）', fsAttr * 20 >= 10 && fsAttr * 20 <= 15.01,
    'font-size=' + fsAttr + 'px @k=20 → ' + (fsAttr * 20).toFixed(2) + 'px 屏幕');
  check('标签描边屏幕恒定 3px（不再变成黑块）',
    Math.abs(swAttr * 20 - 3) < 0.02, 'stroke-width=' + swAttr + 'px @k=20 → ' + (swAttr * 20).toFixed(2) + 'px 屏幕');
  check('描边用内联样式（SVG 属性会被 CSS 覆盖）', sample.getAttribute('style').includes('stroke-width'),
    sample.getAttribute('style'));
  check('标签不再使用 XML 属性设置描边', !sample.hasAttribute('stroke-width'));
  const sz1 = parseFloat($('.labels text.show').style.fontSize) * 20;
  centerOn('276', 8); RL();
  const sz8 = parseFloat($('.labels text.show').style.fontSize) * 8;
  check('放大时字号轻微增大（10~15px 区间）', sz8 >= 10 && sz8 <= sz1 + 0.01,
    'k=20 → ' + sz1.toFixed(1) + 'px，k=8 → ' + sz8.toFixed(1) + 'px');
  const overlap = (() => {
    for (let i = 0; i < boxes8.length; i++) {
      for (let j = i + 1; j < boxes8.length; j++) {
        const a = boxes8[i], b = boxes8[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return [i, j];
      }
    }
    return null;
  })();
  check('标签之间互不重叠', !overlap, overlap ? JSON.stringify(overlap) : boxes8.length + ' 个标签全部无重叠');
  VM.view.k = 1; VM.view.x = 0; VM.view.y = 0; VM.applyView(); RL();
  check('缩回 1 倍时标签全部隐藏', $$('.labels text.show').length === 0, $$('.labels text.show').length);

  // 6. 投影切换
  const dBefore = doc.querySelector('path[data-key="156"]').getAttribute('d');
  doc.querySelector('[data-proj="mercator"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const dAfter = doc.querySelector('path[data-key="156"]').getAttribute('d');
  check('切换墨卡托后路径重算', dBefore !== dAfter);
  const mercY = {}; w.__worldMap.shapes.forEach((s) => { mercY[s.key] = s.cy; });
  check('墨卡托下格陵兰仍在俄罗斯以北', mercY['304'] < mercY['643']);
  check('墨卡托下南极(010)在图底', mercY['010'] > mercY['036']);
  doc.querySelector('[data-proj="ee"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // 7. 搜索
  const input = $('#search');
  input.value = 'japan';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  const items = $$('#suggest .item');
  check('搜索 japan 有结果', items.length >= 1, items.length);
  check('搜索结果显示日本', items[0] && items[0].textContent.includes('日本'), items[0] && items[0].textContent);
  input.value = '德国';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('中文搜索德国可用', $$('#suggest .item')[0].textContent.includes('德国'));
  input.value = 'zzzz';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  check('无结果显示空状态', $('#suggest').textContent.includes('没有找到'));
  $('#suggest').classList.remove('open');

  // 8. 真实指针事件（悬停 → 卡片跟随）
  const svg = $('#map');
  const jp = doc.querySelector('path[data-key="392"]');
  jp.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 640, clientY: 380 }));
  check('指针悬停触发卡片', $('#tooltip').classList.contains('show'));
  check('指针悬停卡片为日本', $('#tooltip').textContent.includes('日本'));

  // 9. 缩放/平移
  const before = $('#world').getAttribute('transform');
  const WEv = w.WheelEvent || w.MouseEvent;
  svg.dispatchEvent(new WEv('wheel', { bubbles: true, deltaY: -400, deltaMode: 0, clientX: 500, clientY: 260 }));
  const after = $('#world').getAttribute('transform');
  check('滚轮缩放改变变换矩阵', before !== after, after);
  check('变换矩阵无 NaN', !/NaN/.test(after), after);
  const k = parseFloat((after.match(/scale\(([\d.]+)\)/) || [])[1]);
  check('缩放系数落在 1~90', k > 1 && k <= 90, k);
  // 缩到极限不越界
  for (let i = 0; i < 40; i++) {
    svg.dispatchEvent(new WEv('wheel', { bubbles: true, deltaY: -200, deltaMode: 0, clientX: 500, clientY: 260 }));
  }
  const maxT = $('#world').getAttribute('transform');
  const kmax = parseFloat((maxT.match(/scale\(([\d.]+)\)/) || [])[1]);
  check('连续放大被限制在 90 倍', Math.abs(kmax - 90) < 0.01 && !/NaN/.test(maxT), maxT);
  for (let i = 0; i < 60; i++) {
    svg.dispatchEvent(new WEv('wheel', { bubbles: true, deltaY: 200, deltaMode: 0, clientX: 500, clientY: 260 }));
  }
  check('连续缩小回到 1 倍并复位', /scale\(1\.0000\)/.test($('#world').getAttribute('transform')),
    $('#world').getAttribute('transform'));

  // 9b. 地图铺满 viewBox
  const nums = ($$('path.country').map((p) => p.getAttribute('d')).join(' ').match(/-?\d+(\.\d+)?/g) || [])
    .map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  check('地图横向铺满画布', Math.min(...xs) < 40 && Math.max(...xs) > 960,
    `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}`);
  check('地图纵向铺满画布', Math.min(...ys) < 40 && Math.max(...ys) > 480,
    `y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`);

  // 9c. 微小国家点击点：屏幕尺寸恒定，放大后不会变成遮罩
  const hit0 = doc.querySelector('circle.hit');
  check('存在微国家点击点', !!hit0, $$('circle.hit').length + ' 个');
  if (hit0) {
    const mk = (k) => { w.__worldMap.view.k = k; w.__worldMap.syncHitRadius(); };
    mk(1); const p1 = parseFloat(hit0.getAttribute('r')) * 1;
    mk(10); const p10 = parseFloat(hit0.getAttribute('r')) * 10;
    mk(60); const p60 = parseFloat(hit0.getAttribute('r')) * 60;
    check('点击点屏幕半径不随缩放变化',
      Math.abs(p1 - p10) < 0.35 && Math.abs(p10 - p60) < 0.35,
      `${p1.toFixed(2)} / ${p10.toFixed(2)} / ${p60.toFixed(2)} viewBox 单位`);
    check('高倍放大时点击点不会遮挡地图', parseFloat(hit0.getAttribute('r')) < 0.5,
      'r=' + hit0.getAttribute('r'));
    mk(1);
  }

  // 10. 邻国跳转
  w.__worldMap.select('156', {});
  const nb = doc.querySelector('[data-neighbor]');
  check('选中后列出陆上邻国', !!nb, nb && nb.textContent);
  if (nb) {
    nb.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('点击邻国完成切换', $('#panel').textContent.includes('已选中') &&
      !$('#panel').textContent.includes('中国\n') , $('#panel').querySelector('.sel-zh').textContent);
  }

  // 11. 品牌标题与全屏按钮
  check('页面标题为 UniEarth', /UniEarth/.test(doc.title), doc.title);
  check('顶栏品牌为 UniEarth', $('.brand').textContent.includes('UniEarth'),
    $('.brand').textContent.trim().split('\n')[0]);
  const fsBtn = $('#fsbtn');
  check('右上角存在全屏按钮', !!fsBtn);
  check('全屏按钮位于缩放条末尾（最靠右上角）',
    fsBtn && fsBtn.parentElement.lastElementChild === fsBtn,
    fsBtn && fsBtn.parentElement.className);
  check('支持全屏时按钮可见', fsBtn.style.display !== 'none');
  check('全屏按钮初始图标为 ⛶', fsBtn.textContent.trim() === '⛶', fsBtn.textContent);
  fsBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('点击后进入全屏', !!doc.fullscreenElement, String(doc.fullscreenElement && doc.fullscreenElement.id));
  check('全屏按钮切换为退出态', fsBtn.textContent.trim() === '⤡' && fsBtn.classList.contains('on'),
    fsBtn.textContent + ' / ' + fsBtn.getAttribute('title'));
  fsBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('再次点击退出全屏', !doc.fullscreenElement);
  check('退出后按钮复原', fsBtn.textContent.trim() === '⛶' && !fsBtn.classList.contains('on'));
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  check('按 F 进入全屏', !!doc.fullscreenElement);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F', bubbles: true }));
  check('再按 F 退出全屏', !doc.fullscreenElement);

  // 12. 搜索框内输入 f 不应触发全屏
  const searchBox = $('#search');
  searchBox.focus();
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  check('搜索框内输入 f 不触发全屏', !doc.fullscreenElement);
  searchBox.blur();

  // 13. 品牌副标题已移除
  check('LOGO 右侧无副标题', !$('.brand .sub'), $('.brand').textContent.trim());

  // 14. 三种地图模式
  const WM = w.__worldMap;
  check('共有三个地图模式', Object.keys(WM.modes).join(',') === 'world,cn,us', Object.keys(WM.modes).join(','));
  check('模式切换器有三个按钮', $$('#mapmodes button').length === 3,
    $$('#mapmodes button').map((b) => b.textContent.trim()).join(' | '));
  check('按钮文案为 世界/中国/美国（不含“地图”二字）',
    $$('#mapmodes button').map((b) => b.textContent.trim()).join(',') === '🌍世界,🇨🇳中国,🇺🇸美国',
    $$('#mapmodes button').map((b) => b.textContent.trim()).join(','));
  check('按钮 title 保留完整名称', $$('#mapmodes button').every((b) => b.title.includes('地图')),
    $$('#mapmodes button').map((b) => b.title).join(' | '));
  check('默认是世界地图', WM.mapMode() === 'world' &&
    $('#mapmodes button.on').dataset.mode === 'world');
  check('世界模式有 177 个国家、无省界', $$('path.country').length === 177 && $$('path.sub').length === 0);

  // 切到中国地图
  doc.querySelector('#mapmodes button[data-mode="cn"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('切到中国地图模式', WM.mapMode() === 'cn');
  check('中国模式渲染 34 个省级行政区', $$('path.sub').length === 34, $$('path.sub').length);
  check('中国模式按钮高亮', $('#mapmodes button.on').dataset.mode === 'cn');
  check('国家层变为底衬且不可交互',
    $$('path.country').every((p) => p.classList.contains('context')));
  const vb = $('#map').getAttribute('viewBox').split(/\s+/).map(Number);
  const cnPts = (() => {
    const nums = $$('path.sub').map((p) => p.getAttribute('d')).join(' ').match(/-?\d+(\.\d+)?/g).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  })();
  check('中国地图画布按内容宽高比自适应（不再是 2:1 留白）',
    Math.abs(vb[2] / vb[3] - 1.08) < 0.35, 'viewBox 0 0 ' + vb[2] + ' ' + vb[3]);
  check('中国地图铺满画布',
    cnPts.x0 < vb[2] * 0.1 && cnPts.x1 > vb[2] * 0.9 &&
    cnPts.y0 < vb[3] * 0.1 && cnPts.y1 > vb[3] * 0.9,
    `x ${cnPts.x0.toFixed(0)}..${cnPts.x1.toFixed(0)} y ${cnPts.y0.toFixed(0)}..${cnPts.y1.toFixed(0)} of ${vb[2]}x${vb[3]}`);
  check('侧栏切换为中国地图信息', $('#panel').textContent.includes('中国地图') &&
    $('#panel').textContent.includes('个省级行政区'), $('#panel').querySelector('.drill-card h3').textContent.trim());
  check('榜单为中国省级前十', $$('#rank .row').length === 10 && $('#rank .row').textContent.includes('广东'),
    $('#rank .row').textContent.trim());

  // 中国模式交互
  const gdEl = doc.querySelector('path.sub[data-key="440000"]');
  check('广东省路径存在', !!gdEl, gdEl && gdEl.getAttribute('data-key'));
  gdEl.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 700, clientY: 420 }));
  const tipTxt = $('#tooltip').textContent;
  check('悬停省份显示名称/人口/面积/密度',
    tipTxt.includes('广东省') && tipTxt.includes('人口') && tipTxt.includes('km²') && tipTxt.includes('人口密度'));
  check('悬停省份显示省会与所属国家', tipTxt.includes('省会') && tipTxt.includes('广州') && tipTxt.includes('中国'));
  gdEl.dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 700, clientY: 420 }));
  check('点击选中省份', doc.querySelector('path.sub[data-key="440000"]').classList.contains('sel'));
  check('侧栏显示省份卡片', $('#panel').textContent.includes('广东省') &&
    $('#panel').textContent.includes('占全国人口'), $('#panel').querySelector('.sel-zh').textContent);
  const provColored = $$('path.sub').filter((p) => p.style.fill && p.style.fill !== '');
  check('省级按人口着色', provColored.length > 30, provColored.length);
  doc.querySelector('[data-metric="density"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('密度模式下省级榜单第一是港澳沪', /香港|澳门|上海/.test($('#rank .row').textContent),
    $('#rank .row').textContent.trim());
  doc.querySelector('[data-metric="gdpTotal"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('省级无 GDP 数据时有兜底', $('#rank').textContent.includes('暂无数据') ||
    $$('path.sub.nodata').length === 34, $('#rank').textContent.trim());
  doc.querySelector('[data-metric="pop"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // 切到美国地图
  doc.querySelector('#mapmodes button[data-mode="us"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('切到美国地图模式', WM.mapMode() === 'us' && $$('path.sub').length === 51, $$('path.sub').length);
  check('切换模式后清空选中', !doc.querySelector('.sub.sel'));
  check('侧栏切换为美国地图信息', $('#panel').textContent.includes('美国地图') &&
    $('#panel').textContent.includes('个州'), $('#panel').querySelector('.drill-card h3').textContent.trim());
  const usNames = WM.subShapes().map((x) => x.info.name);
  const usScreen = {};
  WM.subShapes().forEach((x) => { usScreen[x.info.name] = { x: x.cx, y: x.cy, size: x.size }; });
  const inBox = (v) => v.x > -10 && v.x < 1010 && v.y > -10 && v.y < 530;  // 世界画布坐标
  const vbUs = $('#map').getAttribute('viewBox').split(/\s+/).map(Number);
  check('美国地图画布按内容宽高比自适应', vbUs[2] < 1000 && vbUs[2] > 500,
    'viewBox 0 0 ' + vbUs[2] + ' ' + vbUs[3]);
  check('美国地图取景排除阿拉斯加', !inBox(usScreen['Alaska']), JSON.stringify(usScreen['Alaska']));
  check('美国地图取景排除夏威夷', !inBox(usScreen['Hawaii']), JSON.stringify(usScreen['Hawaii']));
  check('本土州在画面内', inBox(usScreen['California']) && inBox(usScreen['Texas']) && inBox(usScreen['Maine']));
  const mainland = WM.subShapes().filter((x) => !['Alaska', 'Hawaii', 'Puerto Rico'].includes(x.info.name));
  const mx0 = Math.min(...mainland.map((x) => x.cx - x.bw / 2));
  const mx1 = Math.max(...mainland.map((x) => x.cx + x.bw / 2));
  const my0 = Math.min(...mainland.map((x) => x.cy - x.bh / 2));
  const my1 = Math.max(...mainland.map((x) => x.cy + x.bh / 2));
  check('美国本土铺满画布',
    mx0 < vbUs[2] * 0.1 && mx1 > vbUs[2] * 0.9 && my0 < vbUs[3] * 0.1 && my1 > vbUs[3] * 0.9,
    `x ${mx0.toFixed(0)}..${mx1.toFixed(0)} y ${my0.toFixed(0)}..${my1.toFixed(0)} of ${vbUs[2]}x${vbUs[3]}`);
  check('州级标签可显示', WM.renderLabels().length >= 20, WM.renderLabels().length + ' 个');
  check('榜单为美国州级前十', $('#rank .row').textContent.includes('加利福尼亚州'), $('#rank .row').textContent.trim());

  // 键盘 1/2/3 切换
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '1', bubbles: true }));
  check('按 1 回到世界地图', WM.mapMode() === 'world' && $$('path.sub').length === 0);
  check('世界模式国家层恢复可交互',
    $$('path.country').every((p) => !p.classList.contains('context')));
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '2', bubbles: true }));
  check('按 2 进入中国地图', WM.mapMode() === 'cn' && $$('path.sub').length === 34);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '3', bubbles: true }));
  check('按 3 进入美国地图', WM.mapMode() === 'us' && $$('path.sub').length === 51);
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '1', bubbles: true }));

  // 搜索跨模式
  const input2 = $('#search');
  input2.value = '广东';
  input2.dispatchEvent(new w.Event('input', { bubbles: true }));
  const provItem = $('#suggest .item');
  check('搜索能命中省份', provItem && provItem.textContent.includes('广东省'), provItem && provItem.textContent);
  check('搜索结果带“省”标记', provItem.querySelector('.pill') &&
    provItem.querySelector('.pill').textContent === '省');
  provItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('选省份结果自动切到中国地图并选中',
    WM.mapMode() === 'cn' && doc.querySelector('path.sub[data-key="440000"]').classList.contains('sel'));
  input2.value = 'California';
  input2.dispatchEvent(new w.Event('input', { bubbles: true }));
  const usItem = $('#suggest .item');
  check('搜索能命中美国州', usItem && usItem.textContent.includes('加利福尼亚州'));
  usItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('选州结果自动切到美国地图并选中',
    WM.mapMode() === 'us' && doc.querySelector('path.sub[data-key="06"]').classList.contains('sel'));
  input2.value = '日本';
  input2.dispatchEvent(new w.Event('input', { bubbles: true }));
  const jpItem = $('#suggest .item');
  jpItem.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('搜索国家自动切回世界地图并选中',
    WM.mapMode() === 'world' && doc.querySelector('path[data-key="392"]').classList.contains('sel'));

  // 投影切换在各模式下都成立
  doc.querySelector('#mapmodes button[data-mode="cn"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const dBeforeSub = doc.querySelector('path.sub[data-key="440000"]').getAttribute('d');
  doc.querySelector('[data-proj="plate"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('中国模式下切投影重算省界',
    doc.querySelector('path.sub[data-key="440000"]').getAttribute('d') !== dBeforeSub &&
    $$('path.sub').length === 34);
  doc.querySelector('[data-proj="mercator"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('美国模式在墨卡托下也正常', (() => {
    doc.querySelector('#mapmodes button[data-mode="us"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    return WM.mapMode() === 'us' && $$('path.sub').length === 51;
  })());
  doc.querySelector('[data-proj="ee"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  doc.querySelector('#mapmodes button[data-mode="world"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // Esc 清除选中，不改变模式
  doc.querySelector('#mapmodes button[data-mode="cn"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  WM.selectSub('440000', {});
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc 清除选中但保留地图模式',
    WM.mapMode() === 'cn' && !doc.querySelector('.sub.sel'), WM.mapMode());
  doc.querySelector('#mapmodes button[data-mode="world"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('回到世界地图后一切正常',
    WM.mapMode() === 'world' && $$('path.country').length === 177 && $$('path.sub').length === 0);

  report();
}

function report() {
  let pass = 0;
  results.forEach((r) => {
    if (r.ok) pass++;
    console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.name + (r.extra ? '   [' + r.extra + ']' : ''));
  });
  console.log(`\n${pass}/${results.length} 通过`);
  if (errors.length) { console.log('\n运行时错误:'); errors.forEach((e) => console.log('  ! ' + e)); }
  process.exit(pass === results.length && errors.length === 0 ? 0 : 1);
}
