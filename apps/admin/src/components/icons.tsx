/**
 * HGXT 图标集 —— 全站唯一的图标来源（不再使用 @ant-design/icons）
 *
 * 规格：24 网格、1.75 描边、圆头圆角、currentColor、尺寸 1em（随所在文字缩放）。
 * 新增图标时保持同一网格与描边，别混用其他图标库。
 */
import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** 可访问名称；不传则视为装饰性图标（aria-hidden） */
  title?: string;
};

function createIcon(displayName: string, body: ReactNode) {
  function Icon({ title, className, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        className={className ? `hg-icon ${className}` : 'hg-icon'}
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {body}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

/* ---------- 导航 ---------- */

export const HomeIcon = createIcon(
  'HomeIcon',
  <>
    <path d="M4 10.2 12 4l8 6.2V18.5a1.5 1.5 0 0 1-1.5 1.5H15v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5H5.5A1.5 1.5 0 0 1 4 18.5z" />
  </>,
);

export const FormsIcon = createIcon(
  'FormsIcon',
  <>
    <rect x="4.75" y="4" width="14.5" height="17" rx="3" />
    <rect x="8.75" y="2.5" width="6.5" height="3.5" rx="1.25" />
    <path d="M8.75 11h6.5M8.75 15h4" />
  </>,
);

export const UsersIcon = createIcon(
  'UsersIcon',
  <>
    <circle cx="9.25" cy="8.25" r="3.5" />
    <path d="M3 19.5c.6-3 3.1-4.9 6.25-4.9s5.65 1.9 6.25 4.9" />
    <path d="M15.25 4.9a3.4 3.4 0 0 1 0 6.7M17.6 14.9c1.8.6 3 2.2 3.4 4.6" />
  </>,
);

/* ---------- 壳层 ---------- */

export const SunIcon = createIcon(
  'SunIcon',
  <>
    <circle cx="12" cy="12" r="3.75" />
    <path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5M5.46 5.46l1.06 1.06M17.48 17.48l1.06 1.06M5.46 18.54l1.06-1.06M17.48 6.52l1.06-1.06" />
  </>,
);

export const MoonIcon = createIcon(
  'MoonIcon',
  <path d="M19.8 14.6A8 8 0 0 1 9.4 4.2a8 8 0 1 0 10.4 10.4z" />,
);

export const ChevronsUpDownIcon = createIcon(
  'ChevronsUpDownIcon',
  <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" />,
);

export const PanelLeftIcon = createIcon(
  'PanelLeftIcon',
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9.5 4.5v15" />
  </>,
);

export const ChevronRightIcon = createIcon('ChevronRightIcon', <path d="M9.5 6l6 6-6 6" />);

export const LogoutIcon = createIcon(
  'LogoutIcon',
  <>
    <path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10" />
    <path d="M15 8l4 4-4 4M19 12H9.5" />
  </>,
);

/* ---------- 通用操作 ---------- */

export const SearchIcon = createIcon(
  'SearchIcon',
  <>
    <circle cx="11" cy="11" r="6.25" />
    <path d="M20 20l-4.5-4.5" />
  </>,
);

export const PlusIcon = createIcon('PlusIcon', <path d="M12 5v14M5 12h14" />);

export const CheckIcon = createIcon('CheckIcon', <path d="M5 12.5l4.5 4.5L19 7.5" />);

export const XIcon = createIcon('XIcon', <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);

export const ArrowLeftIcon = createIcon('ArrowLeftIcon', <path d="M19 12H5M11 6l-6 6 6 6" />);

export const ArrowRightIcon = createIcon('ArrowRightIcon', <path d="M5 12h14M13 6l6 6-6 6" />);

export const MoreIcon = createIcon(
  'MoreIcon',
  <g fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18.5" cy="12" r="1.5" />
  </g>,
);

export const RefreshIcon = createIcon(
  'RefreshIcon',
  <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3l2.2 2.2M19.5 4.5v4.4h-4.4" />,
);

export const DownloadIcon = createIcon(
  'DownloadIcon',
  <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
);

export const TrashIcon = createIcon(
  'TrashIcon',
  <path d="M4.5 7h15M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7M10.5 11v5M13.5 11v5" />,
);

export const UndoIcon = createIcon(
  'UndoIcon',
  <path d="M9 14.5 4.5 10 9 5.5M4.5 10h10a5 5 0 0 1 0 10H11" />,
);

export const SaveIcon = createIcon(
  'SaveIcon',
  <path d="M5 6.5a2 2 0 0 1 2-2h8.2a2 2 0 0 1 1.4.6l2.3 2.3a2 2 0 0 1 .6 1.4v8.7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8.5 4.5v3.5h6V4.5M8 19.5v-5h8v5" />,
);

export const PencilIcon = createIcon(
  'PencilIcon',
  <path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5zM13.5 7.5l3 3" />,
);

export const PenLineIcon = createIcon(
  'PenLineIcon',
  <path d="M13 20h7M4.5 16.3 14.8 6a2 2 0 0 1 2.9 2.9L7.4 19.2l-3.9 1z" />,
);

export const KeyIcon = createIcon(
  'KeyIcon',
  <>
    <circle cx="8" cy="15.5" r="3.75" />
    <path d="M10.7 12.8 19 4.5M16.2 7.3l2.5 2.5M13.7 9.8l1.6 1.6" />
  </>,
);

export const BanIcon = createIcon(
  'BanIcon',
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M6.4 6.4l11.2 11.2" />
  </>,
);

export const UserCheckIcon = createIcon(
  'UserCheckIcon',
  <>
    <circle cx="10" cy="8" r="3.75" />
    <path d="M3.5 19.5c.8-3.3 3.4-5 6.5-5 1.3 0 2.5.3 3.5.8M15 17.5l2 2 4-4" />
  </>,
);

export const EyeIcon = createIcon(
  'EyeIcon',
  <>
    <path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12z" />
    <circle cx="12" cy="12" r="2.75" />
  </>,
);

export const TableIcon = createIcon(
  'TableIcon',
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
  </>,
);

/* ---------- 表单 / 字段 ---------- */

export const UserIcon = createIcon(
  'UserIcon',
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" />
  </>,
);

export const LockIcon = createIcon(
  'LockIcon',
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3" />
    <path d="M12 14.75v1.5" />
  </>,
);

export const CalendarIcon = createIcon(
  'CalendarIcon',
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>,
);

export const PauseCircleIcon = createIcon(
  'PauseCircleIcon',
  <>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M10 9.5v5M14 9.5v5" />
  </>,
);

export const HistoryIcon = createIcon(
  'HistoryIcon',
  <>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9M4.5 4.5v4.4h4.4" />
    <path d="M12 8.5V12l2.5 1.5" />
  </>,
);

/* ---------- 状态插画 ---------- */

export const InboxIcon = createIcon(
  'InboxIcon',
  <path d="M3.5 13.5 6.2 6a2 2 0 0 1 1.9-1.5h7.8a2 2 0 0 1 1.9 1.5l2.7 7.5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" />,
);

export const WifiOffIcon = createIcon(
  'WifiOffIcon',
  <>
    <path d="M2.5 8.8A14 14 0 0 1 6 6.6M10 5.2a14 14 0 0 1 11.5 3.6M5.5 12.3a9 9 0 0 1 3.4-2M14 10.2a9 9 0 0 1 4.5 2.1M8.8 15.6a4.5 4.5 0 0 1 6.4 0M3.5 3.5l17 17" />
    <circle cx="12" cy="19" r="0.6" fill="currentColor" />
  </>,
);

export const ShieldIcon = createIcon(
  'ShieldIcon',
  <>
    <path d="M12 3.5 5 6.2v5.3c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6.2z" />
    <path d="M12 9v4M12 16v.01" />
  </>,
);

export const FileSearchIcon = createIcon(
  'FileSearchIcon',
  <>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h4M13.5 3.5l5 5M13.5 3.5v5h5M18.5 8.5V11" />
    <circle cx="16" cy="16" r="2.75" />
    <path d="M18 18l2 2" />
  </>,
);
