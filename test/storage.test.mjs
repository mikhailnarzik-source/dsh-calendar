import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  DATA_VERSION,
  MAX_ENTRIES,
  addEvent,
  addManualLog,
  appendLog,
  emptyState,
  eventView,
  logView,
  normalizeState,
  readState,
  removeEvent,
  sanitizeEvent,
  toggleEvent,
  writeState,
} from '../lib/storage.mjs'
import { dateKey, timeKey } from '../lib/time.mjs'
import { localMoment, withTempCalendar } from './helpers.mjs'

/** An ISO moment `minutes` after a local base moment. */
function isoAt(base, minutes = 0) {
  return new Date(base.getTime() + minutes * 60_000).toISOString()
}

/** A log record valid for storage. */
function logRecord(label, endedAt, durationSec) {
  return { label, startedAt: endedAt, endedAt, durationSec, source: 'timer' }
}

test('storage: пустое состояние и версия схемы', () => {
  const state = emptyState()
  assert.equal(state.version, DATA_VERSION)
  assert.equal(state.version, 1)
  assert.deepEqual(state.events, [])
  assert.deepEqual(state.log, [])
  assert.equal(state.timer.mode, 'idle')
  assert.deepEqual(normalizeState(null), state)
  assert.deepEqual(normalizeState('broken'), state)
  assert.deepEqual(normalizeState([1, 2]), state)
})

test('storage: миграция старого файла (version 0, items/entries, date+time)', () => {
  const raw = {
    version: 0,
    items: [
      { title: 'Старое событие', date: '2026-01-15', time: '09:30', done: true },
      { title: '', date: '2026-01-15' },
      { title: 'Без даты' },
      null,
    ],
    entries: [
      { label: 'Работа', durationSec: 600, endedAt: '2026-01-15T10:00:00.000Z' },
      { label: 'Сломано', durationSec: -5, endedAt: '2026-01-15T10:00:00.000Z' },
      { label: 'Без конца', durationSec: 600 },
    ],
    timer: { mode: 'work', startedAt: '2026-01-15T09:00:00.000Z', durationMin: 25, label: 'Работа' },
  }
  const state = normalizeState(raw)
  assert.equal(state.version, 1)
  assert.equal(state.events.length, 1)
  assert.equal(state.events[0].title, 'Старое событие')
  assert.equal(dateKey(state.events[0].start), '2026-01-15')
  assert.equal(timeKey(state.events[0].start), '09:30')
  assert.equal(state.events[0].done, true)
  assert.equal(state.log.length, 1)
  assert.equal(state.log[0].label, 'Работа')
  assert.equal(state.log[0].durationSec, 600)
  assert.equal(state.timer.mode, 'work')
  assert.equal(state.timer.durationMin, 25)
})

test('storage: битые записи отбрасываются, а не ломают файл', () => {
  assert.equal(sanitizeEvent(undefined), undefined)
  assert.equal(sanitizeEvent({ title: 'X' }), undefined)
  assert.ok(sanitizeEvent({ title: 'X', start: '2026-01-15T09:00:00.000Z' }) !== undefined)
  const state = normalizeState({
    events: [{ title: 'Живое', start: '2026-01-15T09:00:00.000Z' }, { title: 'Мёртвое' }],
    log: [{ label: 'ok', durationSec: 60, endedAt: '2026-01-15T10:00:00.000Z' }, { label: 'no-end' }],
  })
  assert.equal(state.events.length, 1)
  assert.equal(state.log.length, 1)
})

test('storage: лимит 2000 записей в событиях и журнале', () => {
  const base = localMoment({ year: 2026, month: 1, day: 15 })
  const events = []
  for (let index = 0; index < MAX_ENTRIES + 100; index += 1) {
    events.push({
      id: `ev-${index}`,
      title: `Событие ${index}`,
      start: isoAt(base, index),
      end: isoAt(base, index + 30),
      note: '',
      done: false,
      createdAt: isoAt(base, index),
    })
  }
  const log = []
  for (let index = 0; index < MAX_ENTRIES + 100; index += 1) {
    log.push(logRecord(`Метка ${index}`, isoAt(base, index), 60))
  }
  const state = normalizeState({ events, log })
  assert.equal(state.events.length, MAX_ENTRIES)
  assert.equal(state.log.length, MAX_ENTRIES)
  // The newest records survive.
  assert.equal(state.events[state.events.length - 1].title, `Событие ${MAX_ENTRIES + 99}`)
  assert.equal(state.log[state.log.length - 1].label, `Метка ${MAX_ENTRIES + 99}`)
})

test('storage: атомарная запись — файл валиден, временных файлов не остаётся', async () => {
  await withTempCalendar(async dir => {
    const base = localMoment({ year: 2026, month: 1, day: 15 })
    const state = { ...emptyState(), events: [] }
    const first = addEvent(state, { title: 'Первое', date: '2026-01-15', time: '09:00' }, base)
    await writeState(first.state)
    const content = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'))
    assert.equal(content.version, 1)
    assert.equal(content.events.length, 1)
    const leftovers = (await readdir(dir)).filter(name => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [], 'временных файлов не осталось')

    // Two writes in a row must both land and keep the file readable.
    const second = addEvent(first.state, { title: 'Второе', date: '2026-01-15', time: '10:00' }, base)
    await writeState(second.state)
    const reread = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'))
    assert.equal(reread.events.length, 2)

    // Parallel writes serialise on the file system: the file stays valid JSON.
    const states = []
    for (let index = 0; index < 8; index += 1) {
      states.push(addEvent(emptyState(), { title: `Параллельное ${index}`, date: '2026-01-15', time: '11:00' }, base).state)
    }
    await Promise.all(states.map(state => writeState(state)))
    const final = JSON.parse(await readFile(join(dir, 'data.json'), 'utf8'))
    assert.equal(final.version, 1)
    assert.equal(final.events.length, 1)
  })
})

