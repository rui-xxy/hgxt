import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { InboxIcon, XIcon } from '../components/icons';
import { StatusView } from '../components/StatusView';
import { darkTheme, lightTheme, paletteCssVars, palettes, type ThemeMode } from './tokens';

export type { ThemeMode };

const STORAGE_KEY = 'hgxt:theme-mode';

/** 切换动画的圆心（通常是切换按钮中心）；不传则从视口右上角展开 */
export interface ThemeToggleOrigin {
  x: number;
  y: number;
}

interface ThemeModeContextValue {
  mode: ThemeMode;
  /** 单击切换浅色 / 深色，并持久化选择 */
  toggleMode: (origin?: ThemeToggleOrigin) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readStoredMode(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function getInitialMode(): ThemeMode {
  // 兼容旧的 system 值与首次访问：只在初始化时读取系统偏好，之后由用户一键切换。
  return readStoredMode() ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

/** 把当前主题的 `--hg-*` 变量、color-scheme 与 data-theme 写到 <html>，body 等组件树外元素也能引用 */
function applyDocumentTheme(mode: ThemeMode) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(paletteCssVars(palettes[mode]))) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', palettes[mode].canvas);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** 主题：只保留浅色 / 深色，一键切换（圆形展开过渡）并持久化到 localStorage */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);
  // toggleMode 保持稳定引用，通过 ref 读取最新模式（在 layout effect 中同步，不在渲染期写 ref）
  const modeRef = useRef(mode);

  useLayoutEffect(() => {
    modeRef.current = mode;
    applyDocumentTheme(mode);
  }, [mode]);

  const toggleMode = useCallback((origin?: ThemeToggleOrigin) => {
    const next: ThemeMode = modeRef.current === 'dark' ? 'light' : 'dark';
    const commit = () => {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // 隐私模式等场景下存储不可用：本次会话内仍然切换
      }
      flushSync(() => setMode(next));
    };

    // 切换期间关闭所有 CSS 过渡：否则组件各自的背景渐变会被截进新快照（出现半深半浅的块）
    const root = document.documentElement;
    root.classList.add('hg-theme-switching');
    const release = () => root.classList.remove('hg-theme-switching');

    if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
      commit();
      requestAnimationFrame(() => requestAnimationFrame(release));
      return;
    }

    const x = origin?.x ?? window.innerWidth;
    const y = origin?.y ?? 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(commit);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {
        // 过渡被跳过（如标签页不可见）时主题已切换，无需处理
      });
    transition.finished.finally(release);
  }, []);

  const themeConfig = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ConfigProvider
        locale={zhCN}
        theme={themeConfig}
        button={{ autoInsertSpace: false }}
        modal={{ closeIcon: <XIcon /> }}
        drawer={{ closeIcon: <XIcon /> }}
        renderEmpty={() => <StatusView compact icon={<InboxIcon />} title="暂无数据" />}
      >
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
