import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const run = promisify(execFile)

/** Read and parse one JSON file of the plugin. */
async function readJson(relative) {
  return JSON.parse(await readFile(join(ROOT, relative), 'utf8'))
}

/** Assert that a plugin file exists. */
async function exists(relative) {
  await access(join(ROOT, relative))
}

test('package.json: bundle-патч, клиент, версия 0.2.3 и экспорты ресурсов', async () => {
  const manifest = await readJson('package.json')
  assert.equal(manifest.name, 'dsh-calendar')
  assert.equal(manifest.version, '0.2.3')
  assert.equal(manifest.private, true)
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh?.client?.platform, 'web')
  assert.equal(manifest.dsh?.client?.immediately, true)
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-slots',
  ])
  assert.equal(manifest.exports['.'], './index.js')
  assert.equal(manifest.exports['./client'], './client.js')
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  assert.equal(manifest.exports['./icon'], './icon.svg')
  assert.equal(manifest.icon, './icon.svg')
  for (const entry of ['index.js', 'client.js', 'lib', 'cordis.patch.yml', 'locale/*.json', 'docs', 'icon.svg', 'README.md', 'test']) {
    assert.ok(manifest.files.includes(entry), `files содержит ${entry}`)
  }
  assert.equal(manifest.scripts?.test, 'node --test test/*.test.mjs')
})

test('cordis.patch.yml вставляет строку dsh-calendar', async () => {
  const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /^- insert:/m)
  assert.match(patch, /id: dsh-calendar/)
  assert.match(patch, /name: dsh-calendar/)
})

test('локали ru и en: meta.title/description/detail и документ существует', async () => {
  for (const locale of ['ru', 'en']) {
    const data = await readJson(`locale/${locale}.json`)
    assert.equal(typeof data.meta?.title, 'string', `${locale}: title`)
    assert.ok(data.meta.title.length > 1, `${locale}: title не пустой`)
    assert.equal(typeof data.meta?.description, 'string', `${locale}: description`)
    assert.ok(data.meta.description.length > 60, `${locale}: description содержательный`)
    assert.equal(data.meta.detail, 'docs/DETAIL.md', `${locale}: detail`)
  }
  const ru = await readJson('locale/ru.json')
  assert.match(ru.meta.title, /Календарь/)
  assert.match(ru.meta.description, /таймер/)
  assert.match(ru.meta.description, /data\.json/)
  assert.match(ru.meta.description, /calendar_today/)
  const en = await readJson('locale/en.json')
  assert.equal(en.meta.title, 'Calendar and time tracking')
  assert.match(en.meta.description, /timer/)
})

test('ресурсы на месте: index.js, client.js, lib, icon.svg, README, docs/DETAIL.md', async () => {
  for (const relative of [
    'index.js',
    'client.js',
    'icon.svg',
    'README.md',
    'docs/DETAIL.md',
    'lib/paths.mjs',
    'lib/time.mjs',
    'lib/timer.mjs',
    'lib/storage.mjs',
    'lib/reports.mjs',
    'lib/format.mjs',
    'lib/tools.mjs',
  ]) {
    await exists(relative)
  }
  const icon = await readFile(join(ROOT, 'icon.svg'), 'utf8')
  assert.match(icon, /^<svg /)
  assert.match(icon, /viewBox="0 0 48 48"/)
  assert.ok(!icon.includes('\uFFFD'))
})

test('index.js: имя, inject, apply, маршруты и отсутствие секретов', async () => {
  const module = await import('../index.js')
  assert.equal(module.name, 'dsh-calendar')
  assert.deepEqual(module.inject, ['tools', 'connection', 'sessionPersistence'])
  assert.equal(typeof module.apply, 'function')
  const source = await readFile(join(ROOT, 'index.js'), 'utf8')
  for (const path of [
    '/api/dsh-calendar/state',
    '/api/dsh-calendar/event/add',
    '/api/dsh-calendar/event/toggle',
    '/api/dsh-calendar/event/remove',
    '/api/dsh-calendar/timer',
    '/api/dsh-calendar/log/add',
    '/api/dsh-calendar/report',
  ]) {
    assert.ok(source.includes(path), `маршрут ${path} объявлен`)
  }
  const toolsSource = await readFile(join(ROOT, 'lib', 'tools.mjs'), 'utf8')
  for (const toolName of ['calendar_today', 'calendar_add', 'calendar_list', 'timer_start', 'timer_status', 'timer_stop', 'time_report']) {
    assert.ok(toolsSource.includes(`name: '${toolName}'`), `инструмент ${toolName} объявлен`)
  }
  for (const forbidden of ['TELEGRAM_BOT_TOKEN', 'GITHUB_TOKEN', 'api.telegram.org', 'api.github.com']) {
    assert.equal(source.includes(forbidden), false, `в host-части нет ${forbidden}`)
  }
  assert.equal(source.includes('\uFFFD'), false, 'нет битых символов')
  assert.ok(toolsSource.includes('export function createTools'), 'lib/tools.mjs объявляет createTools')
})

test('index.js и client.js: синтаксис проходит node --check', async () => {
  const libFiles = (await readdir(join(ROOT, 'lib'))).filter(name => name.endsWith('.mjs')).map(name => join('lib', name))
  const testFiles = (await readdir(join(ROOT, 'test'))).filter(name => name.endsWith('.mjs')).map(name => join('test', name))
  for (const relative of ['index.js', 'client.js', ...libFiles, ...testFiles]) {
    await run(process.execPath, ['--check', join(ROOT, relative)])
  }
})

test('client.js регистрирует слоты левой панели и не ломает inject', async () => {
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  for (const marker of [
    "name: 'main'",
    "key: PANEL_ID",
    "name: 'sidebar.panellist'",
    "id: PANEL_ID",
    "name: 'shell.overlay'",
    "name: 'plugins.detail.section'",
    'ctx.layout',
    'selectPanel',
    "const PANEL_ID = 'calendar'",
    "exports.inject = ['slots', 'locale', 'layout']",
  ]) {
    assert.ok(source.includes(marker), `client.js содержит ${marker}`)
  }
  const module = await import('../client.js').catch(() => null)
  assert.equal(module, null, 'client.js — браузерный артефакт, в Node не импортируется')
})

test('README и docs/DETAIL.md: инструкция для новичка, инструменты и ограничения', async () => {
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8')
  for (const marker of [
    'Что это и зачем',
    'Как открыть',
    'Как пользоваться пошагово',
    'Примеры',
    'Что вы увидите',
    'Частые ошибки',
    'Ограничения',
    'Связанные плагины',
    'data.json',
    'calendar_today',
    'calendar_add',
    'calendar_list',
    'timer_start',
    'timer_status',
    'timer_stop',
    'time_report',
    'сегодня',
    'недел',
    'левой панели',
    '0.2.0',
    '0.2.2',
    '0.2.3',
  ]) {
    assert.ok(readme.includes(marker), `README содержит «${marker}»`)
  }
  const detail = await readFile(join(ROOT, 'docs', 'DETAIL.md'), 'utf8')
  for (const marker of [
    'Что это и зачем',
    'Как открыть',
    'Как пользоваться пошагово',
    'Что вы увидите',
    'Как это устроено',
    'Частые ошибки',
    'Ограничения',
    'Связанные плагины',
    'data.json',
    'таймер',
    'отчёт',
  ]) {
    assert.ok(detail.includes(marker), `DETAIL содержит «${marker}»`)
  }
  for (const text of [readme, detail]) {
    assert.equal(text.includes('\uFFFD'), false, 'нет битых символов')
  }
})

