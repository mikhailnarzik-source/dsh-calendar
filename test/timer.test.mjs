import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  BREAK_MINUTES,
  WORK_MINUTES,
  emptyTimer,
  normalizeTimer,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  timerLogEntry,
  timerView,
} from '../lib/timer.mjs'
import { localMoment } from './helpers.mjs'

/** A deterministic local start moment. */
const BASE = localMoment({ year: 2026, month: 1, day: 15, hours: 10, minutes: 0 })

/** ISO of a local moment shifted by whole minutes. */
function at(minutes) {
  return new Date(BASE.getTime() + minutes * 60_000)
}

test('timer: старт по умолчанию — работа 25 минут', () => {
  const timer = startTimer(emptyTimer(), { label: 'Код' }, at(0))
  assert.equal(timer.mode, 'work')
  assert.equal(timer.label, 'Код')
  assert.equal(timer.durationMin, WORK_MINUTES)
  assert.equal(timer.startedAt, BASE.toISOString())
  const view = timerView(timer, at(0))
  assert.equal(view.running, true)
  assert.equal(view.paused, false)
  assert.equal(view.expired, false)
  assert.equal(view.remainingSec, WORK_MINUTES * 60)
  assert.equal(view.progress, 0)
})

test('timer: перерыв 5 минут и своя длительность с пределами', () => {
  const paused = startTimer(emptyTimer(), { mode: 'break' }, at(0))
  assert.equal(paused.mode, 'break')
  assert.equal(paused.durationMin, BREAK_MINUTES)
  assert.equal(paused.label, 'Перерыв')
  const custom = startTimer(emptyTimer(), { durationMin: 40, label: 'Своя' }, at(0))
  assert.equal(custom.durationMin, 40)
  assert.equal(startTimer(emptyTimer(), { durationMin: 0 }, at(0)).durationMin, 1)
  assert.equal(startTimer(emptyTimer(), { durationMin: 9999 }, at(0)).durationMin, 720)
  assert.equal(startTimer(emptyTimer(), { durationMin: 'abc' }, at(0)).durationMin, 25)
})

test('timer: второй старт при идущем таймере отклоняется', () => {
  const running = startTimer(emptyTimer(), {}, at(0))
  assert.throws(() => startTimer(running, {}, at(1)), /уже идёт/)
})

test('timer: duration вычисляется из startedAt, счётчик идёт', () => {
  const timer = startTimer(emptyTimer(), { durationMin: 30 }, at(0))
  const view = timerView(timer, at(10))
  assert.equal(view.elapsedSec, 600)
  assert.equal(view.remainingSec, 1200)
  assert.equal(view.durationSec, 1800)
  assert.ok(Math.abs(view.progress - 1 / 3) < 1e-9)
  assert.equal(view.finishedAt, at(30).toISOString())
})

test('timer: пауза замораживает время, продолжение сдвигает старт', () => {
  const timer = startTimer(emptyTimer(), { durationMin: 25 }, at(0))
  const paused = pauseTimer(timer, at(5))
  const pausedView = timerView(paused, at(60))
  assert.equal(pausedView.paused, true)
  assert.equal(pausedView.running, false)
  assert.equal(pausedView.elapsedSec, 300)
  assert.equal(pausedView.remainingSec, 1200)
  // A second pause changes nothing.
  assert.deepEqual(pauseTimer(paused, at(80)), paused)

  const resumed = resumeTimer(paused, at(60))
  const afterFive = timerView(resumed, at(65))
  assert.equal(afterFive.elapsedSec, 600)
  assert.equal(afterFive.remainingSec, 900)
  assert.equal(afterFive.paused, false)
})

test('timer: перезапуск DSH — таймер продолжается из файла', () => {
  const timer = startTimer(emptyTimer(), { durationMin: 25, label: 'Код' }, at(0))
  // What a restart does: read the JSON back and normalise it.
  const restored = normalizeTimer(JSON.parse(JSON.stringify(timer)))
  assert.deepEqual(restored, timer)
  const view = timerView(restored, at(20))
  assert.equal(view.running, true)
  assert.equal(view.elapsedSec, 1200)
  assert.equal(view.remainingSec, 300)
})

test('timer: просроченный таймер после перезапуска предлагает завершить', () => {
  const timer = startTimer(emptyTimer(), { durationMin: 25, label: 'Код' }, at(0))
  const restored = normalizeTimer(JSON.parse(JSON.stringify(timer)))
  const view = timerView(restored, at(40))
  assert.equal(view.expired, true)
  assert.equal(view.remainingSec, 0)
  assert.equal(view.progress, 1)
  const stopped = stopTimer(restored, at(40))
  assert.equal(stopped.completed, true)
  // The log gets the planned interval, not the whole time the machine was off.
  assert.equal(stopped.durationSec, 25 * 60)
  assert.equal(stopped.endedAt, at(25).toISOString())
  assert.equal(stopped.timer.mode, 'idle')
})

test('timer: стоп до конца записывает реально прошедшее время', () => {
  const timer = startTimer(emptyTimer(), { durationMin: 25, label: 'Код' }, at(0))
  const stopped = stopTimer(timer, at(7))
  assert.equal(stopped.completed, false)
  assert.equal(stopped.durationSec, 420)
  assert.equal(stopped.endedAt, at(7).toISOString())
  const entry = timerLogEntry(timer, stopped)
  assert.equal(entry.label, 'Код')
  assert.equal(entry.source, 'timer')
  assert.equal(entry.durationSec, 420)
  assert.equal(entry.startedAt, at(0).toISOString())
  assert.equal(entry.endedAt, at(7).toISOString())
})

test('timer: стоп на паузе считает до момента паузы', () => {
  const timer = startTimer(emptyTimer(), {}, at(0))
  const paused = pauseTimer(timer, at(5))
  const stopped = stopTimer(paused, at(50))
  assert.equal(stopped.durationSec, 300)
  assert.equal(stopped.endedAt, at(5).toISOString())
})

test('timer: стоп без запуска и неизвестные значения', () => {
  assert.throws(() => stopTimer(emptyTimer(), at(0)), /не запущен/)
  assert.throws(() => pauseTimer(emptyTimer(), at(0)), /не запущен/)
  assert.throws(() => resumeTimer(emptyTimer(), at(0)), /не запущен/)
  assert.deepEqual(normalizeTimer({ mode: 'work', startedAt: 'не дата' }), emptyTimer())
  assert.deepEqual(normalizeTimer({ mode: 'nope', startedAt: at(0).toISOString() }), emptyTimer())
  assert.deepEqual(normalizeTimer(null), emptyTimer())
  const pausedBeforeStart = normalizeTimer({
    mode: 'work',
    startedAt: at(10).toISOString(),
    pausedAt: at(5).toISOString(),
  })
  assert.equal(pausedBeforeStart.pausedAt, '')
})
