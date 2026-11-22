import { test } from 'node:test'
import assert from 'node:assert/strict'

import { appendLog, addManualLog, emptyState } from '../lib/storage.mjs'
import { entriesInRange, reportFor, summarize, summaryFor } from '../lib/reports.mjs'
import { localMoment } from './helpers.mjs'

/** Wednesday inside the week of Monday 2026-01-12. */
const NOW = localMoment({ year: 2026, month: 1, day: 14, hours: 16, minutes: 0 })

/** Build the time log used by the range tests. */
function stateWithLog() {
  let state = emptyState()
  const records = [
    // The week before: never counted.
    { label: 'Старое', endedAt: localMoment({ year: 2026, month: 1, day: 11, hours: 23 }).toISOString(), durationSec: 600 },
    // Monday of the current week.
    { label: 'Работа', endedAt: localMoment({ year: 2026, month: 1, day: 12, hours: 10 }).toISOString(), durationSec: 3600 },
    // Today.
    { label: 'Созвон', endedAt: localMoment({ year: 2026, month: 1, day: 14, hours: 9 }).toISOString(), durationSec: 1800 },
    { label: 'Работа', endedAt: localMoment({ year: 2026, month: 1, day: 14, hours: 15 }).toISOString(), durationSec: 1200 },
  ]
  for (const record of records) {
    state = appendLog(state, { ...record, startedAt: new Date(Date.parse(record.endedAt) - record.durationSec * 1000).toISOString(), source: 'timer' }).state
  }
  return state
}

test('отчёты: пустой журнал', () => {
  const summary = summarize([])
  assert.equal(summary.totalSec, 0)
  assert.equal(summary.count, 0)
  assert.deepEqual(summary.byLabel, [])
  const report = summaryFor(emptyState(), 'today', NOW)
  assert.equal(report.totalSec, 0)
  assert.equal(report.range, 'today')
  assert.deepEqual(report.byLabel, [])
})

test('отчёты: сегодня — сумма и разбивка по меткам', () => {
  const state = stateWithLog()
  const today = summaryFor(state, 'today', NOW)
  assert.equal(today.range, 'today')
  assert.equal(today.totalSec, 3000)
  assert.equal(today.count, 2)
  assert.equal(today.byLabel.length, 2)
  assert.equal(today.byLabel[0].label, 'Созвон')
  assert.equal(today.byLabel[0].durationSec, 1800)
  assert.equal(today.byLabel[1].label, 'Работа')
  assert.equal(today.byLabel[1].durationSec, 1200)
  assert.equal(today.byLabel[0].count, 1)
  assert.ok(Math.abs(today.byLabel[0].share - 0.6) < 1e-9)
  const full = reportFor(state, 'today', NOW)
  assert.equal(full.entries.length, 2)
  assert.equal(full.entries[0].label, 'Созвон')
  assert.equal('entries' in today, false, 'summaryFor не тащит записи')
})

test('отчёты: неделя начинается с понедельника и не берёт прошлую', () => {
  const state = stateWithLog()
  const week = summaryFor(state, 'week', NOW)
  assert.equal(week.range, 'week')
  assert.equal(week.count, 3)
  assert.equal(week.totalSec, 3600 + 1800 + 1200)
  // Wednesday's «Созвон» ends before «Работа»: the label sum wins over order.
  assert.equal(week.byLabel[0].label, 'Работа')
  assert.equal(week.byLabel[0].durationSec, 4800)
  assert.equal(week.byLabel[1].label, 'Созвон')
  assert.deepEqual(week.byLabel.map(row => row.label).sort(), ['Работа', 'Созвон'])
  const scoped = entriesInRange(state, 'week', NOW)
  assert.equal(scoped.entries[0].label, 'Работа', 'первая запись недели — понедельник')
})

test('отчёты: ручная запись на конкретный день попадает в неделю, но не в сегодня', () => {
  const state = addManualLog(emptyState(), { label: 'Планёрка', durationMin: 45, date: '2026-01-12' }, NOW).state
  const today = summaryFor(state, 'today', NOW)
  assert.equal(today.totalSec, 0)
  const week = summaryFor(state, 'week', NOW)
  assert.equal(week.totalSec, 45 * 60)
  assert.equal(week.byLabel[0].label, 'Планёрка')
})

test('отчёты: границы диапазона — включительно в начале, исключительно в конце', () => {
  let state = emptyState()
  const mondayMidnight = localMoment({ year: 2026, month: 1, day: 12, hours: 0 }).toISOString()
  const nextMondayMidnight = localMoment({ year: 2026, month: 1, day: 19, hours: 0 }).toISOString()
  state = appendLog(state, { label: 'Ровно начало', startedAt: mondayMidnight, endedAt: mondayMidnight, durationSec: 60, source: 'manual' }).state
  state = appendLog(state, { label: 'Ровно конец', startedAt: nextMondayMidnight, endedAt: nextMondayMidnight, durationSec: 60, source: 'manual' }).state
  const week = summaryFor(state, 'week', NOW)
  assert.equal(week.count, 1)
  assert.equal(week.byLabel[0].label, 'Ровно начало')
})

test('отчёты: неизвестный диапазон читается как today', () => {
  const state = stateWithLog()
  const report = summaryFor(state, 'month', NOW)
  assert.equal(report.range, 'today')
  assert.equal(report.totalSec, 3000)
})
