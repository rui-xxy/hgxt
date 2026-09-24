/**
 * DESIGN.md → AntD Design Token 映射（详见 docs/ui-mapping.md）
 *
 * DESIGN.md 是 Tailwind 语法的设计系统，本项目不引入 Tailwind，
 * 而是把它的 token 值映射到 AntD 主题上：
 *   - --ui-font-size: 14px  → fontSize: 14（AntD 默认值正好一致）
 *   - rounded-xl(12) 卡片   → borderRadiusLG: 12
 *   - rounded-lg(8)  控件   → borderRadius: 8
 *   - rounded-md(6)  嵌套件 → borderRadiusSM: 6
 *   - 对话框 rounded-2xl(16)→ Modal.borderRadiusLG: 16
 *   - 控件高度 h-8(32px)    → controlHeight: 32
 *
 * 约束（DESIGN.md「最高优先级」章节的等价物）：
 *   - 业务代码禁止出现任意 px 字号/圆角/颜色，统一走主题 token 或 CSS 变量
 *   - 语义色（success/warning/error）只用于真实语义状态，不做装饰
 *   - 品牌色克制使用：主按钮、链接、选中态；绝不做整面填充
 */
import { theme, type ThemeConfig } from 'antd';

/** 克制的极客蓝品牌色 */
export const brandPrimary = '#2f54eb';

const baseToken = {
  colorPrimary: brandPrimary,
  colorInfo: brandPrimary,
  colorLink: brandPrimary,

  // 字号刻度：--ui-font-size 默认 14px
  fontSize: 14,
  fontSizeHeading1: 24,
  fontSizeHeading2: 20,
  fontSizeHeading3: 18,
  fontSizeHeading4: 16,
  fontSizeHeading5: 14,

  // 圆角层级：容器 12 → 控件 8 → 嵌套 6
  borderRadius: 8,
  borderRadiusLG: 12,
  borderRadiusSM: 6,

  // 密度：h-8 为默认控件高度
  controlHeight: 32,

  // 动效：快而克制（DESIGN.md Motion）
  motionDurationFast: '0.1s',
  motionDurationMid: '0.15s',
  motionDurationSlow: '0.2s',
};

/** 浮层用轻阴影（Overlay 级）；卡片等普通表面靠背景对比 + 边框，不用大阴影 */
const overlayShadow = '0 4px 16px rgba(0, 0, 0, 0.08)';

const sharedComponents = {
  Layout: {
    headerHeight: 48,
    headerPadding: '0 16px',
  },
  Menu: {
    // 密集菜单行（DESIGN.md: 12px 密集列表项）
    itemHeight: 36,
    itemMarginInline: 8,
    itemMarginBlock: 4,
    itemBorderRadius: 6,
  },
  Table: {
    headerSplitColor: 'transparent',
    cellPaddingBlock: 12,
    cellPaddingInline: 12,
  },
  Card: {
    paddingLG: 20,
  },
  Modal: {
    // 对话框 rounded-2xl(16)
    borderRadiusLG: 16,
  },
};

export const lightTheme: ThemeConfig = {
  cssVar: { key: 'hgxt' },
  algorithm: theme.defaultAlgorithm,
  token: {
    ...baseToken,
    boxShadowSecondary: overlayShadow,
  },
  components: {
    ...sharedComponents,
    Layout: {
      ...sharedComponents.Layout,
      // 结构表面用中性色 + 边框分隔，而不是深色整面（DESIGN.md: 结构表面仅用于布局）
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f5f6f8',
    },
    Table: {
      ...sharedComponents.Table,
      headerBg: '#fafafa',
    },
  },
};

export const darkTheme: ThemeConfig = {
  cssVar: { key: 'hgxt' },
  algorithm: theme.darkAlgorithm,
  token: {
    ...baseToken,
    boxShadowSecondary: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  components: {
    ...sharedComponents,
    Layout: {
      ...sharedComponents.Layout,
      headerBg: '#141414',
      siderBg: '#141414',
      bodyBg: '#0a0a0a',
    },
    Table: {
      ...sharedComponents.Table,
      headerBg: '#1d1d1d',
    },
  },
};
