/**
 * Time reports: the sum of the time log and a breakdown by label.
 *
 * A range is half-open `[from, to)` in local time: today is local midnight to
 * the next midnight, a week starts on Monday. A record belongs to the range by
 * its end, so a session that started before midnight is counted on the day it
 * finished.
 */

import { dateKey, timeRange } from './time.mjs'

/** Local Monday 00:00 of the week containing a moment. */
function weekStart(now) {
  const date = new Date(now.getTime())
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const shift = (start.getDay() + 6) % 7
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() - shift)
}

/**
 * Seconds of the log per local weekday of the current week, Monday first.
 *
 * This is what the mini bar chart of the page draws. It always covers the whole
 * current week, even when the report itself is scoped to today, so the chart
 * keeps a stable «неделя» context. A record belongs to the day it ended on, like
 * everywhere else in the report.
 *
 * @param state - current state.
 * @param now - the moment the buckets are built for.
 * @returns seven buckets `{ date, weekday, durationSec, isToday }`, Monday first.
 */
export function weekDayBuckets(state, now) {
  const from = weekStart(now)
  const buckets = []
  const indexByDate = new Map()
  const today = dateKey(now)
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + index)
    const key = dateKey(day)
    indexByDate.set(key, index)
    buckets.push({ date: key, weekday: index, durationSec: 0, isToday: key === today })
  }
  const log = Array.isArray(state?.log) ? state.log : []
  for (const entry of log) {
    const endedMs = Date.parse(entry.endedAt)
    if (!Number.isFinite(endedMs)) continue
    const index = indexByDate.get(dateKey(new Date(endedMs)))
    if (index === undefined) continue
    buckets[index].durationSec += Math.max(0, Math.round(Number(entry.durationSec) || 0))
  }
  return buckets
}

/**
 * Sum a list of time records.
 * @param entries - stored log records.
 * @returns `{ totalSec, count, byLabel }`, labels sorted by time spent.
 */
export function summarize(entries) {
  const byLabel = new Map()
  let totalSec = 0
  for (const entry of entries) {
    const seconds = Math.max(0, Math.round(Number(entry.durationSec) || 0))
    totalSec += seconds
    const label = typeof entry.label === 'string' && entry.label !== '' ? entry.label : '—'
    const row = byLabel.get(label) ?? { label, durationSec: 0, count: 0 }
    row.durationSec += seconds
    row.count += 1
    byLabel.set(label, row)
  }
  const labels = [...byLabel.values()]
    .sort((left, right) => right.durationSec - left.durationSec || left.label.localeCompare(right.label))
    .map(row => ({ ...row, share: totalSec === 0 ? 0 : row.durationSec / totalSec }))
  return { totalSec, count: entries.length, byLabel: labels }
}

/**
 * Records of one range, oldest first.
 * @param state - current state.
 * @param range - `today` or `week`.
 * @param now - the moment the report is built for.
 * @returns `{ range, from, to, entries }` with ISO bounds.
 */
export function entriesInRange(state, range, now) {
  const normalized = range === 'week' ? 'week' : 'today'
  const { from, to } = timeRange(normalized, now)
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const log = Array.isArray(state?.log) ? state.log : []
  const entries = log
    .filter(entry => {
      const endedMs = Date.parse(entry.endedAt)
      return Number.isFinite(endedMs) && endedMs >= fromMs && endedMs < toMs
    })
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  return { range: normalized, from: from.toISOString(), to: to.toISOString(), entries }
}

/**
 * Full report of one range.
 * @param state - current state.
 * @param range - `today` or `week`.
 * @param now - the moment the report is built for.
 * @returns `{ range, from, to, entries, totalSec, count, byLabel }`.
 */
export function reportFor(state, range, now) {
  const scoped = entriesInRange(state, range, now)
  return { ...scoped, ...summarize(scoped.entries), days: weekDayBuckets(state, now) }
}

/**
 * Report without the entries: what the page and the agent usually need.
 * @param state - current state.
 * @param range - `today` or `week`.
 * @param now - the moment the report is built for.
 * @returns `{ range, from, to, totalSec, count, byLabel, days }`; `days` are the
 *   seven weekday buckets of the current week, Monday first.
 */
export function summaryFor(state, range, now) {
  const scoped = entriesInRange(state, range, now)
  const { totalSec, count, byLabel } = summarize(scoped.entries)
  return { range: scoped.range, from: scoped.from, to: scoped.to, totalSec, count, byLabel, days: weekDayBuckets(state, now) }
}
