import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { MODES, initialMode, modeFilePath, normalizeMode, saveMode } from './lib/mode.js'
import { buildRules } from './lib/rules.js'
import { loadSkills } from './lib/skills.js'

export const name = 'dsh-ponytail'
export const inject = ['systemPrompt']

export const Config = z.object({
  defaultMode: z.union([...MODES]).default('full'),
  sectionOrder: z.number().default(10150),
})

export function apply(ctx, config) {
  const { skills, errors } = loadSkills(fileURLToPath(new URL('skills', import.meta.url)))
  for (const error of errors) ctx.logger.warn('dsh-ponytail: skipped skill %s', error)
  const skillBody = skills.find(skill => skill.name === 'ponytail')?.content

  const file = modeFilePath()
  let mode = initialMode({ file, env: process.env, defaultMode: config.defaultMode })

  ctx.systemPrompt.section({
    name: 'ponytail',
    order: config.sectionOrder,
    interpolate: false,
    text: () => buildRules(mode, skillBody),
  })

  ctx.inject(['commands'], (inner) => {
    inner.commands.register({
      name: 'ponytail',
      description: 'Switch ponytail level',
      input: { hint: '[lite|full|ultra|off]' },
      handler: ({ rawInput }) => {
        const wanted = rawInput.trim()
        const next = wanted !== '' ? normalizeMode(wanted)
          : mode !== 'off' ? mode
            : config.defaultMode === 'off' ? 'full' : config.defaultMode
        if (!next) return { kind: 'error', text: 'Usage: /ponytail [lite|full|ultra|off]' }
        if (next !== mode) {
          mode = next
          // The in-process switch already holds; a failed write only loses it across restarts.
          try {
            saveMode(file, mode)
          } catch (e) {
            ctx.logger.warn('dsh-ponytail: could not save level to %s: %s', file, e.message)
          }
        }
        return { kind: 'success', text: 'ponytail ' + mode }
      },
    })
  })

  ctx.inject(['skills'], (inner) => {
    for (const skill of skills) {
      try {
        inner.skills.register({ ...skill, source: 'runtime' })
      } catch (e) {
        ctx.logger.warn('dsh-ponytail: could not register skill %s: %s', skill.name, e.message)
      }
    }
  })
}
