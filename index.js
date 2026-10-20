import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { buildRules } from './lib/rules.js'
import { loadSkills } from './lib/skills.js'

export const name = 'dsh-ponytail'
export const inject = ['systemPrompt']

const MODES = ['lite', 'full', 'ultra', 'off']
// The profile entry id this package's cordis.patch.yml inserts; settings address it by that id.
const SETTINGS_NS = 'ponytail'

function normalizeMode(value) {
  const mode = String(value).trim().toLowerCase()
  return MODES.includes(mode) ? mode : undefined
}

export const Config = z.object({
  mode: z.union(MODES).default('full').volatile(),
  sectionOrder: z.number().default(10150),
})

export function apply(ctx, config) {
  const { skills, errors } = loadSkills(fileURLToPath(new URL('skills', import.meta.url)))
  for (const error of errors) ctx.logger.warn('dsh-ponytail: skipped skill %s', error)
  const skillBody = skills.find(skill => skill.name === 'ponytail')?.content

  ctx.systemPrompt.section({
    name: 'ponytail',
    order: config.sectionOrder,
    interpolate: false,
    text: () => buildRules(config.mode.get(), skillBody),
  })

  ctx.inject(['commands'], (inner) => {
    inner.commands.register({
      name: 'ponytail',
      description: 'Switch ponytail level',
      input: { hint: '[lite|full|ultra|off]' },
      handler: async ({ rawInput }) => {
        const current = config.mode.get()
        const wanted = rawInput.trim()
        if (wanted === '' && current !== 'off') return { kind: 'success', text: 'ponytail ' + current }
        const next = wanted === '' ? 'full' : normalizeMode(wanted)
        if (!next) return { kind: 'error', text: 'Usage: /ponytail [lite|full|ultra|off]' }
        const settings = ctx.get('settings')
        if (!settings) return { kind: 'error', text: 'Settings service unavailable; set mode in cordis.yml' }
        try {
          await settings.update(SETTINGS_NS, { mode: next })
        } catch (e) {
          return { kind: 'error', text: e.message }
        }
        return { kind: 'success', text: 'ponytail ' + next }
      },
    })
  })

  ctx.inject(['skills'], (inner) => {
    for (const skill of skills) {
      try {
        // The ponytail rules already ride in the system prompt; a model-loadable copy
        // would bring them back after /ponytail off.
        const invocation = skill.name === 'ponytail' ? { invocation: { modelInvocable: false, userInvocable: true } } : {}
        inner.skills.register({ ...skill, source: 'runtime', ...invocation })
      } catch (e) {
        ctx.logger.warn('dsh-ponytail: could not register skill %s: %s', skill.name, e.message)
      }
    }
  })
}
