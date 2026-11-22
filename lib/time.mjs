/**
 * Local time helpers of the calendar plugin.
 *
 * Everything the person sees is in the local time zone: a day starts at local
 * midnight, a week starts on Monday. Stored timestamps are ISO strings in UTC,
 * so the data file does not depend on the machine's zone and the conversion
 * happens exactly once, on the way in and on the way out.
 */

/** One day in milliseconds (a fixed arithmetic day, not a local one). */
export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Turn a Date, a timestamp or an ISO string into a Date; anything unreadable
 * falls back to the current moment.
 * @param value - Date, number or string.
 * @returns a fresh Date.
 */
export function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date() : new Date(value.getTime())
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string' && value !== '') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed)
  }
  return new Date()
}

/** Two-digit zero padding. */
export function pad2(value) {
  return String(value).padStart(2, '0')
}

/** Local date key `YYYY-MM-DD` of a moment. */
export function dateKey(value) {
  const date = asDate(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local clock `HH:MM` of a moment. */
export function timeKey(value) {
  const date = asDate(value)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Parse a local date key.
 * @param value - `YYYY-MM-DD`.
 * @returns local midnight, or `undefined` when the value is not a real date.
 */
export function parseDateKey(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date
}

/**
 * Parse a local clock value.
 * @param value - `HH:MM` (one-digit hour is accepted too).
 * @returns `{ hours, minutes }`, or `undefined` when the value is not a time.
 */
export function parseTimeKey(value) {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return { hours, minutes }
}

/** Local midnight of the day containing a moment. */
export function startOfDay(value) {
  const date = asDate(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

/** Local midnight of the next day. */
export function nextDay(value) {
  const start = startOfDay(value)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0)
}

/**
 * Shift a moment by whole local days.
 * @param value - source moment.
 * @param days - how many days to add (negative goes back).
 * @returns a new Date with the same local clock.
 */
export function addDays(value, days) {
  const date = asDate(value)
  const result = new Date(date.getTime())
  result.setDate(result.getDate() + Math.trunc(days))
  return result
}

/** Local Monday 00:00 of the week containing a moment. */
export function startOfWeek(value) {
  const start = startOfDay(value)
  const shift = (start.getDay() + 6) % 7
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - shift, 0, 0, 0, 0)
}

/**
 * The half-open interval `[from, to)` of a report range.
 * @param range - `today` or `week`.
 * @param now - the moment the report is built for.
 * @returns `{ range, from, to }` as Dates.
 */
export function timeRange(range, now) {
  const date = asDate(now)
  if (range === 'week') {
    const from = startOfWeek(date)
    return { range: 'week', from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7, 0, 0, 0, 0) }
  }
  const from = startOfDay(date)
  return { range: 'today', from, to: nextDay(date) }
}

/**
 * Whether a moment falls inside a half-open interval.
 * @param value - moment to test.
 * @param from - inclusive start.
 * @param to - exclusive end.
 * @returns true when `from <= value < to`.
 */
export function inRange(value, from, to) {
  const time = asDate(value).getTime()
  return time >= from.getTime() && time < to.getTime()
}

/**
 * Build the ISO start of an event from a date key, a time key and a fallback.
 * @param dateValue - `YYYY-MM-DD`, optional.
 * @param timeValue - `HH:MM`, optional.
 * @param now - the current moment, for missing parts.
 * @returns ISO string.
 */
export function combineLocal(dateValue, timeValue, now) {
  const current = asDate(now)
  const date = parseDateKey(dateValue) ?? startOfDay(current)
  const time = parseTimeKey(timeValue)
  if (time === undefined) {
    date.setHours(current.getHours(), current.getMinutes(), 0, 0)
  } else {
    date.setHours(time.hours, time.minutes, 0, 0)
  }
  return date.toISOString()
}

/**
 * Human duration in Russian for tool and page texts.
 * @param totalSec - duration in seconds.
 * @returns `0 мин`, `< 1 мин`, `25 мин`, `1 ч 05 мин`, `2 ч`.
 */
export function formatDuration(totalSec) {
  const seconds = Math.max(0, Math.round(Number(totalSec) || 0))
  if (seconds < 60) return seconds === 0 ? '0 мин' : '< 1 мин'
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${minutes} мин`
  if (rest === 0) return `${hours} ч`
  return `${hours} ч ${pad2(rest)} мин`
}

/**
 * Countdown text `MM:SS`, or `H:MM:SS` past an hour.
 * @param totalSec - remaining or elapsed seconds.
 * @returns the clock-like text.
 */
export function formatCountdown(totalSec) {
  const seconds = Math.max(0, Math.round(Number(totalSec) || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(rest)}`
  return `${pad2(minutes)}:${pad2(rest)}`
}

/** Short local date `DD.MM`. */
export function formatShortDate(value) {
  const date = asDate(value)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`
}

/** Local date and time `DD.MM HH:MM`. */
export function formatDateTime(value) {
  return `${formatShortDate(value)} ${timeKey(value)}`
}
