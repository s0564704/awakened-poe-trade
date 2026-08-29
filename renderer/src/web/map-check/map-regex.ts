import { CLIENT_STRINGS as _$, ITEMS_ITERATOR, STATS_ITERATOR } from '@/assets/data'
import { ItemCategory } from '@/parser/meta'
import {
  type MapCheckStat, type MapRegexConfig, StatTag, type StatMatcher,
  decisionAt, decisionHasColor
} from './common.js'

// The in-game search field accepts at most this many characters.
export const SEARCH_LENGTH_LIMIT = 250

const MIN_TOKEN_LENGTH = 3
const ROLL_PLACEHOLDER = '#'

export type TokenKind = 'plain' | 'anchored' | 'ambiguous'

export interface RegexToken {
  matcher: string
  /** `d` (deadly) and `w` (warning) are excluded, `g` (good) is required. */
  decision: string
  token: string
  kind: TokenKind
}

export interface GeneratedRegex {
  text: string
  tokens: RegexToken[]
  /** Matchers left out because the search field ran out of room. */
  dropped: RegexToken[]
  /** Word-aligned tokens did not fit, so shorter cryptic ones were used. */
  compacted: boolean
}

function tagToShowOrder (tag?: StatTag): number {
  switch (tag) {
    case StatTag.UberMapExclusive: return 1
    case StatTag.HeistExclusive: return 2
  }
  return 0
}

export function findAllAreaMods (): StatMatcher[] {
  const out: StatMatcher[] = []
  for (const stat of STATS_ITERATOR('AreaMods')) {
    if (!stat.fromAreaMods) continue

    const tag = (stat.fromAreaMods === 'heist_exclusive') ? StatTag.HeistExclusive
      : (stat.fromAreaMods === 'ubermap_exclusive') ? StatTag.UberMapExclusive : undefined

    for (const c of stat.matchers) {
      out.push({ matchStr: c.string, tag })
    }
  }
  out.sort((a, b) =>
    (tagToShowOrder(a.tag) - tagToShowOrder(b.tag)) ||
    a.matchStr.localeCompare(b.matchStr))
  return out
}

/**
 * Every area mod as the game renders it, grouped by stat. Two matchers of the
 * same stat are two phrasings of one mod ("# additional Abyss" and its
 * singular "1 additional Abyss"), so a token is allowed to match both.
 */
export interface AreaModIndex {
  samples: string[]
  /** Stat that each sample belongs to. */
  statOf: number[]
}

// Rebuilt whenever the data files are swapped for another language.
let _index: AreaModIndex | undefined
let _indexFor: unknown

export function areaModIndex (): AreaModIndex {
  if (_index === undefined || _indexFor !== _$) {
    const samples: string[] = []
    const statOf: number[] = []
    let statId = 0
    for (const stat of STATS_ITERATOR('AreaMods')) {
      if (!stat.fromAreaMods) continue
      for (const matcher of stat.matchers) {
        samples.push(renderSample(matcher.string))
        statOf.push(statId)
      }
      statId += 1
    }
    _index = { samples, statOf }
    _indexFor = _$
  }
  return _index
}

/** Rendered text of every mod that is not the one we are shortening. */
function otherMods (index: AreaModIndex, self: string): string[] {
  const own = new Set(index.statOf.filter((_, i) => index.samples[i] === self))
  return index.samples.filter((_, i) => !own.has(index.statOf[i]))
}

let _noise: string[] | undefined
let _noiseFor: unknown

/**
 * Text a map can show that has nothing to do with its mods: the property
 * labels every tooltip carries, and the name of every map and area in the
 * game. A token matching any of these would quietly hit unrelated maps in the
 * tab — "sul", shortest unique token for the Dead Man's Sulphur mod, otherwise
 * also matches every Sulphur Vents and Peninsula.
 */
export function nonModText (): string[] {
  if (_noise === undefined || _noiseFor !== _$) {
    const out = [
      _$.MAP_ITEM_QUANTITY, _$.MAP_ITEM_RARITY, _$.MAP_MONSTER_PACK_SIZE,
      _$.MAP_MORE_MAPS, _$.MAP_MORE_SCARABS, _$.MAP_MORE_CURRENCY,
      _$.MAP_MORE_DIVINATION_CARDS, _$.MAP_AREA,
      _$.QUALITY, _$.ITEM_LEVEL, _$.RARITY, _$.CORRUPTED, _$.UNIDENTIFIED
    ]
    for (const item of ITEMS_ITERATOR('"AREA"')) {
      if (item.namespace === 'AREA') out.push(item.name)
    }
    for (const item of ITEMS_ITERATOR('"Map"')) {
      if (item.craftable?.category === ItemCategory.Map) out.push(item.name)
    }
    _noise = out.map(str => str.toLowerCase())
    _noiseFor = _$
  }
  return _noise
}

