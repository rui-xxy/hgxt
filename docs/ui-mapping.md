# UI 规范：HGXT 视觉系统（DESIGN.md → Ant Design 6 落地）

根目录 `DESIGN.md` 是 **ZCode 原版设计系统**（Tailwind 语法，用户指定作为本项目 UI 规范来源，从 github.com/zai-org/ZCode 同步）。
本项目用 Ant Design 6，**不引入 Tailwind**，通过「`--hg-*` CSS 变量 + AntD Design Token」落地：字号刻度、圆角层级、密度、表面分层、语义色规则严格继承；与桌面 AI 工作台强绑定的章节（Chat/Diff/Terminal/Workflow）只取其精神。

2026-09 视觉重做（用户要求「以最新最高级的审美来做工作台」，不走传统工业仪表 / 普通 SaaS 模板风）：
中性单色 + 一抹靛紫强调色、画布上浮起的内缩主面板、墨色主按钮、自研图标集、圆形展开的主题切换。
本文件是落地映射表，也是后续所有新页面的 UI 验收标准。

## 布局骨架（壳层，AdminLayout）

后续所有页面都渲染在这个壳层内，**禁止绕过或另起结构**：

```text
画布（--hg-canvas，整屏 100vh，不滚动）
├ 侧栏 232px，透明坐在画布上（可折叠为 64px 图标栏；手动折叠记忆到 hgxt:sider-collapsed，<992px 自动折叠）
│ ├ 品牌区：BrandMark 28px + 「HGXT / 数据工作台」
│ ├ 导航：34px 行、8px 圆角；分组用 Menu group 小标题（「系统管理」），不用可折叠子菜单
│ │   选中态 = 浮起的面板色胶囊 + 发丝阴影（--hg-shadow-xs）+ 图标转强调色
│ │   （禁止大面积品牌色胶囊 / 左缘色条）
│ └ 账户区：固定底部；头像 + 姓名 + 用户名(mono) + 上下箭头；点击弹出菜单，退出登录只放在这里
│
└ 主面板（.hg-main）：上/右/下内缩 8px，圆角 12，面板色 + --hg-shadow-panel
  ├ 顶栏 52px：侧栏开关 │ 面包屑（模块 › 页面）……右侧主题切换（太阳/月亮交替旋转）
  └ 内容区：独立滚动，padding 24 / 28
```

## 页面模板（每个业务页面按此三层组装）

```text
① PageHeader（components/PageHeader.tsx）
   左：[返回按钮] + 标题（18px semibold，字距 -0.015em）+ [计量：三级灰纯数字，不加底色]
   右：页面级主操作（一页至多一个 primary 按钮）
   —— **不加辅助说明小字**（用户明确要求：页面用途靠标题与内容表达，禁止
      "管理系统账号：新增、编辑…"这类解释性副文本；计量标记是数字，不是说明）

② 数据工作区
   列表页（.hg-list）：**无外框**，表格直接落在面板上（少一层盒子才显得克制）
   ├ Toolbar：左侧填充式搜索框（.hg-search，SearchIcon 前缀，回车搜索、清空即复位）；
   │   总数只在 PageHeader 显示一次，不重复
   └ Table：表头无底色、12px 三级灰、上下发丝线；首列与工具栏左缘对齐；
      关键业务列不设宽度（伸缩 + ellipsis），时间/号码定宽 + `.tabular`（不用等宽字体）；
      操作列 fixed right、表头隐藏文字（.hg-sr-only）、**悬停/聚焦行时才浮现**（触屏常显）
   宽表 / 编辑型工作区（DataSheet）用 .hg-surface：发丝线边框 + 圆角 12，不加阴影

③ 空态 / 状态页（components/StatusView.tsx）
   图标方块 + 标题 + 说明 + 操作；表格空态由 ConfigProvider.renderEmpty 统一提供。
   不摆假卡片、不用 AntD Result / Empty 的插画。
```

- 列布局原则：**不要让定宽列排完后右侧留大片空白**——至少一个业务列负责伸缩。
- 行操作：高频操作用无图标的 `type="text" size="small"` 文字按钮；低频 / 危险操作（禁用、启用、删除）收进行尾「⋯」菜单。
- **不做装饰性图标方块**：列表行首不放图标 tile，用「标题 + 三级灰元信息行」表达（如「19 个字段 · 10 条记录」）。
- 危险操作必须二次确认 + danger：行内用 `modal.confirm`（图标方块 `.hg-confirm-icon-danger`）或 Popconfirm。
- 页面级反馈用 message（成功/失败）。

