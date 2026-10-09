/**
 * User-Agent 极简解析：只服务访问监控的两个展示位——设备（电脑/手机）
 * 与客户端摘要（如 "Chrome 129 · Windows"）。不引第三方库，规则宁缺毋滥：
 * 认不出的浏览器/系统就显示类别名，绝不显示 "undefined"。
 */
import type { MonitorDevice } from '@hgxt/shared';

export interface UaInfo {
  device: MonitorDevice;
  /** "Chrome 129 · Windows" 形式的摘要；识别不到为 null */
  client: string | null;
}

function detectBrowser(ua: string): string | null {
  // 顺序敏感：Edg 必须在 Chrome 之前（Edge 的 UA 同时含两者），Miui 浏览器同理
  const patterns: Array<[RegExp, string]> = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
    [/YaBrowser\/([\d.]+)/, 'Yandex'],
    [/MiuiBrowser\/([\d.]+)/, '小米浏览器'],
    [/HuaweiBrowser\/([\d.]+)/, '华为浏览器'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
    [/wxwork\/([\d.]+)/, '企业微信'],
    [/MicroMessenger\/([\d.]+)/, '微信'],
  ];
  // 企业微信内置浏览器同时含 Chrome 与 MicroMessenger/wxwork，优先识别微信系
  const wxPatterns: Array<[RegExp, string]> = [
    [/wxwork\/([\d.]+)/, '企业微信'],
    [/MicroMessenger\/([\d.]+)/, '微信'],
  ];
  for (const [re, name] of [...wxPatterns, ...patterns]) {
    const match = ua.match(re);
    if (match) return `${name} ${match[1].split('.')[0]}`;
  }
  return null;
}

function detectOs(ua: string): string | null {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/(iPhone|iPad|iPod)/.test(ua)) return 'iOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

export function parseUserAgent(ua: string | undefined): UaInfo {
  const source = ua ?? '';
  const device: MonitorDevice = /Mobile|Android|iPhone|iPad|iPod|HarmonyOS/i.test(source)
    ? 'mobile'
    : 'desktop';
  const browser = detectBrowser(source);
  const os = detectOs(source);
  const client = [browser, os].filter(Boolean).join(' · ') || null;
  return { device, client };
}
