/**
 * ============================================================================
 * FORM Core — Чистые функции работы с датами (без сдвигов часовых поясов)
 * ============================================================================
 * Все даты сессий хранятся строкой формата 'YYYY-MM-DD' в локальном календаре.
 * Использование new Date('YYYY-MM-DD') в JS парсит дату в UTC-полночь, что ломает
 * расчёт начала недели в отрицательных часовых поясах (например UTC-8).
 * Здесь все даты парсятся строго в локальный календарь.
 */

export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateLocal(dateStr?: string | null, hour: number = 12): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d, hour, 0, 0, 0);
  // Проверка валидности даты (например, 2026-02-31 не должна молча перескочить на март)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

/**
 * Возвращает локальный понедельник 00:00:00 для указанной даты.
 */
export function getStartOfIsoWeekLocal(referenceDate: Date): Date {
  const dayOfWeekMon0 = (referenceDate.getDay() + 6) % 7; // 0 = Пн, 6 = Вс
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - dayOfWeekMon0,
    0,
    0,
    0,
    0
  );
  return start;
}

/**
 * Возвращает локальное воскресенье 23:59:59.999 для указанной даты.
 */
export function getEndOfIsoWeekLocal(referenceDate: Date): Date {
  const start = getStartOfIsoWeekLocal(referenceDate);
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
    23,
    59,
    59,
    999
  );
}

/**
 * Проверяет, попадает ли строка 'YYYY-MM-DD' в текущую календарную неделю (Пн–Вс).
 */
export function isIsoDateInCurrentWeek(dateStr: string, referenceNow: Date): boolean {
  const parsed = parseIsoDateLocal(dateStr, 12);
  if (!parsed) return false;
  const weekStart = getStartOfIsoWeekLocal(referenceNow);
  const weekEnd = getEndOfIsoWeekLocal(referenceNow);
  return parsed >= weekStart && parsed <= weekEnd;
}

/**
 * Разница в полных календарных днях между 'YYYY-MM-DD' и referenceNow (положительная = в прошлом).
 */
export function getCalendarDaysAgo(dateStr: string, referenceNow: Date): number | null {
  const parsed = parseIsoDateLocal(dateStr, 0);
  if (!parsed) return null;
  const todayMidnight = new Date(
    referenceNow.getFullYear(),
    referenceNow.getMonth(),
    referenceNow.getDate(),
    0,
    0,
    0,
    0
  );
  const diffMs = todayMidnight.getTime() - parsed.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
