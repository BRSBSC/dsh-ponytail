import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseSkillFile } from '../lib/skills.js'
import { FALLBACK_RULES, buildReminder, buildRules, filterSkillBodyForMode } from '../lib/rules.js'

const PONYTAIL_SKILL = path.join(import.meta.dirname, '..', 'skills', 'ponytail', 'SKILL.md')
const body = parseSkillFile(fs.readFileSync(PONYTAIL_SKILL, 'utf8')).content

for (const [mode, kept, dropped] of [
  ['lite', '| **lite** |', ['| **full** |', '| **ultra** |']],
  ['full', '| **full** |', ['| **lite** |', '| **ultra** |']],
  ['ultra', '| **ultra** |', ['| **lite** |', '| **full** |']],
]) {
  test(`filterSkillBodyForMode keeps only ${mode} rows`, () => {
    const out = filterSkillBodyForMode(body, mode)
    assert.ok(out.includes(kept))
    for (const d of dropped) assert.ok(!out.includes(d))
    assert.ok(out.includes('## The smallest complete change'))
  })
}

test('filterSkillBodyForMode keeps a non-mode bullet that starts with a mode word', () => {
  const out = filterSkillBodyForMode('- Full: keep me\n- lite: "drop me"\n', 'ultra')
  assert.ok(out.includes('- Full: keep me'))
  assert.ok(!out.includes('drop me'))
})

test('filterSkillBodyForMode works on CRLF input', () => {
  assert.equal(
    filterSkillBodyForMode(body.replaceAll('\n', '\r\n'), 'lite').replaceAll('\r', ''),
    filterSkillBodyForMode(body, 'lite'),
  )
})

test('buildRules', () => {
  // Models with in-history prompt updates keep earlier system snapshots, so off must revoke them.
  assert.match(buildRules('off', body), /^PONYTAIL MODE OFF — disregard ponytail rules/)
  assert.equal(buildRules('off', undefined), buildRules('off', body))
  assert.ok(buildRules('ultra', body).startsWith('PONYTAIL MODE ACTIVE — level: ultra\n\n'))
  assert.ok(buildRules('full', undefined).startsWith('PONYTAIL MODE ACTIVE — level: full\n\n' + FALLBACK_RULES))
})

test('the language rule rides on every level, including off', () => {
  for (const mode of ['lite', 'full', 'ultra', 'off']) {
    assert.ok(buildRules(mode, body).includes('始终用简体中文回复'), mode)
  }
})

test('each level keeps only its own example line', () => {
  assert.ok(filterSkillBodyForMode(body, 'lite').includes('- lite: "Smaller option'))
  assert.ok(!filterSkillBodyForMode(body, 'lite').includes('- ultra: "'))
  assert.ok(filterSkillBodyForMode(body, 'ultra').includes('- ultra: "Not justified'))
  assert.ok(!/^- (lite|ultra): "/m.test(filterSkillBodyForMode(body, 'full')))
})

test('buildReminder covers only the levels that ask for a line before tools', () => {
  assert.match(buildReminder('lite'), /^PONYTAIL MODE ACTIVE — level: lite\. /)
  assert.match(buildReminder('ultra'), /^PONYTAIL MODE ACTIVE — level: ultra\. /)
  // Without an explicit way out, models answered the reminder with filler on small tasks.
  assert.match(buildReminder('lite'), /If it does not apply, do not mention it at all/)
  assert.equal(buildReminder('full'), undefined)
  assert.equal(buildReminder('off'), undefined)
})
