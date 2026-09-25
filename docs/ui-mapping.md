# UI 规范：DESIGN.md → Ant Design 6 映射

根目录 `DESIGN.md`（HGXT Design System）是本项目 UI 的最高规范。
本项目用 Ant Design 6，**不引入 Tailwind**，通过「CSS 变量 + AntD Design Token」落地同一套约束。
本文件是落地映射表，也是后续所有新页面的 UI 验收标准。
（ZCode 原版设计系统存档于 `docs/reference/zcode-design-system.md`，仅供溯源。）

## 核心原则（直接继承 DESIGN.md）

- 界面冷静、密集、操作型（calm, dense, operational），不做营销风。
- 无渐变、无大面积品牌色填充、无夸张圆角与阴影。
- 靠「背景层次 + 边框 + 文本层级」表达结构，阴影只给浮层。
- 语义色（success/warning/error）只表达真实语义状态，不做装饰。
- 亮色 / 深色两套主题都必须正常（顶栏可切换：浅色/深色/跟随系统）。
- 国际化留白：不要用"截断"作为翻译变长的唯一兜底。

## Token 映射表

### 字号（DESIGN.md 最高优先级约束）

| DESIGN.md token | 值 | AntD 落地 | 用途 |
| --- | --- | --- | --- |
| `--ui-font-size` | 14px | `fontSize: 14` | 基准，正好等于 AntD 默认 |
| `text-ui-xl` | 18px | 页面大标题（Typography Title level=3 → fontSizeHeading3: 18） | 一级标题 |
| `text-ui-lg` | 16px | Title level=4 → `fontSizeHeading4: 16` | 二级标题 |
| `text-ui-base` | 14px | 默认 | 正文、按钮、表格、菜单 |
| `text-ui-sm` | 12px | 辅助文字（`--ui-font-size-sm` 变量） | 次级信息、帮助文本 |
| `text-ui-xs` | 10px | 仅徽标级元数据 | 一般 UI 从 sm 起步 |

**硬性规则**：业务代码禁止出现任意 px 字号、禁止内联 `font-size`。自定义样式只允许引用 `var(--ui-font-size-*)`（定义在 `apps/admin/src/styles/global.css`）。标识符/技术值（用户名、路径、命令）用 `--font-mono`（`.mono` 类）。

### 圆角（按嵌套层级递减）

| DESIGN.md | 值 | AntD 落地 |
| --- | --- | --- |
| `rounded-xl`（第一层圆角容器/卡片） | 12 | `borderRadiusLG: 12`（Card、登录面板） |
| `rounded-lg`（基础控件） | 8 | `borderRadius: 8`（按钮、输入框） |
| `rounded-md`（嵌套小件） | 6 | `borderRadiusSM: 6`（菜单项等） |
| `rounded-2xl`（对话框） | 16 | `Modal.borderRadiusLG: 16` |

### 密度

- 控件高度以 **32px（h-8）** 为默认：`controlHeight: 32`。
- 菜单行 `itemHeight: 36`、表格 `cellPaddingBlock: 12`——密集、可扫读，不做"通风"的菜单和表格。

### 颜色分层（绝不混用）

| DESIGN.md | AntD 变量 | 用途 |
| --- | --- | --- |
| background | `--ant-color-bg-layout` | 页面/工作区背景（浅 #f5f6f8 / 深 #0a0a0a） |
| card / surface | `--ant-color-bg-container` | 卡片、表格、侧栏、顶栏 |
| popover / menu | `--ant-color-bg-elevated` | 浮层专属，**不得**用作普通内容底色 |
| 文本三级 | `--ant-color-text` / `-secondary` / `-tertiary` | 正文 / 辅助 / 占位 |
| 边框 | `--ant-color-border-secondary` | 结构分隔靠边框，不靠阴影 |
| 品牌色 | `--ant-color-primary`（#2f54eb） | 只用于主按钮、链接、选中态；**绝不做整面填充** |

### 阴影（克制）

- 普通表面：无阴影，靠背景对比 + 边框。
- 浮层（下拉/弹窗/通知）：`boxShadowSecondary: 0 4px 16px rgba(0,0,0,0.08)`（深色主题加深）。

### 动效

`motionDurationFast/Mid/Slow = 0.1s/0.15s/0.2s`——快而克制，只用于表达状态变化。

## 主题机制

- `apps/admin/src/theme/tokens.ts`：light/dark 两套 `ThemeConfig`（唯一允许出现原始色值/尺寸的地方）。
- `apps/admin/src/theme/ThemeProvider.tsx`：模式切换（light/dark/system，localStorage `hgxt:theme-mode` 持久化），AntD `cssVar: { key: 'hgxt' }` 模式——CSS 变量名稳定，全局 CSS 直接用 `var(--ant-*)`。
- **`--ant-*` 变量作用域警告**：变量只挂在 antd 组件的作用域类（`.hgxt`）上，`html`/`body` 等组件树之外的元素**引用不到**。因此页面根布局一律用 `minHeight: 100vh` 的 Layout 承担主背景（不要用 `height: 100%`——AntD `<App>` 会包一层无高度的 div 使百分比断链）；body 上只放静态兜底色（浅 #f5f6f8 / 深 #0a0a0a 随系统偏好）。
- 自定义 CSS（非 AntD 组件部分）引用 `var(--ui-font-size-*)`，不写裸值。

## 组件约定

- 表格操作列用 `type="link" size="small"`，危险操作（禁用）带 Popconfirm + danger。
- 角色用 Tag（管理员 gold / 普通用户默认），状态用 Badge（正常 success / 已禁用 default）——状态语义用色 + 文字双重表达，不靠颜色单独传义。
- 表单 `layout="vertical"` + `requiredMark={false}`，弹窗 `destroyOnHidden`。
- 每个页面顶部标题用 Title level=3（18px），与 DESIGN.md 的层级一致。
