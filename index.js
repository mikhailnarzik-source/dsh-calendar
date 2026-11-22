/**
 * Host half of `dsh-calendar` — «Календарь и учёт времени».
 *
 * Keeps one local JSON file (`~/.dsh/dsh-calendar/data.json`) with the events of
 * the day, the running pomodoro timer and the time log. The browser half talks
 * to it through POST routes, the agent through seven tools; both share the same
 * runtime, so a change made from the page is visible to the agent at once.
 *
 * Nothing leaves the machine: there is no network code in this plugin, no
 * credential and no external API. Timestamps are stored as ISO strings in UTC
 * and shown in the local time zone.
 */

import {
  MAX_ENTRIES,
  addEvent as createEvent,
  addManualLog as recordManualLog,
  appendLog,
  emptyState,
  eventView,
  logView,
  readState,
  removeEvent as deleteEvent,
  toggleEvent as flipEvent,
  writeState,
} from './lib/storage.mjs'
import { pauseTimer, resumeTimer, startTimer, stopTimer, timerLogEntry, timerView } from './lib/timer.mjs'
import { summaryFor } from './lib/reports.mjs'
import { createTools } from './lib/tools.mjs'
import { addDays, dateKey, formatDuration, startOfDay } from './lib/time.mjs'

/** Plugin name; also the id of the bundle row in `cordis.patch.yml`. */
export const name = 'dsh-calendar'

/** Services required before the routes and tools can be registered. */
export const inject = ['tools', 'connection', 'sessionPersistence']

/** Route the page calls for the current state. */
const STATE_PATH = '/api/dsh-calendar/state'

/** Route the page calls to add an event. */
const EVENT_ADD_PATH = '/api/dsh-calendar/event/add'

/** Route the page calls to flip the `done` flag of an event. */
const EVENT_TOGGLE_PATH = '/api/dsh-calendar/event/toggle'

/** Route the page calls to delete an event. */
const EVENT_REMOVE_PATH = '/api/dsh-calendar/event/remove'

/** Route the page calls to start, pause, resume or stop the timer. */
const TIMER_PATH = '/api/dsh-calendar/timer'

/** Route the page calls to record time by hand. */
const LOG_ADD_PATH = '/api/dsh-calendar/log/add'

/** Route the page calls for a today/week report. */
const REPORT_PATH = '/api/dsh-calendar/report'

/** How many recent time records the page receives. */
const VISIBLE_RECENT = 10

/** Largest window `calendar_list` may show, in days. */
const MAX_LIST_DAYS = 31

/**
 * Build one JSON response.
 * @param value - body to serialise.
 * @param status - HTTP status; 200 by default.
 * @returns the response.
 */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Read a JSON request body, tolerating an empty or broken one.
 * @param request - incoming request.
 * @returns the parsed body, or `{}`.
 */
async function readBody(request) {
  try {
    const text = await request.text()
    return text === '' ? {} : JSON.parse(text)
  } catch {
    return {}
  }
}

