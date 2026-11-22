import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_ENTRIES,
  addEvent,
  emptyState,
  eventView,
  normalizeState,
  removeEvent,
  toggleEvent,
} from '../lib/storage.mjs'
import { dateKey } from '../lib/time.mjs'
import { localMoment } from './helpers.mjs'

/** A deterministic local moment. */
const BASE = localMoment({ year: 2026, month: 1, day: 15, hours: 9, minutes: 0 })

test('события: добавление на сегодня, завтра и в прошлое', () => {
  const today = addEvent(emptyState(), { title: 'Сегодня', time: '10:00' }, BASE).state
  const tomorrow = addEvent(today, { title: 'Завтра', date: '2026-01-16', time: '11:00' }, BASE).state
  const past = addEvent(tomorrow, { title: 'Вчера', date: '2026-01-14', time: '18:00', durationMin: 60 }, BASE).state
  assert.equal(past.events.length, 3)
  const titles = past.events.map(event => event.title).sort()
  assert.deepEqual(titles, ['Вчера', 'Завтра', 'Сегодня'])
  const yesterdayView = eventView(past.events.find(event => event.title === 'Вчера'))
  assert.equal(yesterdayView.date, '2026-01-14')
  assert.equal(yesterdayView.time, '18:00')
  assert.equal(yesterdayView.endTime, '19:00')
})

test('события: список сортируется по времени начала', () => {
  let state = emptyState()
  for (const time of ['12:00', '09:00', '18:00']) {
    state = addEvent(state, { title: `В ${time}`, time }, BASE).state
  }
  assert.deepEqual(state.events.map(event => eventView(event).time), ['09:00', '12:00', '18:00'])
})

test('события: отметка выполнения переключается в обе стороны', () => {
  const created = addEvent(emptyState(), { title: 'Созвон', time: '10:00' }, BASE)
  const done = toggleEvent(created.state, created.event.id)
  assert.equal(eventView(done.event).done, true)
  const open = toggleEvent(done.state, created.event.id)
  assert.equal(eventView(open.event).done, false)
})

test('события: удаление убирает только выбранное', () => {
  const first = addEvent(emptyState(), { title: 'Первое', time: '10:00' }, BASE)
  const second = addEvent(first.state, { title: 'Второе', time: '11:00' }, BASE)
  const removed = removeEvent(second.state, first.event.id)
  assert.equal(removed.state.events.length, 1)
  assert.equal(removed.state.events[0].title, 'Второе')
  assert.equal(removed.removed.id, first.event.id)
})

test('события: лимит записей и перенос даты в начатый день', () => {
  let state = emptyState()
  for (let index = 0; index < MAX_ENTRIES + 5; index += 1) {
    state = addEvent(state, { title: `Событие ${index}`, date: '2026-01-15', time: '10:00' }, BASE).state
  }
  assert.equal(state.events.length, MAX_ENTRIES)
  const normalized = normalizeState(state)
  assert.equal(normalized.events.length, MAX_ENTRIES)
  assert.equal(dateKey(state.events[0].start), '2026-01-15')
})

test('события: сохраняются поля id, createdAt и end', () => {
  const created = addEvent(emptyState(), { title: 'X', date: '2026-01-15', time: '08:00', durationMin: 15 }, BASE).event
  assert.match(created.id, /^ev-/)
  assert.equal(created.createdAt, BASE.toISOString())
  assert.equal(new Date(created.end).getTime() - new Date(created.start).getTime(), 15 * 60_000)
  assert.equal(Object.keys(created).sort().join(','), 'createdAt,done,end,id,note,start,title')
})