## 核心原则

- 界面冷静、密集、操作型（calm, dense, operational），不做营销风。
- 中性色承担 95% 的界面；**强调色（靛紫）只用于焦点、选中、链接、进度与品牌**，主按钮用墨色（浅色近黑 / 深色近白）。
- 品牌标识保持墨色单色（仅极轻的明度渐变）；登录页背景柔光是唯一的装饰。普通 UI 不用渐变、不用彩色填充块。
- 头像、角色徽标一律中性：头像 = 浅填充 + 发丝描边 + 二级灰字；角色 = 描边徽标（`.hg-badge`，管理员 `.hg-badge-strong`）。
- 靠「画布 → 面板 → 弱分区」的明度层次 + 发丝线表达结构；阴影只给浮起面板（极轻）和浮层。
- 语义色（success/warning/danger）只表达真实语义状态，不做装饰；状态用「颜色 + 文字」双重表达。
- 亮色 / 深色两套主题都必须正常；顶栏单按钮一键切换，不提供三态选择器。
- 国际化留白：不要用"截断"作为翻译变长的唯一兜底。

## 图标（components/icons.tsx）

- **全站唯一图标来源**，已移除 `@ant-design/icons` 依赖。不要混用其他图标库。
- 规格：24 网格、1.75 描边、圆头圆角、`currentColor`、尺寸 `1em`（随文字缩放，按钮内自动放大到 1.07em）。
- 新增图标：用 `createIcon(name, <path …/>)`，保持同网格同描边；装饰性图标默认 `aria-hidden`，需要可访问名称时传 `title`。
- 纯图标按钮必须有 `aria-label`（并建议配 Tooltip）。
- 品牌标识：`components/BrandMark.tsx`（墨色圆角方块 + H 字形 + 圆点），颜色来自 `--hg-brand-*`。

## Token 映射表

### 字号（DESIGN.md 最高优先级约束）

| DESIGN.md token | 值 | 落地 | 用途 |
| --- | --- | --- | --- |
| `--ui-font-size` | 14px | `fontSize: 14` | 基准 |
| `text-ui-xl` | 18px | `--ui-font-size-xl` | 页面标题、状态页标题 |
| `text-ui-lg` | 16px | `--ui-font-size-lg` | 弹窗标题、填报页标题 |
| `text-ui-base` | 14px | 默认 | 正文、按钮、表格、菜单 |
| `text-ui-caption` | 13px | `--ui-font-size-caption` | 面包屑、表单标签、分段控件 |
| `text-ui-sm` | 12px | `--ui-font-size-sm` | 表头、次级信息、计数 |
| `text-ui-xs` | 10px | `--ui-font-size-xs` | 徽标级计数 / 单位 |
| `text-mobile-input-safe` | 16px | `--ui-font-size-mobile-input` | 仅移动端输入框（防 iOS 缩放） |

**硬性规则**：业务代码禁止出现任意 px 字号、禁止内联 `font-size`。自定义样式只允许引用 `var(--ui-font-size-*)`（定义在 `apps/admin/src/styles/global.css`）。

### 字体

- UI：Geist Variable（`@fontsource-variable/geist`，本地打包，内网可用）→ 苹方 / HarmonyOS Sans / MiSans / 微软雅黑。
- 等宽字体（`.mono`）只用于真正的标识符（用户名、编码）；日期、手机号、数量用 `.tabular`（等宽数字的正文字体）。

### 圆角（按嵌套层级递减）

| DESIGN.md | 值 | 落地 |
| --- | --- | --- |
| `rounded-xl`（主面板 / 第一层容器） | 12 | `--hg-radius-lg` / `borderRadiusLG: 12` |
| `rounded-lg`（基础控件） | 8 | `--hg-radius-md` / `borderRadius: 8` |
| `rounded-md`（嵌套小件） | 6 | `--hg-radius-sm` / `borderRadiusSM: 6` |
| `rounded-2xl`（对话框、登录卡片） | 16 | `--hg-radius-xl` / `Modal.borderRadiusLG: 16` |

