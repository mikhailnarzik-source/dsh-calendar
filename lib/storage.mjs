/**
 * Storage of the calendar plugin.
 *
 * One JSON file holds the events, the timer and the time log. Everything is
 * plain JSON with ISO timestamps, so a backup or another DSH version can read
 * it. Writes are atomic: a temporary file is written first and then renamed over
 * the real one, and a rename blocked by Windows (antivirus, backup) is retried.
 *
 * `normalizeState` is also the migration: any older or broken file is read into
 * the current shape, invalid records are dropped and both lists are trimmed to
 * `MAX_ENTRIES`, so a corrupted file never breaks the page.
 */

import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { dataFile } from './paths.mjs'
import { asDate, dateKey, parseDateKey, parseTimeKey, startOfDay, timeKey } from './time.mjs'
import { emptyTimer, normalizeTimer } from './timer.mjs'

/** Layout version of the data file; version 1 is the first public one. */
export const DATA_VERSION = 1

/** How many events and how many time records the file keeps. */
export const MAX_ENTRIES = 2000

/** Longest event title and label. */
export const MAX_TITLE = 200

/** Longest event note. */
export const MAX_NOTE = 500

/** Default event length, in minutes. */
export const DEFAULT_EVENT_MIN = 30

/** Shortest event length, in minutes. */
export const MIN_EVENT_MIN = 5

/** Longest event length, in minutes (24 hours). */
export const MAX_EVENT_MIN = 24 * 60

/** Longest manually recorded block, in minutes (24 hours). */
export const MAX_LOG_MIN = 24 * 60

/** A state value with nothing in it. */
export function emptyState() {
  return {
    version: DATA_VERSION,
    events: [],
    timer: emptyTimer(),
    log: [],
  }
}

/** Convert a value to a string, or to ''. */
function text(value) {
  return typeof value === 'string' ? value : ''
}

/** Generate an id that is unique enough for one local file. */
function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Clamp a duration in minutes.
 * @param value - unknown input.
 * @param fallback - used when the value is not a number.
 * @param min - lower bound.
 * @param max - upper bound.
 * @returns whole minutes, or `undefined` when there is no usable value and no
 *   fallback.
 */
function clampMinutes(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

/**
 * Find the start of a stored event: an ISO/parseable `start`, a legacy
 * `date` + `time` pair, or a date alone.
 * @param value - raw event from disk or from a request.
 * @returns a timestamp, or `NaN`.
 */
function startOfRecord(value) {
  const direct = Date.parse(text(value.start))
  if (Number.isFinite(direct)) return direct
  const date = parseDateKey(text(value.date))
  if (date === undefined) return Number.NaN
  const time = parseTimeKey(text(value.time))
  if (time !== undefined) date.setHours(time.hours, time.minutes, 0, 0)
  return date.getTime()
}

/**
 * Validate and normalise one event record.
 * @param value - unknown record from disk.
 * @returns the clean event, or `undefined` when it cannot be used.
 */
export function sanitizeEvent(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const title = text(value.title).trim().slice(0, MAX_TITLE)
  if (title === '') return undefined
  const startMs = startOfRecord(value)
  if (!Number.isFinite(startMs)) return undefined
  const start = new Date(startMs)
  const endMs = Date.parse(text(value.end))
  const end = Number.isFinite(endMs) && endMs > startMs ? new Date(endMs) : new Date(startMs + DEFAULT_EVENT_MIN * 60_000)
  const createdMs = Date.parse(text(value.createdAt))
  return {
    id: text(value.id).trim() || createId('ev'),
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    note: text(value.note).trim().slice(0, MAX_NOTE),
    done: value.done === true,
    createdAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : start.toISOString(),
  }
}

/**
 * Validate and normalise one time-log record.
 * @param value - unknown record from disk.
 * @returns the clean record, or `undefined` when it cannot be used.
 */
export function sanitizeLog(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const endedMs = Date.parse(text(value.endedAt))
  if (!Number.isFinite(endedMs)) return undefined
  const seconds = Number(value.durationSec)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  const durationSec = Math.min(Math.round(seconds), MAX_LOG_MIN * 60)
  const endedAt = new Date(endedMs)
  const startedMs = Date.parse(text(value.startedAt))
  const startedAt = Number.isFinite(startedMs) && startedMs <= endedMs
    ? new Date(startedMs)
    : new Date(endedMs - durationSec * 1000)
  const sessionId = text(value.sessionId).trim()
  return {
    id: text(value.id).trim() || createId('log'),
    label: text(value.label).trim().slice(0, MAX_TITLE) || 'Работа',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec,
    source: value.source === 'manual' ? 'manual' : 'timer',
    ...(sessionId === '' ? {} : { sessionId }),
  }
}

/** Sort events by start and keep the newest `MAX_ENTRIES`. */
export function trimEvents(events) {
  return [...events].sort((left, right) => Date.parse(left.start) - Date.parse(right.start)).slice(-MAX_ENTRIES)
}

/** Sort the time log by end and keep the newest `MAX_ENTRIES`. */
export function trimLog(log) {
  return [...log].sort((left, right) => Date.parse(left.endedAt) - Date.parse(right.endedAt)).slice(-MAX_ENTRIES)
}

/**
 * Accept anything read from disk and return a usable state.
 *
 * Old files are migrated here: a missing `version`, a legacy `items`/`entries`
 * array instead of `events`/`log`, and events stored as `date` + `time` instead
 * of `start`. Invalid records are dropped instead of failing the whole file.
 *
 * @param raw - parsed JSON or any other value.
 * @returns the normalised state with `version: 1`.
 */
export function normalizeState(raw) {
  const state = emptyState()
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return state
  const rawEvents = Array.isArray(raw.events)
    ? raw.events
    : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.tasks)
        ? raw.tasks
        : []
  const rawLog = Array.isArray(raw.log)
    ? raw.log
    : Array.isArray(raw.entries)
      ? raw.entries
      : Array.isArray(raw.timeLog)
        ? raw.timeLog
        : []
  state.events = trimEvents(rawEvents.map(sanitizeEvent).filter(record => record !== undefined))
  state.log = trimLog(rawLog.map(sanitizeLog).filter(record => record !== undefined))
  state.timer = normalizeTimer(raw.timer)
  return state
}

