"""Export the icons used by AdminLayout into a self-contained review page."""

from pathlib import Path
import re
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/admin/src/components/icons.tsx"
LAYOUT = ROOT / "apps/admin/src/layouts/AdminLayout.tsx"
OUTPUT = ROOT / "design/当前左侧图标预览.html"

ICON_NAMES = (
    "DashboardIcon", "FormsNavIcon", "SystemNavIcon", "FactoryIcon",
    "SunIcon", "PackageIcon", "TargetIcon", "SlidersIcon",
    "UsersIcon", "MoonIcon", "LogoutIcon",
)


def symbols_from_source() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    layout = LAYOUT.read_text(encoding="utf-8")
    definitions = dict(re.findall(
        r"export const (\w+) = createIcon\(\s*'[^']+',\s*(.*?)\s*,?\s*\);",
        source,
        flags=re.S,
    ))
    symbols = []
    for name in ICON_NAMES:
        if name not in definitions:
            raise ValueError(f"Missing SVG definition: {name}")
        if name not in layout:
            raise ValueError(f"Icon is no longer referenced by the left navigation: {name}")
        body = definitions[name].replace("<>", "").replace("</>", "")
        body = body.replace("strokeWidth=", "stroke-width=")
        body = "\n".join(line.strip() for line in body.splitlines() if line.strip())
        symbols.append(f'<symbol id="{name}" viewBox="0 0 24 24">{body}</symbol>')
    return "\n".join(symbols)


