/**
 * Server-side pomodoro timer.
 *
 * No interval and no process memory: the state file stores the run start and
 * the label, so the timer keeps going while DSH is closed and survives a
 * restart. An elapsed time is always computed from `startedAt`, never counted in
 * memory. Pausing freezes the elapsed time by remembering `pausedAt`; resuming
 * shifts `startedAt` forward by the paused span, so `now - startedAt` stays the
 * real working time.
 *
 * A run that passed its duration while nobody watched is not completed
 * automatically: the page and `timer_status` report `expired` and offer to stop
 * the run, which writes the planned duration to the log and clears the timer.
 */

import { asDate } from './time.mjs'

/** Timer modes: `idle` means no active run. */
export const TIMER_MODES = ['idle', 'work', 'break']

/** Default work length, in minutes. */
export const WORK_MINUTES = 25

/** Default break length, in minutes. */
export const BREAK_MINUTES = 5

/** Shortest custom run, in minutes. */
export const MIN_MINUTES = 1

/** Longest custom run, in minutes (12 hours). */
export const MAX_MINUTES = 12 * 60

/** Longest label stored with a run. */
export const MAX_LABEL = 120

/**
 * Clamp a custom duration; a missing or broken value falls back to the default
 * of the mode.
 * @param value - unknown input.
 * @param fallback - default minutes.
 * @returns whole minutes inside [MIN_MINUTES, MAX_MINUTES].
 */
export function clampMinutes(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(number)))
}

/** A timer with no active run. */
export function emptyTimer() {
  return { mode: 'idle', startedAt: '', label: '', durationMin: 0, pausedAt: '', sessionId: '' }
}

/**
 * Accept anything read from disk and return a usable timer.
 * @param raw - parsed JSON value.
 * @returns the normalised timer; an invalid run reads as `idle`.
 */
export function normalizeTimer(raw) {
  const timer = emptyTimer()
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return timer
  const mode = TIMER_MODES.includes(raw.mode) ? raw.mode : 'idle'
  if (mode === 'idle') return timer
  const startedMs = Date.parse(String(raw.startedAt ?? ''))
  if (!Number.isFinite(startedMs)) return timer
  timer.mode = mode
  timer.startedAt = new Date(startedMs).toISOString()
  timer.durationMin = clampMinutes(raw.durationMin, mode === 'break' ? BREAK_MINUTES : WORK_MINUTES)
  timer.label = String(raw.label ?? '').trim().slice(0, MAX_LABEL) || (mode === 'break' ? 'Перерыв' : 'Работа')
  const pausedMs = Date.parse(String(raw.pausedAt ?? ''))
  if (Number.isFinite(pausedMs) && pausedMs >= startedMs) timer.pausedAt = new Date(pausedMs).toISOString()
  if (typeof raw.sessionId === 'string') timer.sessionId = raw.sessionId.trim()
  return timer
}

/**
 * Read-only view of a timer: what the page and the tools show.
 * @param timer - stored timer.
 * @param now - the moment to compute for.
 * @returns `{ mode, running, paused, expired, label, startedAt, durationMin,
 *   durationSec, elapsedSec, remainingSec, progress, sessionId, finishedAt }`.
 */
export function timerView(timer, now) {
  const clean = normalizeTimer(timer)
  const current = asDate(now)
  if (clean.mode === 'idle') {
    return {
      mode: 'idle',
      running: false,
      paused: false,
      expired: false,
      label: '',
      startedAt: '',
      durationMin: 0,
      durationSec: 0,
      elapsedSec: 0,
      remainingSec: 0,
      progress: 0,
      sessionId: '',
      finishedAt: '',
    }
  }
  const startedMs = Date.parse(clean.startedAt)
  const endMs = clean.pausedAt === '' ? current.getTime() : Date.parse(clean.pausedAt)
  const elapsedSec = Math.max(0, Math.floor((endMs - startedMs) / 1000))
  const durationSec = clean.durationMin * 60
  const remainingSec = Math.max(0, durationSec - elapsedSec)
  return {
    mode: clean.mode,
    running: clean.pausedAt === '',
    paused: clean.pausedAt !== '',
    expired: clean.pausedAt === '' && elapsedSec >= durationSec,
    label: clean.label,
    startedAt: clean.startedAt,
    durationMin: clean.durationMin,
    durationSec,
    elapsedSec,
    remainingSec,
    progress: durationSec === 0 ? 0 : Math.min(1, Math.max(0, elapsedSec / durationSec)),
    sessionId: clean.sessionId,
    finishedAt: new Date(startedMs + durationSec * 1000).toISOString(),
  }
}

