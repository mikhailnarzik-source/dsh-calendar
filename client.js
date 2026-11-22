/**
 * Browser half of `dsh-calendar` — «Календарь и учёт времени».
 *
 * Registers a global panel in the left rail (the same `main` + `sidebar.panellist`
 * pair «Расходы» and «Плагины» use), a floating timer chip in `shell.overlay`,
 * and a short help section on the plugin page:
 *   «Сегодня»      — events of the day, a quick-add form, done marks, deletion;
 *   «Таймер»       — a pomodoro counter that ticks every second, work 25,
 *                    break 5 or a custom length, start/pause/resume/stop;
 *   «Учёт времени» — the time log of today with its total and a manual record;
 *   «Отчёт»        — today or the current week, broken down by label.
 *
 * The Host owns the state: the page only calls POST routes and re-reads the
 * snapshot, so the same timer runs in the agent and in the browser. The panel
 * refreshes every five seconds while it is open; the interval, the one-second
 * ticker and the finish notice are removed on unmount. The plugin page keeps a
 * one-paragraph help card that opens the panel through `ctx.layout.selectPanel`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-calendar',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;

    const NS = 'dshCalendar';
    /** Panel identity: the rail entry id and the `main` slot key are the same. */
    const PANEL_ID = 'calendar';
    const STATE_PATH = '/api/dsh-calendar/state';
    const EVENT_ADD_PATH = '/api/dsh-calendar/event/add';
    const EVENT_TOGGLE_PATH = '/api/dsh-calendar/event/toggle';
    const EVENT_REMOVE_PATH = '/api/dsh-calendar/event/remove';
    const TIMER_PATH = '/api/dsh-calendar/timer';
    const LOG_ADD_PATH = '/api/dsh-calendar/log/add';
    const REPORT_PATH = '/api/dsh-calendar/report';
    const REFRESH_MS = 5000;
    /** The floating chip re-reads the timer in the background at this cadence. */
    const CHIP_REFRESH_MS = 20000;

    const en = {
      panel: 'Calendar',
      pageTitle: 'Calendar and time tracking',
      hint: 'Events of the day, a pomodoro timer and a time log — everything stays on this computer.',
      helpHint: 'The calendar opens in the left sidebar — the calendar-clock icon. Events, the timer, the time log and reports live there, and the agent sees the same data.',
      helpOpen: 'Open calendar',
      helpOpenFailed: 'Could not open the panel. Click the calendar icon in the left sidebar.',
      chipHint: 'Open the calendar in the left sidebar',
      refresh: 'Refresh',
      loadFailed: 'Could not load the calendar. It will retry in a few seconds.',
      retry: 'Retry',
      loading: 'Loading…',
      saved: 'Done.',
      requestFailed: 'The request did not complete.',
      addFailed: 'Could not add the event.',
      toggleFailed: 'Could not change the event.',
      removeFailed: 'Could not remove the event.',
      timerActionFailed: 'The timer action failed:',
      logAddFailed: 'Could not record the time.',
      reportFailed: 'Could not build the report.',
      todayTitle: 'Today',
      todayCount: 'events:',
      doneCount: 'done:',
      noEvents: 'No events today. Add one in the form above.',
      addTitle: 'New event',
      titleLabel: 'Title',
      titlePlaceholder: 'What is planned…',
      timeLabel: 'Time',
      durationLabel: 'Minutes',
      noteLabel: 'Note',
      notePlaceholder: 'Note (optional)',
      addButton: 'Add',
      adding: 'Adding…',
      eventAdded: 'Event added.',
      doneMark: '✓',
      undoneMark: '○',
      markDone: 'Mark as done',
      markOpen: 'Mark as not done',
      deleteEvent: 'Delete',
      confirmRemove: 'Delete this event?',
      yes: 'Yes, delete',
      no: 'No',
      eventRemoved: 'Event deleted.',
      timerTitle: 'Timer',
      timerIdle: 'not running',
      timerRunning: 'running',
      timerPaused: 'paused',
      timerExpired: 'time is up',
      timerModeWork: 'Work 25',
      timerModeBreak: 'Break 5',
      timerModeCustom: 'Custom',
      defaultWorkLabel: 'Work',
      defaultBreakLabel: 'Break',
      customMinutesLabel: 'Minutes',
      minutesShort: 'min',
      hoursShort: 'h',
      labelLabel: 'Label',
      labelPlaceholder: 'Label for the time log',
      timerStartAction: 'Start',
      timerPauseAction: 'Pause',
      timerResumeAction: 'Resume',
      timerStopAction: 'Stop',
      timerStartedNotice: 'Timer started.',
      timerStoppedNotice: 'Timer stopped and the interval is written to the time log.',
      timerStoppedNoLog: 'Timer stopped: less than a second passed, nothing was written to the time log.',
      timerBreakStopped: 'Break finished: breaks are not written to the time log.',
      timerFinishedNotice: 'The timer has finished — stop it to write the interval to the time log.',
      timerExpiredNotice: 'The timer finished while DSH was closed. Stop it to write the planned interval.',
      counterRemaining: 'left',
      counterElapsed: 'elapsed',
      logTitle: 'Time log',
      logEmpty: 'No time recorded today yet. Start the timer or add a record below.',
      logTotal: 'Total:',
      logSourceTimer: 'timer',
      logSourceManual: 'manual',
      logAddTitle: 'Record by hand',
      logLabelPlaceholder: 'Label, e.g. Meeting',
      logMinutesPlaceholder: 'Minutes',
      logAddButton: 'Record',
      logAdding: 'Recording…',
      logAdded: 'Time recorded.',
      reportTitle: 'Report',
      rangeToday: 'Today',
      rangeWeek: 'Week',
      reportTotal: 'Total:',
      reportEntriesCount: 'records:',
      reportEmpty: 'No time recorded for this period.',
      reportShare: 'share',
      summaryTimerOff: 'timer off',
      summaryTimerOn: 'timer on',
      summaryBreakOn: 'break',
      summaryEvents: 'events:'
    };
    const ru = {
      panel: 'Календарь',
      pageTitle: 'Календарь и учёт времени',
      hint: 'События дня, помодоро-таймер и журнал времени — всё остаётся на этом компьютере.',
      helpHint: 'Календарь открывается в левой панели — значок календаря с часами. События, таймер, журнал времени и отчёты живут там, и ассистент видит те же данные.',
      helpOpen: 'Открыть календарь',
      helpOpenFailed: 'Не удалось открыть панель. Нажмите значок календаря в левой панели.',
      chipHint: 'Открыть календарь в левой панели',
      refresh: 'Обновить',
      loadFailed: 'Не удалось загрузить календарь. Через несколько секунд попробую снова.',
      retry: 'Повторить',
      loading: 'Загрузка…',
      saved: 'Готово.',
      requestFailed: 'Запрос не выполнился.',
      addFailed: 'Не удалось добавить событие.',
      toggleFailed: 'Не удалось изменить событие.',
      removeFailed: 'Не удалось удалить событие.',
      timerActionFailed: 'Действие с таймером не удалось:',
      logAddFailed: 'Не удалось записать время.',
      reportFailed: 'Не удалось построить отчёт.',
      todayTitle: 'Сегодня',
      todayCount: 'событий:',
      doneCount: 'выполнено:',
      noEvents: 'На сегодня событий нет. Добавьте событие в форме выше.',
      addTitle: 'Новое событие',
      titleLabel: 'Название',
      titlePlaceholder: 'Что запланировано…',
      timeLabel: 'Время',
      durationLabel: 'Минут',
      noteLabel: 'Заметка',
      notePlaceholder: 'Заметка (необязательно)',
      addButton: 'Добавить',
      adding: 'Добавляю…',
      eventAdded: 'Событие добавлено.',
      doneMark: '✓',
      undoneMark: '○',
      markDone: 'Отметить выполненным',
      markOpen: 'Отметить невыполненным',
      deleteEvent: 'Удалить',
      confirmRemove: 'Удалить это событие?',
      yes: 'Да, удалить',
      no: 'Нет',
      eventRemoved: 'Событие удалено.',
      timerTitle: 'Таймер',
      timerIdle: 'не запущен',
      timerRunning: 'идёт',
      timerPaused: 'на паузе',
      timerExpired: 'время вышло',
      timerModeWork: 'Работа 25',
      timerModeBreak: 'Перерыв 5',
      timerModeCustom: 'Своя длительность',
      defaultWorkLabel: 'Работа',
      defaultBreakLabel: 'Перерыв',
      customMinutesLabel: 'Минут',
      minutesShort: 'мин',
      hoursShort: 'ч',
      labelLabel: 'Метка',
      labelPlaceholder: 'Метка для журнала времени',
      timerStartAction: 'Старт',
      timerPauseAction: 'Пауза',
      timerResumeAction: 'Продолжить',
      timerStopAction: 'Стоп',
      timerStartedNotice: 'Таймер запущен.',
      timerStoppedNotice: 'Таймер остановлен, интервал записан в журнал времени.',
      timerStoppedNoLog: 'Таймер остановлен: прошло меньше секунды, в журнал ничего не записано.',
      timerBreakStopped: 'Перерыв завершён: перерывы в журнал времени не записываются.',
      timerFinishedNotice: 'Таймер дошёл до конца — нажмите «Стоп», чтобы записать интервал в журнал.',
      timerExpiredNotice: 'Таймер завершился, пока DSH был закрыт. Нажмите «Стоп», чтобы записать запланированный интервал.',
      counterRemaining: 'осталось',
      counterElapsed: 'прошло',
      logTitle: 'Учёт времени',
      logEmpty: 'За сегодня времени пока нет. Запустите таймер или добавьте запись ниже.',
      logTotal: 'Всего:',
      logSourceTimer: 'таймер',
      logSourceManual: 'вручную',
      logAddTitle: 'Записать вручную',
      logLabelPlaceholder: 'Метка, например «Созвон»',
      logMinutesPlaceholder: 'Минут',
      logAddButton: 'Записать',
      logAdding: 'Записываю…',
      logAdded: 'Время записано.',
      reportTitle: 'Отчёт',
      rangeToday: 'Сегодня',
      rangeWeek: 'Неделя',
      reportTotal: 'Всего:',
      reportEntriesCount: 'записей:',
      reportEmpty: 'За этот период времени нет.',
      reportShare: 'доля',
      summaryTimerOff: 'таймер выкл',
      summaryTimerOn: 'таймер идёт',
      summaryBreakOn: 'перерыв',
      summaryEvents: 'событий:'
    };

    /**
     * The stylesheet inherits the host theme: surfaces, text and borders come
     * from the `--dsw-alias-*` tokens, geometry is plain CSS.
     */
    const CSS = `
.dsh-calendar-page{box-sizing:border-box;display:flex;width:100%;min-width:0;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:20px}
.dsh-calendar-scroll{position:relative;flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.dsh-calendar-content{display:flex;flex-direction:column;gap:14px;box-sizing:border-box;width:100%;max-width:1100px;margin:0 auto;padding:0 clamp(20px,4vw,48px) 56px}
.dsh-calendar-heading{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding-top:28px}
.dsh-calendar-heading-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-calendar-heading h1{margin:0;font-size:22px;font-weight:600;line-height:30px;letter-spacing:-.01em}
.dsh-calendar-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dsh-calendar-logo{display:inline-flex;flex:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-logo.is-small{width:26px;height:26px;border-radius:9px}
.dsh-calendar-actions{display:flex;flex:none;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto}
.dsh-calendar-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start}
.dsh-calendar-grid > .dsh-calendar-card{min-width:0}
.dsh-calendar-help{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsh-calendar-help-card{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-calendar-chip-wrap{position:fixed;right:22px;bottom:22px;z-index:2147483000;display:flex;pointer-events:none}
.dsh-calendar-chip{position:relative;display:inline-flex;align-items:center;gap:9px;box-sizing:border-box;height:40px;padding:0 14px;border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2));border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 10px 28px rgba(15,23,42,.22);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;pointer-events:auto}
.dsh-calendar-chip:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-calendar-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-calendar-chip.is-bad{border-color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-chip-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dsh-calendar-chip.is-bad .dsh-calendar-chip-dot{background:var(--dsw-alias-state-error-primary)}
.dsh-calendar-chip-time{font-variant-numeric:tabular-nums;font-weight:600;font-size:15px;line-height:20px}
.dsh-calendar-chip-label{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px}
@media (max-width:1024px){.dsh-calendar-grid{grid-template-columns:minmax(0,1fr)}}
.dsh-calendar-card{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-calendar-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-calendar-label{font-weight:600}
.dsh-calendar-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px}
.dsh-calendar-note{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-state-success-primary)}
.dsh-calendar-note.is-bad{color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-error{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:17px;white-space:nowrap}
.dsh-calendar-pill.is-on{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}
.dsh-calendar-pill.is-warn{border-color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)}
.dsh-calendar-pill.is-bad{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}
.dsh-calendar-form{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-calendar-input{flex:1 1 180px;min-width:120px;box-sizing:border-box;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dsh-calendar-input::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-calendar-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-calendar-input:disabled{opacity:.6}
.dsh-calendar-input.is-time{flex:0 0 110px;min-width:100px}
.dsh-calendar-input.is-number{flex:0 0 92px;min-width:80px}
.dsh-calendar-input.is-title{flex:1 1 100%}
.dsh-calendar-input.is-note{flex:1 1 120px;min-width:100px}
.dsh-calendar-button{appearance:none;box-sizing:border-box;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}
.dsh-calendar-button:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent)}
.dsh-calendar-button:active:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)}
.dsh-calendar-button:disabled{opacity:.55;cursor:default}
.dsh-calendar-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-calendar-button.is-primary{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}
.dsh-calendar-button.is-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-button.is-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-list{display:flex;flex-direction:column;gap:6px}
.dsh-calendar-event{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base)}
.dsh-calendar-event.is-done{opacity:.62}
.dsh-calendar-event.is-done .dsh-calendar-event-title{text-decoration:line-through}
.dsh-calendar-check{appearance:none;box-sizing:border-box;width:24px;height:24px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;flex:0 0 auto}
.dsh-calendar-event.is-done .dsh-calendar-check{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.dsh-calendar-event-time{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-event-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-event-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-event-note{flex:1 1 140px;min-width:100px;font-size:12px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-event .dsh-calendar-button{height:26px;padding:0 9px;font-size:12px;margin-left:auto}
.dsh-calendar-timer{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.dsh-calendar-counter{font-size:34px;line-height:38px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.5px}
.dsh-calendar-counter.is-bad{color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-log{display:flex;flex-direction:column;gap:6px}
.dsh-calendar-log-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-base)}
.dsh-calendar-badge{display:inline-flex;align-items:center;padding:1px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-bars{display:flex;flex-direction:column;gap:7px}
.dsh-calendar-bar-row{display:flex;flex-direction:column;gap:3px}
.dsh-calendar-bar-head{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:17px}
.dsh-calendar-bar-label{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-bar-value{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-bar-track{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsh-calendar-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}
.dsh-calendar-summary{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.dsh-calendar-badge.is-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
`;

    /** Locale lookup with a literal fallback, so a missing dictionary never prints a key. */
    let bound;
    function translate(key) {
      if (bound !== undefined) {
        try {
          const value = bound(key);
          if (typeof value === 'string' && value !== '' && value !== key) return value;
        } catch {
          // Fall through to the literal Russian dictionary.
        }
      }
      return ru[key] ?? en[key] ?? key;
    }

    /** Calendar-clock glyph: the left-rail icon and the page heading logo. */
    function CalendarIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': true,
          focusable: false
        },
        h('rect', { x: 1.75, y: 3.25, width: 12.5, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M1.75 6.25h12.5', stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M4.75 1.75v3M11.25 1.75v3', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        h('circle', { cx: 8, cy: 10.5, r: 2.1, stroke: 'currentColor', strokeWidth: 1.2 }),
        h('path', { d: 'M8 9.6v1l1 0.6', stroke: 'currentColor', strokeWidth: 1, strokeLinecap: 'round' })
      );
    }

    /** Two-digit padding. */
    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    /**
     * Countdown text `MM:SS`, or `H:MM:SS` past an hour.
     * @param totalSec - seconds.
     * @returns the clock-like text.
     */
    function formatCounter(totalSec) {
      const seconds = Math.max(0, Math.round(Number(totalSec) || 0));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = seconds % 60;
      if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(rest)}`;
      return `${pad2(minutes)}:${pad2(rest)}`;
    }

    /**
     * Human duration in the current language.
     * @param totalSec - seconds.
     * @param t - translation function.
     * @returns `25 мин`, `1 ч 05 мин`.
     */
    function durationText(totalSec, t) {
      const seconds = Math.max(0, Math.round(Number(totalSec) || 0));
      const minutes = Math.max(seconds === 0 ? 0 : 1, Math.round(seconds / 60));
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (hours === 0) return `${minutes} ${t('minutesShort')}`;
      if (rest === 0) return `${hours} ${t('hoursShort')}`;
      return `${hours} ${t('hoursShort')} ${pad2(rest)} ${t('minutesShort')}`;
    }

    /** A short beep at the end of a run; never throws, never blocks the page. */
    function beep() {
      try {
        const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
        if (AudioContextClass === undefined) return;
        const audio = new AudioContextClass();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.35);
        setTimeout(() => {
          try {
            void audio.close();
          } catch {
            // the context may already be closed
          }
        }, 800);
      } catch {
        // sound is a nice-to-have: a blocked AudioContext must not break the page
      }
    }

    /**
     * Mount the section.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      bound = t;
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-calendar: card dictionaries');

      /**
       * Open the calendar panel in the main area through the layout service.
       * @returns true when the panel was selected.
       */
      function openPanel() {
        try {
          const layout = ctx.layout ?? (typeof ctx.get === 'function' ? ctx.get('layout') : undefined);
          if (layout !== undefined && layout !== null && typeof layout.selectPanel === 'function') {
            layout.selectPanel(PANEL_ID);
            return true;
          }
        } catch {
          // An older host without ctx.layout keeps the hint-only help card.
        }
        return false;
      }

      /**
       * Call one Host route.
       * @param path - route path.
       * @param payload - JSON body.
       * @returns the parsed answer; `null` when the body is not JSON.
       */
      async function call(path, payload) {
        const response = await fetch(path, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {})
        });
        return await response.json().catch(() => null);
      }

      /** Short badge for the plugin row in the list. */
      function CalendarSummary() {
        const [data, setData] = React.useState(null);
        React.useEffect(() => {
          let alive = true;
          call(STATE_PATH)
            .then(payload => {
              if (alive) setData(payload);
            })
            .catch(() => {});
          return () => {
            alive = false;
          };
        }, []);
        const timer = data?.timer ?? {};
        const timerClass = timer.mode === 'work' || timer.mode === 'break'
          ? 'dsh-calendar-badge is-on'
          : 'dsh-calendar-badge';
        return h(
          'span',
          { className: 'dsh-calendar-summary' },
          h('span', null, t('pageTitle')),
          h('span', { className: timerClass },
            timer.mode === 'work'
              ? t('summaryTimerOn')
              : timer.mode === 'break'
                ? t('summaryBreakOn')
                : t('summaryTimerOff')),
          h('span', { className: 'dsh-calendar-badge' }, `${t('summaryEvents')} ${data?.today?.count ?? 0}`)
        );
      }

      /** The full section: today, timer, time log and report. */
      function CalendarPage() {
        const [snapshot, setSnapshot] = React.useState(null);
        const [phase, setPhase] = React.useState('loading');
        const [tick, setTick] = React.useState(() => Date.now());
        const [notice, setNotice] = React.useState(null);
        const [busy, setBusy] = React.useState('');
        const [draft, setDraft] = React.useState({ title: '', time: '', durationMin: '30', note: '' });
        const [timerMode, setTimerMode] = React.useState('work');
        const [customMinutes, setCustomMinutes] = React.useState('30');
        const [labelDraft, setLabelDraft] = React.useState('');
        const [confirmId, setConfirmId] = React.useState('');
        const [range, setRange] = React.useState('today');
        const [fetchedReport, setFetchedReport] = React.useState(null);
        const [logDraft, setLogDraft] = React.useState({ label: '', minutes: '25' });
        const mounted = React.useRef(true);
        const notified = React.useRef('');

        const refresh = React.useCallback(async () => {
          try {
            const payload = await call(STATE_PATH);
            if (!mounted.current) return;
            if (payload === null || payload.ok !== true) {
              setPhase('error');
              return;
            }
            setSnapshot(payload);
            setPhase('ready');
          } catch {
            if (mounted.current) setPhase('error');
          }
        }, []);

        // The page is live only while the section is mounted: the interval and
        // the one-second ticker below are disposed on unmount.
        React.useEffect(() => {
          mounted.current = true;
          void refresh();
          const timer = setInterval(() => {
            if (document.visibilityState !== 'hidden') void refresh();
          }, REFRESH_MS);
          return () => {
            mounted.current = false;
            clearInterval(timer);
          };
        }, [refresh]);

        React.useEffect(() => {
          const timer = setInterval(() => setTick(Date.now()), 1000);
          return () => clearInterval(timer);
        }, []);

        // A confirmation line is transient: a stale "saved" must not read as the
        // current state.
        React.useEffect(() => {
          if (notice === null) return undefined;
          const timer = setTimeout(() => setNotice(null), 8000);
          return () => clearTimeout(timer);
        }, [notice]);

        const run = async (action, work) => {
          if (busy !== '') return;
          setBusy(action);
          setNotice(null);
          try {
            await work();
          } finally {
            if (mounted.current) setBusy('');
          }
        };

        const addEvent = () => {
          const title = draft.title.trim();
          if (title === '') return;
          return run('add', async () => {
            try {
              const payload = await call(EVENT_ADD_PATH, {
                title,
                time: draft.time.trim(),
                durationMin: Number(draft.durationMin) || 30,
                note: draft.note.trim()
              });
              if (!mounted.current) return;
              if (payload?.ok !== true) {
                setNotice({ kind: 'bad', text: payload?.message ?? t('addFailed') });
                return;
              }
              setDraft({ title: '', time: '', durationMin: '30', note: '' });
              setNotice({ kind: 'ok', text: t('eventAdded') });
              await refresh();
            } catch {
              if (mounted.current) setNotice({ kind: 'bad', text: t('addFailed') });
            }
          });
        };

        const toggleEvent = event => run('toggle', async () => {
          try {
            const payload = await call(EVENT_TOGGLE_PATH, { id: event.id });
            if (!mounted.current) return;
            if (payload?.ok !== true) setNotice({ kind: 'bad', text: payload?.message ?? t('toggleFailed') });
            await refresh();
          } catch {
            if (mounted.current) setNotice({ kind: 'bad', text: t('toggleFailed') });
          }
        });

        const removeEvent = event => run('remove', async () => {
          try {
            const payload = await call(EVENT_REMOVE_PATH, { id: event.id });
            if (!mounted.current) return;
            setConfirmId('');
            setNotice({ kind: payload?.ok === true ? 'ok' : 'bad', text: payload?.ok === true ? t('eventRemoved') : (payload?.message ?? t('removeFailed')) });
            await refresh();
          } catch {
            if (mounted.current) setNotice({ kind: 'bad', text: t('removeFailed') });
          }
        });

        const timerAction = (action, payload) => run('timer', async () => {
          try {
            const answer = await call(TIMER_PATH, { action, ...(payload ?? {}) });
            if (!mounted.current) return;
            if (answer?.ok !== true) {
              setNotice({ kind: 'bad', text: `${t('timerActionFailed')} ${answer?.message ?? ''}`.trim() });
              return;
            }
            // The floating chip lives in another subtree; a window event keeps it
            // in sync without waiting for its background poll.
            try {
              window.dispatchEvent(new Event('dsh-calendar:timer-changed'));
            } catch {
              // no window (test harness): the poll still catches up
            }
            setNotice({
              kind: 'ok',
              text: action === 'stop'
                ? timer.mode === 'break'
                  ? t('timerBreakStopped')
                  : answer.log === null
                    ? t('timerStoppedNoLog')
                    : t('timerStoppedNotice')
                : action === 'pause' || action === 'resume'
                  ? t('saved')
                  : t('timerStartedNotice')
            });
            await refresh();
          } catch {
            if (mounted.current) setNotice({ kind: 'bad', text: t('timerActionFailed') });
          }
        });

        const startSelected = () => {
          const minutes = Number(customMinutes);
          const fallbackLabel = timerMode === 'break' ? t('defaultBreakLabel') : t('defaultWorkLabel');
          const label = labelDraft.trim() || fallbackLabel;
          if (timerMode === 'break') return timerAction('break', { label });
          return timerAction('start', {
            label,
            ...(timerMode === 'custom' ? { durationMin: Number.isFinite(minutes) && minutes > 0 ? minutes : 30 } : {})
          });
        };

        const stopTimer = () => timerAction('stop');

        const addLog = () => {
          const label = logDraft.label.trim();
          const minutes = Number(logDraft.minutes);
          if (label === '' || !Number.isFinite(minutes) || minutes <= 0) return;
          return run('log', async () => {
            try {
              const payload = await call(LOG_ADD_PATH, { label, durationMin: minutes });
              if (!mounted.current) return;
              if (payload?.ok !== true) {
                setNotice({ kind: 'bad', text: payload?.message ?? t('logAddFailed') });
                return;
              }
              setLogDraft({ label: '', minutes: '25' });
              setNotice({ kind: 'ok', text: t('logAdded') });
              await refresh();
            } catch {
              if (mounted.current) setNotice({ kind: 'bad', text: t('logAddFailed') });
            }
          });
        };

        const showReport = wanted => {
          setRange(wanted);
          void (async () => {
            try {
              const payload = await call(REPORT_PATH, { range: wanted });
              if (!mounted.current) return;
              if (payload?.ok === true) setFetchedReport(payload.report);
            } catch {
              // the snapshot still carries today and week
            }
          })();
        };

        const events = Array.isArray(snapshot?.today?.events) ? snapshot.today.events : [];
        const doneCount = events.filter(event => event.done === true).length;
        const timer = snapshot?.timer ?? { mode: 'idle', running: false, paused: false, expired: false, label: '', durationMin: 0, durationSec: 0, elapsedSec: 0, remainingSec: 0 };
        const running = timer.mode !== 'idle' && timer.running === true;
        const serverNowMs = Date.parse(snapshot?.now ?? '');
        const extraSec = running && Number.isFinite(serverNowMs)
          ? Math.max(0, Math.floor((tick - serverNowMs) / 1000))
          : 0;
        const liveRemaining = Math.max(0, timer.remainingSec - extraSec);
        const liveElapsed = timer.elapsedSec + extraSec;
        const expired = timer.mode !== 'idle' && (timer.expired === true || (running && liveRemaining <= 0));
        // While idle the counter previews the length the next start would use.
        const idleSeconds = timerMode === 'break'
          ? 5 * 60
          : timerMode === 'custom'
            ? Math.max(1, Number(customMinutes) || 30) * 60
            : 25 * 60;
        const counterSeconds = expired ? 0 : timer.mode === 'idle' ? idleSeconds : liveRemaining;
        const elapsedSeconds = timer.mode === 'idle' ? 0 : liveElapsed;
        const timerStatusClass = expired
          ? 'dsh-calendar-pill is-bad'
          : timer.paused === true
            ? 'dsh-calendar-pill is-warn'
            : timer.mode !== 'idle'
              ? 'dsh-calendar-pill is-on'
              : 'dsh-calendar-pill';
        const timerStatus = expired
          ? t('timerExpired')
          : timer.mode === 'idle'
            ? t('timerIdle')
            : timer.paused === true
              ? t('timerPaused')
              : t('timerRunning');

        // The finish is announced once per run: a sound and a line in the page.
        React.useEffect(() => {
          if (!expired || timer.mode === 'idle') return undefined;
          const key = `${timer.startedAt}|${timer.mode}|${timer.durationSec}`;
          if (notified.current === key) return undefined;
          notified.current = key;
          beep();
          setNotice({ kind: 'bad', text: timer.expired === true ? t('timerExpiredNotice') : t('timerFinishedNotice') });
          return undefined;
        }, [expired, timer.mode, timer.startedAt, timer.durationSec, timer.expired]);

        const bigAction = expired
          ? { label: t('timerStopAction'), primary: true, run: stopTimer }
          : timer.mode === 'idle'
            ? { label: t('timerStartAction'), primary: true, run: startSelected }
            : timer.paused === true
              ? { label: t('timerResumeAction'), primary: true, run: () => timerAction('resume') }
              : { label: t('timerPauseAction'), primary: false, run: () => timerAction('pause') };

        const entries = Array.isArray(snapshot?.logToday?.entries) ? snapshot.logToday.entries : [];
        const logTotalSec = Number(snapshot?.logToday?.totalSec) || 0;
        const activeReport = fetchedReport !== null && fetchedReport.range === range
          ? fetchedReport
          : (snapshot?.report?.[range] ?? null);
        const reportLabels = Array.isArray(activeReport?.byLabel) ? activeReport.byLabel : [];

        const modeButton = (value, label) => h(
          'button',
          {
            type: 'button',
            className: timerMode === value ? 'dsh-calendar-button is-primary' : 'dsh-calendar-button',
            disabled: busy !== '',
            onClick: () => setTimerMode(value)
          },
          label
        );

        return h(
          'section',
          { className: 'dsh-calendar-page', 'aria-label': t('pageTitle') },
          h('style', null, CSS),
          h(
            'div',
            { className: 'dsh-calendar-scroll' },
            h(
              'div',
              { className: 'dsh-calendar-content' },
              h(
                'div',
                { className: 'dsh-calendar-heading' },
                h('span', { className: 'dsh-calendar-logo' }, h(CalendarIcon, { size: 20 })),
                h(
                  'div',
                  { className: 'dsh-calendar-heading-main' },
                  h('h1', null, t('pageTitle')),
                  h('p', { className: 'dsh-calendar-sub' }, t('hint'))
                ),
                h(
                  'div',
                  { className: 'dsh-calendar-actions' },
                  h('span', { className: timerStatusClass }, timerStatus),
                  h('button', {
                    type: 'button',
                    className: 'dsh-calendar-button',
                    disabled: busy !== '',
                    onClick: () => void run('refresh', refresh)
                  }, busy === 'refresh' ? t('loading') : t('refresh'))
                )
              ),
              phase === 'error'
                ? h('p', { className: 'dsh-calendar-error' }, t('loadFailed'), ' ',
                  h('button', { type: 'button', className: 'dsh-calendar-button', onClick: () => void refresh() }, t('retry')))
                : null,
              notice !== null
                ? h('p', { className: notice.kind === 'ok' ? 'dsh-calendar-note' : 'dsh-calendar-note is-bad' }, notice.text)
                : null,
              h(
                'div',
                { className: 'dsh-calendar-grid' },
          h(
            'div',
            { className: 'dsh-calendar-card' },
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('span', { className: 'dsh-calendar-label' }, t('todayTitle')),
              h('span', { className: 'dsh-calendar-hint' }, `${t('todayCount')} ${events.length} · ${t('doneCount')} ${doneCount}`)
            ),
            h(
              'div',
              { className: 'dsh-calendar-form' },
              h('span', { className: 'dsh-calendar-hint' }, t('addTitle')),
              h('input', {
                className: 'dsh-calendar-input is-title',
                placeholder: t('titlePlaceholder'),
                value: draft.title,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, title: event.target.value })
              }),
              h('input', {
                className: 'dsh-calendar-input is-time',
                type: 'time',
                title: t('timeLabel'),
                value: draft.time,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, time: event.target.value })
              }),
              h('input', {
                className: 'dsh-calendar-input is-number',
                type: 'number',
                min: 5,
                max: 1440,
                title: t('durationLabel'),
                value: draft.durationMin,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, durationMin: event.target.value })
              }),
              h('input', {
                className: 'dsh-calendar-input is-note',
                placeholder: t('notePlaceholder'),
                value: draft.note,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, note: event.target.value })
              }),
              h('button', {
                type: 'button',
                className: 'dsh-calendar-button is-primary',
                disabled: busy !== '' || draft.title.trim() === '',
                onClick: () => void addEvent()
              }, busy === 'add' ? t('adding') : t('addButton'))
            ),
            events.length === 0
              ? h('p', { className: 'dsh-calendar-hint' }, t('noEvents'))
              : h(
                'div',
                { className: 'dsh-calendar-list' },
                events.map(event => h(
                  'div',
                  { key: event.id, className: event.done === true ? 'dsh-calendar-event is-done' : 'dsh-calendar-event' },
                  h('button', {
                    type: 'button',
                    className: 'dsh-calendar-check',
                    title: event.done === true ? t('markOpen') : t('markDone'),
                    disabled: busy !== '',
                    onClick: () => void toggleEvent(event)
                  }, event.done === true ? t('doneMark') : t('undoneMark')),
                  h('span', { className: 'dsh-calendar-event-time' }, `${event.time}–${event.endTime}`),
                  h('span', { className: 'dsh-calendar-event-title' }, event.title),
                  h('span', { className: 'dsh-calendar-event-meta' }, durationText(event.durationMin * 60, t)),
                  event.note ? h('span', { className: 'dsh-calendar-event-note', title: event.note }, event.note) : null,
                  confirmId === event.id
                    ? h(
                      'span',
                      { className: 'dsh-calendar-row' },
                      h('span', { className: 'dsh-calendar-hint' }, t('confirmRemove')),
                      h('button', {
                        type: 'button',
                        className: 'dsh-calendar-button is-danger',
                        disabled: busy !== '',
                        onClick: () => void removeEvent(event)
                      }, t('yes')),
                      h('button', {
                        type: 'button',
                        className: 'dsh-calendar-button',
                        onClick: () => setConfirmId('')
                      }, t('no'))
                    )
                    : h('button', {
                      type: 'button',
                      className: 'dsh-calendar-button is-ghost',
                      disabled: busy !== '',
                      onClick: () => setConfirmId(event.id)
                    }, t('deleteEvent'))
                ))
              )
          ),
          h(
            'div',
            { className: 'dsh-calendar-card' },
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('span', { className: 'dsh-calendar-label' }, t('timerTitle'))
            ),
            h(
              'div',
              { className: 'dsh-calendar-timer' },
              h('span', { className: expired ? 'dsh-calendar-counter is-bad' : 'dsh-calendar-counter' }, formatCounter(counterSeconds)),
              h('span', { className: 'dsh-calendar-hint' },
                `${t('counterRemaining')} · ${t('counterElapsed')} ${formatCounter(elapsedSeconds)}${timer.mode === 'idle' ? '' : ` · ${timer.durationMin} ${t('minutesShort')}`}`)
            ),
            expired && timer.mode !== 'idle'
              ? h('p', { className: 'dsh-calendar-note is-bad' },
                timer.expired === true ? t('timerExpiredNotice') : t('timerFinishedNotice'))
              : null,
            h(
              'div',
              { className: 'dsh-calendar-row' },
              modeButton('work', t('timerModeWork')),
              modeButton('break', t('timerModeBreak')),
              modeButton('custom', t('timerModeCustom')),
              timerMode === 'custom'
                ? h('input', {
                  className: 'dsh-calendar-input is-number',
                  type: 'number',
                  min: 1,
                  max: 720,
                  title: t('customMinutesLabel'),
                  value: customMinutes,
                  disabled: busy !== '',
                  onChange: event => setCustomMinutes(event.target.value)
                })
                : null
            ),
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('input', {
                className: 'dsh-calendar-input',
                placeholder: t('labelPlaceholder'),
                value: labelDraft,
                disabled: busy !== '',
                onChange: event => setLabelDraft(event.target.value)
              }),
              h('button', {
                type: 'button',
                className: bigAction.primary ? 'dsh-calendar-button is-primary' : 'dsh-calendar-button',
                disabled: busy !== '',
                onClick: () => void bigAction.run()
              }, busy === 'timer' ? t('loading') : bigAction.label),
              timer.mode !== 'idle'
                ? h('button', {
                  type: 'button',
                  className: 'dsh-calendar-button is-danger',
                  disabled: busy !== '',
                  onClick: () => void stopTimer()
                }, t('timerStopAction'))
                : null
            )
          ),
          h(
            'div',
            { className: 'dsh-calendar-card' },
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('span', { className: 'dsh-calendar-label' }, t('logTitle')),
              h('span', { className: 'dsh-calendar-hint' }, `${t('logTotal')} ${durationText(logTotalSec, t)}`)
            ),
            entries.length === 0
              ? h('p', { className: 'dsh-calendar-hint' }, t('logEmpty'))
              : h(
                'div',
                { className: 'dsh-calendar-log' },
                entries.map(entry => h(
                  'div',
                  { key: entry.id, className: 'dsh-calendar-log-item' },
                  h('span', { className: 'dsh-calendar-event-time' }, `${entry.startTime}–${entry.endTime}`),
                  h('span', { className: 'dsh-calendar-event-title' }, entry.label),
                  h('span', { className: 'dsh-calendar-event-meta' }, durationText(entry.durationSec, t)),
                  h('span', { className: 'dsh-calendar-badge' }, entry.source === 'manual' ? t('logSourceManual') : t('logSourceTimer'))
                ))
              ),
            h('span', { className: 'dsh-calendar-hint' }, t('logAddTitle')),
            h(
              'div',
              { className: 'dsh-calendar-form' },
              h('input', {
                className: 'dsh-calendar-input',
                placeholder: t('logLabelPlaceholder'),
                value: logDraft.label,
                disabled: busy !== '',
                onChange: event => setLogDraft({ ...logDraft, label: event.target.value })
              }),
              h('input', {
                className: 'dsh-calendar-input is-number',
                type: 'number',
                min: 1,
                max: 1440,
                title: t('logMinutesPlaceholder'),
                placeholder: t('logMinutesPlaceholder'),
                value: logDraft.minutes,
                disabled: busy !== '',
                onChange: event => setLogDraft({ ...logDraft, minutes: event.target.value })
              }),
              h('button', {
                type: 'button',
                className: 'dsh-calendar-button is-primary',
                disabled: busy !== '' || logDraft.label.trim() === '' || !(Number(logDraft.minutes) > 0),
                onClick: () => void addLog()
              }, busy === 'log' ? t('logAdding') : t('logAddButton'))
            )
          ),
          h(
            'div',
            { className: 'dsh-calendar-card' },
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('span', { className: 'dsh-calendar-label' }, t('reportTitle')),
              h('button', {
                type: 'button',
                className: range === 'today' ? 'dsh-calendar-button is-primary' : 'dsh-calendar-button',
                onClick: () => showReport('today')
              }, t('rangeToday')),
              h('button', {
                type: 'button',
                className: range === 'week' ? 'dsh-calendar-button is-primary' : 'dsh-calendar-button',
                onClick: () => showReport('week')
              }, t('rangeWeek'))
            ),
            activeReport === null
              ? h('p', { className: 'dsh-calendar-hint' }, t('loading'))
              : h(
                'div',
                { className: 'dsh-calendar-bars' },
                h('div', { className: 'dsh-calendar-row' },
                  h('span', { className: 'dsh-calendar-hint' },
                    `${t('reportTotal')} ${durationText(activeReport.totalSec, t)} · ${t('reportEntriesCount')} ${activeReport.count}`)),
                reportLabels.length === 0
                  ? h('p', { className: 'dsh-calendar-hint' }, t('reportEmpty'))
                  : reportLabels.map(row => h(
                    'div',
                    { key: row.label, className: 'dsh-calendar-bar-row' },
                    h(
                      'div',
                      { className: 'dsh-calendar-bar-head' },
                      h('span', { className: 'dsh-calendar-bar-label' }, row.label),
                      h('span', { className: 'dsh-calendar-bar-value' },
                        `${durationText(row.durationSec, t)} · ${Math.round((Number(row.share) || 0) * 100)}%`)
                    ),
                    h('div', { className: 'dsh-calendar-bar-track' },
                      h('div', {
                        className: 'dsh-calendar-bar-fill',
                        style: { width: `${Math.max(2, Math.round((Number(row.share) || 0) * 100))}%` }
                      }))
                  ))
              )
            )
          )
        )
        )
        );
      }

      /** Brief help card on the plugin page: the calendar now lives in the left rail. */
      function CalendarHelp() {
        const [notice, setNotice] = React.useState('');
        const open = () => {
          if (openPanel()) return;
          setNotice(t('helpOpenFailed'));
        };
        return h(
          'div',
          { className: 'dsh-calendar-help' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'dsh-calendar-help-card' },
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('span', { className: 'dsh-calendar-logo is-small' }, h(CalendarIcon, { size: 16 })),
              h('span', { className: 'dsh-calendar-label' }, t('pageTitle'))
            ),
            h('p', { className: 'dsh-calendar-hint' }, t('helpHint')),
            h(
              'div',
              { className: 'dsh-calendar-row' },
              h('button', {
                type: 'button',
                className: 'dsh-calendar-button is-primary',
                onClick: open
              }, t('helpOpen')),
              notice !== '' ? h('span', { className: 'dsh-calendar-hint' }, notice) : null
            )
          )
        );
      }

      /** Floating chip: the remaining time of a running timer, visible anywhere in DSH. */
      function TimerChip() {
        const [state, setState] = React.useState(null);
        const [tick, setTick] = React.useState(() => Date.now());
        React.useEffect(() => {
          let alive = true;
          const load = async () => {
            try {
              const payload = await call(STATE_PATH);
              if (!alive) return;
              if (payload !== null && payload.ok === true) {
                setState({ timer: payload.timer, serverNow: Date.parse(payload.now) });
              }
            } catch {
              // the chip keeps the last known value
            }
          };
          void load();
          const id = setInterval(() => {
            if (document.visibilityState !== 'hidden') void load();
          }, CHIP_REFRESH_MS);
          // A tab that just became visible should not wait for the next tick.
          const onVisibility = () => {
            if (document.visibilityState !== 'hidden') void load();
          };
          const onTimerChanged = () => { void load(); };
          document.addEventListener('visibilitychange', onVisibility);
          window.addEventListener('dsh-calendar:timer-changed', onTimerChanged);
          return () => {
            alive = false;
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('dsh-calendar:timer-changed', onTimerChanged);
          };
        }, []);
        const timer = state?.timer ?? null;
        const active = timer !== null && timer.mode !== 'idle';
        React.useEffect(() => {
          if (!active) return undefined;
          const id = setInterval(() => setTick(Date.now()), 1000);
          return () => clearInterval(id);
        }, [active]);
        if (!active) return null;
        const extra = timer.running === true && Number.isFinite(state.serverNow)
          ? Math.max(0, Math.floor((tick - state.serverNow) / 1000))
          : 0;
        const remaining = Math.max(0, timer.remainingSec - extra);
        const expired = timer.expired === true || (timer.running === true && remaining <= 0);
        return h(
          'div',
          { className: 'dsh-calendar-chip-wrap' },
          h('style', null, CSS),
          h(
            'button',
            {
              type: 'button',
              className: expired ? 'dsh-calendar-chip is-bad' : 'dsh-calendar-chip',
              title: t('chipHint'),
              'aria-live': 'polite',
              onClick: () => { openPanel(); }
            },
            h('span', { className: 'dsh-calendar-chip-dot' }),
            h('span', { className: 'dsh-calendar-chip-time' }, formatCounter(expired ? 0 : remaining)),
            h('span', { className: 'dsh-calendar-chip-label' }, expired ? t('timerExpired') : timer.label)
          )
        );
      }

      // The left-rail entry and its page: the same `main` + `sidebar.panellist`
      // pair «Расходы» and «Плагины» use. The rail id equals the `main` key.
      try {
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, CalendarPage));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 4,
          label: () => translate('panel'),
          locale: NS,
        }, CalendarIcon));
      } catch (error) {
        console.error('[dsh-calendar] панель в левой панели недоступна:', error);
      }

      // The floating timer chip is optional: an older host without the overlay
      // keeps the panel only, and a failed registration must not break the rest.
      try {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'calendar.timer',
          order: 44,
        }, TimerChip));
      } catch (error) {
        console.error('[dsh-calendar] плавающий таймер недоступен:', error);
      }

      // The plugin page keeps a short help card instead of duplicating the UI.
      try {
        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            {
              name: 'plugins.detail.section',
              id: 'dsh-calendar-detail',
              order: 47,
              locale: NS
            },
            props => {
              const subject = props?.subject;
              const packageName =
                subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string'
                  ? subject.pkg.name
                  : typeof subject?.id === 'string'
                    ? subject.id
                    : '';
              if (packageName !== 'dsh-calendar') return null;
              if (props?.view === 'summary') return h(CalendarSummary, props);
              return h(CalendarHelp, props);
            }
          )
        );
      } catch (error) {
        console.error('[dsh-calendar] секция страницы недоступна:', error);
      }
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale', 'layout'];
    exports.NS = NS;
    return module.exports;
  }
});