TEMPLATE = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>当前左侧图标预览 · HGXT</title>
<style>
  :root {
    --bg: #fff; --side: #f6f6f4; --ink: #1a1a19; --ink2: #5e5e59;
    --ink3: #8c8c86; --line: #ecece9; --line2: #dfdfdb;
    --hover: rgba(20,20,18,.04); --active: rgba(20,20,18,.065);
    --brand: #2f55a4; --brand-soft: #e7edf8;
    --pop: 0 1px 2px rgba(31,29,26,.05), 0 12px 32px -8px rgba(31,29,26,.18);
  }
  [data-theme="dark"] {
    --bg: #1d1d1c; --side: #141414; --ink: #ececea; --ink2: #a6a6a0;
    --ink3: #7a7a75; --line: #2e2e2c; --line2: #3d3d3a;
    --hover: rgba(255,255,255,.04); --active: rgba(255,255,255,.075);
    --brand: #93afea; --brand-soft: rgba(147,175,234,.15);
    --pop: 0 0 0 1px rgba(255,255,255,.06), 0 16px 40px -8px rgba(0,0,0,.6);
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 36px; background: var(--side); color: var(--ink);
    font: 14px/1.5 'Geist','Noto Sans SC','Microsoft YaHei',system-ui,sans-serif; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .wrap { max-width: 1190px; margin: 0 auto; }
  .head { display: flex; align-items: end; gap: 22px; margin-bottom: 22px; }
  h1 { margin: 0; font: 500 28px/1.25 'Newsreader','Noto Serif SC',serif; }
  .lede { margin: 6px 0 0; color: var(--ink2); }
  .head-actions { margin-left: auto; display: flex; gap: 8px; }
  .control { min-height: 34px; padding: 0 13px; border: 1px solid var(--line2);
    border-radius: 9px; background: var(--bg); color: var(--ink2); }
  .control:hover { color: var(--ink); }
  .stage { display: grid; grid-template-columns: 350px minmax(0,1fr); gap: 18px; align-items: start; }
  .surface { border: 1px solid var(--line); border-radius: 14px; background: var(--bg); overflow: hidden; }
  .surface-title { display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin: 0; padding: 16px 18px; border-bottom: 1px solid var(--line);
    font-size: 14px; font-weight: 600; }
  .surface-title small { color: var(--ink3); font-size: 12px; font-weight: 400; }
  .mock { display: flex; min-height: 490px; background: var(--side); }
  .rail { display: flex; flex: 0 0 68px; flex-direction: column; align-items: center;
    gap: 2px; padding: 12px 0; }
  .mark { display: grid; place-items: center; width: 32px; height: 32px;
    margin-bottom: 14px; border-radius: 9px; background: var(--ink); color: var(--bg);
    font: 600 15px 'Noto Serif SC',serif; }
  .rail-btn { display: grid; place-items: center; width: 44px; height: 44px;
    border: 0; border-radius: 9px; background: transparent; color: var(--ink2); }
  .rail-btn:hover { background: var(--hover); color: var(--ink); }
  .rail-btn.active { background: var(--active); color: var(--ink); }
  .rail-foot { display: grid; place-items: center; width: 44px; height: 44px;
    margin-top: auto; border: 0; border-radius: 9px; background: transparent; }
  .rail-avatar { display: grid; place-items: center; width: 30px; height: 30px;
    border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-size: 14px; font-weight: 600; }
  .flyout { flex: 1; margin: 8px 8px 8px 0; padding: 12px 10px 10px 2px;
    border: 1px solid var(--line); border-left: 0; border-radius: 0 14px 14px 0;
    background: var(--bg); box-shadow: var(--pop); }
  .flyout-title { height: 32px; margin-bottom: 10px; padding: 0 10px;
    font-size: 15px; font-weight: 600; line-height: 32px; }
  .section + .section { margin-top: 16px; }
  .section-name { padding: 0 10px 6px; color: var(--ink3); font-size: 12px; letter-spacing: .02em; }
  .nav-row { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px;
    padding: 0 10px; border: 0; border-radius: 8px; background: transparent;
    color: var(--ink2); text-align: left; }
  .nav-row:hover { background: var(--hover); color: var(--ink); }
  .nav-row.active { background: var(--active); color: var(--ink); font-weight: 500; }
  .icon { display: block; flex: none; width: var(--icon-size,20px); height: var(--icon-size,20px);
    fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .rail .icon { --icon-size: 20px; }
  .flyout .icon { --icon-size: 17px; }
  .catalog { padding: 18px; }
  h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
  .catalog-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 9px; }
  .tile { min-width: 0; padding: 15px; border: 1px solid var(--line); border-radius: 10px; }
  .tile-name { margin: 11px 0 2px; font-weight: 600; }
  .tile-source { overflow: hidden; color: var(--ink3); font: 11px/1.4 'Geist Mono',Consolas,monospace;
    white-space: nowrap; text-overflow: ellipsis; }
  .tile-icons { display: flex; align-items: center; gap: 12px; min-height: 38px; }
  .tile-icons .icon { --icon-size: 28px; }
  .tile-icons .subtle { color: var(--ink3); }
  .selected-box { display: grid; place-items: center; width: 38px; height: 38px;
    border-radius: 9px; background: var(--active); color: var(--ink); }
  .selected-box .icon { --icon-size: 20px; }
  .catalog + .catalog { border-top: 1px solid var(--line); }
  @media (max-width: 930px) { .stage { grid-template-columns: 1fr; } .mock { max-width: 350px; } }
  @media (max-width: 600px) { body { padding: 16px; } .head { align-items: start; flex-wrap: wrap; }
    .head-actions { margin-left: 0; } .catalog-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute;overflow:hidden">
{{SYMBOLS}}
</svg>
<div class="wrap">
  <div class="head">
    <div><h1>当前左侧图标</h1><p class="lede">点击最左侧图标，查看每个模块的实际选中状态和展开菜单。</p></div>
    <div class="head-actions"><button id="theme" class="control" type="button">切换深色</button></div>
  </div>
  <div class="stage">
    <section class="surface" aria-label="侧栏实际尺寸预览">
      <h2 class="surface-title">侧栏预览 <small>图标轨 20px · 菜单 17px</small></h2>
      <div class="mock"><div id="rail" class="rail"></div><div id="flyout" class="flyout"></div></div>
    </section>
    <section class="surface" aria-label="全部图标对照">
      <h2 class="surface-title">图标对照 <small>放大显示便于看造型</small></h2>
      <div class="catalog"><h2>最左侧 · 3 个模块</h2><div id="module-grid" class="catalog-grid"></div></div>
      <div class="catalog"><h2>展开菜单 · 8 个入口</h2><div id="menu-grid" class="catalog-grid"></div></div>
      <div class="catalog"><h2>账号菜单 · 主题与退出</h2><div id="account-grid" class="catalog-grid"></div></div>
    </section>
  </div>
</div>
<script>
  const modules = [
    {key:'home',label:'首页',title:'首页',icon:'DashboardIcon',sections:[
      {items:[['工作台','DashboardIcon']]},
      {label:'生产看板',items:[['车间版面','FactoryIcon'],['计划与完成','TargetIcon']]},
      {label:'能源消耗',items:[['能源中心','SunIcon']]},
      {label:'库存',items:[['物料与库存','PackageIcon']]},
      {label:'计划管理',items:[['生产计划设置','SlidersIcon']]}
    ]},
    {key:'forms',label:'表单',title:'表单',icon:'FormsNavIcon',sections:[
      {items:[['全部表单','FormsNavIcon']]}
    ]},
    {key:'system',label:'系统',title:'系统',icon:'SystemNavIcon',sections:[
      {items:[['成员管理','UsersIcon']]}
    ]}
  ];
  const menuItems = [
    ['工作台','DashboardIcon'],['车间版面','FactoryIcon'],['计划与完成','TargetIcon'],
    ['能源中心','SunIcon'],['物料与库存','PackageIcon'],
    ['生产计划设置','SlidersIcon'],['全部表单','FormsNavIcon'],['成员管理','UsersIcon']
  ];
  const accountItems = [['深色模式','MoonIcon'],['浅色模式','SunIcon'],['退出登录','LogoutIcon']];
  let current = 'home';
  let activeMenu = '工作台';
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`;
  function render() {
    const module = modules.find(item => item.key === current);
    document.getElementById('rail').innerHTML = `<div class="mark">化</div>` + modules.map(item => {
      const selected = item.key === current;
      return `<button class="rail-btn${selected?' active':''}" type="button" data-module="${item.key}" aria-label="${item.label}" aria-pressed="${selected}">${icon(item.icon)}</button>`;
    }).join('') + `<div class="rail-foot" title="账号菜单"><div class="rail-avatar">账</div></div>`;
    document.getElementById('flyout').innerHTML = `<div class="flyout-title">${module.title}</div>` + module.sections.map(section =>
      `<div class="section">${section.label ? `<div class="section-name">${section.label}</div>` : ''}${section.items.map(([label,name]) =>
        `<button class="nav-row${activeMenu===label?' active':''}" type="button" data-item="${label}">${icon(name)}<span>${label}</span></button>`).join('')}</div>`
    ).join('');
    document.getElementById('module-grid').innerHTML = modules.map(item =>
      `<div class="tile"><div class="tile-icons"><span class="subtle">${icon(item.icon)}</span><span class="selected-box">${icon(item.icon)}</span></div><div class="tile-name">${item.label}</div><div class="tile-source">${item.icon}</div></div>`
    ).join('');
    document.getElementById('menu-grid').innerHTML = menuItems.map(([label,name]) =>
      `<div class="tile"><div class="tile-icons">${icon(name)}</div><div class="tile-name">${label}</div><div class="tile-source">${name}</div></div>`
    ).join('');
    document.getElementById('account-grid').innerHTML = accountItems.map(([label,name]) =>
      `<div class="tile"><div class="tile-icons">${icon(name)}</div><div class="tile-name">${label}</div><div class="tile-source">${name}</div></div>`
    ).join('');
  }
  document.addEventListener('click', event => {
    const railButton = event.target.closest('[data-module]');
    if (railButton) { current = railButton.dataset.module; activeMenu = current === 'home' ? '工作台' : current === 'forms' ? '全部表单' : '成员管理'; render(); }
    const menuButton = event.target.closest('[data-item]');
    if (menuButton) { activeMenu = menuButton.dataset.item; render(); }
  });
  document.getElementById('theme').addEventListener('click', event => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    event.currentTarget.textContent = dark ? '切换浅色' : '切换深色';
  });
  render();
</script>
</body>
</html>
'''


if __name__ == "__main__":
    symbols = symbols_from_source()
    svg = ElementTree.fromstring(f'<svg xmlns="http://www.w3.org/2000/svg">{symbols}</svg>')
    if len(svg) != len(ICON_NAMES):
        raise ValueError("The exported SVG symbol count does not match the navigation icon list")
    OUTPUT.write_text(TEMPLATE.replace("{{SYMBOLS}}", symbols), encoding="utf-8")
    print(OUTPUT)
