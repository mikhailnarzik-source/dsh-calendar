/**
 * Text forms for the agent tools and the Host messages.
 *
 * The strings are Russian, like the rest of the Host side of the project; the
 * page is localised separately through the client dictionaries.
 */

import { formatCountdown, formatDateTime, formatDuration, formatShortDate } from './time.mjs'

/** Mark of a finished event. */
const DONE_MARK = '✓'

/** Mark of a pending event. */
const OPEN_MARK = '○'

/** Russian word for the report range. */
const RANGE_RU = { today: 'сегодня', week: 'неделю' }

/**
 * One event line.
 * @param event - event view.
 * @returns `14:00–15:00 ○ Название — заметка`.
 */
export function formatEventLine(event) {
  const mark = event.done === true ? DONE_MARK : OPEN_MARK
  const note = typeof event.note === 'string' && event.note !== '' ? ` — ${event.note}` : ''
  return `${event.time}–${event.endTime} ${mark} ${event.title}${note}`
}

/**
 * The timer as one line for the daily text.
 * @param timer - timer view.
 * @returns a sentence.
 */
export function formatTimerLine(timer) {
  if (timer === null || timer === undefined || timer.mode === 'idle') return 'Таймер: не запущен.'
  const label = timer.label === '' ? (timer.mode === 'break' ? 'Перерыв' : 'Работа') : timer.label
  const mode = timer.mode === 'break' ? 'перерыв' : 'работа'
  if (timer.expired === true) {
    return `Таймер: ${mode} «${label}» — время вышло (${timer.durationMin} мин). Остановите его, чтобы записать интервал в журнал.`
  }
  const state = timer.paused === true ? 'на паузе' : 'идёт'
  return `Таймер: ${mode} «${label}» — ${state}, осталось ${formatCountdown(timer.remainingSec)} из ${formatCountdown(timer.durationSec)}.`
}

/**
 * Full timer status text.
 * @param timer - timer view.
 * @returns a multi-line report.
 */
export function formatTimer(timer) {
  const lines = [formatTimerLine(timer)]
  if (timer === null || timer === undefined || timer.mode === 'idle') {
    lines.push('Запустите: timer_start (работа 25 минут по умолчанию) или кнопкой на странице плагина.')
    return lines.join('\n')
  }
  lines.push(`Начало: ${formatDateTime(timer.startedAt)}; прошло ${formatDuration(timer.elapsedSec)}; длительность ${timer.durationMin} мин.`)
  if (timer.expired === true) {
    lines.push('Пока DSH был закрыт, таймер дошёл до конца. timer_stop запишет в журнал запланированные минуты и очистит таймер.')
  } else if (timer.paused === true) {
    lines.push('Таймер на паузе: время не идёт. Продолжите на странице плагина.')
  } else {
    lines.push(`Окончание: ${formatDateTime(timer.finishedAt)}.`)
  }
  return lines.join('\n')
}

/**
 * One report as text.
 * @param report - summary with `range`, `totalSec`, `count`, `byLabel`.
 * @param now - the moment the report was built for.
 * @returns a multi-line report.
 */
export function formatReport(report, now) {
  const range = report?.range === 'week' ? 'week' : 'today'
  const date = now === undefined ? new Date() : now
  const fromMs = Date.parse(report?.from ?? '')
  const toMs = Date.parse(report?.to ?? '')
  const period = range === 'week' && Number.isFinite(fromMs) && Number.isFinite(toMs)
    ? `${formatShortDate(new Date(fromMs))}–${formatShortDate(new Date(toMs - 1))}`
    : formatShortDate(Number.isFinite(fromMs) ? new Date(fromMs) : date)
  const headers = {
    today: `Отчёт за сегодня (${period}): ${formatDuration(report?.totalSec ?? 0)}, записей ${report?.count ?? 0}.`,
    week: `Отчёт за неделю (${period}): ${formatDuration(report?.totalSec ?? 0)}, записей ${report?.count ?? 0}.`,
  }
  const lines = [headers[range]]
  const labels = Array.isArray(report?.byLabel) ? report.byLabel : []
  if (labels.length === 0) {
    lines.push('Учтённого времени нет. Запустите таймер (timer_start) или добавьте запись вручную (time_report: range "today").')
    return lines.join('\n')
  }
  for (const row of labels) {
    const share = Math.round((Number(row.share) || 0) * 100)
    lines.push(`- ${row.label}: ${formatDuration(row.durationSec)} (${row.count} записей, ${share}%)`)
  }
  return lines.join('\n')
}

