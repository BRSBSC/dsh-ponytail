import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initialMode, modeFilePath, normalizeMode, readSavedMode, saveMode } from '../lib/mode.js'

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ponytail-'))

test('normalizeMode', () => {
  assert.equal(normalizeMode(' ULTRA\n'), 'ultra')
  assert.equal(normalizeMode('loud'), undefined)
  assert.equal(normalizeMode(undefined), undefined)
})

test('modeFilePath follows DSH_HOME rules', () => {
  const home = os.homedir()
  assert.equal(modeFilePath({ DSH_HOME: ' /x/h ' }), path.join('/x/h', 'ponytail-mode'))
  assert.equal(modeFilePath({ DSH_HOME: '~/h' }), path.join(home, 'h', 'ponytail-mode'))
  assert.equal(modeFilePath({ DSH_HOME: '   ' }), path.join(home, '.dsh', 'ponytail-mode'))
  assert.equal(modeFilePath({}), path.join(home, '.dsh', 'ponytail-mode'))
})

test('saveMode then readSavedMode round-trips; garbage reads as undefined', () => {
  const tmp = tmpDir()
  const file = path.join(tmp, 'nested', 'ponytail-mode')
  saveMode(file, 'lite')
  assert.equal(readSavedMode(file), 'lite')
  fs.writeFileSync(file, 'ULTRA\n')
  assert.equal(readSavedMode(file), 'ultra')
  fs.writeFileSync(file, 'garbage')
  assert.equal(readSavedMode(file), undefined)
  assert.equal(readSavedMode(path.join(tmp, 'missing')), undefined)
})

test('initialMode precedence: saved > env > defaultMode', () => {
  const file = path.join(tmpDir(), 'm')
  assert.equal(initialMode({ file, env: {}, defaultMode: 'lite' }), 'lite')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, defaultMode: 'lite' }), 'ultra')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'bogus' }, defaultMode: 'lite' }), 'lite')
  saveMode(file, 'off')
  assert.equal(initialMode({ file, env: { PONYTAIL_DEFAULT_MODE: 'ultra' }, defaultMode: 'lite' }), 'off')
})