/**
 * Start a work or break run.
 * @param timer - current timer.
 * @param input - `{ mode?, durationMin?, label?, sessionId? }`.
 * @param now - current moment.
 * @returns the new timer.
 */
export function startTimer(timer, input, now) {
  const current = asDate(now)
  if (timerView(timer, current).mode !== 'idle') throw new Error('Таймер уже идёт: сначала остановите его.')
  const mode = input?.mode === 'break' ? 'break' : 'work'
  const durationMin = clampMinutes(input?.durationMin, mode === 'break' ? BREAK_MINUTES : WORK_MINUTES)
  const label = String(input?.label ?? '').trim().slice(0, MAX_LABEL) || (mode === 'break' ? 'Перерыв' : 'Работа')
  const sessionId = String(input?.sessionId ?? '').trim()
  return {
    ...emptyTimer(),
    mode,
    startedAt: current.toISOString(),
    label,
    durationMin,
    ...(sessionId === '' ? {} : { sessionId }),
  }
}

/**
 * Pause a running timer; pausing a paused timer changes nothing.
 * @param timer - current timer.
 * @param now - current moment.
 * @returns the new timer.
 */
export function pauseTimer(timer, now) {
  const clean = normalizeTimer(timer)
  const view = timerView(clean, now)
  if (view.mode === 'idle') throw new Error('Таймер не запущен.')
  if (view.paused) return clean
  return { ...clean, pausedAt: asDate(now).toISOString() }
}

/**
 * Resume a paused timer, shifting the start so the paused span is not counted.
 * @param timer - current timer.
 * @param now - current moment.
 * @returns the new timer.
 */
export function resumeTimer(timer, now) {
  const clean = normalizeTimer(timer)
  const view = timerView(clean, now)
  if (view.mode === 'idle') throw new Error('Таймер не запущен.')
  if (!view.paused) return clean
  const current = asDate(now)
  const elapsedMs = Math.max(0, Date.parse(clean.pausedAt) - Date.parse(clean.startedAt))
  return { ...clean, startedAt: new Date(current.getTime() - elapsedMs).toISOString(), pausedAt: '' }
}

/**
 * Stop a run and tell what belongs in the time log.
 *
 * A run that passed its duration counts as the planned length, not as the whole
 * time the computer was off: the log ends at `startedAt + durationMin`.
 *
 * @param timer - current timer.
 * @param now - current moment.
 * @returns `{ timer, endedAt, durationSec, completed }`: the empty timer, the
 *   logical end and the seconds worth logging.
 */
export function stopTimer(timer, now) {
  const clean = normalizeTimer(timer)
  const view = timerView(clean, now)
  if (view.mode === 'idle') throw new Error('Таймер не запущен.')
  const current = asDate(now)
  const startedMs = Date.parse(clean.startedAt)
  const durationSec = clean.durationMin * 60
  const endMs = clean.pausedAt === '' ? current.getTime() : Date.parse(clean.pausedAt)
  const elapsedSec = Math.max(0, Math.floor((endMs - startedMs) / 1000))
  const completed = elapsedSec >= durationSec
  const loggedSec = completed ? durationSec : elapsedSec
  const endedAt = new Date(completed ? startedMs + durationSec * 1000 : endMs).toISOString()
  return { timer: emptyTimer(), endedAt, durationSec: loggedSec, completed }
}

/**
 * Build the log record of a stopped work run.
 * @param timer - the timer before stopping.
 * @param result - return value of `stopTimer`.
 * @returns an unsaved log record; `id` is assigned by storage.
 */
export function timerLogEntry(timer, result) {
  const clean = normalizeTimer(timer)
  return {
    label: clean.label,
    startedAt: clean.startedAt,
    endedAt: result.endedAt,
    durationSec: result.durationSec,
    source: 'timer',
    ...(clean.sessionId === '' ? {} : { sessionId: clean.sessionId }),
  }
}
