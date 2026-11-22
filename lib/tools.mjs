/**
 * Agent-facing tools of the calendar plugin.
 *
 * Seven tools: `calendar_today` and `calendar_list` read the schedule,
 * `calendar_add` creates an event, `timer_start`, `timer_status` and
 * `timer_stop` drive the pomodoro timer, and `time_report` prints the time log
 * of today or of the current week. They share the runtime with the plugin page,
 * so an event added by the agent appears on the page at once and a timer started
 * from the page is visible here.
 */

import {
  formatCalendarList,
  formatEventAdded,
  formatReport,
  formatTimer,
  formatTimerAction,
  formatToday,
} from './format.mjs'

/** Canonical text output shared by every tool. */
const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
}

/** Default window of `calendar_list`, in days. */
export const DEFAULT_LIST_DAYS = 7

/** Longest window of `calendar_list`, in days. */
export const MAX_LIST_DAYS = 31

/**
 * Normalise the `days` argument of `calendar_list`.
 * @param value - unknown input.
 * @returns whole days inside [1, MAX_LIST_DAYS].
 */
export function normalizeDays(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_LIST_DAYS
  return Math.min(MAX_LIST_DAYS, Math.max(1, Math.round(number)))
}

/**
 * Build every tool definition.
 * @param deps - runtime bridge:
 *   `ready`, `snapshot()`, `addEvent(input)`, `calendarList(days)`,
 *   `timerAction(action, input)`, `report(range)`.
 * @returns the definitions to register.
 */
export function createTools(deps) {
  return [
    {
      name: 'calendar_today',
      description: 'Показать события на сегодня, статус таймера и учтённое время за день. Только чтение.',
      parameters: { type: 'object', properties: {} },
      output: TEXT_OUTPUT,
      async execute() {
        await deps.ready
        return formatToday(deps.snapshot())
      },
    },
    {
      name: 'calendar_add',
      description: 'Добавить событие в календарь: название обязательно, дата, время, длительность в минутах и заметка — по желанию.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Название события, до 200 символов.' },
          date: { type: 'string', description: 'Дата в формате YYYY-MM-DD; без неё — сегодня.' },
          time: { type: 'string', description: 'Время начала HH:MM в локальной зоне; без него — текущее время.' },
          durationMin: { type: 'number', description: 'Длительность в минутах, от 5 до 1440; по умолчанию 30.' },
          note: { type: 'string', description: 'Заметка к событию, до 500 символов.' },
        },
        required: ['title'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        await deps.ready
        const event = await deps.addEvent({
          title: args?.title,
          date: args?.date,
          time: args?.time,
          durationMin: args?.durationMin,
          note: args?.note,
        })
        return formatEventAdded(event)
      },
    },
    {
      name: 'calendar_list',
      description: 'Показать события на ближайшие дни, начиная с сегодня: days — сколько дней, по умолчанию 7, максимум 31.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: `Сколько дней показать от сегодня: от 1 до ${MAX_LIST_DAYS}, по умолчанию ${DEFAULT_LIST_DAYS}.` },
        },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        await deps.ready
        return formatCalendarList(await deps.calendarList(normalizeDays(args?.days)))
      },
    },
    {
      name: 'timer_start',
      description: 'Запустить таймер: работа 25 минут по умолчанию или своя длительность durationMin; label — метка для журнала времени.',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Метка для журнала времени; по умолчанию «Работа».' },
          sessionId: { type: 'string', description: 'Идентификатор сессии DSH, если нужно связать интервал с сессией.' },
          durationMin: { type: 'number', description: 'Длительность в минутах, от 1 до 720; по умолчанию 25.' },
        },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        await deps.ready
        const result = await deps.timerAction('start', {
          label: args?.label,
          sessionId: args?.sessionId,
          durationMin: args?.durationMin,
        })
        return formatTimerAction(result)
      },
    },
    {
      name: 'timer_status',
      description: 'Показать состояние таймера: режим, метка, сколько прошло и осталось, не завершился ли он, пока DSH был закрыт.',
      parameters: { type: 'object', properties: {} },
      output: TEXT_OUTPUT,
      async execute() {
        await deps.ready
        return formatTimer(deps.snapshot().timer)
      },
    },
    {
      name: 'timer_stop',
      description: 'Остановить таймер и записать рабочий интервал в журнал времени; перерывы в журнал не записываются.',
      parameters: { type: 'object', properties: {} },
      output: TEXT_OUTPUT,
      async execute() {
        await deps.ready
        const result = await deps.timerAction('stop', {})
        return formatTimerAction(result)
      },
    },
    {
      name: 'time_report',
      description: 'Отчёт по учтённому времени: range "today" (сегодня) или "week" (текущая неделя) — сумма и разбивка по меткам.',
      parameters: {
        type: 'object',
        properties: {
          range: { type: 'string', description: 'Период отчёта: "today" или "week". По умолчанию "today".' },
        },
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        await deps.ready
        const range = args?.range === 'week' ? 'week' : 'today'
        return formatReport(await deps.report(range))
      },
    },
  ]
}