/**
 * Substrings of `matcher` that could stand in for it, shortest first.
 *
 * A candidate never spans a `#`, because that is where the roll goes and the
 * roll is not part of the rendered text we are matching against. When
 * `wordAligned` is set a candidate also has to start on a word boundary, which
 * is what keeps tokens readable ("regenerate") instead of cryptic ("ve r").
 */
function candidateTokens (matcher: string, wordAligned: boolean): string[] {
  const out: string[] = []
  for (const segment of matcher.split(ROLL_PLACEHOLDER)) {
    const seg = segment.toLowerCase()
    for (let start = 0; start < seg.length; ++start) {
      if (wordAligned) {
        const isWordStart = /\p{L}/u.test(seg[start]) &&
          (start === 0 || !/\p{L}/u.test(seg[start - 1]))
        if (!isWordStart) continue
      }
      for (let end = start + MIN_TOKEN_LENGTH; end <= seg.length; ++end) {
        const candidate = seg.slice(start, end)
        if (!/\p{L}/u.test(candidate)) continue
        out.push(candidate)
      }
    }
  }
  return out.sort((a, b) => a.length - b.length)
}

function escapeRegex (str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** What the game actually prints, with a stand-in for the roll. */
function renderSample (matcher: string): string {
  return matcher.split(ROLL_PLACEHOLDER).join('42').toLowerCase()
}

/**
 * The matcher as a sequence of regex atoms: one per character, except that
 * every `#` becomes a number class. Anchored patterns are built by taking a
 * prefix or a suffix of this list.
 */
function toAtoms (matcher: string): string[] {
  const atoms: string[] = []
  for (const char of matcher.toLowerCase()) {
    atoms.push((char === ROLL_PLACEHOLDER) ? '[0-9.]+' : escapeRegex(char))
  }
  return atoms
}

function testPattern (pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern).test(text)
  } catch {
    return false
  }
}

/**
 * Shortest pattern anchored to the start or the end of the line that only this
 * mod can produce. Needed when one mod's text is wholly contained in another's
 * ("#% increased Area of Effect" inside "Unique Boss has #% increased Area of
 * Effect"), where no plain substring can tell the two apart.
 */
function anchoredToken (
  matcher: string,
  others: string[],
  self: string
): { token: string, kind: TokenKind } {
  const atoms = toAtoms(matcher)

  for (let take = 1; take <= atoms.length; ++take) {
    const candidates = [
      '^' + atoms.slice(0, take).join(''),
      atoms.slice(atoms.length - take).join('') + '$'
    ]
    // Prefer whichever anchor spells out fewer characters.
    candidates.sort((a, b) => a.length - b.length)
    for (const candidate of candidates) {
      if (!testPattern(candidate, self)) continue
      if (!others.some(other => testPattern(candidate, other))) {
        return { token: candidate, kind: 'anchored' }
      }
    }
  }

  return { token: '^' + atoms.join('') + '$', kind: 'ambiguous' }
}

function plainToken (
  matcher: string,
  others: string[],
  noise: string[],
  wordAligned: boolean
): string | undefined {
  for (const candidate of candidateTokens(matcher, wordAligned)) {
    const collides =
      others.some(other => other.includes(candidate)) ||
      noise.some(other => other.includes(candidate))
    if (!collides) return candidate
  }
}

export function shortestToken (
  matcher: string,
  index: AreaModIndex,
  noise: string[],
  wordAligned: boolean
): { token: string, kind: TokenKind } {
  const self = renderSample(matcher)
  const others = otherMods(index, self)

  if (wordAligned) {
    const aligned = plainToken(matcher, others, noise, true)
    if (aligned !== undefined) return { token: aligned, kind: 'plain' }
  }
  // Languages without spaces between words, and mods that only differ mid-word,
  // have no word-aligned token but usually still have a plain one.
  const loose = plainToken(matcher, others, noise, false)
  if (loose !== undefined) return { token: loose, kind: 'plain' }

  return anchoredToken(matcher, others, self)
}

/**
 * Shortest tail of `label` that nothing else on a map can show, so
 * `"Item Quantity: "` can be spent as `"ntity: "`. Derived rather than
 * hardcoded, so it holds for every shipped language.
 */
function shortestLabel (label: string, avoid: string[]): string {
  const self = label.toLowerCase()
  const others = avoid
    .map(other => other.toLowerCase())
    .filter(other => other !== self)
  for (let start = self.length - 1; start > 0; --start) {
    const candidate = self.slice(start)
    if (!/\p{L}/u.test(candidate)) continue
    if (!others.some(other => other.includes(candidate))) return candidate
  }
  return self
}

/**
 * Alternation matching every integer >= `min` that the game could print, e.g.
 * 85 becomes `(8[5-9]|9[0-9]|[1-9][0-9]{2})`.
 */
