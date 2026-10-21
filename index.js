import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { buildReminder, buildRules } from './lib/rules.js'
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

// Never throws: a failing pre-step listener ends the user's turn.
function openedWithToolCall(agent) {
  try {
    const last = agent.session.deriveMessages().findLast(message => message.role === 'assistant')
    return last !== undefined
      && last.content.some(block => block.type === 'tool-call')
      && !last.content.some(block => block.type === 'text' && block.text.trim() !== '')
  } catch {
    return false
  }
}

// The shape dsh-llm's createUserMessage builds. A source kind of our own keeps it out of the
// user's own turns and the session title, which only read `kind: 'user'`.
function reminderMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({ kind: 'dsh-ponytail' }),
  })
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

  // Steps count from 1 within a turn. A first step that opened with a tool call is always
  // followed by step 2, so the reminder rides on it and costs no extra request; after a
  // text-only reply an added message would reopen the closing turn instead.
  ctx.on('agent/pre-step', async ({ agent, step }, next) => {
    const decision = await next()
    const text = buildReminder(config.mode.get())
    if (step !== 2 || !text || decision.kind !== 'enter' || !openedWithToolCall(agent)) return decision
    return { ...decision, messages: [...decision.messages, reminderMessage(text)] }
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
        // The ponytail rules already ride in the system prompt; every vendored skill
        // restates them, so a model-loaded copy would bring them back after /ponytail off.
        inner.skills.register({
          ...skill,
          source: 'runtime',
          invocation: { modelInvocable: false, userInvocable: true },
        })
      } catch (e) {
        ctx.logger.warn('dsh-ponytail: could not register skill %s: %s', skill.name, e.message)
      }
    }
  })
}