/**
 * Read the data file.
 * @param file - path to read; the default is `dataFile()`.
 * @returns the state; a missing or broken file reads as an empty state.
 */
export async function readState(file = dataFile()) {
  try {
    return normalizeState(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    return emptyState()
  }
}

/** Pause between write attempts, in milliseconds. */
function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Replace the destination with the temporary file.
 *
 * Windows refuses a rename while another process has the destination open
 * (antivirus, backup, editor) with `EPERM`/`EBUSY`/`EACCES`; a few short retries
 * make that transient, and the in-place fallback keeps the data usable when the
 * rename stays blocked.
 *
 * @param temporary - file with the new content.
 * @param file - destination.
 * @param content - the same content, for the fallback write.
 */
async function replaceFile(temporary, file, content) {
  let lastError
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(temporary, file)
      return
    } catch (error) {
      lastError = error
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY' && error?.code !== 'EACCES') throw error
      await pause(20 * (attempt + 1))
    }
  }
  await writeFile(file, content, 'utf8')
  try {
    await unlink(temporary)
  } catch {
    // the temporary file is disposable
  }
  if (lastError !== undefined) {
    console.warn('[dsh-calendar] данные записаны без атомарной замены:', lastError?.code ?? lastError)
  }
}

/**
 * Write the data file atomically: a temporary file first, then rename.
 * @param state - state to persist; it is normalised before writing.
 * @param file - path to write; the default is `dataFile()`.
 * @returns the normalised state that was written.
 */
export async function writeState(state, file = dataFile()) {
  const normalized = normalizeState(state)
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  const content = `${JSON.stringify(normalized, null, 2)}\n`
  await writeFile(temporary, content, 'utf8')
  await replaceFile(temporary, file, content)
  return normalized
}

/**
 * Append an event.
 * @param state - current state.
 * @param input - `{ title, date?, time?, start?, durationMin?, note? }`.
 * @param now - current moment, for defaults and `createdAt`.
 * @returns `{ state, event }`; throws when the title is empty.
 */
export function addEvent(state, input, now) {
  const current = asDate(now)
  const title = text(input?.title).trim().slice(0, MAX_TITLE)
  if (title === '') throw new Error('Название события не может быть пустым.')
  const date = parseDateKey(text(input?.date)) ?? startOfDay(current)
  const rawStart = text(input?.start)
  const startIsMoment = rawStart !== '' && Number.isFinite(Date.parse(rawStart))
  const time = startIsMoment ? undefined : (parseTimeKey(rawStart) ?? parseTimeKey(text(input?.time)))
  if (startIsMoment) {
    // A full moment was given: keep its clock, ignore the separate date.
  } else if (time === undefined && text(input?.time) === '' && rawStart === '') {
    date.setHours(current.getHours(), current.getMinutes(), 0, 0)
  } else if (time !== undefined) {
    date.setHours(time.hours, time.minutes, 0, 0)
  } else {
    // A broken time string: fall back to the current clock instead of midnight.
    date.setHours(current.getHours(), current.getMinutes(), 0, 0)
  }
  const start = startIsMoment ? new Date(Date.parse(rawStart)) : date
  const durationMin = clampMinutes(input?.durationMin, DEFAULT_EVENT_MIN, MIN_EVENT_MIN, MAX_EVENT_MIN)
  const event = {
    id: createId('ev'),
    title,
    start: start.toISOString(),
    end: new Date(start.getTime() + durationMin * 60_000).toISOString(),
    note: text(input?.note).trim().slice(0, MAX_NOTE),
    done: false,
    createdAt: current.toISOString(),
  }
  return { state: { ...state, events: trimEvents([...state.events, event]) }, event }
}