export function atLeastPattern (min: number, maxDigits = 3): string {
  const alternatives: string[] = []
  const digits = String(min)

  // Numbers with the same digit count as `min`: fix a prefix, raise one digit,
  // let the rest run free.
  for (let i = digits.length - 1; i >= 0; --i) {
    const digit = Number(digits[i])
    if (digit === 9 && i !== digits.length - 1) continue
    const upper = (i === digits.length - 1) ? digit : digit + 1
    if (upper > 9) continue
    const rest = digits.length - i - 1
    alternatives.push(
      digits.slice(0, i) +
      ((upper === 9) ? '9' : `[${upper}-9]`) +
      ((rest === 0) ? '' : (rest === 1) ? '[0-9]' : `[0-9]{${rest}}`))
  }

  // Anything with more digits is automatically larger.
  for (let len = digits.length + 1; len <= maxDigits; ++len) {
    alternatives.push('[1-9]' + ((len === 2) ? '[0-9]' : `[0-9]{${len - 1}}`))
  }

  return (alternatives.length === 1) ? alternatives[0] : `(${alternatives.join('|')})`
}

export function thresholdTerm (label: string, min: number, avoid: string[]): string {
  return `"${shortestLabel(label, avoid)}\\+?${atLeastPattern(min)}"`
}

function quote (text: string): string {
  return `"${text}"`
}

function assemble (
  thresholds: string[],
  excluded: RegexToken[],
  required: RegexToken[],
  extraTerms: string
): string {
  const terms = [...thresholds]
  if (excluded.length) {
    terms.push(`!${quote(excluded.map(t => t.token).join('|'))}`)
  }
  for (const token of required) {
    terms.push(quote(token.token))
  }
  const extra = extraTerms.trim()
  if (extra) terms.push(extra)
  return terms.join(' ')
}

function generateWith (
  config: MapRegexConfig,
  selectedStats: MapCheckStat[],
  profile: number,
  wordAligned: boolean
): GeneratedRegex {
  const index = areaModIndex()
  const noise = nonModText()

  const thresholdInputs: Array<[string, number | null]> = [
    [_$.MAP_ITEM_QUANTITY, config.minQuantity],
    [_$.MAP_ITEM_RARITY, config.minRarity],
    [_$.MAP_MONSTER_PACK_SIZE, config.minPackSize],
    [_$.QUALITY, config.minQuality]
  ]
  // A shortened label has to stay clear of every other label, every map name
  // and every mod, or it would read a number off the wrong line.
  const avoid = [...thresholdInputs.map(([label]) => label), ...noise, ...index.samples]
  const thresholds = thresholdInputs
    .filter(([, min]) => min != null && Number.isFinite(min))
    .map(([label, min]) => thresholdTerm(label, min!, avoid))

  const wanted = new Map<string, string>()
  for (const stat of selectedStats) {
    if (!decisionHasColor(stat.decision, profile)) continue
    const decision = decisionAt(stat.decision, profile)
    const isWanted =
      (decision === 'd' && config.excludeDeadly) ||
      (decision === 'w' && config.excludeWarning) ||
      (decision === 'g' && config.requireGood)
    // A mod may be listed twice if it was tagged before a rename.
    if (isWanted && !wanted.has(stat.matcher)) wanted.set(stat.matcher, decision)
  }

  const tokens: RegexToken[] = [...wanted].map(([matcher, decision]) => ({
    matcher,
    decision,
    ...shortestToken(matcher, index, noise, wordAligned)
  }))

  // Longest tokens go first, so that if we have to drop some to fit we keep the
  // most mods rather than the fewest characters.
  const byCost = [...tokens].sort((a, b) => b.token.length - a.token.length)
  const dropped: RegexToken[] = []
  let kept = tokens

  for (;;) {
    const excluded = kept.filter(t => t.decision !== 'g')
    const required = kept.filter(t => t.decision === 'g')
    const text = assemble(thresholds, excluded, required, config.extraTerms)
    if (text.length <= SEARCH_LENGTH_LIMIT || !kept.length) {
      return { text, tokens, dropped, compacted: !wordAligned }
    }
    const evict = byCost.find(t => kept.includes(t))!
    dropped.push(evict)
    kept = kept.filter(t => t !== evict)
  }
}

export function generateMapRegex (
  config: MapRegexConfig,
  selectedStats: MapCheckStat[],
  profile: number
): GeneratedRegex {
  const readable = generateWith(config, selectedStats, profile, true)
  if (!readable.dropped.length) return readable

  // Readable tokens overflowed the search field, so trade legibility for room.
  const compact = generateWith(config, selectedStats, profile, false)
  return (compact.dropped.length < readable.dropped.length) ? compact : readable
}