`999px` 只用于胶囊标记（`.hg-pill`、计数徽标）。

### 密度

- 控件高度默认 32（sm 28 / lg 40）；导航行 34；表格单元 13/16 内边距；数据表行高 40。

### 颜色分层（theme/tokens.ts 的 `palettes`，绝不混用）

| 变量 | 用途 |
| --- | --- |
| `--hg-canvas` | 画布：侧栏与面板外的底色（= AntD `colorBgLayout`） |
| `--hg-panel` | 主面板、卡片、表格（= `colorBgContainer`） |
| `--hg-subtle` | 面板内弱分区：表头、分组色带、悬停行 |
| `--hg-elevated` | 浮层专属（= `colorBgElevated`），**不得**用作普通内容底色 |
| `--hg-fill` / `-hover` / `-strong` | 交互填充：悬停、分段控件轨道、中性标记 |
| `--hg-border` / `--hg-hairline` | 控件边框 / 结构分隔发丝线 |
| `--hg-text` / `text2` / `text3` / `text4` | 正文 / 辅助 / 弱信息 / 占位 |
| `--hg-ink` / `--hg-on-ink` | 墨色主按钮及其文字（AntD `Button.colorPrimary`） |
| `--hg-accent*` | 强调色：焦点环、选中、链接、进度（= AntD `colorPrimary`） |
| `--hg-success/warning/danger(-soft)` | 语义状态 |

### 阴影

- `--hg-shadow-xs`：导航选中胶囊、分段控件选中项、状态图标方块。
- `--hg-shadow-panel`：主面板（几乎只是一圈发丝线）。
- `--hg-shadow-overlay`：下拉、弹窗、消息、登录卡片。普通内容表面不加阴影。

### 动效

`motionDurationFast/Mid/Slow = 0.1s/0.16s/0.22s`，缓动 `cubic-bezier(0.32, 0.72, 0, 1)`——快而克制。
`prefers-reduced-motion` 下全局关闭动画。

## 主题机制

- `apps/admin/src/theme/tokens.ts`：`palettes.light/dark` 是**唯一允许出现原始色值的地方**；同一份 palette 生成 AntD `ThemeConfig` 与 `--hg-*` CSS 变量。
- `apps/admin/src/theme/ThemeProvider.tsx`：
  - 只保留 light/dark，一键切换并用 localStorage `hgxt:theme-mode` 持久化；首次访问读系统偏好。
  - 把 `--hg-*`、`data-theme`、`color-scheme`、`<meta name="theme-color">` 写到 `<html>`——**body 等组件树外的元素也能用 `--hg-*`**。
  - 切换动画：View Transitions API 从按钮位置圆形展开；切换期间给 `<html>` 加 `.hg-theme-switching` 关闭所有 CSS 过渡（否则组件背景渐变会被截进快照）。不支持或减少动效时直接切换。
  - ConfigProvider 统一注入：`button.autoInsertSpace=false`（「取消」不插空格）、弹窗关闭图标、`renderEmpty`。
- **`--ant-*` 变量作用域警告**：AntD 的 `--ant-*` 只挂在组件自身的作用域类上，自定义 DOM 引用不到。自定义 CSS 一律用 `--hg-*`。

## 组件约定

- 角色用 `.hg-badge`（管理员 `.hg-badge-strong`）；状态用 `.hg-status-dot`（正常 success 点 / 已禁用灰点）。`.hg-pill` 只用于真实状态（未保存 / 已保存）。
- 用户类单元格：`.hg-cell-user` = 头像（`.hg-avatar`）+ 姓名 + mono 用户名。
- 表单 `layout="vertical"` + `requiredMark={false}`，弹窗 `destroyOnHidden`。
- 页面标题统一走 `PageHeader`，不用 Typography.Title 直接铺在页面里。
- 数据表（DataSheet）：分组色带用 `--hg-subtle/--hg-fill` 交替；活动单元格 2px 强调色内描边；未保存修改用 warning 弱底色 + 工具栏「未保存」胶囊。
- 移动端填报页：顶部进度细线 + 必填计数、分段 tab（缺项数 / 完成勾）、单位嵌在输入框内、底部墨色大按钮（未完成时显示「还差 N 项必填」）。
