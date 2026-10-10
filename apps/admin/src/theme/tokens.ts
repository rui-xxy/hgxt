/**
 * design/00-设计规范.html（HGXT 设计语言 v3）→ AntD Design Token 映射
 *
 * 三个原则：留白代替边框，墨色代替品牌色，字体承担层级。
 *   - 主按钮用墨色；钴蓝只出现在焦点、选中、链接，面积极小
 *   - 圆角三级：控件 9 · 容器 14 · 浮层 12 · 标签 6
 *   - 阴影只给浮层；分隔线只用 1px
 *   - 中文正文 Geist + 思源黑体，标题衬线（见 styles/global.css）
 *
 * 自定义 CSS 用的同一套色值见 styles/global.css 的 --bg/--ink 等变量；
 * 原始色值只允许出现在这两个文件。
 */
import { theme, type ThemeConfig } from 'antd';

interface Palette {
  bg: string;
  side: string;
  sunken: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  hover: string;
  active: string;
  /** 与 hover 等效的不透明色：表格固定列不能透底 */
  hoverSolid: string;
  brand: string;
  brandSoft: string;
  ok: string;
  amber: string;
  danger: string;
  pop: string;
}

const light: Palette = {
  bg: '#FFFFFF',
  side: '#F6F6F4',
  sunken: '#F9F9F8',
  ink: '#1A1A19',
  ink2: '#5E5E59',
  ink3: '#8C8C86',
  line: '#ECECE9',
  line2: '#DFDFDB',
  hover: 'rgba(20, 20, 18, 0.04)',
  active: 'rgba(20, 20, 18, 0.065)',
  hoverSolid: '#F5F5F5',
  brand: '#2F55A4',
  brandSoft: '#E7EDF8',
  ok: '#2E6A45',
  amber: '#8A5A12',
  danger: '#B3261E',
  pop: '0 1px 2px rgba(31, 29, 26, 0.05), 0 12px 32px -8px rgba(31, 29, 26, 0.18)',
};

const dark: Palette = {
  bg: '#1D1D1C',
  side: '#141414',
  sunken: '#191918',
  ink: '#ECECEA',
  ink2: '#A6A6A0',
  ink3: '#7A7A75',
  line: '#2E2E2C',
  line2: '#3D3D3A',
  hover: 'rgba(255, 255, 255, 0.04)',
  active: 'rgba(255, 255, 255, 0.075)',
  hoverSolid: '#252524',
  brand: '#93AFEA',
  brandSoft: 'rgba(147, 175, 234, 0.15)',
  ok: '#8FC6A0',
  amber: '#E3B873',
  danger: '#F28B80',
  pop: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 16px 40px -8px rgba(0, 0, 0, 0.6)',
};

/** 中控趋势图的系列配色；与设计稿一致，并为暗色主题提供对应亮度。 */
export const controlChartPalette = {
  light: { blue: light.brand, paleBlue: '#9DB1DA', amber: '#EDA100', orange: '#EB6834', green: '#1BAF7A' },
  dark: { blue: dark.brand, paleBlue: '#7186B4', amber: dark.amber, orange: dark.danger, green: dark.ok },
} as const;

/** 硫酸中控手机设计稿的局部视觉色，保留 HGXT 的明暗主题。 */
export const sulfuricControlPalette = {
  light: { hero: '#15273A', accent: '#1D5FD1', accentSoft: '#EAF0FB', mark: '#EDC437', page: '#F2F4F6', pendingBar: '#F0A43A', uncheckedBar: '#B7BEC7' },
  dark: { hero: dark.bg, accent: dark.brand, accentSoft: dark.brandSoft, mark: '#E3B873', page: dark.side, pendingBar: dark.amber, uncheckedBar: dark.ink3 },
} as const;

/** 经营简报设计稿的状态色：明亮色用于条、点，深色用于小字。 */
export const briefPalette = {
  light: {
    okFill: controlChartPalette.light.green,
    amberFill: controlChartPalette.light.amber,
    dangerFill: controlChartPalette.light.orange,
    okText: '#16754F',
    amberText: '#8A5A12',
    dangerText: '#B4532A',
    dangerSoft: '#FDEBE2',
  },
  dark: {
    okFill: '#31C48D',
    amberFill: '#E9AD2D',
    dangerFill: '#EC7651',
    okText: '#8FC6A0',
    amberText: '#E3B873',
    dangerText: '#F4A284',
    dangerSoft: 'rgba(236, 118, 81, 0.16)',
  },
} as const;

/** 登录页与《以硫为源》影片共用的浅蓝纸面配色。 */
export const loginPalette = {
  paper: '#F5F8FC',
  showreelBg: '#030915',
  ink: '#0A1D3D',
  muted: '#47597A',
  line: '#B8CBE4',
  cardIdle: 'rgba(245, 248, 252, 0.68)',
  cardActive: 'rgba(245, 248, 252, 0.96)',
  cardShadow: 'rgba(10, 29, 61, 0.12)',
  teal: '#0D9184',
  blue: '#1F6FD1',
  white: '#FFFFFF',
  focus: 'rgba(31, 111, 209, 0.14)',
} as const;

const fontFamily =
  "'Geist', 'Noto Sans SC', system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

