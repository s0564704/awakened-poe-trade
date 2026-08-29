import { STAT_BY_MATCH_STR_V2 } from '@/assets/data'

export interface MapCheckConfig {
  /** 1-based index into `profiles` */
  profile: number
  profiles: MapCheckProfile[]
  showNewStats: boolean
  /** Whether the stash search section of the settings is unfolded. */
  regexExpanded: boolean
  selectedStats: MapCheckStat[]
}

export interface MapCheckProfile {
  name: string
  regex: MapRegexConfig
}

export interface MapRegexConfig {
  excludeDeadly: boolean
  excludeWarning: boolean
  requireGood: boolean
  minQuantity: number | null
  minRarity: number | null
  minPackSize: number | null
  minQuality: number | null
  extraTerms: string
}

export interface MapCheckStat {
  matcher: string
  /**
   * One character per profile, indexed by `profile - 1`:
   * -: undefined
   * d: deadly mod
   * w: warning
   * g: good mod
   * s: marked as seen
   * Trailing `-` are trimmed, so the string is usually shorter than `profiles`.
   */
  decision: string
}

export enum StatTag {
  Outdated = 1,
  HeistExclusive,
  UberMapExclusive
}

export interface StatMatcher {
  matchStr: string
  tag?: StatTag
}

export function defaultMapRegexConfig (): MapRegexConfig {
  return {
    excludeDeadly: true,
    excludeWarning: true,
    requireGood: false,
    minQuantity: null,
    minRarity: null,
    minPackSize: null,
    minQuality: null,
    extraTerms: ''
  }
}

const DEFAULT_NAMES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export function defaultProfileName (index: number): string {
  return DEFAULT_NAMES[index] ?? String(index + 1)
}

export function activeProfile (maps: MapCheckConfig): MapCheckProfile {
  return maps.profiles[maps.profile - 1] ?? maps.profiles[0]
}

export function decisionAt (decisionSet: string, profileName: number): string {
  return decisionSet[profileName - 1] ?? '-'
}

export function decisionHasColor (decisionSet: string, profileName: number) {
  const decision = decisionAt(decisionSet, profileName)
  return decision !== '-' && decision !== 's'
}

export function nextDecision (current: string): string {
  switch (current) {
    case 'd': return 'w'
    case 'w': return 'g'
    case 'g': return 's'
  }
  return 'd'
}

export function decisionCreate (value: string, profileName: number, updateSet = '') {
  const idx = profileName - 1
  const split = updateSet.padEnd(idx + 1, '-').split('')
  split[idx] = value
  return trimDecision(split.join(''))
}

function trimDecision (decisionSet: string) {
  return decisionSet.replace(/-+$/, '')
}

function decisionIsEmpty (decisionSet: string) {
  return !/[^-]/.test(decisionSet)
}

/**
 * Writes `value` into the profile's slot, adding the stat to the list on the
 * first decision and dropping it once no profile has an opinion left.
 */
export function setDecision (
  selectedStats: MapCheckStat[],
  matcher: string,
  profileName: number,
  value: string
) {
  const idx = selectedStats.findIndex(entry => entry.matcher === matcher)
  const entry = (idx !== -1) ? selectedStats[idx] : undefined
  const decision = decisionCreate(value, profileName, entry?.decision)

  if (!entry) {
    if (decisionIsEmpty(decision)) return
    selectedStats.push({ matcher, decision })
  } else if (decisionIsEmpty(decision)) {
    selectedStats.splice(idx, 1)
  } else {
    entry.decision = decision
  }
}

export function isOutdated (profileName: number, stat: MapCheckStat): boolean {
  return decisionHasColor(stat.decision, profileName) &&
    STAT_BY_MATCH_STR_V2(stat.matcher) == null
}

export function addProfile (maps: MapCheckConfig, name: string) {
  maps.profiles.push({ name, regex: defaultMapRegexConfig() })
  maps.profile = maps.profiles.length
}

/** Copies both the decisions and the search settings of the active profile. */
export function duplicateProfile (maps: MapCheckConfig, name: string) {
  const source = maps.profile
  maps.profiles.push({ name, regex: { ...activeProfile(maps).regex } })
  const target = maps.profiles.length

  for (const stat of maps.selectedStats) {
    stat.decision = decisionCreate(
      decisionAt(stat.decision, source), target, stat.decision)
  }
  maps.profile = target
}

export function removeProfile (maps: MapCheckConfig, profileName: number) {
  if (maps.profiles.length <= 1) return
  maps.profiles.splice(profileName - 1, 1)

  const idx = profileName - 1
  for (let i = maps.selectedStats.length - 1; i >= 0; i -= 1) {
    const stat = maps.selectedStats[i]
    const decision = trimDecision(
      stat.decision.slice(0, idx) + stat.decision.slice(idx + 1))
    if (decisionIsEmpty(decision)) {
      maps.selectedStats.splice(i, 1)
    } else {
      stat.decision = decision
    }
  }
  // Everything after the hole moved down a slot, the active profile included.
  const shifted = (profileName < maps.profile) ? maps.profile - 1 : maps.profile
  maps.profile = Math.min(shifted, maps.profiles.length)
}
