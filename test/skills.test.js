import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadSkills, parseSkillFile } from '../lib/skills.js'

const SKILLS_DIR = path.join(import.meta.dirname, '..', 'skills')

test('parseSkillFile reads single-line and folded frontmatter', () => {
  const s = parseSkillFile('---\nname: demo\ndescription: >\n  First line\n  second line.\nlicense: MIT\n---\n\n# Body\ntext\n')
  assert.deepEqual(s, { name: 'demo', description: 'First line second line.', content: '# Body\ntext\n' })
})

test('parseSkillFile handles CRLF the same as LF', () => {
  const lf = '---\nname: demo\ndescription: >\n  A b.\n---\n\nBody\n'
  assert.deepEqual(parseSkillFile(lf.replaceAll('\n', '\r\n')), parseSkillFile(lf))
})

test('parseSkillFile strips quotes and rejects missing name/description', () => {
  assert.equal(parseSkillFile('---\nname: "q"\ndescription: \'d\'\n---\nx').name, 'q')
  assert.equal(parseSkillFile('no frontmatter'), undefined)
  assert.equal(parseSkillFile('---\nname: only\n---\nx'), undefined)
})

test('loadSkills loads the 6 vendored skills', () => {
  const { skills, errors } = loadSkills(SKILLS_DIR)
  assert.deepEqual(errors, [])
  assert.deepEqual(skills.map(s => s.name).sort(),
    ['ponytail', 'ponytail-audit', 'ponytail-debt', 'ponytail-gain', 'ponytail-help', 'ponytail-review'])
  assert.ok(skills.every(s => s.description.length > 0 && s.content.length > 0 && path.isAbsolute(s.path)))
})

test('loadSkills reports a broken skill and keeps the rest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ponytail-'))
  fs.mkdirSync(path.join(tmp, 'good'))
  fs.writeFileSync(path.join(tmp, 'good', 'SKILL.md'), '---\nname: good\ndescription: ok\n---\nbody\n')
  fs.mkdirSync(path.join(tmp, 'bad'))
  fs.writeFileSync(path.join(tmp, 'bad', 'SKILL.md'), 'nope')
  const { skills, errors } = loadSkills(tmp)
  assert.deepEqual(skills.map(s => s.name), ['good'])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /bad/)
})
