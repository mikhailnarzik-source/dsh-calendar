import { test } from 'node:test'
import assert from 'node:assert/strict'

import { emptyState, writeState } from '../lib/storage.mjs'
import { callRoute, fakeContext, withTempCalendar } from './helpers.mjs'

/**
 * Apply the plugin and return the registered tools.
 * @returns `{ ctx, tools }`.
 */
async function mountTools() {
  const module = await import('../index.js')
  const ctx = fakeContext()
  module.apply(ctx)
  return { ctx, tools: ctx.toolsList }
}

/**
 * Find one tool by name.
 * @param tools - registered definitions.
 * @param name - tool name.
 * @returns the definition.
 */
function tool(tools, name) {
  const found = tools.find(item => item.name === name)
  assert.ok(found !== undefined, `инструмент ${name} зарегистрирован`)
  return found
}

test('инструменты: семь штук, русские описания до 180 символов и канонический output', async () => {
  await withTempCalendar(async () => {
    const { tools } = await mountTools()
    assert.deepEqual(tools.map(item => item.name).sort(), [
      'calendar_add',
      'calendar_list',
      'calendar_today',
      'time_report',
      'timer_start',
      'timer_status',
      'timer_stop',
    ])
    for (const definition of tools) {
      assert.equal(typeof definition.description, 'string', `${definition.name}: описание`)
      assert.ok(definition.description.length > 20, `${definition.name}: описание содержательное`)
      assert.ok(definition.description.length <= 180, `${definition.name}: описание ${definition.description.length} > 180`)
      assert.equal(definition.parameters?.type, 'object', `${definition.name}: parameters`)
      assert.equal(typeof definition.execute, 'function', `${definition.name}: execute`)
      assert.equal(definition.output?.schema?.type, 'string', `${definition.name}: output.schema`)
      assert.equal(typeof definition.output?.render, 'function', `${definition.name}: output.render`)
      assert.equal('run' in definition, false, `${definition.name}: не должно быть run`)
    }
    assert.deepEqual(tool(tools, 'calendar_add').parameters.required, ['title'])
    assert.equal(tool(tools, 'time_report').parameters.properties.range.type, 'string')
  })
})

test('инструменты: календарь — добавить, посмотреть сегодня и список на дни', async () => {
  await withTempCalendar(async () => {
    const { tools } = await mountTools()
    const add = tool(tools, 'calendar_add')
    const added = await add.execute({ title: 'Созвон', time: '14:00', durationMin: 45, note: 'важно' })
    assert.match(added, /Созвон/)
    assert.match(added, /14:00/)
    assert.match(added, /45 мин/)

    const today = await tool(tools, 'calendar_today').execute({})
    assert.match(today, /События \(1, выполнено 0\)/)
    assert.match(today, /14:00–14:45 ○ Созвон — важно/)
    assert.match(today, /Таймер: не запущен/)

    const list = await tool(tools, 'calendar_list').execute({ days: 7 })
    assert.match(list, /Созвон/)
    assert.match(list, /ближайшие 7 дн\./)

    await assert.rejects(() => add.execute({ title: '  ' }), /Название события/)
  })
})

test('инструменты: таймер — статус после перезапуска, стоп пишет журнал', async () => {
  await withTempCalendar(async () => {
    const now = new Date()
    await writeState({
      ...emptyState(),
      timer: {
        mode: 'work',
        startedAt: new Date(now.getTime() - 60 * 60_000).toISOString(),
        label: 'Код',
        durationMin: 25,
        pausedAt: '',
        sessionId: '',
      },
      log: [{
        id: 'log-seeded',
        label: 'Работа',
        startedAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
        endedAt: now.toISOString(),
        durationSec: 600,
        source: 'manual',
      }],
    })
    const { ctx, tools } = await mountTools()
    const status = await tool(tools, 'timer_status').execute({})
    assert.match(status, /Таймер: работа «Код» — время вышло/)
    assert.match(status, /таймер дошёл до конца/)

    const today = await tool(tools, 'calendar_today').execute({})
    assert.match(today, /Учтённое время: 10 мин за 1 записей/)
    assert.match(today, /Работа: 10 мин/)

    const stopped = await tool(tools, 'timer_stop').execute({})
    assert.match(stopped, /Таймер остановлен/)
    assert.match(stopped, /Код/)
    assert.match(stopped, /25 мин/)
    assert.match(stopped, /Таймер: не запущен/)

    // The written interval is visible in the journal even when the run started
    // just before midnight; the report of "today" may legitimately not include it.
    const state = await callRoute(ctx, '/api/dsh-calendar/state', {})
    assert.equal(state.recent.length, 2)
    const written = state.recent.find(entry => entry.label === 'Код')
    assert.ok(written !== undefined, 'интервал таймера есть в журнале')
    assert.equal(written.durationSec, 25 * 60)
    assert.equal(written.source, 'timer')

    const report = await tool(tools, 'time_report').execute({ range: 'today' })
    assert.match(report, /Отчёт за сегодня/)
    assert.match(report, /Работа/)
    const week = await tool(tools, 'time_report').execute({ range: 'week' })
    assert.match(week, /Отчёт за неделю/)
  })
})

test('инструменты: timer_start и повторный старт', async () => {
  await withTempCalendar(async () => {
    const { tools } = await mountTools()
    const started = await tool(tools, 'timer_start').execute({ label: 'Писатель', durationMin: 40 })
    assert.match(started, /Таймер запущен/)
    assert.match(started, /Писатель/)
    assert.match(started, /40 мин/)
    const view = await tool(tools, 'timer_status').execute({})
    assert.match(view, /осталось/)
    await assert.rejects(() => tool(tools, 'timer_start').execute({}), /уже идёт/)
    const stopped = await tool(tools, 'timer_stop').execute({})
    assert.match(stopped, /Таймер остановлен/)
  })
})

test('инструменты: time_report по умолчанию — сегодня', async () => {
  await withTempCalendar(async () => {
    const { tools } = await mountTools()
    const report = await tool(tools, 'time_report').execute({})
    assert.match(report, /Отчёт за сегодня/)
    assert.match(report, /Учтённого времени нет/)
  })
})
