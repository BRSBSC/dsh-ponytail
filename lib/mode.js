import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MODES = Object.freeze(['lite', 'full', 'ultra', 'off'])

export function normalizeMode(value) {
  if (typeof value !== 'string') return undefined
  const mode = value.trim().toLowerCase()
  return MODES.includes(mode) ? mode : undefined
}

// Mirrors DSH's resolveDshHome: $DSH_HOME when non-blank (tilde expanded), else ~/.dsh.
export function modeFilePath(env = process.env) {
  const raw = (env.DSH_HOME ?? '').trim()
  const home = raw === '' ? path.join(os.homedir(), '.dsh')
    : raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\') ? path.join(os.homedir(), raw.slice(1))
      : raw
  return path.join(home, 'ponytail-mode')
}

export function readSavedMode(file) {
  try {
    return normalizeMode(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

export function saveMode(file, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, mode)
}

export function initialMode({ file, env, defaultMode }) {
  return readSavedMode(file) ?? normalizeMode(env.PONYTAIL_DEFAULT_MODE) ?? defaultMode
}
