<template>
  <div v-if="generated.text" class="bg-gray-900 py-1 px-8 flex items-baseline gap-2">
    <i class="fas fa-search text-gray-500"></i>
    <button class="btn" @click="copy">
      {{ copied ? t(':regex.copied') : t(':regex.copy') }}</button>
    <button class="btn" @click="searchStash">{{ t(':regex.search') }}</button>
    <div class="flex-1"></div>
    <i v-if="generated.dropped.length"
      class="fas fa-exclamation-triangle text-orange-400"
      :title="t(':regex.dropped', [generated.dropped.length])"></i>
    <span :class="tooLong ? 'text-red-400' : 'text-gray-500'">
      {{ generated.text.length }}/{{ SEARCH_LENGTH_LIMIT }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { generateMapRegex, SEARCH_LENGTH_LIMIT } from './map-regex.js'
import { useRegexActions } from './regex-actions.js'
import { activeProfile, type MapCheckConfig } from './common.js'

const props = defineProps<{
  maps: MapCheckConfig
}>()

const { t } = useI18nNs('map_check')

const generated = computed(() => generateMapRegex(
  activeProfile(props.maps).regex, props.maps.selectedStats, props.maps.profile))

const tooLong = computed(() => generated.value.text.length > SEARCH_LENGTH_LIMIT)

const { copied, copy, searchStash } = useRegexActions(() => generated.value.text)
</script>
