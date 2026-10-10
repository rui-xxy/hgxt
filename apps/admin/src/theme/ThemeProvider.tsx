import { flushSync } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { darkTheme, lightTheme, sulfuricControlPalette } from './tokens';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'hgxt:theme-mode';

interface ThemeModeContextValue {
  mode: ThemeMode;
  /** 单击切换浅色 / 深色，并持久化选择 */
  toggleMode: (origin?: { x: number; y: number }) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function getInitialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // 兼容旧的 system 值与首次访问：只在初始化时读取系统偏好，之后由用户一键切换。
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 主题：只保留浅色 / 深色，一键切换并持久化到 localStorage */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  const toggleMode = useCallback((origin?: { x: number; y: number }) => {
    const next: ThemeMode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEY, next);
    const apply = () => {
      document.documentElement.dataset.theme = next;
      flushSync(() => setMode(next));
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) {
      apply();
      return;
    }
    // 从点击处圆形扩散切换（样式见 styles/global.css）
    const root = document.documentElement;
    root.style.setProperty('--vt-x', `${origin?.x ?? window.innerWidth / 2}px`);
    root.style.setProperty('--vt-y', `${origin?.y ?? window.innerHeight / 2}px`);
    document.startViewTransition(apply);
  }, []);

  // 自定义 CSS 的配色变量（styles/global.css）随 data-theme 切换
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    for (const [name, value] of Object.entries(sulfuricControlPalette[mode])) root.style.setProperty(`--hg-sc-${name}`, value);
  }, [mode]);

  const themeConfig = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ConfigProvider locale={zhCN} theme={themeConfig} button={{ autoInsertSpace: false }}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode 必须在 ThemeProvider 内使用');
  return context;
}
