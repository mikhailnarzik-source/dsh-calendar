/**
 * Browser half of `dsh-calendar` — «Календарь и учёт времени».
 *
 * Registers a global panel in the left rail (the same `main` + `sidebar.panellist`
 * pair «Расходы» and «Плагины» use), a floating timer chip in `shell.overlay`,
 * and a short help section on the plugin page. The panel itself is one centred
 * column of cards:
 *   шапка         — дата, день недели, приветствие, статус таймера, «Обновить»;
 *   стат-карточки — события, выполнено, учтено времени, записей;
 *   «Сегодня»     — быстрый ввод и таймлайн событий с отметкой выполнения;
 *   «Таймер»      — круговой прогресс, режимы «Работа 25 / Перерыв 5 / Своя»;
 *   «Учёт времени»— записи дня, итог «Всего» и ручное добавление;
 *   «Отчёт»       — Сегодня/Неделя, мини-бар-чарт по дням недели, доли меток.
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
    /** Geometry of the SVG progress ring, in viewBox units. */
    const RING_RADIUS = 64;
    const RING_STROKE = 10;
    const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
    /** Cycle of accent colours for the event dots of the timeline. */
    const TIMELINE_ACCENTS = [
      'var(--dsw-alias-brand-primary)',
      'var(--dsw-alias-state-success-primary)',
      'var(--dsw-alias-state-warn-primary)',
      'var(--dsw-alias-state-error-primary)'
    ];
    /** Weekday keys indexed like `Date.getDay()`: 0 is Sunday. */
    const WEEKDAY_LONG_KEYS = ['weekdaySun', 'weekdayMon', 'weekdayTue', 'weekdayWed', 'weekdayThu', 'weekdayFri', 'weekdaySat'];
    const WEEKDAY_SHORT_KEYS = ['weekdayShortSun', 'weekdayShortMon', 'weekdayShortTue', 'weekdayShortWed', 'weekdayShortThu', 'weekdayShortFri', 'weekdayShortSat'];

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
      doneOf: 'done',
      todayPlanned: 'Planned:',
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
      summaryEvents: 'events:',
      greetingMorning: 'Good morning',
      greetingDay: 'Good afternoon',
      greetingEvening: 'Good evening',
      greetingNight: 'Good night',
      weekdayMon: 'Monday',
      weekdayTue: 'Tuesday',
      weekdayWed: 'Wednesday',
      weekdayThu: 'Thursday',
      weekdayFri: 'Friday',
      weekdaySat: 'Saturday',
      weekdaySun: 'Sunday',
      weekdayShortMon: 'Mon',
      weekdayShortTue: 'Tue',
      weekdayShortWed: 'Wed',
      weekdayShortThu: 'Thu',
      weekdayShortFri: 'Fri',
      weekdayShortSat: 'Sat',
      weekdayShortSun: 'Sun',
      statsEvents: 'Events today',
      statsDone: 'Completed',
      statsTracked: 'Time tracked',
      statsRecords: 'Records',
      reportChartCaption: 'by day of the week',
      invalidDuration: 'Duration is 5 to 1440 minutes.'
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
      doneOf: 'выполнено',
      todayPlanned: 'Запланировано:',
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
      summaryEvents: 'событий:',
      greetingMorning: 'Доброе утро',
      greetingDay: 'Добрый день',
      greetingEvening: 'Добрый вечер',
      greetingNight: 'Доброй ночи',
      weekdayMon: 'понедельник',
      weekdayTue: 'вторник',
      weekdayWed: 'среда',
      weekdayThu: 'четверг',
      weekdayFri: 'пятница',
      weekdaySat: 'суббота',
      weekdaySun: 'воскресенье',
      weekdayShortMon: 'пн',
      weekdayShortTue: 'вт',
      weekdayShortWed: 'ср',
      weekdayShortThu: 'чт',
      weekdayShortFri: 'пт',
      weekdayShortSat: 'сб',
      weekdayShortSun: 'вс',
      statsEvents: 'Событий сегодня',
      statsDone: 'Выполнено',
      statsTracked: 'Учтено времени',
      statsRecords: 'Записей',
      reportChartCaption: 'по дням недели',
      invalidDuration: 'Длительность — от 5 до 1440 минут.'
    };

    /**
     * The stylesheet inherits the host theme: surfaces, text and borders come
     * from the `--dsw-alias-*` tokens, geometry is plain CSS. Every accent is a
     * colour-mix of a token, so light and dark themes both stay readable.
     */
    const CSS = `
.dsh-calendar-page{box-sizing:border-box;display:flex;width:100%;min-width:0;height:100%;max-height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:20px}
.dsh-calendar-scroll{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
.dsh-calendar-content{display:flex;flex-direction:column;gap:18px;box-sizing:border-box;width:100%;max-width:1000px;margin:0 auto;padding:0 clamp(18px,4vw,40px) 64px}
.dsh-calendar-hero{display:flex;flex-wrap:wrap;align-items:center;gap:16px;padding-top:26px}
.dsh-calendar-logo{display:inline-flex;flex:none;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-logo.is-large{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent));box-shadow:0 10px 26px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}
.dsh-calendar-logo.is-small{width:26px;height:26px;border-radius:9px}
.dsh-calendar-hero-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsh-calendar-hero-text h1{margin:0;font-size:23px;font-weight:650;line-height:30px;letter-spacing:-.015em}
.dsh-calendar-date{margin:0;font-size:13px;line-height:19px;opacity:.88}
.dsh-calendar-sub{margin:0;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:18px;max-width:54ch}
.dsh-calendar-actions{display:flex;flex:none;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px;margin-left:auto}
.dsh-calendar-status{display:inline-flex;align-items:center;gap:7px;padding:5px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px;white-space:nowrap}
.dsh-calendar-status-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}
.dsh-calendar-status.is-on{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);color:var(--dsw-alias-label-primary)}
.dsh-calendar-status.is-on .dsh-calendar-status-dot{background:var(--dsw-alias-state-success-primary);animation:dsh-calendar-pulse 1.8s ease-in-out infinite}
.dsh-calendar-status.is-warn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);color:var(--dsw-alias-label-primary)}
.dsh-calendar-status.is-warn .dsh-calendar-status-dot{background:var(--dsw-alias-state-warn-primary)}
.dsh-calendar-status.is-bad{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 13%, transparent);color:var(--dsw-alias-label-primary)}
.dsh-calendar-status.is-bad .dsh-calendar-status-dot{background:var(--dsw-alias-state-error-primary)}
@keyframes dsh-calendar-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.72)}}
.dsh-calendar-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.dsh-calendar-stat{display:flex;align-items:flex-start;gap:12px;box-sizing:border-box;min-width:0;padding:14px 15px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.dsh-calendar-stat-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:34px;height:34px;border-radius:11px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-stat-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-calendar-stat-value{font-size:20px;line-height:26px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-calendar-stat-label{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-calendar-stat.is-done .dsh-calendar-stat-icon{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary)}
.dsh-calendar-stat.is-time .dsh-calendar-stat-icon{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent);color:var(--dsw-alias-state-warn-primary)}
.dsh-calendar-stat.is-count .dsh-calendar-stat-icon{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);color:var(--dsw-alias-label-primary)}
.dsh-calendar-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);grid-template-areas:'today timer' 'report log';gap:16px;align-items:stretch;min-width:0}
.dsh-calendar-card{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;height:100%;min-width:0;padding:16px;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)}
.dsh-calendar-card-today{grid-area:today}
.dsh-calendar-card-timer{grid-area:timer}
.dsh-calendar-card-report{grid-area:report}
.dsh-calendar-card-log{grid-area:log}
.dsh-calendar-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:9px;min-height:38px}
.dsh-calendar-card-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-card-title{font-size:14px;font-weight:650;line-height:20px;min-width:0;overflow-wrap:anywhere}
.dsh-calendar-card-sub{margin-left:auto;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-card-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:auto;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsh-calendar-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-calendar-label{font-weight:600}
.dsh-calendar-hint{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:17px}
.dsh-calendar-note{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-state-success-primary)}
.dsh-calendar-note.is-bad{color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-error{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-badge{display:inline-flex;align-items:center;padding:1px 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-badge.is-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-summary{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.dsh-calendar-input{flex:1 1 140px;min-width:100px;box-sizing:border-box;height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.dsh-calendar-input::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-calendar-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-calendar-input:disabled{opacity:.6}
.dsh-calendar-input.is-number{flex:0 0 84px;min-width:74px}
.dsh-calendar-button,.dsh-calendar-primary{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;height:36px;padding:0 14px;border-radius:10px;font-family:inherit;font-size:12.5px;font-weight:600;line-height:1;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,color .12s ease,opacity .12s ease}
.dsh-calendar-button{border:1px solid var(--dsw-alias-border-l4);background:transparent;color:var(--dsw-alias-label-primary)}
.dsh-calendar-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-calendar-button:active:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}
.dsh-calendar-button:disabled,.dsh-calendar-primary:disabled{opacity:.55;cursor:default}
.dsh-calendar-button:focus-visible,.dsh-calendar-primary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-calendar-button.is-primary,.dsh-calendar-primary{border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-button.is-primary:hover:not(:disabled),.dsh-calendar-primary:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent)}
.dsh-calendar-button.is-danger{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent);color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-button.is-danger:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 26%, transparent)}
.dsh-calendar-button.is-ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-primary{flex:1 1 auto}
.dsh-calendar-seg{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.dsh-calendar-seg-btn{appearance:none;box-sizing:border-box;height:32px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12.5px;font-weight:600;line-height:1;white-space:nowrap;cursor:pointer}
.dsh-calendar-seg-btn:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);color:var(--dsw-alias-label-primary)}
.dsh-calendar-seg-btn.is-active{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-calendar-seg-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-calendar-seg-btn:disabled{opacity:.55;cursor:default}
.dsh-calendar-seg .dsh-calendar-input{flex:0 0 72px;min-width:62px;height:32px;padding:0 8px;border-radius:8px}
.dsh-calendar-field{display:flex;align-items:center;gap:7px;flex:1 1 150px;min-width:110px;box-sizing:border-box;height:36px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.dsh-calendar-field:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)}
.dsh-calendar-field-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-field .dsh-calendar-input{flex:1 1 auto;min-width:0;height:auto;padding:0;border:0;background:transparent;font-size:13px}
.dsh-calendar-field .dsh-calendar-input:focus-visible{outline:none}
.dsh-calendar-field.is-time{flex:0 0 108px;min-width:98px}
.dsh-calendar-field.is-number{flex:0 0 88px;min-width:78px}
.dsh-calendar-add{display:flex;flex-direction:column;gap:8px;box-sizing:border-box;padding:11px;border:1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, var(--dsw-alias-border-l1));border-radius:13px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, transparent)}
.dsh-calendar-add-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsh-calendar-add-title{font-size:11.5px;font-weight:600;line-height:16px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.04em}
.dsh-calendar-timer-hero{display:flex;flex:1 1 auto;align-items:center;gap:20px;flex-wrap:wrap;min-width:0}
.dsh-calendar-dial{position:relative;display:flex;flex:none;align-items:center;justify-content:center;width:168px;height:168px}
.dsh-calendar-ring{position:absolute;inset:0;width:100%;height:100%}
.dsh-calendar-ring-track{stroke:var(--dsw-alias-bg-layer-2)}
.dsh-calendar-ring-bar{stroke:var(--dsw-alias-brand-primary);transition:stroke-dashoffset .45s linear}
.dsh-calendar-dial.is-expired .dsh-calendar-ring-bar{stroke:var(--dsw-alias-state-error-primary)}
.dsh-calendar-dial.is-paused .dsh-calendar-ring-bar{stroke:var(--dsw-alias-state-warn-primary)}
.dsh-calendar-dial-text{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center}
.dsh-calendar-dial-time{font-size:32px;line-height:36px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.dsh-calendar-dial-time.is-bad{color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-dial-mode{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-pulse{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary);animation:dsh-calendar-pulse 1.4s ease-in-out infinite}
.dsh-calendar-timer-meta{display:flex;flex:1 1 150px;flex-direction:column;gap:4px;min-width:0}
.dsh-calendar-timer-controls{display:flex;flex-direction:column;gap:10px;margin-top:auto}
.dsh-calendar-timer-controls > .dsh-calendar-field{flex:0 0 auto;width:100%}
.dsh-calendar-timer-buttons{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsh-calendar-timeline{position:relative;display:flex;flex:1 1 auto;flex-direction:column;gap:1px;min-height:0}
.dsh-calendar-tl-item{position:relative;display:grid;grid-template-columns:50px 14px minmax(0,1fr) auto;gap:9px;align-items:start;padding:9px 8px 9px 2px;border-radius:12px;transition:background-color .12s ease}
.dsh-calendar-tl-item:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}
.dsh-calendar-tl-time{padding-top:1px;font-size:12.5px;line-height:20px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-calendar-tl-rail{position:relative;align-self:stretch;min-height:20px}
.dsh-calendar-tl-rail::before{content:'';position:absolute;top:-11px;bottom:-11px;left:50%;width:2px;transform:translateX(-50%);border-radius:1px;background:var(--dsw-alias-border-l1)}
.dsh-calendar-tl-dot{position:absolute;top:6px;left:50%;width:10px;height:10px;transform:translateX(-50%);border-radius:50%;background:var(--dsh-calendar-accent, var(--dsw-alias-brand-primary));box-shadow:0 0 0 3px var(--dsw-alias-bg-layer-1)}
.dsh-calendar-tl-main{display:flex;flex-direction:column;gap:2px;min-width:0;padding-top:1px}
.dsh-calendar-tl-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dsh-calendar-tl-title{overflow:hidden;font-size:13.5px;font-weight:600;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-tl-meta{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-tl-note{display:-webkit-box;overflow:hidden;margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;-webkit-line-clamp:2}
.dsh-calendar-tl-item.is-done{opacity:.55}
.dsh-calendar-tl-item.is-done .dsh-calendar-tl-title{text-decoration:line-through}
.dsh-calendar-tl-actions{display:flex;align-items:center;gap:4px;opacity:0;transition:opacity .12s ease}
.dsh-calendar-tl-item:hover .dsh-calendar-tl-actions,.dsh-calendar-tl-item:focus-within .dsh-calendar-tl-actions{opacity:1}
.dsh-calendar-check{appearance:none;display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:22px;height:22px;padding:0;border:1.5px solid var(--dsw-alias-border-l2);border-radius:50%;background:var(--dsw-alias-bg-base);color:transparent;font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:border-color .12s ease,background-color .12s ease,color .12s ease}
.dsh-calendar-check:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-check.is-done{border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-bg-base)}
.dsh-calendar-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-calendar-del{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.dsh-calendar-del:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}
.dsh-calendar-del:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-calendar-empty{display:flex;flex:1 1 auto;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;min-height:120px;padding:22px 12px;text-align:center;border:1px dashed var(--dsw-alias-border-l1);border-radius:13px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent)}
.dsh-calendar-empty-icon{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:14px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);color:var(--dsw-alias-brand-primary)}
.dsh-calendar-empty-note{display:flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:54px;text-align:center}
.dsh-calendar-log{display:flex;flex:1 1 auto;flex-direction:column;gap:6px;min-height:0}
.dsh-calendar-log-item{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:8px 11px;border:1px solid var(--dsw-alias-border-l1);border-left:3px solid var(--dsw-alias-brand-primary);border-radius:11px;background:var(--dsw-alias-bg-base)}
.dsh-calendar-log-time{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-calendar-log-label{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-log-duration{margin-left:auto;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-calendar-total{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.dsh-calendar-total-value{font-size:30px;line-height:36px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.dsh-calendar-total-caption{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-chart-block{display:flex;flex:1 1 auto;flex-direction:column;min-height:0}
.dsh-calendar-chart{display:flex;flex:1 1 auto;align-items:flex-end;gap:6px;box-sizing:border-box;min-height:118px;padding:10px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-calendar-chart-col{display:flex;flex:1 1 0;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;height:100%;min-width:0}
.dsh-calendar-chart-track{display:flex;flex:1 1 auto;align-items:flex-end;justify-content:center;width:100%;min-height:0}
.dsh-calendar-chart-bar{width:min(100%,34px);border-radius:9px 9px 4px 4px;background:linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent));transition:height .35s ease}
.dsh-calendar-chart-col.is-today .dsh-calendar-chart-bar{background:linear-gradient(180deg, var(--dsw-alias-state-success-primary), color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, transparent));box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent)}
.dsh-calendar-chart-day{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-chart-col.is-today .dsh-calendar-chart-day{color:var(--dsw-alias-state-success-primary);font-weight:600}
.dsh-calendar-chart-caption{margin:6px 0 0;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-calendar-bars{display:flex;flex-direction:column;gap:9px}
.dsh-calendar-bar-row{display:flex;flex-direction:column;gap:4px}
.dsh-calendar-bar-head{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:17px}
.dsh-calendar-bar-label{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-calendar-bar-value{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-calendar-bar-track{height:7px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.dsh-calendar-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}
.dsh-calendar-help{display:flex;flex-direction:column;gap:12px;box-sizing:border-box;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;min-height:0;max-height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;padding-bottom:12px}
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
@media (max-width:980px){.dsh-calendar-layout{grid-template-columns:minmax(0,1fr);grid-template-areas:'today' 'timer' 'report' 'log'}.dsh-calendar-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.dsh-calendar-hero{padding-top:18px}.dsh-calendar-actions{justify-content:flex-start;margin-left:0}.dsh-calendar-content{gap:14px;padding:0 14px 56px}.dsh-calendar-card{padding:14px}.dsh-calendar-dial{width:148px;height:148px}.dsh-calendar-dial-time{font-size:28px;line-height:32px}.dsh-calendar-tl-item{grid-template-columns:44px 12px minmax(0,1fr) auto;gap:7px}.dsh-calendar-tl-actions{opacity:1}.dsh-calendar-chart{min-height:96px;gap:4px}}
@media (max-width:640px){.dsh-calendar-content{gap:12px;padding:0 12px 48px}.dsh-calendar-layout{gap:12px}.dsh-calendar-card{padding:12px;border-radius:14px}.dsh-calendar-card-head{min-height:36px;gap:8px}.dsh-calendar-timer-hero{gap:14px}.dsh-calendar-empty{min-height:104px;padding:18px 10px}}
@media (max-width:520px){.dsh-calendar-stats{grid-template-columns:minmax(0,1fr)}}
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

    /** Clock glyph: stat card and field icons. */
    function ClockIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('circle', { cx: 8, cy: 8, r: 5.75, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M8 4.75V8l2.2 1.3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })
      );
    }

    /** Check mark glyph: «выполнено». */
    function CheckIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('circle', { cx: 8, cy: 8, r: 5.75, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M5.4 8.1l1.8 1.8 3.5-3.7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })
      );
    }

    /** List glyph: journal and note fields. */
    function ListIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M5.5 4h8M5.5 8h8M5.5 12h8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('circle', { cx: 2.6, cy: 4, r: 0.9, fill: 'currentColor' }),
        h('circle', { cx: 2.6, cy: 8, r: 0.9, fill: 'currentColor' }),
        h('circle', { cx: 2.6, cy: 12, r: 0.9, fill: 'currentColor' })
      );
    }

    /** Bar-chart glyph: the report card. */
    function ChartIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M2 13.25h12', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M4.2 11V8.4M7 11V5.2M9.8 11V6.8M12.6 11V3.75', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' })
      );
    }

    /** Plus glyph: add buttons. */
    function PlusIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M8 3.5v9M3.5 8h9', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })
      );
    }

    /** Trash glyph: the hover delete button of an event. */
    function TrashIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M3.5 4.75h9M6.25 4.75V3.5h3.5v1.25M5 4.75l.55 7.5h4.9L11 4.75', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round' })
      );
    }

    /** Refresh glyph: the header button. */
    function RefreshIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M13.1 8a5.1 5.1 0 1 1-1.5-3.6', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        h('path', { d: 'M13.25 2.9v2.9h-2.9', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })
      );
    }

    /** Play glyph: the big timer button. */
    function PlayIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M5.5 3.8l7 4.2-7 4.2z', fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round' })
      );
    }

    /** Pause glyph: the big timer button. */
    function PauseIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('path', { d: 'M5.75 3.5v9M10.25 3.5v9', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' })
      );
    }

    /** Stop glyph: the big timer button when the time is up. */
    function StopIcon(props) {
      const size = Number(props?.size) || 16;
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, focusable: false },
        h('rect', { x: 4, y: 4, width: 8, height: 8, rx: 1.6, fill: 'currentColor' })
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

    /**
     * Date as `DD.MM.YYYY` in local time.
     * @param date - moment to print.
     * @returns the date text.
     */
    function dateText(date) {
      return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
    }

    /**
     * Greeting key for the hour of the day.
     * @param hours - local hour 0–23.
     * @returns the dictionary key.
     */
    function greetingKey(hours) {
      if (hours >= 5 && hours < 12) return 'greetingMorning';
      if (hours >= 12 && hours < 18) return 'greetingDay';
      if (hours >= 18 && hours < 23) return 'greetingEvening';
      return 'greetingNight';
    }

    /** Local Monday 00:00 of the week containing a moment. */
    function weekStartOf(date) {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const shift = (start.getDay() + 6) % 7;
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() - shift);
    }

    /**
     * Seven empty weekday buckets, used before the first snapshot arrives.
     * @returns Monday-first buckets `{ date, weekday, durationSec, isToday }`.
     */
    function emptyWeekBuckets() {
      const now = new Date();
      const monday = weekStartOf(now);
      const todayKey = dateText(now);
      const buckets = [];
      for (let index = 0; index < 7; index += 1) {
        const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
        buckets.push({ date: dateText(day), weekday: index, durationSec: 0, isToday: dateText(day) === todayKey });
      }
      return buckets;
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

      /** The full section: header, stat cards, today, timer, time log and report. */
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
          const minutes = Number(draft.durationMin);
          if (draft.durationMin !== '' && (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440)) return;
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
        const plannedMin = events.reduce((sum, event) => sum + (Number(event.durationMin) || 0), 0);
        const timer = snapshot?.timer ?? { mode: 'idle', running: false, paused: false, expired: false, label: '', durationMin: 0, durationSec: 0, elapsedSec: 0, remainingSec: 0 };
        const running = timer.mode !== 'idle' && timer.running === true;
        const serverNowMs = Date.parse(snapshot?.now ?? '');
        const extraSec = running && Number.isFinite(serverNowMs)
          ? Math.max(0, Math.floor((tick - serverNowMs) / 1000))
          : 0;
        const liveRemaining = Math.max(0, timer.remainingSec - extraSec);
        const liveElapsed = timer.elapsedSec + extraSec;
        const expired = timer.mode !== 'idle' && (timer.expired === true || (running && liveRemaining <= 0));
        // While idle the dial previews the length the next start would use.
        const idleSeconds = timerMode === 'break'
          ? 5 * 60
          : timerMode === 'custom'
            ? Math.max(1, Number(customMinutes) || 30) * 60
            : 25 * 60;
        const counterSeconds = expired ? 0 : timer.mode === 'idle' ? idleSeconds : liveRemaining;
        const elapsedSeconds = timer.mode === 'idle' ? 0 : liveElapsed;
        const timerDurationSec = timer.mode === 'idle'
          ? idleSeconds
          : Math.max(1, Number(timer.durationSec) || Math.round((Number(timer.durationMin) || 0) * 60) || idleSeconds);
        const progress = timer.mode === 'idle'
          ? 0
          : expired
            ? 1
            : Math.min(1, Math.max(0, liveElapsed / timerDurationSec));
        const ringOffset = RING_LENGTH * (1 - progress);
        const dialMode = timer.mode === 'idle'
          ? timerMode === 'break'
            ? t('defaultBreakLabel')
            : timerMode === 'custom'
              ? t('timerModeCustom')
              : t('defaultWorkLabel')
          : timer.mode === 'break'
            ? t('defaultBreakLabel')
            : t('defaultWorkLabel');
        const timerStatus = expired
          ? t('timerExpired')
          : timer.mode === 'idle'
            ? t('timerIdle')
            : timer.paused === true
              ? t('timerPaused')
              : t('timerRunning');
        const statusVariant = expired
          ? 'is-bad'
          : timer.paused === true && timer.mode !== 'idle'
            ? 'is-warn'
            : running
              ? 'is-on'
              : '';
        const dialVariant = expired
          ? ' is-expired'
          : timer.paused === true && timer.mode !== 'idle'
            ? ' is-paused'
            : '';

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
          ? { label: t('timerStopAction'), Icon: StopIcon, run: stopTimer }
          : timer.mode === 'idle'
            ? { label: t('timerStartAction'), Icon: PlayIcon, run: startSelected }
            : timer.paused === true
              ? { label: t('timerResumeAction'), Icon: PlayIcon, run: () => timerAction('resume') }
              : { label: t('timerPauseAction'), Icon: PauseIcon, run: () => timerAction('pause') };

        const entries = Array.isArray(snapshot?.logToday?.entries) ? snapshot.logToday.entries : [];
        const logTotalSec = Number(snapshot?.logToday?.totalSec) || 0;
        const activeReport = fetchedReport !== null && fetchedReport.range === range
          ? fetchedReport
          : (snapshot?.report?.[range] ?? null);
        const reportLabels = Array.isArray(activeReport?.byLabel) ? activeReport.byLabel : [];
        const weekReportDays = Array.isArray(snapshot?.report?.week?.days) ? snapshot.report.week.days : [];
        const activeDays = Array.isArray(activeReport?.days) && activeReport.days.length === 7 ? activeReport.days : weekReportDays;
        const chartDays = activeDays.length === 7 ? activeDays : emptyWeekBuckets();
        const chartMax = Math.max(1, ...chartDays.map(day => Math.max(0, Number(day.durationSec) || 0)));
        const durationInvalid = draft.durationMin !== ''
          && (!Number.isFinite(Number(draft.durationMin)) || Number(draft.durationMin) < 5 || Number(draft.durationMin) > 1440);
        const nowLocal = new Date();
        const dateLine = `${t(WEEKDAY_LONG_KEYS[nowLocal.getDay()])}, ${dateText(nowLocal)}`;
        const greeting = t(greetingKey(nowLocal.getHours()));

        /** One stat card: big number, small caption and an accent icon. */
        const statCard = (variant, Icon, label, value) => h(
          'div',
          { className: `dsh-calendar-stat ${variant}` },
          h('span', { className: 'dsh-calendar-stat-icon' }, h(Icon, { size: 17 })),
          h(
            'div',
            { className: 'dsh-calendar-stat-body' },
            h('span', { className: 'dsh-calendar-stat-value' }, value),
            h('span', { className: 'dsh-calendar-stat-label' }, label)
          )
        );

        /** One mode chip of the segmented timer control. */
        const modeButton = (value, label) => h(
          'button',
          {
            type: 'button',
            className: timerMode === value ? 'dsh-calendar-seg-btn is-active' : 'dsh-calendar-seg-btn',
            disabled: busy !== '',
            'aria-pressed': timerMode === value,
            onClick: () => setTimerMode(value)
          },
          label
        );

        const ring = h(
          'svg',
          { className: 'dsh-calendar-ring', viewBox: '0 0 160 160', 'aria-hidden': true, focusable: false },
          h('circle', { className: 'dsh-calendar-ring-track', cx: 80, cy: 80, r: RING_RADIUS, fill: 'none', strokeWidth: RING_STROKE }),
          h('circle', {
            className: 'dsh-calendar-ring-bar',
            cx: 80,
            cy: 80,
            r: RING_RADIUS,
            fill: 'none',
            strokeWidth: RING_STROKE,
            strokeLinecap: 'round',
            strokeDasharray: `${RING_LENGTH.toFixed(2)} ${RING_LENGTH.toFixed(2)}`,
            strokeDashoffset: ringOffset.toFixed(2),
            transform: 'rotate(-90 80 80)'
          })
        );

        const addForm = h(
          'div',
          { className: 'dsh-calendar-add' },
          h(
            'div',
            { className: 'dsh-calendar-add-row' },
            h('span', { className: 'dsh-calendar-add-title' }, t('addTitle'))
          ),
          h(
            'div',
            { className: 'dsh-calendar-add-row' },
            h(
              'label',
              { className: 'dsh-calendar-field' },
              h('span', { className: 'dsh-calendar-field-icon' }, h(CalendarIcon, { size: 14 })),
              h('input', {
                className: 'dsh-calendar-input',
                placeholder: t('titlePlaceholder'),
                value: draft.title,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, title: event.target.value })
              })
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-calendar-button is-primary',
                disabled: busy !== '' || draft.title.trim() === '' || durationInvalid,
                onClick: () => void addEvent()
              },
              h(PlusIcon, { size: 14 }),
              h('span', null, busy === 'add' ? t('adding') : t('addButton'))
            )
          ),
          h(
            'div',
            { className: 'dsh-calendar-add-row' },
            h(
              'label',
              { className: 'dsh-calendar-field is-time' },
              h('span', { className: 'dsh-calendar-field-icon' }, h(ClockIcon, { size: 14 })),
              h('input', {
                className: 'dsh-calendar-input',
                type: 'time',
                title: t('timeLabel'),
                value: draft.time,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, time: event.target.value })
              })
            ),
            h(
              'label',
              { className: 'dsh-calendar-field is-number' },
              h('span', { className: 'dsh-calendar-field-icon' }, h(ClockIcon, { size: 14 })),
              h('input', {
                className: 'dsh-calendar-input',
                type: 'number',
                min: 5,
                max: 1440,
                title: t('durationLabel'),
                value: draft.durationMin,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, durationMin: event.target.value })
              })
            ),
            h(
              'label',
              { className: 'dsh-calendar-field' },
              h('span', { className: 'dsh-calendar-field-icon' }, h(ListIcon, { size: 14 })),
              h('input', {
                className: 'dsh-calendar-input',
                placeholder: t('notePlaceholder'),
                value: draft.note,
                disabled: busy !== '',
                onChange: event => setDraft({ ...draft, note: event.target.value })
              })
            )
          ),
          durationInvalid ? h('p', { className: 'dsh-calendar-error' }, t('invalidDuration')) : null
        );

        const timeline = h(
          'div',
          { className: 'dsh-calendar-timeline' },
          events.length === 0
            ? h(
              'div',
              { className: 'dsh-calendar-empty' },
              h('span', { className: 'dsh-calendar-empty-icon' }, h(CalendarIcon, { size: 22 })),
              h('p', { className: 'dsh-calendar-hint' }, t('noEvents'))
            )
            : events.map((event, index) => h(
              'div',
              {
                key: event.id,
                className: event.done === true ? 'dsh-calendar-tl-item is-done' : 'dsh-calendar-tl-item',
                style: { '--dsh-calendar-accent': TIMELINE_ACCENTS[index % TIMELINE_ACCENTS.length] }
              },
              h('span', { className: 'dsh-calendar-tl-time' }, event.time),
              h('span', { className: 'dsh-calendar-tl-rail' }, h('span', { className: 'dsh-calendar-tl-dot' })),
              h(
                'div',
                { className: 'dsh-calendar-tl-main' },
                h(
                  'div',
                  { className: 'dsh-calendar-tl-head' },
                  h('button', {
                    type: 'button',
                    className: event.done === true ? 'dsh-calendar-check is-done' : 'dsh-calendar-check',
                    title: event.done === true ? t('markOpen') : t('markDone'),
                    disabled: busy !== '',
                    onClick: () => void toggleEvent(event)
                  }, event.done === true ? t('doneMark') : ''),
                  h('span', { className: 'dsh-calendar-tl-title' }, event.title),
                  h('span', { className: 'dsh-calendar-tl-meta' }, `${event.endTime} · ${durationText(event.durationMin * 60, t)}`)
                ),
                event.note ? h('p', { className: 'dsh-calendar-tl-note' }, event.note) : null
              ),
              h(
                'div',
                { className: 'dsh-calendar-tl-actions' },
                confirmId === event.id
                  ? h(
                    'div',
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
                    className: 'dsh-calendar-del',
                    title: t('deleteEvent'),
                    'aria-label': t('deleteEvent'),
                    disabled: busy !== '',
                    onClick: () => setConfirmId(event.id)
                  }, h(TrashIcon, { size: 15 }))
              )
            ))
        );

        const todayCard = h(
          'div',
          { className: 'dsh-calendar-card dsh-calendar-card-today' },
          h(
            'div',
            { className: 'dsh-calendar-card-head' },
            h('span', { className: 'dsh-calendar-card-icon' }, h(CalendarIcon, { size: 15 })),
            h('span', { className: 'dsh-calendar-card-title' }, t('todayTitle')),
            h('span', { className: 'dsh-calendar-card-sub' }, `${doneCount} / ${events.length} ${t('doneOf')}`)
          ),
          addForm,
          timeline,
          events.length > 0
            ? h(
              'div',
              { className: 'dsh-calendar-card-foot' },
              h('span', { className: 'dsh-calendar-hint' }, `${t('todayPlanned')} ${durationText(plannedMin * 60, t)}`)
            )
            : null
        );

        const timerCard = h(
          'div',
          { className: 'dsh-calendar-card dsh-calendar-card-timer' },
          h(
            'div',
            { className: 'dsh-calendar-card-head' },
            h('span', { className: 'dsh-calendar-card-icon' }, h(ClockIcon, { size: 15 })),
            h('span', { className: 'dsh-calendar-card-title' }, t('timerTitle')),
            h('span', { className: 'dsh-calendar-card-sub' }, t('counterRemaining'))
          ),
          h(
            'div',
            { className: 'dsh-calendar-timer-hero' },
            h(
              'div',
              { className: `dsh-calendar-dial${dialVariant}` },
              ring,
              h(
                'div',
                { className: 'dsh-calendar-dial-text' },
                h('span', { className: expired ? 'dsh-calendar-dial-time is-bad' : 'dsh-calendar-dial-time' }, formatCounter(counterSeconds)),
                h('span', { className: 'dsh-calendar-dial-mode' }, `${dialMode} · ${Math.max(1, Math.round(timerDurationSec / 60))} ${t('minutesShort')}`),
                running ? h('span', { className: 'dsh-calendar-pulse', 'aria-hidden': true }) : null
              )
            ),
            h(
              'div',
              { className: 'dsh-calendar-timer-meta' },
              h('span', { className: 'dsh-calendar-hint' }, `${t('counterRemaining')} · ${t('counterElapsed')} ${formatCounter(elapsedSeconds)}`),
              expired && timer.mode !== 'idle'
                ? h('p', { className: 'dsh-calendar-note is-bad' }, timer.expired === true ? t('timerExpiredNotice') : t('timerFinishedNotice'))
                : h('span', { className: 'dsh-calendar-hint' }, timer.mode === 'idle' ? t('timerIdle') : timerStatus)
            )
          ),
          h(
            'div',
            { className: 'dsh-calendar-timer-controls' },
            h(
              'div',
              { className: 'dsh-calendar-seg', role: 'group' },
              modeButton('work', t('timerModeWork')),
              modeButton('break', t('timerModeBreak')),
              modeButton('custom', t('timerModeCustom')),
              timerMode === 'custom'
                ? h('input', {
                  className: 'dsh-calendar-input',
                  type: 'number',
                  min: 1,
                  max: 720,
                  title: t('customMinutesLabel'),
                  'aria-label': t('customMinutesLabel'),
                  value: customMinutes,
                  disabled: busy !== '',
                  onChange: event => setCustomMinutes(event.target.value)
                })
                : null
            ),
            h(
              'label',
              { className: 'dsh-calendar-field' },
              h('span', { className: 'dsh-calendar-field-icon' }, h(ListIcon, { size: 14 })),
              h('input', {
                className: 'dsh-calendar-input',
                placeholder: t('labelPlaceholder'),
                value: labelDraft,
                disabled: busy !== '',
                onChange: event => setLabelDraft(event.target.value)
              })
            ),
            h(
              'div',
              { className: 'dsh-calendar-timer-buttons' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-calendar-primary',
                  disabled: busy !== '',
                  onClick: () => void bigAction.run()
                },
                h(bigAction.Icon, { size: 15 }),
                h('span', null, busy === 'timer' ? t('loading') : bigAction.label)
              ),
              timer.mode !== 'idle' && !expired
                ? h('button', {
                  type: 'button',
                  className: 'dsh-calendar-button is-danger',
                  disabled: busy !== '',
                  onClick: () => void stopTimer()
                }, t('timerStopAction'))
                : null
            )
          )
        );

        const logCard = h(
          'div',
          { className: 'dsh-calendar-card dsh-calendar-card-log' },
          h(
            'div',
            { className: 'dsh-calendar-card-head' },
            h('span', { className: 'dsh-calendar-card-icon' }, h(ListIcon, { size: 15 })),
            h('span', { className: 'dsh-calendar-card-title' }, t('logTitle')),
            h('span', { className: 'dsh-calendar-card-sub' }, `${t('logTotal')} ${durationText(logTotalSec, t)}`)
          ),
          entries.length === 0
            ? h(
              'div',
              { className: 'dsh-calendar-empty' },
              h('span', { className: 'dsh-calendar-empty-icon' }, h(ClockIcon, { size: 22 })),
              h('p', { className: 'dsh-calendar-hint' }, t('logEmpty'))
            )
            : h(
              'div',
              { className: 'dsh-calendar-log' },
              entries.map(entry => h(
                'div',
                { key: entry.id, className: 'dsh-calendar-log-item' },
                h('span', { className: 'dsh-calendar-log-time' }, `${entry.startTime}–${entry.endTime}`),
                h('span', { className: 'dsh-calendar-log-label' }, entry.label),
                h('span', { className: 'dsh-calendar-log-duration' }, durationText(entry.durationSec, t)),
                h('span', { className: 'dsh-calendar-badge' }, entry.source === 'manual' ? t('logSourceManual') : t('logSourceTimer'))
              ))
            ),
          h('span', { className: 'dsh-calendar-hint' }, t('logAddTitle')),
          h(
            'div',
            { className: 'dsh-calendar-add' },
            h(
              'div',
              { className: 'dsh-calendar-add-row' },
              h(
                'label',
                { className: 'dsh-calendar-field' },
                h('span', { className: 'dsh-calendar-field-icon' }, h(ListIcon, { size: 14 })),
                h('input', {
                  className: 'dsh-calendar-input',
                  placeholder: t('logLabelPlaceholder'),
                  value: logDraft.label,
                  disabled: busy !== '',
                  onChange: event => setLogDraft({ ...logDraft, label: event.target.value })
                })
              ),
              h(
                'label',
                { className: 'dsh-calendar-field is-number' },
                h('span', { className: 'dsh-calendar-field-icon' }, h(ClockIcon, { size: 14 })),
                h('input', {
                  className: 'dsh-calendar-input',
                  type: 'number',
                  min: 1,
                  max: 1440,
                  title: t('logMinutesPlaceholder'),
                  placeholder: t('logMinutesPlaceholder'),
                  value: logDraft.minutes,
                  disabled: busy !== '',
                  onChange: event => setLogDraft({ ...logDraft, minutes: event.target.value })
                })
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-calendar-button is-primary',
                  disabled: busy !== '' || logDraft.label.trim() === '' || !(Number(logDraft.minutes) > 0),
                  onClick: () => void addLog()
                },
                h(PlusIcon, { size: 14 }),
                h('span', null, busy === 'log' ? t('logAdding') : t('logAddButton'))
              )
            )
          )
        );

        const chartColumns = chartDays.map((day, index) => {
          const seconds = Math.max(0, Number(day.durationSec) || 0);
          const height = seconds === 0 ? 4 : Math.max(8, Math.round((seconds / chartMax) * 100));
          // Host buckets start on Monday; the short weekday keys start on Sunday.
          const dayName = t(WEEKDAY_SHORT_KEYS[(index + 1) % 7]);
          return h(
            'div',
            {
              key: `day-${index}`,
              className: day.isToday === true ? 'dsh-calendar-chart-col is-today' : 'dsh-calendar-chart-col'
            },
            h(
              'div',
              { className: 'dsh-calendar-chart-track' },
              h('div', {
                className: 'dsh-calendar-chart-bar',
                style: { height: `${height}%` },
                title: `${dayName} · ${durationText(seconds, t)}`
              })
            ),
            h('span', { className: 'dsh-calendar-chart-day' }, dayName)
          );
        });

        const reportCard = h(
          'div',
          { className: 'dsh-calendar-card dsh-calendar-card-report' },
          h(
            'div',
            { className: 'dsh-calendar-card-head' },
            h('span', { className: 'dsh-calendar-card-icon' }, h(ChartIcon, { size: 15 })),
            h('span', { className: 'dsh-calendar-card-title' }, t('reportTitle')),
            h(
              'div',
              { className: 'dsh-calendar-seg' },
              h('button', {
                type: 'button',
                className: range === 'today' ? 'dsh-calendar-seg-btn is-active' : 'dsh-calendar-seg-btn',
                'aria-pressed': range === 'today',
                onClick: () => showReport('today')
              }, t('rangeToday')),
              h('button', {
                type: 'button',
                className: range === 'week' ? 'dsh-calendar-seg-btn is-active' : 'dsh-calendar-seg-btn',
                'aria-pressed': range === 'week',
                onClick: () => showReport('week')
              }, t('rangeWeek'))
            )
          ),
          activeReport === null
            ? h('p', { className: 'dsh-calendar-hint dsh-calendar-empty-note' }, t('loading'))
            : h(
              'div',
              { className: 'dsh-calendar-total' },
              h('span', { className: 'dsh-calendar-total-value' }, durationText(activeReport.totalSec, t)),
              h('span', { className: 'dsh-calendar-total-caption' }, `${t('reportEntriesCount')} ${activeReport.count}`)
            ),
          h(
            'div',
            { className: 'dsh-calendar-chart-block' },
            h(
              'div',
              { className: 'dsh-calendar-chart', role: 'img', 'aria-label': t('reportChartCaption') },
              chartColumns
            ),
            h('p', { className: 'dsh-calendar-chart-caption' }, t('reportChartCaption'))
          ),
          activeReport !== null && reportLabels.length === 0
            ? h('p', { className: 'dsh-calendar-hint dsh-calendar-empty-note' }, t('reportEmpty'))
            : null,
          activeReport !== null && reportLabels.length > 0
            ? h(
              'div',
              { className: 'dsh-calendar-bars' },
              reportLabels.map(row => h(
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
            : null
        );

        const hero = h(
          'div',
          { className: 'dsh-calendar-hero' },
          h('span', { className: 'dsh-calendar-logo is-large' }, h(CalendarIcon, { size: 26 })),
          h(
            'div',
            { className: 'dsh-calendar-hero-text' },
            h('h1', null, t('pageTitle')),
            h('p', { className: 'dsh-calendar-date' }, `${dateLine} · ${greeting}`),
            h('p', { className: 'dsh-calendar-sub' }, t('hint'))
          ),
          h(
            'div',
            { className: 'dsh-calendar-actions' },
            h(
              'span',
              { className: `dsh-calendar-status ${statusVariant}`.trim() },
              h('span', { className: 'dsh-calendar-status-dot' }),
              timerStatus
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-calendar-button',
                disabled: busy !== '',
                onClick: () => void run('refresh', refresh)
              },
              h(RefreshIcon, { size: 14 }),
              h('span', null, busy === 'refresh' ? t('loading') : t('refresh'))
            )
          )
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
              hero,
              phase === 'error'
                ? h('p', { className: 'dsh-calendar-error' }, t('loadFailed'), ' ',
                  h('button', { type: 'button', className: 'dsh-calendar-button', onClick: () => void refresh() }, t('retry')))
                : null,
              notice !== null
                ? h('p', { className: notice.kind === 'ok' ? 'dsh-calendar-note' : 'dsh-calendar-note is-bad', role: 'status' }, notice.text)
                : null,
              h(
                'div',
                { className: 'dsh-calendar-stats' },
                statCard('is-events', CalendarIcon, t('statsEvents'), String(events.length)),
                statCard('is-done', CheckIcon, t('statsDone'), String(doneCount)),
                statCard('is-time', ClockIcon, t('statsTracked'), durationText(logTotalSec, t)),
                statCard('is-count', ListIcon, t('statsRecords'), String(entries.length))
              ),
              h(
                'div',
                { className: 'dsh-calendar-layout' },
                todayCard,
                timerCard,
                reportCard,
                logCard
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
