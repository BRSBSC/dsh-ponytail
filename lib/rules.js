const LEVELS = ['lite', 'full', 'ultra']

function levelOf(label) {
  const level = label.trim().toLowerCase()
  return LEVELS.includes(level) ? level : undefined
}

// Ported from ponytail hooks/ponytail-instructions.js.
export function filterSkillBodyForMode(body, mode) {
  const withoutFrontmatter = String(body ?? '').replace(/^---[\s\S]*?---\s*/, '')

  // Only the intensity table rows and worked examples are mode-specific, and
  // both are keyed by a mode name. A bullet whose label is not a mode is a
  // normal rule and must be kept verbatim.
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/)
      if (tableLabel && levelOf(tableLabel[1])) return levelOf(tableLabel[1]) === mode

      // Every worked example quotes its value (`- lite: "..."`); without the quote
      // a prose bullet that starts with a mode word ("- Full: ...") would be dropped.
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/)
      if (exampleLabel && levelOf(exampleLabel[1])) return levelOf(exampleLabel[1]) === mode

      return true
    })
    .join('\n')
}

// Used only when skills/ponytail/SKILL.md cannot be read. Kept to a notice on
// purpose: a copy of the rules lived here once and drifted from the file it copied.
export const FALLBACK_RULES = 'ponytail rules could not be loaded from skills/ponytail/SKILL.md; reinstall dsh-ponytail.'

// Not empty: models with in-history prompt updates (DeepSeek) keep earlier system
// snapshots, including resumed sessions, so off has to revoke them explicitly.
const OFF_NOTICE = 'PONYTAIL MODE OFF — disregard ponytail rules from earlier system messages.'

// The user wants Chinese whatever the level is, so this rides outside the mode
// rules: off revokes ponytail, not the language. Fixed labels a skill prints
// (its opening heading, `Verdict:`, the help card) stay verbatim.
const LANGUAGE_RULES = '## 输出语言\n\n' +
  '始终用简体中文回复。第一个字就是中文，不许英文开场，不许在一个中文回复里夹整段英文。' +
  '英文只允许出现在代码块、行内代码、文件路径、命令行、标识符，以及没有通用中文译名的术语里。' +
  '标题、表头、列表、总结、报错解释同样是中文。技能模板里写死的英文标签（开头标题、`Verdict:` 这类常量行、帮助卡片）照抄，不翻译。' +
  '用户用英文提问，也用中文回答。不要解释这条规则，直接执行。'

export function buildRules(mode, skillBody) {
  const language = '\n\n' + LANGUAGE_RULES
  if (mode === 'off') return OFF_NOTICE + language
  // Empty body counts as missing: an active level with no rules is worse than the notice.
  const rules = skillBody ? filterSkillBodyForMode(skillBody, mode) : FALLBACK_RULES
  return 'PONYTAIL MODE ACTIVE — level: ' + mode + '\n\n' + rules + language
}
