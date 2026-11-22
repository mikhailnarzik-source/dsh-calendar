/**
 * Where the plugin keeps its own data.
 *
 * `~/.dsh/dsh-calendar/data.json` by default; `DSH_CALENDAR_DIR` overrides the
 * directory (tests use a temporary one, a portable install may too). The path is
 * resolved on every call, so an environment change applies without reloading.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Directory holding the events, the timer and the time log. */
export function calendarDir() {
  const override = process.env.DSH_CALENDAR_DIR
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  return join(homedir(), '.dsh', 'dsh-calendar')
}

/** Absolute path of the data file. */
export function dataFile() {
  return join(calendarDir(), 'data.json')
}