function buildTheme(p: Palette, isDark: boolean): ThemeConfig {
  return {
    cssVar: { key: 'hgxt' },
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // 墨色为主色（主按钮）；钴蓝走 link / info / 焦点
      colorPrimary: p.ink,
      colorInfo: p.brand,
      colorLink: p.brand,
      colorLinkHover: p.brand,
      colorSuccess: p.ok,
      colorWarning: p.amber,
      colorError: p.danger,

      colorBgLayout: p.side,
      colorBgContainer: p.bg,
      colorBgElevated: p.bg,
      colorText: p.ink,
      colorTextSecondary: p.ink2,
      colorTextTertiary: p.ink3,
      colorTextQuaternary: p.ink3,
      colorBorder: p.line2,
      colorBorderSecondary: p.line,
      colorSplit: p.line,
      colorFillQuaternary: p.hover,
      colorFillTertiary: p.hover,
      colorFillSecondary: p.active,
      colorFill: p.active,
      colorBgTextHover: p.hover,
      colorBgTextActive: p.active,
      // 主按钮使用墨色，但列表选中项采用品牌浅色，避免悬停时被推导成黑底。
      controlItemBgActive: p.brandSoft,
      controlItemBgActiveHover: p.brandSoft,

      fontFamily,
      fontFamilyCode: "'Geist Mono', ui-monospace, monospace",
      fontSize: 15,
      fontSizeHeading1: 30,
      fontSizeHeading2: 26,
      fontSizeHeading3: 18,
      fontSizeHeading4: 15,
      fontSizeHeading5: 14,

      // 圆角：控件 9 · 浮层 12 · 容器 14 · 标签 6
      borderRadius: 9,
      borderRadiusSM: 6,
      borderRadiusLG: 12,
      borderRadiusXS: 4,

      controlHeight: 36,
      controlHeightSM: 32,
      controlHeightLG: 44,

      boxShadow: 'none',
      boxShadowSecondary: p.pop,
      boxShadowTertiary: 'none',

      // 动效：140ms 悬停 / 200ms 浮层，快出缓停
      motionDurationFast: '0.14s',
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.24s',
      motionEaseOut: 'cubic-bezier(.2, .8, .2, 1)',
    },
    components: {
      Button: {
        fontWeight: 500,
        defaultShadow: 'none',
        primaryShadow: 'none',
        dangerShadow: 'none',
        defaultBorderColor: p.line2,
        defaultHoverBorderColor: p.ink3,
        defaultHoverColor: p.ink,
        defaultActiveBorderColor: p.ink3,
        defaultActiveColor: p.ink,
        primaryColor: isDark ? p.bg : '#FFFFFF',
        colorPrimaryHover: p.ink,
        colorPrimaryActive: p.ink,
      },
      Input: {
        activeBorderColor: p.brand,
        hoverBorderColor: p.ink3,
        activeShadow: `0 0 0 3px ${p.brandSoft}`,
      },
      DatePicker: {
        colorPrimary: p.brand,
        colorTextLightSolid: p.bg,
        activeBorderColor: p.brand,
        hoverBorderColor: p.ink3,
        activeShadow: `0 0 0 3px ${p.brandSoft}`,
        cellHoverBg: p.hover,
        cellActiveWithRangeBg: p.brandSoft,
        cellHoverWithRangeBg: p.brandSoft,
        cellRangeBorderColor: p.brand,
      },
      InputNumber: {
        activeBorderColor: p.brand,
        hoverBorderColor: p.ink3,
        activeShadow: `0 0 0 3px ${p.brandSoft}`,
      },
      Select: {
        activeBorderColor: p.brand,
        hoverBorderColor: p.ink3,
        activeOutlineColor: p.brandSoft,
        optionSelectedBg: p.brandSoft,
        optionSelectedColor: p.ink,
        optionActiveBg: p.hover,
        borderRadiusLG: 12,
        borderRadiusSM: 8,
      },
      Dropdown: {
        borderRadiusLG: 12,
        borderRadiusSM: 8,
        controlItemBgHover: p.active,
      },
      Card: {
        borderRadiusLG: 14,
        paddingLG: 16,
      },
      Popover: {
        borderRadiusLG: 12,
      },
      Modal: {
        borderRadiusLG: 16,
      },
      Table: {
        headerBg: p.bg,
        headerColor: p.ink3,
        headerSplitColor: 'transparent',
        rowHoverBg: p.hoverSolid,
        borderColor: p.line,
        cellPaddingBlock: 18,
        cellPaddingInline: 12,
        fontWeightStrong: 500,
      },
      Tag: {
        borderRadiusSM: 6,
        defaultBg: p.active,
        defaultColor: p.ink2,
      },
      Menu: {
        itemHeight: 36,
        itemBorderRadius: 8,
        itemMarginInline: 0,
        itemMarginBlock: 1,
        itemBg: 'transparent',
        itemColor: p.ink2,
        itemHoverBg: p.hover,
        itemHoverColor: p.ink,
        itemSelectedBg: p.active,
        itemSelectedColor: p.ink,
        activeBarBorderWidth: 0,
      },
      Segmented: {
        trackBg: p.active,
        itemSelectedBg: p.bg,
        itemSelectedColor: p.ink,
        trackPadding: 3,
      },
      Layout: {
        bodyBg: p.side,
        siderBg: p.side,
        headerBg: 'transparent',
        headerHeight: 52,
        headerPadding: '0 16px',
      },
    },
  };
}

export const lightTheme = buildTheme(light, false);
export const darkTheme = buildTheme(dark, true);
