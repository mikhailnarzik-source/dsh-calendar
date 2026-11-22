/**
 * Time reports: the sum of the time log and a breakdown by label.
 *
 * A range is half-open `[from, to)` in local time: today is local midnight to
 * the next midnight, a week starts on Monday. A record belongs to the range by
 * its end, so a session that started before midnight is counted on the day it
 * finished.
 */

import { timeRange } from './time.mjs'

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
  return { ...scoped, ...summarize(scoped.entries) }
}

/**
 * Report without the entries: what the page and the agent usually need.
 * @param state - current state.
 * @param range - `today` or `week`.
 * @param now - the moment the report is built for.
 * @returns `{ range, from, to, totalSec, count, byLabel }`.
 */
export function summaryFor(state, range, now) {
  const scoped = entriesInRange(state, range, now)
  const { totalSec, count, byLabel } = summarize(scoped.entries)
  return { range: scoped.range, from: scoped.from, to: scoped.to, totalSec, count, byLabel }
}