/**
 * Mount the routes and the tools.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  /** Live state: the file plus the in-memory changes already applied. */
  let state = emptyState()

  /** Serialises file writes so two actions cannot interleave. */
  let writeChain = Promise.resolve()

  /** The current moment; one function keeps the time source replaceable. */
  const nowDate = () => new Date()

  /** Save the current state, one write at a time. */
  const persist = () => {
    const current = state
    writeChain = writeChain
      .then(() => writeState(current))
      .catch(error => {
        console.error('[dsh-calendar] не удалось сохранить данные:', error?.message ?? error)
      })
    return writeChain
  }

  /** Load the data file; routes and tools await this promise. */
  const ready = readState().then(loaded => {
    state = loaded
    return state
  })

  /** Event views of one local day, sorted by start. */
  function eventsOfDay(current) {
    const key = dateKey(current)
    return state.events
      .filter(event => dateKey(event.start) === key)
      .map(eventView)
      .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
  }

  /** Time-log views of one local day, oldest first. */
  function logOfDay(current) {
    const key = dateKey(current)
    return state.log
      .filter(entry => dateKey(entry.endedAt) === key)
      .map(logView)
      .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  }

  /**
   * Everything the page needs in one answer.
   * @returns the snapshot object.
   */
  function snapshot() {
    const current = nowDate()
    const todayEvents = eventsOfDay(current)
    const todayLog = logOfDay(current)
    const totalSec = todayLog.reduce((sum, entry) => sum + entry.durationSec, 0)
    return {
      ok: true,
      version: state.version,
      now: current.toISOString(),
      today: {
        date: dateKey(current),
        events: todayEvents,
        count: todayEvents.length,
        done: todayEvents.filter(event => event.done === true).length,
      },
      timer: timerView(state.timer, current),
      logToday: { entries: todayLog, totalSec, count: todayLog.length },
      recent: state.log.slice(-VISIBLE_RECENT).map(logView).reverse(),
      report: {
        today: summaryFor(state, 'today', current),
        week: summaryFor(state, 'week', current),
      },
      limits: { maxEntries: MAX_ENTRIES },
    }
  }

  /**
   * Events from today through `days - 1` days ahead, grouped by date.
   * @param days - window length in days.
   * @returns `{ days, from, to, groups, total }`.
   */
  function calendarList(days) {
    const current = nowDate()
    const window = Math.min(MAX_LIST_DAYS, Math.max(1, Math.round(Number(days) || 7)))
    const from = startOfDay(current)
    const to = addDays(from, window)
    const fromMs = from.getTime()
    const toMs = to.getTime()
    const events = state.events
      .filter(event => {
        const startMs = Date.parse(event.start)
        return Number.isFinite(startMs) && startMs >= fromMs && startMs < toMs
      })
      .map(eventView)
      .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
    const groups = []
    for (const event of events) {
      const last = groups[groups.length - 1]
      if (last !== undefined && last.date === event.date) last.events.push(event)
      else groups.push({ date: event.date, events: [event] })
    }
    return { days: window, from: from.toISOString(), to: to.toISOString(), groups, total: events.length }
  }

  /**
   * Run one timer action, save the result and describe it.
   * @param action - `start`, `break`, `pause`, `resume` or `stop`.
   * @param input - `{ label?, sessionId?, durationMin? }`.
   * @returns `{ ok, action, timer, message, log }`.
   */
  async function runTimerAction(action, input) {
    const current = nowDate()
    if (action === 'start' || action === 'break') {
      const timer = startTimer(state.timer, {
        mode: action === 'break' ? 'break' : 'work',
        label: input?.label,
        sessionId: input?.sessionId,
        durationMin: input?.durationMin,
      }, current)
      state = { ...state, timer }
      await persist()
      const view = timerView(state.timer, current)
      return {
        ok: true,
        action,
        timer: view,
        message: action === 'break'
          ? `Перерыв запущен на ${view.durationMin} мин.`
          : `Таймер запущен: «${view.label}», ${view.durationMin} мин.`,
        log: null,
      }
    }
    if (action === 'pause') {
      const timer = pauseTimer(state.timer, current)
      state = { ...state, timer }
      await persist()
      return { ok: true, action, timer: timerView(timer, current), message: 'Таймер на паузе.', log: null }
    }
    if (action === 'resume') {
      const timer = resumeTimer(state.timer, current)
      state = { ...state, timer }
      await persist()
      return { ok: true, action, timer: timerView(timer, current), message: 'Таймер продолжен.', log: null }
    }
    if (action === 'stop') {
      const before = state.timer
      const result = stopTimer(before, current)
      let entry = null
      state = { ...state, timer: result.timer }
      if (before.mode === 'work' && result.durationSec > 0) {
        const appended = appendLog(state, timerLogEntry(before, result))
        state = appended.state
        entry = logView(appended.entry)
      }
      await persist()
      const lines = []
      if (before.mode === 'work') {
        lines.push(entry === null
          ? 'Таймер остановлен: прошло меньше секунды, в журнал ничего не записано.'
          : `Таймер остановлен: «${entry.label}», ${formatDuration(entry.durationSec)} записано в журнал.`)
        if (result.completed === true) lines.push('Интервал дошёл до запланированной длительности.')
      } else {
        lines.push('Перерыв завершён: в журнал времени перерывы не записываются.')
      }
      return { ok: true, action, timer: timerView(result.timer, current), message: lines.join(' '), log: entry }
    }
    throw new Error(`Неизвестное действие таймера «${String(action)}»: допустимо start, break, pause, resume, stop.`)
  }

  // Routes live as one effect: unloading the plugin removes all of them.
  try {
    ctx.effect(() => {
      /** Register one POST route with a common JSON error wrapper. */
      const register = (path, handle) => ctx.connection.fetch.register({
        path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async request => {
          try {
            return await handle(request)
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return json({ ok: false, message: message === '' ? 'неизвестная ошибка' : message })
          }
        },
      })

      register(STATE_PATH, async () => {
        await ready
        return json(snapshot())
      })

      register(EVENT_ADD_PATH, async request => {
        await ready
        const body = await readBody(request)
        const created = createEvent(state, body, nowDate())
        state = created.state
        await persist()
        return json({
          ok: true,
          event: eventView(created.event),
          message: `Событие «${created.event.title}» добавлено.`,
        })
      })

      register(EVENT_TOGGLE_PATH, async request => {
        await ready
        const body = await readBody(request)
        const toggled = flipEvent(state, body.id)
        state = toggled.state
        await persist()
        return json({
          ok: true,
          event: eventView(toggled.event),
          message: `Событие «${toggled.event.title}» отмечено как ${toggled.event.done === true ? 'выполненное' : 'невыполненное'}.`,
        })
      })

      register(EVENT_REMOVE_PATH, async request => {
        await ready
        const body = await readBody(request)
        const removed = deleteEvent(state, body.id)
        state = removed.state
        await persist()
        return json({ ok: true, message: `Событие «${removed.removed.title}» удалено.` })
      })

      register(TIMER_PATH, async request => {
        await ready
        const body = await readBody(request)
        return json(await runTimerAction(body.action, body))
      })

      register(LOG_ADD_PATH, async request => {
        await ready
        const body = await readBody(request)
        const recorded = recordManualLog(state, body, nowDate())
        state = recorded.state
        await persist()
        return json({
          ok: true,
          entry: logView(recorded.entry),
          message: `Записано: «${recorded.entry.label}», ${formatDuration(recorded.entry.durationSec)}.`,
        })
      })

      register(REPORT_PATH, async request => {
        await ready
        const body = await readBody(request)
        const range = body.range === 'week' ? 'week' : 'today'
        return json({ ok: true, report: summaryFor(state, range, nowDate()) })
      })
    }, 'dsh-calendar: routes')
  } catch (error) {
    console.error('[dsh-calendar] маршруты недоступны:', error)
  }

  // Effect-owned registrations: unloading or replacing the plugin disposes every
  // tool, so a reload can register the same names again.
  try {
    ctx.effect(() => {
      const disposers = []
      const runtime = {
        ready,
        snapshot,
        calendarList: async days => {
          await ready
          return calendarList(days)
        },
        addEvent: async input => {
          await ready
          const created = createEvent(state, input, nowDate())
          state = created.state
          await persist()
          return eventView(created.event)
        },
        timerAction: async (action, input) => {
          await ready
          return await runTimerAction(action, input)
        },
        report: async range => {
          await ready
          return summaryFor(state, range, nowDate())
        },
      }
      for (const tool of createTools(runtime)) {
        try {
          disposers.push(ctx.tools.register(tool))
        } catch (error) {
          // One bad definition must not hide the rest.
          console.error(`[dsh-calendar] инструмент ${tool.name} не зарегистрирован:`, error?.message ?? error)
        }
      }
      return () => {
        for (const dispose of disposers.splice(0)) {
          try {
            dispose()
          } catch {
            // disposal is best effort
          }
        }
      }
    }, 'dsh-calendar: tools')
  } catch (error) {
    console.error('[dsh-calendar] инструменты недоступны:', error)
  }
}
