import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Config, apply } from '../index.js'

// Services and records stay apart: in DSH `ctx.skills` is the service itself.
function fakeCtx({ commands = true, skills = true } = {}) {
  const rec = { sections: [], commands: [], skills: [], warnings: [] }
  const ctx = {
    rec,
    systemPrompt: { section: (s) => { rec.sections.push(s); return () => {} } },
    logger: { warn: (...a) => rec.warnings.push(a) },
    inject: (names, fn) => { if (names.every(n => ctx[n])) fn(ctx) },
    rules: () => rec.sections[0].text({}),
    run: input => rec.commands[0].handler({ rawInput: input }),
  }
  if (commands) ctx.commands = { register: (d) => { rec.commands.push(d); return () => {} } }
  if (skills) ctx.skills = { register: (s) => { rec.skills.push(s); return () => {} } }
  return ctx
}

const cfg = () => Config({})

beforeEach(() => {
  process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ponytail-'))
  delete process.env.PONYTAIL_DEFAULT_MODE
})

test('Config defaults and validation', () => {
  assert.deepEqual(Config({}), { defaultMode: 'full', sectionOrder: 10150 })
  assert.throws(() => Config({ defaultMode: 'loud' }))
})

test('registers the rules section at full by default', () => {
  const ctx = fakeCtx()
  apply(ctx, cfg())
  const [s] = ctx.rec.sections
  assert.equal(s.name, 'ponytail')
  assert.equal(s.order, 10150)
  assert.equal(s.interpolate, false)
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: full'))
})

test('/ponytail switches, persists, and survives re-apply', () => {
  const ctx = fakeCtx()
  apply(ctx, cfg())
  assert.deepEqual(ctx.run('  Ultra '), { kind: 'success', text: 'ponytail ultra' })
  assert.ok(ctx.rules().startsWith('PONYTAIL MODE ACTIVE — level: ultra'))
  assert.equal(fs.readFileSync(path.join(process.env.DSH_HOME, 'ponytail-mode'), 'utf8'), 'ultra')
  const again = fakeCtx()
  apply(again, cfg())
  assert.ok(again.rules().includes('level: ultra'))
  assert.deepEqual(ctx.run(' off'), { kind: 'success', text: 'ponytail off' })
  assert.match(ctx.rules(), /^PONYTAIL MODE OFF/)
})

test('bare /ponytail turns on from off, otherwise keeps the level', () => {
  const ctx = fakeCtx()
  apply(ctx, Config({ defaultMode: 'lite' }))
  assert.deepEqual(ctx.run(''), { kind: 'success', text: 'ponytail lite' })
  ctx.run(' off')
  assert.deepEqual(ctx.run(''), { kind: 'success', text: 'ponytail lite' })
  process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ponytail-'))
  const offDefault = fakeCtx()
  apply(offDefault, Config({ defaultMode: 'off' }))
  assert.deepEqual(offDefault.run(''), { kind: 'success', text: 'ponytail full' })
})

test('invalid level is an error and keeps the level', () => {
  const ctx = fakeCtx()
  apply(ctx, cfg())
  const r = ctx.run(' loud')
  assert.equal(r.kind, 'error')
  assert.match(r.text, /lite\|full\|ultra\|off/)
  assert.ok(ctx.rules().includes('level: full'))
})

test('unwritable DSH_HOME still switches in-process and warns once', () => {
  const blocker = path.join(process.env.DSH_HOME, 'file')
  fs.writeFileSync(blocker, '')
  process.env.DSH_HOME = blocker
  const ctx = fakeCtx()
  apply(ctx, cfg())
  assert.equal(ctx.run(' ultra').kind, 'success')
  assert.ok(ctx.rules().includes('level: ultra'))
  assert.equal(ctx.rec.warnings.length, 1)
})

test('registers all 6 skills with source runtime', () => {
  const ctx = fakeCtx()
  apply(ctx, cfg())
  assert.equal(ctx.rec.skills.length, 6)
  assert.ok(ctx.rec.skills.every(s => s.source === 'runtime' && s.content && s.description))
})

test('a throwing skills.register is logged and the rest still register', () => {
  const ctx = fakeCtx()
  let n = 0
  ctx.skills.register = (s) => { if (n++ === 0) throw new Error('boom'); ctx.rec.skills.push(s) }
  apply(ctx, cfg())
  assert.equal(ctx.rec.skills.length, 5)
  assert.equal(ctx.rec.warnings.length, 1)
})

test('loads without commands and skills services', () => {
  const ctx = fakeCtx({ commands: false, skills: false })
  assert.doesNotThrow(() => apply(ctx, cfg()))
  assert.ok(ctx.rules().includes('level: full'))
})