/**
 * Flip the `done` flag of one event.
 * @param state - current state.
 * @param id - event id.
 * @returns `{ state, event }`; throws when the event is gone.
 */
export function toggleEvent(state, id) {
  const wanted = text(id).trim()
  const found = state.events.find(event => event.id === wanted)
  if (found === undefined) throw new Error('Событие не найдено: возможно, его уже удалили.')
  const event = { ...found, done: found.done !== true }
  return {
    state: { ...state, events: state.events.map(item => (item.id === wanted ? event : item)) },
    event,
  }
}

/**
 * Remove one event.
 * @param state - current state.
 * @param id - event id.
 * @returns `{ state, removed }`; throws when the event is gone.
 */
export function removeEvent(state, id) {
  const wanted = text(id).trim()
  const found = state.events.find(event => event.id === wanted)
  if (found === undefined) throw new Error('Событие не найдено: возможно, его уже удалили.')
  return { state: { ...state, events: state.events.filter(item => item.id !== wanted) }, removed: found }
}

/**
 * Append one time-log record.
 * @param state - current state.
 * @param entry - `{ label, startedAt, endedAt, durationSec, source, sessionId? }`.
 * @returns `{ state, entry }`.
 */
export function appendLog(state, entry) {
  const record = sanitizeLog({ ...entry, id: entry?.id ?? createId('log') })
  if (record === undefined) throw new Error('Не удалось записать время: проверьте метку и длительность.')
  return { state: { ...state, log: trimLog([...state.log, record]) }, entry: record }
}

/**
 * Record time by hand: a label and a duration, without a timer.
 * @param state - current state.
 * @param input - `{ label, durationMin, date? }`.
 * @param now - current moment, for the default date and clock.
 * @returns `{ state, entry }`; throws when the duration is missing.
 */
export function addManualLog(state, input, now) {
  const current = asDate(now)
  const label = text(input?.label).trim().slice(0, MAX_TITLE) || 'Работа'
  const rawMinutes = Number(input?.durationMin)
  if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) {
    throw new Error('Укажите длительность в минутах: целое число больше нуля.')
  }
  const durationMin = clampMinutes(rawMinutes, undefined, 1, MAX_LOG_MIN)
  const durationSec = durationMin * 60
  const date = parseDateKey(text(input?.date))
  let endedAt
  if (date === undefined) {
    endedAt = current
  } else {
    date.setHours(current.getHours(), current.getMinutes(), 0, 0)
    endedAt = date
  }
  const entry = {
    id: createId('log'),
    label,
    startedAt: new Date(endedAt.getTime() - durationSec * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec,
    source: 'manual',
  }
  return { state: { ...state, log: trimLog([...state.log, entry]) }, entry }
}

/**
 * Event as the page and the tools see it: local date and clock added.
 * @param event - stored event.
 * @returns `{ id, title, date, time, endTime, start, end, note, done,
 *   durationMin }`.
 */
export function eventView(event) {
  const startMs = Date.parse(event.start)
  const endMs = Date.parse(event.end)
  const durationMin = Math.max(1, Math.round((endMs - startMs) / 60_000))
  return {
    id: event.id,
    title: event.title,
    date: dateKey(event.start),
    time: timeKey(event.start),
    endTime: timeKey(event.end),
    start: event.start,
    end: event.end,
    note: event.note,
    done: event.done === true,
    durationMin,
  }
}

/**
 * Time record as the page sees it.
 * @param entry - stored record.
 * @returns `{ id, label, date, startTime, endTime, durationSec, durationMin,
 *   source, sessionId? }`.
 */
export function logView(entry) {
  return {
    id: entry.id,
    label: entry.label,
    date: dateKey(entry.endedAt),
    startTime: timeKey(entry.startedAt),
    endTime: timeKey(entry.endedAt),
    durationSec: entry.durationSec,
    durationMin: Math.max(1, Math.round(entry.durationSec / 60)),
    source: entry.source,
    ...(entry.sessionId === undefined || entry.sessionId === '' ? {} : { sessionId: entry.sessionId }),
  }
}
