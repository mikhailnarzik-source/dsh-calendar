import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyState, writeState } from '../lib/storage.mjs'
import { callRoute, fakeContext, withTempCalendar } from './helpers.mjs'

/**
 * Apply the plugin to a fresh fake context.
 * @returns the context with `toolsList` and `routesList`.
 */
async function mount() {
  const module = await import('../index.js')
  const ctx = fakeContext()
  module.apply(ctx)
  return ctx
}

/** ISO of a moment `minutes` in the past. */
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

test('маршруты: зарегистрированы все POST-маршруты и инструменты', async () => {
  await withTempCalendar(async () => {
    const module = await import('../index.js')
    assert.equal(module.name, 'dsh-calendar')
    assert.deepEqual(module.inject, ['tools', 'connection', 'sessionPersistence'])
    const ctx = await mount()
    assert.deepEqual(ctx.routesList.map(route => route.path).sort(), [
      '/api/dsh-calendar/event/add',
      '/api/dsh-calendar/event/remove',
      '/api/dsh-calendar/event/toggle',
      '/api/dsh-calendar/log/add',
      '/api/dsh-calendar/report',
      '/api/dsh-calendar/state',
      '/api/dsh-calendar/timer',
    ])
    for (const route of ctx.routesList) {
      assert.deepEqual(route.methods, ['POST'], `${route.path}: методы`)
      assert.equal(route.requestBody, 'buffered', `${route.path}: тело`)
      assert.equal(typeof route.fetch, 'function', `${route.path}: fetch`)
    }
    assert.deepEqual(ctx.toolsList.map(tool => tool.name).sort(), [
      'calendar_add',
      'calendar_list',
      'calendar_today',
      'time_report',
      'timer_start',
      'timer_status',
      'timer_stop',
    ])
  })
})

test('маршрут state: пустое состояние и полный набор полей', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const payload = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(payload.ok, true)
    assert.equal(payload.version, 1)
    assert.equal(typeof payload.now, 'string')
    assert.deepEqual(payload.today.events, [])
    assert.equal(payload.today.count, 0)
    assert.equal(payload.timer.mode, 'idle')
    assert.equal(payload.timer.running, false)
    assert.deepEqual(payload.logToday.entries, [])
    assert.equal(payload.logToday.totalSec, 0)
    assert.deepEqual(payload.recent, [])
    assert.equal(payload.report.today.totalSec, 0)
    assert.equal(payload.report.week.totalSec, 0)
    assert.equal(payload.limits.maxEntries, 2000)
  })
})

test('маршруты event: добавление, отметка и удаление', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const added = await callRoute(ctx, '/api/dsh-calendar/event/add', {
      title: 'Созвон',
      time: '14:00',
      durationMin: 45,
      note: 'важно',
    })
    assert.equal(added.ok, true)
    assert.equal(added.event.title, 'Созвон')
    assert.equal(added.event.time, '14:00')
    assert.equal(added.event.endTime, '14:45')
    assert.equal(added.event.note, 'важно')
    assert.match(added.message, /Созвон/)

    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.today.count, 1)
    assert.equal(state.today.events[0].title, 'Созвон')

    const toggled = await callRoute(ctx, '/api/dsh-calendar/event/toggle', { id: added.event.id })
    assert.equal(toggled.ok, true)
    assert.equal(toggled.event.done, true)
    assert.match(toggled.message, /выполненное/)

    const removed = await callRoute(ctx, '/api/dsh-calendar/event/remove', { id: added.event.id })
    assert.equal(removed.ok, true)
    assert.match(removed.message, /удалено/)
    const after = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(after.today.count, 0)
  })
})

test('маршруты event: ошибки отвечают ok:false и понятным текстом', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const empty = await callRoute(ctx, '/api/dsh-calendar/event/add', { title: '   ' })
    assert.equal(empty.ok, false)
    assert.match(empty.message, /Название события/)
    const unknown = await callRoute(ctx, '/api/dsh-calendar/event/toggle', { id: 'nope' })
    assert.equal(unknown.ok, false)
    assert.match(unknown.message, /не найдено/)
    const unknownRemove = await callRoute(ctx, '/api/dsh-calendar/event/remove', { id: 'nope' })
    assert.equal(unknownRemove.ok, false)
    await assert.doesNotReject(callRoute(ctx, '/api/dsh-calendar/event/add', null))
  })
})

