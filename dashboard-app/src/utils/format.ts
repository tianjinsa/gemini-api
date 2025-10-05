import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

import 'dayjs/locale/zh-cn';

dayjs.extend(relativeTime);
dayjs.extend(duration);
dayjs.locale('zh-cn');

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes)) return '0 B';
  const absValue = Math.abs(bytes);
  if (absValue === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log10(absValue) / 3), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : fractionDigits)} ${BYTE_UNITS[exponent]}`;
}

export function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('zh-CN').format(num);
}

export function formatDateTime(ts: number | string | Date): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}

export function formatRelative(ts: number | string | Date): string {
  return dayjs(ts).fromNow();
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds <= 0) return '0秒';
  const d = dayjs.duration(milliseconds);
  const parts: string[] = [];

  if (d.days()) parts.push(`${d.days()}天`);
  if (d.hours()) parts.push(`${d.hours()}小时`);
  if (d.minutes()) parts.push(`${d.minutes()}分`);
  const seconds = d.seconds();
  if (seconds || parts.length === 0) {
    parts.push(`${seconds}秒`);
  }

  return parts.join('');
}

export function formatTimestampOrDash(value?: number | null): string {
  if (!value) return '—';
  return formatDateTime(value);
}