/**
 * The daily summary used by `calendar_today`.
 * @param snapshot - what the `/state` route returns.
 * @returns a multi-line report.
 */
export function formatToday(snapshot) {
  const now = new Date(snapshot.now)
  const events = Array.isArray(snapshot.today?.events) ? snapshot.today.events : []
  const done = events.filter(event => event.done === true).length
  const lines = [`Сегодня, ${formatDateTime(now)}.`]
  if (events.length === 0) {
    lines.push('Событий на сегодня нет. Добавьте: calendar_add с названием, временем и длительностью.')
  } else {
    lines.push(`События (${events.length}, выполнено ${done}):`)
    for (const event of events) lines.push(`- ${formatEventLine(event)}`)
  }
  lines.push(formatTimerLine(snapshot.timer))
  const report = snapshot.report?.today ?? { totalSec: 0, count: 0, byLabel: [] }
  lines.push(`Учтённое время: ${formatDuration(report.totalSec)} за ${report.count} записей.`)
  for (const row of Array.isArray(report.byLabel) ? report.byLabel : []) {
    lines.push(`- ${row.label}: ${formatDuration(row.durationSec)}`)
  }
  lines.push('Отчёт за неделю: time_report range "week".')
  return lines.join('\n')
}

/**
 * The upcoming-events text used by `calendar_list`.
 * @param view - `{ days, from, to, groups, total }`, groups have `{ date, events }`.
 * @returns a multi-line report.
 */
export function formatCalendarList(view) {
  const groups = Array.isArray(view?.groups) ? view.groups : []
  const days = Math.max(1, Math.round(Number(view?.days) || 7))
  const fromMs = Date.parse(view?.from ?? '')
  const toMs = Date.parse(view?.to ?? '')
  const period = Number.isFinite(fromMs) && Number.isFinite(toMs)
    ? `${formatShortDate(new Date(fromMs))}–${formatShortDate(new Date(toMs - 1))}`
    : 'сегодня и далее'
  const lines = [`События на ближайшие ${days} дн. (${period}), всего ${view?.total ?? 0}.`]
  if (groups.length === 0) {
    lines.push('Событий нет. Добавьте: calendar_add.')
    return lines.join('\n')
  }
  for (const group of groups) {
    lines.push(`${formatShortDate(`${group.date}T12:00:00`)}:`)
    for (const event of group.events) lines.push(`- ${formatEventLine(event)}`)
  }
  return lines.join('\n')
}

/**
 * Confirmation of a created event.
 * @param event - event view.
 * @returns a sentence.
 */
export function formatEventAdded(event) {
  return `Добавлено событие «${event.title}» на ${formatShortDate(`${event.date}T12:00:00`)} в ${event.time} (${event.durationMin} мин).`
}

/**
 * Confirmation of a toggled event.
 * @param event - event view.
 * @returns a sentence.
 */
export function formatEventToggled(event) {
  return `Событие «${event.title}» отмечено как ${event.done === true ? 'выполненное' : 'невыполненное'}.`
}

/**
 * Confirmation of a removed event.
 * @param event - removed event view or stored event.
 * @returns a sentence.
 */
export function formatEventRemoved(event) {
  return `Событие «${event?.title ?? ''}» удалено.`
}

/**
 * Confirmation of a manually recorded block.
 * @param entry - log view.
 * @returns a sentence.
 */
export function formatLogAdded(entry) {
  return `Записано: «${entry.label}», ${formatDuration(entry.durationSec)} (${formatShortDate(`${entry.date}T12:00:00`)}).`
}

/**
 * Text answer to a timer action.
 * @param result - `{ action, timer, message, log }` from the Host runtime.
 * @returns a multi-line answer.
 */
export function formatTimerAction(result) {
  const lines = [result?.message ?? '']
  if (result?.timer !== undefined) lines.push(formatTimerLine(result.timer))
  if (result?.log !== undefined && result.log !== null) {
    lines.push(`В журнал: «${result.log.label}», ${formatDuration(result.log.durationSec)}.`)
  }
  return lines.filter(line => typeof line === 'string' && line !== '').join('\n')
}

/** Human name of a report range, for hints. */
export function rangeName(range) {
  return RANGE_RU[range === 'week' ? 'week' : 'today']
}
