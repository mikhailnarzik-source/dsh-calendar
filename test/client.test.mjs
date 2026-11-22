import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Minimal React stand-in: hooks return their initial values and do nothing. */
const fakeReact = {
  createElement: (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useReducer: (_reducer, initial) => [initial, () => {}],
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useCallback: callback => callback,
  useMemo: factory => factory(),
}

/** The fake React element factory used to call slot components directly. */
const h = fakeReact.createElement

/** Render function components down to plain host elements. */
function render(node) {
  if (node === null || node === undefined) return node
  if (Array.isArray(node)) return node.map(render)
  if (typeof node === 'object' && typeof node.type === 'function') return render(node.type(node.props ?? {}))
  return node
}

/** Collect every string in a React element tree. */
function texts(node, found = []) {
  if (node === null || node === undefined) return found
  if (typeof node === 'string' || typeof node === 'number') {
    found.push(String(node))
    return found
  }
  if (Array.isArray(node)) {
    for (const item of node) texts(item, found)
    return found
  }
  if (typeof node === 'object' && node.props !== undefined) texts(node.props.children, found)
  return found
}

/** Collect every class name in a React element tree. */
function classes(node, found = []) {
  if (node === null || node === undefined) return found
  if (Array.isArray(node)) {
    for (const item of node) classes(item, found)
    return found
  }
  if (typeof node === 'object' && node.props !== undefined) {
    if (typeof node.props.className === 'string') found.push(node.props.className)
    classes(node.props.children, found)
  }
  return found
}

/** Find the first element of the given host type in a rendered tree. */
function firstOfType(node, type) {
  if (node === null || node === undefined) return undefined
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = firstOfType(item, type)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (typeof node === 'object') {
    if (node.type === type) return node
    return firstOfType(node.props?.children, type)
  }
  return undefined
}

/** Find every element of the given host type in a rendered tree. */
function allOfType(node, type, found = []) {
  if (node === null || node === undefined) return found
  if (Array.isArray(node)) {
    for (const item of node) allOfType(item, type, found)
    return found
  }
  if (typeof node === 'object') {
    if (node.type === type) found.push(node)
    allOfType(node.props?.children, type, found)
  }
  return found
}

/**
 * Load `client.js` the way the browser module loader does.
 * @param options - `{ layout }`: a fake `ctx.layout` navigation service.
 * @returns `{ module, locales, injected, registered, selectedPanels }`.
 */
async function loadClient(options = {}) {
  let source = await readFile(join(ROOT, 'client.js'), 'utf8')
  // A render smoke test may seed the initial snapshot: the component takes it
  // from `useState`, and the effects (the real fetch) stay out of the picture.
  if (options.snapshot !== undefined) {
    const anchor = 'const [snapshot, setSnapshot] = React.useState(null);'
    assert.ok(source.includes(anchor), 'нашлась начальная строка снимка')
    source = source.replace(anchor, `const [snapshot, setSnapshot] = React.useState(${JSON.stringify(options.snapshot)});`)
  }
  const captured = {}
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(config) {
          captured.options = config
        },
      },
    },
    console: { error: () => {}, warn: () => {}, log: () => {} },
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(captured.options !== undefined, 'ModuleLoader.load вызван')
  assert.equal(captured.options.id, 'dsh-calendar')

  const module = captured.options.factory(name => {
    if (name === 'react') return fakeReact
    throw new Error(`неожиданный модуль ${name}`)
  })
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual([...module.inject], ['slots', 'locale', 'layout'])
  assert.equal(module.NS, 'dshCalendar')

  const locales = []
  const injected = []
  const registered = []
  const selectedPanels = []
  const ctx = {
    ...(options.layout === undefined
      ? {}
      : { layout: { selectPanel: id => selectedPanels.push(id) } }),
    effect: callback => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries })
      },
      bind(namespace) {
        return key => `${namespace}.${key}`
      },
    },
    slots: {
      inject(key, callback) {
        injected.push(key)
        return callback()
      },
      register(registration, component) {
        registered.push({ options: registration, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  return { module, locales, injected, registered, selectedPanels }
}

/** One slot registration by slot name. */
function slot(registered, name) {
  const found = registered.find(item => item.options.name === name)
  assert.ok(found !== undefined, `слот ${name} зарегистрирован`)
  return found
}

test('client.js: словари en и ru с одинаковым набором ключей', async () => {
  const { locales } = await loadClient()
  assert.equal(locales.length, 1)
  const { namespace, dictionaries } = locales[0]
  assert.equal(namespace, 'dshCalendar')
  assert.equal(dictionaries.en.pageTitle, 'Calendar and time tracking')
  assert.equal(dictionaries.ru.pageTitle, 'Календарь и учёт времени')
  assert.equal(dictionaries.ru.panel, 'Календарь')
  assert.equal(dictionaries.en.panel, 'Calendar')
  const enKeys = Object.keys(dictionaries.en).sort()
  const ruKeys = Object.keys(dictionaries.ru).sort()
  assert.deepEqual(enKeys, ruKeys, 'словари описывают одни и те же строки')

  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  const used = new Set([...source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map(match => match[1]))
  assert.ok(used.size > 40, `строк используется много: ${used.size}`)
  for (const key of used) {
    assert.ok(enKeys.includes(key), `en: есть ключ ${key}`)
    assert.ok(ruKeys.includes(key), `ru: есть ключ ${key}`)
  }
  assert.equal(source.includes('\uFFFD'), false, 'нет битых символов')
})

test('client.js: регистрирует main, sidebar.panellist, shell.overlay и секцию плагина', async () => {
  const { injected, registered } = await loadClient()
  for (const name of ['main', 'sidebar.panellist', 'shell.overlay', 'plugins.detail.section']) {
    assert.ok(injected.includes(name), `слот ${name} объявлен через slots.inject`)
  }
  assert.equal(registered.length, 4)

  const main = slot(registered, 'main')
  assert.equal(main.options.key, 'calendar')
  assert.equal(typeof main.component, 'function')

  const rail = slot(registered, 'sidebar.panellist')
  assert.equal(rail.options.id, 'calendar')
  assert.equal(rail.options.order, 4)
  assert.equal(rail.options.locale, 'dshCalendar')
  assert.equal(typeof rail.options.label, 'function')
  assert.equal(rail.options.label(), 'dshCalendar.panel')
  assert.equal(typeof rail.component, 'function')

  const overlay = slot(registered, 'shell.overlay')
  assert.equal(overlay.options.id, 'calendar.timer')
  assert.equal(typeof overlay.options.order, 'number')
  assert.equal(typeof overlay.component, 'function')

  const detail = slot(registered, 'plugins.detail.section')
  assert.equal(detail.options.id, 'dsh-calendar-detail')
  assert.equal(detail.options.locale, 'dshCalendar')
  assert.equal(typeof detail.options.order, 'number')
  assert.equal(typeof detail.component, 'function')
})

test('client.js: иконка левой панели — SVG календаря с часами', async () => {
  const { registered } = await loadClient()
  const icon = slot(registered, 'sidebar.panellist').component
  const big = render(h(icon, { size: 22 }))
  assert.equal(big.type, 'svg')
  assert.equal(big.props.width, 22)
  assert.equal(big.props.height, 22)
  assert.equal(big.props['aria-hidden'], true)
  const children = Array.isArray(big.props.children) ? big.props.children : [big.props.children]
  assert.ok(children.length >= 4, 'в иконке есть рамка, шапка и циферблат')
  assert.equal(children.some(child => child?.type === 'circle'), true, 'есть циферблат')
  const small = render(h(icon, {}))
  assert.equal(small.props.width, 16, 'по умолчанию 16px')
})

test('client.js: страница календаря — шапка, стат-карточки, круговой прогресс, таймлайн и бар-чарт', async () => {
  const { registered } = await loadClient()
  const page = slot(registered, 'main').component
  const element = page({})
  assert.notEqual(element, null)
  const tree = render(element)
  assert.equal(tree.type, 'section')
  assert.equal(tree.props['aria-label'], 'dshCalendar.pageTitle')
  const allClasses = classes(tree).join(' ')
  for (const className of [
    'dsh-calendar-page',
    'dsh-calendar-hero',
    'dsh-calendar-stats',
    'dsh-calendar-stat',
    'dsh-calendar-layout',
    'dsh-calendar-card',
    'dsh-calendar-input',
    'dsh-calendar-seg',
    'dsh-calendar-primary',
    'dsh-calendar-button',
    'dsh-calendar-ring',
    'dsh-calendar-timeline',
    'dsh-calendar-chart',
    'dsh-calendar-empty',
  ]) {
    assert.ok(allClasses.includes(className), `на странице есть ${className}`)
  }

  const statCards = classes(tree).filter(name => name.split(' ').includes('dsh-calendar-stat'))
  assert.equal(statCards.length, 4, 'четыре стат-карточки: события, выполнено, время, записи')
  const cards = classes(tree).filter(name => name.split(' ').includes('dsh-calendar-card'))
  assert.equal(cards.length, 4, 'четыре блока-карточки: сегодня, таймер, журнал, отчёт')

  // Прогресс-круг таймера: SVG circle со stroke-dasharray и живым смещением.
  const ringBar = allOfType(tree, 'circle').find(circle => typeof circle.props.strokeDasharray === 'string')
  assert.ok(ringBar !== undefined, 'есть круг прогресса со stroke-dasharray')
  assert.match(ringBar.props.className, /dsh-calendar-ring-bar/)
  assert.equal(typeof ringBar.props.strokeDashoffset, 'string', 'у круга есть stroke-dashoffset')
  assert.equal(ringBar.props.r, 64)
  const ringTrack = allOfType(tree, 'circle').find(circle => typeof circle.props.strokeWidth === 'number' && circle.props.strokeDasharray === undefined)
  assert.ok(ringTrack !== undefined, 'есть дорожка круга')

  // Мини-бар-чарт: семь столбиков по дням недели, без внешних библиотек.
  const chartColumns = classes(tree).filter(name => name.split(' ').includes('dsh-calendar-chart-col'))
  assert.equal(chartColumns.length, 7, 'в бар-чарте семь дней недели')

  const labels = texts(tree).join(' ')
  for (const key of [
    'dshCalendar.pageTitle',
    'dshCalendar.hint',
    'dshCalendar.statsEvents',
    'dshCalendar.statsDone',
    'dshCalendar.statsTracked',
    'dshCalendar.statsRecords',
    'dshCalendar.todayTitle',
    'dshCalendar.addTitle',
    'dshCalendar.noEvents',
    'dshCalendar.timerTitle',
    'dshCalendar.timerIdle',
    'dshCalendar.timerModeWork',
    'dshCalendar.timerModeBreak',
    'dshCalendar.timerModeCustom',
    'dshCalendar.timerStartAction',
    'dshCalendar.logTitle',
    'dshCalendar.logEmpty',
    'dshCalendar.logAddButton',
    'dshCalendar.reportTitle',
    'dshCalendar.rangeToday',
    'dshCalendar.rangeWeek',
    'dshCalendar.reportChartCaption',
    'dshCalendar.refresh',
    'dshCalendar.loading',
  ]) {
    assert.ok(labels.includes(key), `на странице есть строка ${key}`)
  }
  assert.ok(texts(tree).includes('25:00'), 'счётчик в покое показывает 25:00')
  assert.match(labels, /dshCalendar\.greeting/, 'в шапке есть приветствие по времени суток')
  assert.match(labels, /dshCalendar\.weekday/, 'в шапке есть день недели')
})

test('client.js: полный снимок — строки таймлайна, журнал, кольцо таймера и бар-чарт с данными', async () => {
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((_, index) => ({
    date: `2026-11-${16 + index}`,
    weekday: index,
    durationSec: index === 0 ? 1500 : index === 2 ? 2400 : 0,
    isToday: index === 2,
  }))
  const byLabel = [{ label: 'Работа', durationSec: 1500, count: 1, share: 1 }]
  const snapshot = {
    ok: true,
    version: 1,
    now: new Date().toISOString(),
    today: {
      date: '2026-11-18',
      count: 2,
      done: 1,
      events: [
        { id: 'e1', title: 'Созвон', time: '14:00', endTime: '14:45', durationMin: 45, note: 'важно', done: false },
        { id: 'e2', title: 'Код', time: '09:00', endTime: '09:30', durationMin: 30, note: '', done: true },
      ],
    },
    timer: {
      mode: 'work',
      running: true,
      paused: false,
      expired: false,
      label: 'Код',
      durationMin: 25,
      durationSec: 1500,
      elapsedSec: 300,
      remainingSec: 1200,
      startedAt: new Date(Date.now() - 300_000).toISOString(),
      finishedAt: '',
    },
    logToday: {
      count: 1,
      totalSec: 1500,
      entries: [{ id: 'l1', label: 'Работа', startTime: '09:00', endTime: '09:25', durationSec: 1500, source: 'timer' }],
    },
    recent: [],
    report: {
      today: { range: 'today', totalSec: 1500, count: 1, byLabel, days },
      week: { range: 'week', totalSec: 3900, count: 2, byLabel, days },
    },
    limits: { maxEntries: 2000 },
  }
  const { registered } = await loadClient({ snapshot })
  const tree = render(slot(registered, 'main').component({}))
  const allClasses = classes(tree)

  const items = allClasses.filter(name => name.split(' ').includes('dsh-calendar-tl-item'))
  assert.equal(items.length, 2, 'два события в таймлайне')
  assert.equal(items.filter(name => name.split(' ').includes('is-done')).length, 1, 'выполненное приглушено')
  assert.equal(allClasses.filter(name => name.split(' ').includes('dsh-calendar-log-item')).length, 1, 'строка журнала')
  assert.equal(allClasses.filter(name => name.split(' ').includes('dsh-calendar-bar-row')).length, 1, 'полоска метки')
  assert.equal(allClasses.filter(name => name.split(' ').includes('dsh-calendar-del')).length, 2, 'у каждого события есть удаление')

  const chartBars = allOfType(tree, 'div').filter(div => div.props.className === 'dsh-calendar-chart-bar')
  assert.equal(chartBars.length, 7, 'семь столбиков бар-чарта')
  const heights = chartBars.map(bar => Number.parseFloat(String(bar.props.style?.height)))
  assert.equal(heights[0], 63, 'столбик понедельника пропорционален времени')
  assert.equal(heights[2], 100, 'сегодняшний столбик — самый высокий')
  assert.ok(heights.every(height => height > 0), 'у каждого дня есть видимая высота')
  assert.equal(allClasses.filter(name => name.split(' ').includes('is-today')).length >= 1, true, 'сегодняшний столбик подсвечен')

  const labels = texts(tree)
  for (const text of ['Созвон', 'Код', 'важно', 'Работа', '20:00', '2', '1']) {
    assert.ok(labels.includes(text), `на странице есть «${text}»`)
  }

  const ringBar = allOfType(tree, 'circle').find(circle => typeof circle.props.strokeDasharray === 'string')
  const offset = Number.parseFloat(ringBar.props.strokeDashoffset)
  const length = Number.parseFloat(String(ringBar.props.strokeDasharray).split(' ')[0])
  assert.ok(offset > 0 && offset < length, 'кольцо показывает частичный прогресс запущенного таймера')
  assert.ok(labels.join(' ').includes('dshCalendar.timerPauseAction'), 'у идущего таймера кнопка «Пауза»')
})

test('client.js: таймлайн и бар-чарт размечены вложенными элементами', async () => {
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  for (const marker of [
    'dsh-calendar-tl-item',
    'dsh-calendar-tl-time',
    'dsh-calendar-tl-rail',
    'dsh-calendar-tl-dot',
    'dsh-calendar-tl-title',
    'dsh-calendar-tl-note',
    'dsh-calendar-tl-actions',
    'dsh-calendar-chart-bar',
    'dsh-calendar-chart-day',
    'dsh-calendar-chart-col is-today',
    'strokeDasharray',
    'strokeDashoffset',
    'dsh-calendar-status-dot',
    'dsh-calendar-seg-btn',
    'dsh-calendar-pulse',
    'TIMELINE_ACCENTS',
  ]) {
    assert.ok(source.includes(marker), `в разметке есть ${marker}`)
  }
  // Выполненные события приглушены и зачёркнуты, удаление появляется по наведению.
  assert.match(source, /dsh-calendar-tl-item\.is-done/)
  assert.match(source, /text-decoration:line-through/)
  assert.match(source, /:hover \.dsh-calendar-tl-actions/)
})

test('client.js: секция плагина — краткая справка с кнопкой открытия панели', async () => {
  const { registered, selectedPanels } = await loadClient({ layout: {} })
  const detail = slot(registered, 'plugins.detail.section').component
  assert.equal(detail({ subject: { kind: 'bundle', pkg: { name: 'dsh-other' } } }), null)
  assert.equal(detail({ subject: { id: 'dsh-other' } }), null)

  const help = render(detail({ subject: { kind: 'bundle', pkg: { name: 'dsh-calendar' } } }))
  const helpClasses = classes(help).join(' ')
  assert.ok(helpClasses.includes('dsh-calendar-help-card'), 'карточка справки')
  const labels = texts(help).join(' ')
  assert.match(labels, /dshCalendar\.helpHint/)
  assert.match(labels, /dshCalendar\.helpOpen/)
  assert.equal(labels.includes('dshCalendar.timerTitle'), false, 'на странице плагина нет всего UI')

  const openButton = firstOfType(help, 'button')
  assert.ok(openButton !== undefined, 'есть кнопка открытия')
  openButton.props.onClick()
  assert.deepEqual(selectedPanels, ['calendar'], 'кнопка открывает панель calendar')
})

test('client.js: сводка в списке плагинов рисуется без ошибок', async () => {
  const { registered } = await loadClient()
  const detail = slot(registered, 'plugins.detail.section').component
  const element = detail({
    subject: { kind: 'bundle', pkg: { name: 'dsh-calendar' } },
    view: 'summary',
  })
  assert.notEqual(element, null)
  const labels = texts(render(element)).join(' ')
  assert.match(labels, /dshCalendar\.pageTitle/)
  assert.match(labels, /dshCalendar\.summaryTimerOff/)
  assert.match(labels, /dshCalendar\.summaryEvents/)
})

test('client.js: плавающий чип таймера спрятан без запущенного таймера', async () => {
  const { registered } = await loadClient()
  const chip = slot(registered, 'shell.overlay').component
  // The fake host never resolves the state request, so the chip renders nothing.
  assert.equal(render(chip({})), null)
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  assert.match(source, /dsh-calendar-chip/)
  assert.match(source, /formatCounter\(expired \? 0 : remaining\)/)
  assert.match(source, /setInterval\(\(\) => setTick\(Date\.now\(\)\), 1000\)/)
  assert.match(source, /dsh-calendar:timer-changed/, 'чип и панель синхронизируются событием')
  assert.match(source, /selectPanel\(PANEL_ID\)/)
})

test('client.js: стили используют токены темы, адаптив и анимации', async () => {
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  for (const token of [
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-brand-primary',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-state-error-primary',
  ]) {
    assert.ok(source.includes(token), `стили используют ${token}`)
  }
  assert.match(source, /new AudioContext|AudioContextClass/, 'есть звук окончания таймера')
  assert.match(source, /dsh-calendar-chip-wrap\{position:fixed/, 'чип прибит к углу экрана')
  assert.match(source, /style: \{ width: /, 'у полосок отчёта есть ширина')
  assert.match(source, /style: \{ height: /, 'у столбиков бар-чарта есть высота')
  assert.match(source, /@keyframes dsh-calendar-pulse/, 'есть пульсация индикатора таймера')
  assert.match(source, /@media \(max-width:760px\)/, 'одна колонка на узком экране')
  assert.match(source, /@media \(max-width:980px\)/, 'раскладка сжимается раньше')
  assert.match(source, /max-width:1000px/, 'контент центрирован и ограничен по ширине')
  assert.match(source, /margin:0 auto/, 'контейнер выровнен по центру')
  assert.match(source, /border-radius:16px/, 'мягкие радиусы карточек')
  assert.equal(source.includes('\uFFFD'), false, 'нет битых символов')
})
