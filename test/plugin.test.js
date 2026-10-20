import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply } from '../index.js'

// Services and records stay apart: in DSH `ctx.skills` is the service itself.
// `ctx.config` mimics the volatile reference DSH passes; a settings write commits into it.
function fakeCtx({ commands = true, skills = true, settings = true, mode = 'full' } = {}) {
  const rec = { sections: [], commands: [], skills: [], warnings: [], updates: [] }
  const ctx = {
    rec,
    state: { mode },
    systemPrompt: { section: (s) => { rec.sections.push(s); return () => {} } },
    logger: { warn: (...a) => rec.warnings.push(a) },
    inject: (names, fn) => { if (names.every(n => ctx[n])) fn(ctx) },
    get: name => ctx[name],
    rules: () => rec.sections[0].text({}),
    run: input => rec.commands[0].handler({ rawInput: input }),
  }
  ctx.config = { mode: { get: () => ctx.state.mode }, sectionOrder: 10150 }
  if (commands) ctx.commands = { register: (d) => { rec.commands.push(d); return () => {} } }
  if (skills) ctx.skills = { register: (s) => { rec.skills.push(s); return () => {} } }
  if (settings) ctx.settings = { update: async (ns, patch) => { rec.updates.push([ns, patch]); ctx.state.mode = patch.mode } }
  return ctx
}

test('Config: mode is a volatile reference defaulting to full', () => {
  assert.equal(Config({}).mode.get(), 'full')
  assert.equal(Config({}).sectionOrder, 10150)
  assert.throws(() => Config({ mode: 'loud' }))
})

test('registers the rules section', () => {
  const ctx = fakeCtx()
  apply(ctx, ctx.config)
  const [s] = ctx.rec.sections
  assert.equal(s.name, 'ponytail')
  assert.equal(s.order, 10150)
  assert.equal(s.interpolate, false)
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: full'))
})

test('rules follow the settings value', () => {
  const ctx = fakeCtx({ mode: 'lite' })
  apply(ctx, ctx.config)
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: lite'))
  ctx.state.mode = 'off'
  assert.match(ctx.rules(), /^PONYTAIL MODE OFF/)
})

test('/ponytail <level> writes the setting', async () => {
  const ctx = fakeCtx()
  apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run('  Ultra '), { kind: 'success', text: 'ponytail ultra' })
  assert.deepEqual(ctx.rec.updates, [['ponytail', { mode: 'ultra' }]])
  assert.ok(ctx.rules().includes('level: ultra'))
  await ctx.run(' ultra')
  assert.equal(ctx.rec.updates.length, 2)
})

test('bare /ponytail turns off into full and otherwise only reports', async () => {
  const off = fakeCtx({ mode: 'off' })
  apply(off, off.config)
  assert.deepEqual(await off.run(''), { kind: 'success', text: 'ponytail full' })
  assert.deepEqual(off.rec.updates, [['ponytail', { mode: 'full' }]])
  const lite = fakeCtx({ mode: 'lite' })
  apply(lite, lite.config)
  assert.deepEqual(await lite.run(''), { kind: 'success', text: 'ponytail lite' })
  assert.equal(lite.rec.updates.length, 0)
})

test('invalid level is an error and writes nothing', async () => {
  const ctx = fakeCtx()
  apply(ctx, ctx.config)
  const r = await ctx.run(' loud')
  assert.equal(r.kind, 'error')
  assert.match(r.text, /lite\|full\|ultra\|off/)
  assert.equal(ctx.rec.updates.length, 0)
})

test('a refused settings write returns its reason and keeps the level', async () => {
  const ctx = fakeCtx()
  ctx.settings.update = async () => { throw new Error('mode is pinned by the home patch') }
  apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run(' ultra'), { kind: 'error', text: 'mode is pinned by the home patch' })
  assert.ok(ctx.rules().includes('level: full'))
})

test('without a settings service: argument errors, bare reports', async () => {
  const ctx = fakeCtx({ settings: false })
  apply(ctx, ctx.config)
  assert.deepEqual(await ctx.run(' ultra'), { kind: 'error', text: 'Settings service unavailable; set mode in cordis.yml' })
  assert.deepEqual(await ctx.run(''), { kind: 'success', text: 'ponytail full' })
})

test('registers all 6 skills with source runtime', () => {
  const ctx = fakeCtx()
  apply(ctx, ctx.config)
  assert.equal(ctx.rec.skills.length, 6)
  assert.ok(ctx.rec.skills.every(s => s.source === 'runtime' && s.content && s.description))
})

test('every skill is user-only so the model cannot re-enable the rules after off', () => {
  const ctx = fakeCtx()
  apply(ctx, ctx.config)
  assert.deepEqual(
    ctx.rec.skills.map(s => s.invocation),
    Array(6).fill({ modelInvocable: false, userInvocable: true }),
  )
})

test('a throwing skills.register is logged and the rest still register', () => {
  const ctx = fakeCtx()
  let n = 0
  ctx.skills.register = (s) => { if (n++ === 0) throw new Error('boom'); ctx.rec.skills.push(s) }
  apply(ctx, ctx.config)
  assert.equal(ctx.rec.skills.length, 5)
  assert.equal(ctx.rec.warnings.length, 1)
})

test('loads without commands and skills services', () => {
  const ctx = fakeCtx({ commands: false, skills: false })
  assert.doesNotThrow(() => apply(ctx, ctx.config))
  assert.ok(ctx.rules().includes('level: full'))
})
