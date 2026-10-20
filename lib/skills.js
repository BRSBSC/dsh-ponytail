import fs from 'node:fs'
import path from 'node:path'

// Parses the frontmatter subset ponytail's SKILL.md files use:
// `key: value` lines and `key: >` blocks of indented lines.
export function parseSkillFile(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(String(text).replaceAll('\r\n', '\n'))
  if (!match) return undefined
  const meta = {}
  let block
  for (const line of match[1].split('\n')) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line)
    if (pair) {
      block = /^[>|][-+]?$/.test(pair[2]) ? pair[1] : undefined
      meta[pair[1]] = block ? '' : pair[2].replace(/^(['"])(.*)\1$/, '$2')
    } else if (block && /^\s/.test(line)) {
      meta[block] = (meta[block] + ' ' + line.trim()).trim()
    }
  }
  if (!meta.name || !meta.description) return undefined
  return { name: meta.name, description: meta.description, content: match[2].replace(/^\n+/, '') }
}

export function loadSkills(dir) {
  const skills = []
  const errors = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return { skills, errors: [`${dir}: ${e.message}`] }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.resolve(dir, entry.name, 'SKILL.md')
    try {
      const skill = parseSkillFile(fs.readFileSync(file, 'utf8'))
      if (skill) skills.push({ ...skill, path: file })
      else errors.push(`${entry.name}: SKILL.md has no frontmatter name or description`)
    } catch (e) {
      errors.push(`${entry.name}: ${e.message}`)
    }
  }
  return { skills, errors }
}
