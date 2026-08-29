<template>
  <div class="flex flex-col overflow-hidden h-full">
    <div class="flex flex-wrap items-baseline gap-1 p-1 border-b border-gray-700">
      <div class="text-gray-500 px-1">{{ t(':profile') }}</div>
      <template v-for="(entry, idx) in profiles" :key="idx">
        <input v-if="idx + 1 === profile" v-model="entry.name"
          :placeholder="t(':profile_name')"
          class="bg-gray-900 rounded px-2 w-28 border border-gray-600">
        <button v-else @click="selectProfile(idx + 1)"
          class="bg-gray-900 rounded px-2 truncate" style="max-width: 7rem;"
        >{{ entry.name }}</button>
      </template>
      <button @click="addNewProfile" :title="t(':profile_add')"
        class="px-2 text-gray-500 hover:text-gray-200"><i class="fas fa-plus"></i></button>
      <button @click="duplicateCurrentProfile" :title="t(':profile_duplicate')"
        class="px-2 text-gray-500 hover:text-gray-200"><i class="fas fa-clone"></i></button>
      <button v-if="profiles.length > 1" @click="deleteCurrentProfile"
        :title="t(':profile_delete')" class="px-2"
        :class="pendingDelete ? 'text-red-400' : 'text-gray-500 hover:text-gray-200'"
      ><i class="fas fa-trash-alt"></i></button>
      <div v-if="pendingDelete" class="text-red-400">{{ t(':profile_delete_confirm') }}</div>
    </div>
    <div class="flex p-1">
      <input :placeholder="t('Search') + '...'" v-model="search" class="bg-gray-900 rounded px-1">
      <UiToggle v-model="onlySelected" class="mx-2">{{ t(':search_selected') }}</UiToggle>
      <UiToggle v-model="showNewStats" class="ml-12">{{ t(':new_mods_icon') }}</UiToggle>
    </div>
    <div class="flex items-baseline py-1 shadow">
      <div class="flex-1 px-2 leading-none">{{ t(':search_stat_col', [filteredStats.length]) }}</div>
      <div class="flex gap-x-1 text-center items-center" style="padding-right: calc(0.875rem + 2.350rem);">
        <i class="w-8 py-1 bg-orange-600 fas fa-exclamation-triangle"></i>
        <i class="w-8 py-1 bg-red-700 fas fa-skull-crossbones"></i>
        <i class="w-8 py-1 bg-green-700 fas fa-check"></i>
      </div>
    </div>
    <VirtualScroll
      class="flex-1"
      style="overflow-y: scroll;"
      :items="filteredStats"
      :item-height="2 * fontSize"
      v-slot="props"
    >
      <SettingsMatcherEntry
        :style="{ position: 'absolute', top: `${props.top}px` }"
        :matcher="props.item"
        :selected-stats="selectedStats"
        :profile="profile" />
    </VirtualScroll>
    <MapRegexGenerator :maps="widget.maps" />
  </div>
</template>

<script lang="ts">
import {
  StatMatcher, StatTag, decisionHasColor, isOutdated,
  addProfile, duplicateProfile, removeProfile, defaultProfileName
} from './common.js'
import { findAllAreaMods } from './map-regex.js'

export default {
  name: 'map_check.name'
}
</script>

<script setup lang="ts">
import { computed, defineProps, ref } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { configProp, findWidget, configModelValue } from '../settings/utils'
import type { ItemCheckWidget } from '../item-check/widget.js'

import UiToggle from '@/web/ui/UiToggle.vue'
import VirtualScroll from '@/web/ui/VirtualScroll.vue'
import SettingsMatcherEntry from './SettingsMatcherEntry.vue'
import MapRegexGenerator from './MapRegexGenerator.vue'

const props = defineProps(configProp())

const widget = computed(() => findWidget<ItemCheckWidget>('item-check', props.config)!)

const selectedProfileMatchers = computed(() => {
  const { profile } = widget.value.maps
  const matchers = new Set<string>()
  for (const entry of widget.value.maps.selectedStats) {
    if (decisionHasColor(entry.decision, profile)) {
      matchers.add(entry.matcher)
    }
  }
  return matchers
})

const outdatedTranslationList = computed<StatMatcher[]>(() => {
  const { profile } = widget.value.maps
  return widget.value.maps.selectedStats
    .filter(entry => isOutdated(profile, entry))
    .map(entry => ({ matchStr: entry.matcher, tag: StatTag.Outdated }))
})

const areaStatsDb = computed(() => findAllAreaMods())
const search = ref('')
const onlySelected = ref(false)
const filteredStats = computed<StatMatcher[]>(() => {
  const q = search.value.toLowerCase().split(' ')

  const filtered = areaStatsDb.value
    .filter(stat => {
      const searchStr = stat.matchStr.toLowerCase()
      if (!q.every(part => searchStr.includes(part))) return false
      if (onlySelected.value) {
        return selectedProfileMatchers.value.has(stat.matchStr)
      }
      return true
    })

  return [
    ...outdatedTranslationList.value,
    ...filtered
  ]
})

const selectedStats = computed(() => widget.value.maps.selectedStats)
const profile = computed(() => widget.value.maps.profile)
const profiles = computed(() => widget.value.maps.profiles)
const fontSize = computed(() => props.config.fontSize)
const showNewStats = configModelValue(() => widget.value.maps, 'showNewStats')
const { t } = useI18nNs('map_check')

const pendingDelete = ref(false)

function selectProfile (value: number) {
  widget.value.maps.profile = value
  pendingDelete.value = false
}

function addNewProfile () {
  addProfile(widget.value.maps, defaultProfileName(profiles.value.length))
  pendingDelete.value = false
}

function duplicateCurrentProfile () {
  duplicateProfile(widget.value.maps, defaultProfileName(profiles.value.length))
  pendingDelete.value = false
}

// Dropping a profile discards its decision for every mod, so ask for a second
// click before doing it.
function deleteCurrentProfile () {
  if (!pendingDelete.value) {
    pendingDelete.value = true
    return
  }
  removeProfile(widget.value.maps, profile.value)
  pendingDelete.value = false
}
</script>