test('storage: чтение отсутствующего и broken файла даёт пустое состояние', async () => {
  await withTempCalendar(async dir => {
    assert.deepEqual(await readState(join(dir, 'nope.json')), emptyState())
    await writeFile(join(dir, 'data.json'), '{ не json', 'utf8')
    assert.deepEqual(await readState(join(dir, 'data.json')), emptyState())
  })
})

test('storage: addEvent — обязательное название, умолчания и пределы', () => {
  const base = localMoment({ year: 2026, month: 1, day: 15, hours: 14, minutes: 20 })
  assert.throws(() => addEvent(emptyState(), { title: '   ' }, base), /Название события/)
  const created = addEvent(emptyState(), { title: '  Созвон  ' }, base)
  const event = created.event
  assert.equal(event.title, 'Созвон')
  assert.equal(dateKey(event.start), '2026-01-15')
  assert.equal(timeKey(event.start), '14:20')
  assert.equal(Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000), 30)
  assert.equal(event.done, false)
  assert.equal(event.note, '')
  assert.equal(event.createdAt, base.toISOString())
  assert.equal(created.state.events.length, 1)

  const explicit = addEvent(emptyState(), {
    title: 'Планёрка',
    date: '2026-02-01',
    time: '09:05',
    durationMin: 90,
    note: '  важная  ',
  }, base).event
  assert.equal(dateKey(explicit.start), '2026-02-01')
  assert.equal(timeKey(explicit.start), '09:05')
  assert.equal(explicit.note, 'важная')
  assert.equal(Math.round((Date.parse(explicit.end) - Date.parse(explicit.start)) / 60_000), 90)

  // Duration is clamped to 5..1440 minutes.
  const tiny = addEvent(emptyState(), { title: 'Мини', time: '10:00', durationMin: 1 }, base).event
  assert.equal(Math.round((Date.parse(tiny.end) - Date.parse(tiny.start)) / 60_000), 5)
  const huge = addEvent(emptyState(), { title: 'Макси', time: '10:00', durationMin: 5000 }, base).event
  assert.equal(Math.round((Date.parse(huge.end) - Date.parse(huge.start)) / 60_000), 1440)

  // A full ISO start is accepted as is.
  const moment = addEvent(emptyState(), { title: 'Момент', start: '2026-03-01T07:00:00.000Z' }, base).event
  assert.equal(moment.start, '2026-03-01T07:00:00.000Z')
})

test('storage: события — отметка «выполнено» и удаление', () => {
  const base = localMoment({ year: 2026, month: 1, day: 15 })
  const created = addEvent(emptyState(), { title: 'Т', date: '2026-01-15', time: '09:00' }, base)
  const toggled = toggleEvent(created.state, created.event.id)
  assert.equal(toggled.event.done, true)
  const back = toggleEvent(toggled.state, created.event.id)
  assert.equal(back.event.done, false)
  assert.throws(() => toggleEvent(back.state, 'nope'), /не найдено/)
  const removed = removeEvent(back.state, created.event.id)
  assert.equal(removed.state.events.length, 0)
  assert.equal(removed.removed.title, 'Т')
  assert.throws(() => removeEvent(removed.state, created.event.id), /не найдено/)
})

test('storage: ручная запись времени и журнал', () => {
  const base = localMoment({ year: 2026, month: 1, day: 15, hours: 18, minutes: 0 })
  assert.throws(() => addManualLog(emptyState(), { label: 'Созвон' }, base), /длительность/)
  const recorded = addManualLog(emptyState(), { label: 'Созвон', durationMin: 30 }, base)
  assert.equal(recorded.entry.label, 'Созвон')
  assert.equal(recorded.entry.durationSec, 1800)
  assert.equal(recorded.entry.source, 'manual')
  assert.equal(dateKey(recorded.entry.endedAt), '2026-01-15')
  assert.equal(new Date(recorded.entry.startedAt).getTime(), base.getTime() - 1800 * 1000)
  const unnamed = addManualLog(emptyState(), { durationMin: 5 }, base)
  assert.equal(unnamed.entry.label, 'Работа')
  const appended = appendLog(emptyState(), logRecord('Таймер', isoAt(base), 120))
  assert.equal(appended.state.log.length, 1)
  assert.equal(appended.entry.source, 'timer')
})

test('storage: eventView и logView отдают локальные дату и время', () => {
  const base = localMoment({ year: 2026, month: 1, day: 15 })
  const event = addEvent(emptyState(), { title: 'Встреча', date: '2026-01-15', time: '09:30', durationMin: 45 }, base).event
  const view = eventView(event)
  assert.equal(view.date, '2026-01-15')
  assert.equal(view.time, '09:30')
  assert.equal(view.endTime, '10:15')
  assert.equal(view.durationMin, 45)
  assert.equal(view.title, 'Встреча')
  const entry = addManualLog(emptyState(), { label: 'Работа', durationMin: 25 }, base).entry
  const log = logView(entry)
  assert.equal(log.date, '2026-01-15')
  assert.equal(log.durationMin, 25)
  assert.equal(log.startTime, '09:35')
  assert.equal(log.endTime, '10:00')
  assert.equal(log.source, 'manual')
})
