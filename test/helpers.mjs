/**
 * Shared test helpers: a temporary calendar directory and a minimal plugin
 * context that records tools, routes and effect disposers.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Run a test body with `DSH_CALENDAR_DIR` pointing at a fresh temporary
 * directory, so no test ever touches the real `~/.dsh/dsh-calendar`.
 * @param body - async callback receiving the directory path.
 * @returns whatever the callback returns.
 */
export async function withTempCalendar(body) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-calendar-test-'))
  const previous = process.env.DSH_CALENDAR_DIR
  process.env.DSH_CALENDAR_DIR = dir
  try {
    return await body(dir)
  } finally {
    if (previous === undefined) delete process.env.DSH_CALENDAR_DIR
    else process.env.DSH_CALENDAR_DIR = previous
    await rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 })
  }
}

/**
 * Minimal plugin context that records tools, routes and effect disposers.
 * @returns the fake context.
 */
export function fakeContext() {
  const tools = []
  const routes = []
  const effects = []
  const ctx = {
    tools: {
      register: definition => {
        tools.push(definition)
        return () => {}
      },
    },
    connection: {
      fetch: {
        register: route => {
          routes.push(route)
          return () => {}
        },
      },
    },
    sessionPersistence: {},
    effect: callback => {
      const dispose = callback()
      if (typeof dispose === 'function') effects.push(dispose)
      return () => {}
    },
    toolsList: tools,
    routesList: routes,
    disposeAll: async () => {
      while (effects.length > 0) {
        const dispose = effects.pop()
        try {
          await dispose()
        } catch {
          // a disposer must not mask the test result
        }
      }
    },
  }
  return ctx
}

/**
 * Call one registered POST route.
 * @param ctx - fake context after `apply`.
 * @param path - route path.
 * @param payload - JSON body.
 * @returns the parsed response body.
 */
export async function callRoute(ctx, path, payload) {
  const route = ctx.routesList.find(item => item.path === path)
  if (route === undefined) throw new Error(`маршрут ${path} не зарегистрирован`)
  const response = await route.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  }))
  return await response.json()
}

/**
 * A deterministic local moment.
 * @param parts - `{ year, month, day, hours, minutes }`, month is 1-based.
 * @returns the Date.
 */
export function localMoment({ year, month, day, hours = 10, minutes = 0 }) {
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

/**
 * ISO string of a local moment shifted by whole minutes.
 * @param date - base moment.
 * @param minutes - shift in minutes.
 * @returns ISO string.
 */
export function plusMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000).toISOString()
}
