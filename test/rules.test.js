import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseSkillFile } from '../lib/skills.js'
import { FALLBACK_RULES, buildRules, filterSkillBodyForMode } from '../lib/rules.js'

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
  assert.equal(buildRules('full', undefined), 'PONYTAIL MODE ACTIVE — level: full\n\n' + FALLBACK_RULES)
})
