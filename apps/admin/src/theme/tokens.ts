/**
 * HGXT 视觉系统 · 唯一的原始色值 / 尺寸来源（docs/ui-mapping.md 约定）
 *
 * 语言：中性单色 + 一抹靛紫强调色（Linear / Vercel 一类的当代工作台审美）
 *   - 画布（canvas）承载侧栏，主内容是一块浮起的圆角面板（panel）
 *   - 主按钮用「墨色」（浅色=近黑 / 深色=近白），强调色只用于焦点、选中、链接与品牌
 *   - 层次靠背景明度 + 发丝线边框，阴影只给浮层
 *
 * 同一份 palette 同时产出：
 *   1. AntD ThemeConfig（组件 token）
 *   2. `--hg-*` CSS 变量（ThemeProvider 写到 <html>，自定义样式只引用变量）
 */
import { theme, type ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark';

export interface Palette {
  /** 画布：侧栏与面板外的底色 */
  canvas: string;
  /** 主面板 / 卡片表面 */
  panel: string;
  /** 面板内的弱分区（表头、工具条底） */
  subtle: string;
  /** 浮层（下拉、弹窗、气泡） */
  elevated: string;
  /** 交互填充：悬停 / 选中 / 输入底 */
  fill: string;
  fillHover: string;
  fillStrong: string;
  /** 边框：border 用于控件，hairline 用于结构分隔 */
  border: string;
  borderHover: string;
  hairline: string;
  /** 文本三级 + 占位 */
  text: string;
  text2: string;
  text3: string;
  text4: string;
  /** 墨色主按钮 */
  ink: string;
  inkHover: string;
  inkActive: string;
  onInk: string;
  /** 强调色（焦点、选中、链接、品牌） */
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentText: string;
  /** 语义色：只表达真实状态 */
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  /** 阴影：xs 用于选中胶囊 / 面板，overlay 用于浮层 */
  shadowXs: string;
  shadowPanel: string;
  shadowOverlay: string;
  /** 焦点环 */
  focusRing: string;
  /** 品牌标识：墨色微渐变（仅品牌图形使用，保持单色克制） */
  brandFrom: string;
  brandTo: string;
  onBrand: string;
}

export const palettes: Record<ThemeMode, Palette> = {
  light: {
    canvas: '#f4f4f5',
    panel: '#ffffff',
    subtle: '#fafafa',
    elevated: '#ffffff',
    fill: '#f4f4f5',
    fillHover: '#ececee',
    fillStrong: '#e4e4e7',
    border: '#e4e4e7',
    borderHover: '#d4d4d8',
    hairline: '#ececef',
    text: '#09090b',
    text2: '#52525b',
    text3: '#8e8e96',
    text4: '#b4b4bb',
    ink: '#18181b',
    inkHover: '#303036',
    inkActive: '#000000',
    onInk: '#fafafa',
    accent: '#5b5bd6',
    accentHover: '#4c4cc4',
    accentSoft: 'rgba(91, 91, 214, 0.09)',
    accentText: '#4a4ac2',
    success: '#16a34a',
    successSoft: 'rgba(22, 163, 74, 0.10)',
    warning: '#d97706',
    warningSoft: 'rgba(217, 119, 6, 0.10)',
    danger: '#e5484d',
    dangerSoft: 'rgba(229, 72, 77, 0.09)',
    shadowXs: '0 1px 2px rgba(9, 9, 11, 0.05), 0 0 0 1px rgba(9, 9, 11, 0.04)',
    shadowPanel: '0 1px 2px rgba(9, 9, 11, 0.04), 0 0 0 1px rgba(9, 9, 11, 0.05)',
    shadowOverlay:
      '0 0 0 1px rgba(9, 9, 11, 0.06), 0 12px 32px -8px rgba(9, 9, 11, 0.16), 0 4px 8px -4px rgba(9, 9, 11, 0.06)',
    focusRing: '0 0 0 3px rgba(91, 91, 214, 0.18)',
    brandFrom: '#3f3f46',
    brandTo: '#09090b',
    onBrand: '#ffffff',
  },
  dark: {
    canvas: '#09090b',
    panel: '#111113',
    subtle: '#141416',
    elevated: '#18181b',
    fill: '#1c1c1f',
    fillHover: '#232327',
    fillStrong: '#2a2a2f',
    border: '#2a2a2f',
    borderHover: '#3a3a40',
    hairline: '#1f1f23',
    text: '#fafafa',
    text2: '#a1a1aa',
    text3: '#71717a',
    text4: '#52525b',
    ink: '#f4f4f5',
    inkHover: '#ffffff',
    inkActive: '#d4d4d8',
    onInk: '#09090b',
    accent: '#8e8ef5',
    accentHover: '#a3a3f8',
    accentSoft: 'rgba(142, 142, 245, 0.13)',
    accentText: '#b4b4fa',
    success: '#3dd68c',
    successSoft: 'rgba(61, 214, 140, 0.12)',
    warning: '#f5a524',
    warningSoft: 'rgba(245, 165, 36, 0.12)',
    danger: '#ff6369',
    dangerSoft: 'rgba(255, 99, 105, 0.12)',
    shadowXs: '0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
    shadowPanel: '0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.5)',
    shadowOverlay:
      '0 0 0 1px rgba(255, 255, 255, 0.08), 0 16px 40px -8px rgba(0, 0, 0, 0.7), 0 4px 12px -4px rgba(0, 0, 0, 0.5)',
    focusRing: '0 0 0 3px rgba(142, 142, 245, 0.25)',
    brandFrom: '#52525b',
    brandTo: '#1c1c1f',
    onBrand: '#ffffff',
  },
};

const fontSans =
  "'Geist Variable', 'Geist', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const fontMono =
  "'Geist Mono Variable', 'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

/** palette → `--hg-*` CSS 变量（驼峰转短横线），由 ThemeProvider 挂到 <html> */
export function paletteCssVars(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {
    '--hg-font-sans': fontSans,
    '--hg-font-mono': fontMono,
  };
  for (const [key, value] of Object.entries(p)) {
    vars[`--hg-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
  }
  return vars;
}

function buildTheme(mode: ThemeMode): ThemeConfig {
  const p = palettes[mode];
  return {
    cssVar: { key: 'hgxt' },
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      // 品牌 / 强调
      colorPrimary: p.accent,
      colorInfo: p.accent,
      colorLink: p.accentText,
      colorLinkHover: p.accent,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.danger,

      // 表面分层
      colorBgLayout: p.canvas,
      colorBgContainer: p.panel,
      colorBgElevated: p.elevated,
      colorBgSpotlight: mode === 'dark' ? p.fillStrong : p.ink,
      colorBgMask: mode === 'dark' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(9, 9, 11, 0.32)',
      colorFillQuaternary: p.subtle,
      colorFillTertiary: p.fill,
      colorFillSecondary: p.fillHover,
      colorFill: p.fillStrong,
      colorBgTextHover: p.fill,
      colorBgTextActive: p.fillHover,
      controlItemBgHover: p.fill,
      controlItemBgActive: p.accentSoft,
      controlItemBgActiveHover: p.accentSoft,

      // 边框与文本
      colorBorder: p.border,
      colorBorderSecondary: p.hairline,
      colorSplit: p.hairline,
      colorText: p.text,
      colorTextHeading: p.text,
      colorTextSecondary: p.text2,
      colorTextTertiary: p.text3,
      colorTextQuaternary: p.text4,
      colorTextPlaceholder: p.text4,
      colorTextDescription: p.text3,

      // 字体与字号（--ui-font-size 默认 14）
      fontFamily: fontSans,
      fontFamilyCode: fontMono,
      fontSize: 14,
      fontSizeSM: 12,
      fontSizeLG: 16,
      fontSizeHeading1: 24,
      fontSizeHeading2: 20,
      fontSizeHeading3: 18,
      fontSizeHeading4: 16,
      fontSizeHeading5: 14,

      // 圆角层级：面板/卡片 12 → 控件 8 → 嵌套 6
      borderRadius: 8,
      borderRadiusLG: 12,
      borderRadiusSM: 6,
      borderRadiusXS: 4,

      controlHeight: 32,
      controlHeightSM: 28,
      controlHeightLG: 40,
      controlOutline: p.accentSoft,
      controlOutlineWidth: 3,
      lineWidthFocus: 2,

      boxShadow: p.shadowOverlay,
      boxShadowSecondary: p.shadowOverlay,
      boxShadowTertiary: p.shadowXs,

      motionDurationFast: '0.1s',
      motionDurationMid: '0.16s',
      motionDurationSlow: '0.22s',
      motionEaseInOut: 'cubic-bezier(0.32, 0.72, 0, 1)',
      motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
    components: {
      Layout: {
        bodyBg: p.canvas,
        siderBg: 'transparent',
        headerBg: 'transparent',
        headerHeight: 52,
        headerPadding: '0 20px',
      },
      Button: {
        // 主按钮 = 墨色（强调色留给焦点/选中/链接）
        colorPrimary: p.ink,
        colorPrimaryHover: p.inkHover,
        colorPrimaryActive: p.inkActive,
        primaryColor: p.onInk,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        defaultBorderColor: p.border,
        defaultHoverBorderColor: p.borderHover,
        defaultHoverColor: p.text,
        defaultHoverBg: p.subtle,
        defaultActiveBorderColor: p.borderHover,
        defaultActiveColor: p.text,
        textHoverBg: p.fill,
        fontWeight: 500,
        paddingInline: 14,
      },
      Input: {
        activeBorderColor: p.accent,
        hoverBorderColor: p.borderHover,
        activeShadow: p.focusRing,
        paddingInline: 10,
      },
      InputNumber: {
        activeBorderColor: p.accent,
        hoverBorderColor: p.borderHover,
        activeShadow: p.focusRing,
      },
      Select: {
        activeBorderColor: p.accent,
        hoverBorderColor: p.borderHover,
        activeOutlineColor: p.accentSoft,
        optionSelectedBg: p.fill,
        optionSelectedFontWeight: 500,
        optionActiveBg: p.fill,
      },
      Form: {
        itemMarginBottom: 18,
        verticalLabelPadding: '0 0 6px',
        labelColor: p.text2,
      },
      Card: {
        paddingLG: 20,
        colorBorderSecondary: p.hairline,
      },
      Table: {
        headerBg: 'transparent',
        headerColor: p.text3,
        headerSplitColor: 'transparent',
        headerBorderRadius: 0,
        borderColor: p.hairline,
        rowHoverBg: p.subtle,
        rowSelectedBg: p.subtle,
        cellPaddingBlock: 14,
        cellPaddingInline: 16,
        footerBg: 'transparent',
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemHeight: 34,
        itemMarginInline: 0,
        itemMarginBlock: 2,
        itemPaddingInline: 10,
        itemBorderRadius: 8,
        itemColor: p.text2,
        itemHoverColor: p.text,
        itemHoverBg: p.fillHover,
        itemActiveBg: p.fillStrong,
        itemSelectedBg: p.panel,
        itemSelectedColor: p.text,
        groupTitleColor: p.text3,
        groupTitleFontSize: 12,
        iconSize: 16,
        iconMarginInlineEnd: 10,
        activeBarBorderWidth: 0,
        activeBarWidth: 0,
      },
      Dropdown: {
        paddingBlock: 6,
        controlItemBgHover: p.fill,
      },
      Modal: {
        borderRadiusLG: 16,
        contentBg: p.elevated,
        headerBg: p.elevated,
        titleFontSize: 16,
      },
      Popover: {
        borderRadiusLG: 12,
      },
      Tag: {
        defaultBg: p.fill,
        defaultColor: p.text2,
      },
      Pagination: {
        itemActiveBg: p.fill,
        itemBg: 'transparent',
      },
      Tooltip: {
        colorTextLightSolid: mode === 'dark' ? p.text : p.onInk,
      },
      Message: {
        contentPadding: '8px 14px',
      },
      Segmented: {
        itemSelectedBg: p.panel,
        trackBg: p.fill,
      },
    },
  };
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