test('маршрут timer: старт, пауза, продолжение и стоп', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const started = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'start', label: 'Код', durationMin: 30 })
    assert.equal(started.ok, true)
    assert.equal(started.timer.mode, 'work')
    assert.equal(started.timer.running, true)
    assert.equal(started.timer.durationMin, 30)
    assert.equal(started.timer.label, 'Код')
    assert.match(started.message, /Таймер запущен/)

    const paused = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'pause' })
    assert.equal(paused.ok, true)
    assert.equal(paused.timer.paused, true)
    assert.equal(paused.timer.running, false)

    const resumed = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'resume' })
    assert.equal(resumed.ok, true)
    assert.equal(resumed.timer.paused, false)

    const stopped = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'stop' })
    assert.equal(stopped.ok, true)
    assert.equal(stopped.timer.mode, 'idle')
    assert.match(stopped.message, /Таймер остановлен/)
    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.timer.mode, 'idle')
  })
})

test('маршрут timer: перерыв не пишется в журнал', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const started = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'break' })
    assert.equal(started.timer.mode, 'break')
    assert.equal(started.timer.durationMin, 5)
    const stopped = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'stop' })
    assert.equal(stopped.ok, true)
    assert.match(stopped.message, /Перерыв завершён/)
    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.logToday.count, 0)
  })
})

test('маршрут timer: просроченный таймер при перезапуске записывает запланированные минуты', async () => {
  await withTempCalendar(async () => {
    await writeState({
      ...emptyState(),
      timer: {
        mode: 'work',
        startedAt: minutesAgo(20),
        label: 'Код',
        durationMin: 5,
        pausedAt: '',
        sessionId: '',
      },
    })
    const module = await import('../index.js')
    const ctx = fakeContext()
    module.apply(ctx)
    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.timer.expired, true)
    assert.equal(state.timer.remainingSec, 0)

    const stopped = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'stop' })
    assert.equal(stopped.ok, true)
    assert.equal(typeof stopped.log, 'object')
    assert.equal(stopped.log.durationSec, 5 * 60, 'записаны запланированные 5 минут')
    assert.equal(stopped.log.label, 'Код')
    assert.match(stopped.message, /записано в журнал/)
    const after = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(after.timer.mode, 'idle')
    assert.equal(after.today.count, 0)
    assert.equal(after.recent.length, 1, 'интервал записан в журнал')
    assert.equal(after.recent[0].durationSec, 5 * 60)
  })
})

test('маршрут timer: неизвестное действие отклоняется', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const payload = await callRoute(ctx, '/api/dsh-calendar/timer', { action: 'teleport' })
    assert.equal(payload.ok, false)
    assert.match(payload.message, /Неизвестное действие/)
  })
})

test('маршрут log/add: ручная запись попадает в журнал и отчёт', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    const added = await callRoute(ctx, '/api/dsh-calendar/log/add', { label: 'Созвон', durationMin: 30 })
    assert.equal(added.ok, true)
    assert.equal(added.entry.source, 'manual')
    assert.equal(added.entry.durationSec, 1800)
    assert.match(added.message, /Записано/)
    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.logToday.count, 1)
    assert.equal(state.logToday.totalSec, 1800)
    const bad = await callRoute(ctx, '/api/dsh-calendar/log/add', { label: 'Без времени' })
    assert.equal(bad.ok, false)
    assert.match(bad.message, /длительность/)
  })
})

test('маршрут report: today и week с разбивкой по меткам', async () => {
  await withTempCalendar(async () => {
    const ctx = await mount()
    await callRoute(ctx, '/api/dsh-calendar/log/add', { label: 'Работа', durationMin: 50 })
    await callRoute(ctx, '/api/dsh-calendar/log/add', { label: 'Созвон', durationMin: 10 })
    const today = await callRoute(ctx, '/api/dsh-calendar/report', { range: 'today' })
    assert.equal(today.ok, true)
    assert.equal(today.report.range, 'today')
    assert.equal(today.report.totalSec, 3600)
    assert.equal(today.report.count, 2)
    assert.equal(today.report.byLabel[0].label, 'Работа')
    assert.equal(today.report.byLabel[0].durationSec, 3000)
    assert.equal(today.report.byLabel[1].label, 'Созвон')
    const week = await callRoute(ctx, '/api/dsh-calendar/report', { range: 'week' })
    assert.equal(week.report.range, 'week')
    assert.equal(week.report.totalSec, 3600)
    const fallback = await callRoute(ctx, '/api/dsh-calendar/report', { range: 'month' })
    assert.equal(fallback.report.range, 'today')
  })
})
