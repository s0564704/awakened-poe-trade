<template>
  <div class="border-t border-gray-900 p-2 flex flex-col gap-2">
    <div class="flex items-baseline gap-4">
      <div class="flex-1">{{ t(':regex.title') }}</div>
      <div class="flex items-baseline gap-3">
        <span class="text-gray-500">{{ t(':regex.exclude') }}</span>
        <UiCheckbox v-model="excludeDeadly">
          <i class="fas fa-skull-crossbones px-1 bg-red-700"></i>
        </UiCheckbox>
        <UiCheckbox v-model="excludeWarning">
          <i class="fas fa-exclamation-triangle px-1 bg-orange-600"></i>
        </UiCheckbox>
        <span class="text-gray-500 ml-4">{{ t(':regex.require') }}</span>
        <UiCheckbox v-model="requireGood">
          <i class="fas fa-check px-1 bg-green-700"></i>
        </UiCheckbox>
      </div>
    </div>

    <div class="flex items-baseline gap-2">
      <label v-for="input in thresholds" :key="input.label"
        class="flex items-baseline gap-1">
        <span class="text-gray-500">{{ input.label }}</span>
        <input v-model.number="input.model.value" type="number" min="0" max="999"
          class="bg-gray-900 rounded px-1 w-12">
      </label>
      <label class="flex items-baseline gap-1 flex-1">
        <span class="text-gray-500">{{ t(':regex.extra') }}</span>
        <input v-model="extraTerms" class="bg-gray-900 rounded px-1 w-full">
      </label>
    </div>

    <div class="rounded px-2 py-1 break-all font-mono leading-normal select-all shrink-0"
      style="min-height: 2rem; height: fit-content;"
      :class="tooLong ? 'bg-red-800' : 'bg-gray-900'"
    >{{ generated.text }}</div>

    <div class="flex items-baseline gap-2">
      <div :class="tooLong ? 'text-red-400' : 'text-gray-500'">
        {{ generated.text.length }}/{{ SEARCH_LENGTH_LIMIT }}</div>
      <div class="flex-1"></div>
      <button class="btn" :disabled="!generated.text" @click="copy">
        {{ copied ? t(':regex.copied') : t(':regex.copy') }}</button>
      <button class="btn" :disabled="!generated.text" @click="searchStash">
        {{ t(':regex.search') }}</button>
    </div>

    <div v-if="generated.dropped.length" class="text-orange-400">
      {{ t(':regex.dropped', [generated.dropped.length]) }}
    </div>
    <div v-if="ambiguous.length" class="text-orange-400">
      {{ t(':regex.ambiguous', [ambiguous.length]) }}
    </div>

    <div v-if="generated.tokens.length" class="flex flex-col">
      <div v-for="token in generated.tokens" :key="token.matcher"
        class="flex items-baseline gap-2 py-0.5"
        :class="{ 'opacity-50 line-through': generated.dropped.includes(token) }"
      >
        <i class="w-4 text-center" :class="iconOf(token.decision)"></i>
        <code class="bg-gray-900 rounded px-1 whitespace-pre">{{ token.token }}</code>
        <span class="flex-1 truncate text-gray-400">{{ token.matcher }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { MainProcess } from '@/web/background/IPC'
import { configModelValue } from '../settings/utils'
import { generateMapRegex, SEARCH_LENGTH_LIMIT } from './map-regex.js'
import type { MapCheckConfig } from './common.js'

import UiCheckbox from '@/web/ui/UiCheckbox.vue'

const props = defineProps<{
  maps: MapCheckConfig
}>()

const { t } = useI18nNs('map_check')

const regex = () => props.maps.regex

const excludeDeadly = configModelValue(regex, 'excludeDeadly')
const excludeWarning = configModelValue(regex, 'excludeWarning')
const requireGood = configModelValue(regex, 'requireGood')
const extraTerms = configModelValue(regex, 'extraTerms')

const models = {
  minQuantity: configModelValue(regex, 'minQuantity'),
  minRarity: configModelValue(regex, 'minRarity'),
  minPackSize: configModelValue(regex, 'minPackSize'),
  minQuality: configModelValue(regex, 'minQuality')
}

const thresholds = computed(() => [
  { label: t(':regex.min_quantity'), model: models.minQuantity },
  { label: t(':regex.min_rarity'), model: models.minRarity },
  { label: t(':regex.min_pack_size'), model: models.minPackSize },
  { label: t(':regex.min_quality'), model: models.minQuality }
])

const generated = computed(() => generateMapRegex(
  props.maps.regex, props.maps.selectedStats, props.maps.profile))

const tooLong = computed(() => generated.value.text.length > SEARCH_LENGTH_LIMIT)

const ambiguous = computed(() =>
  generated.value.tokens.filter(token => token.kind === 'ambiguous'))

function iconOf (decision: string) {
  switch (decision) {
    case 'd': return 'fas fa-skull-crossbones text-red-500'
    case 'w': return 'fas fa-exclamation-triangle text-orange-500'
  }
  return 'fas fa-check text-green-500'
}

const copied = ref(false)
let clearCopied: ReturnType<typeof setTimeout> | undefined

async function copy () {
  try {
    await navigator.clipboard.writeText(generated.value.text)
    copied.value = true
    clearTimeout(clearCopied)
    clearCopied = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // The overlay may not hold focus; the button below still works.
  }
}

function searchStash () {
  MainProcess.sendEvent({
    name: 'CLIENT->MAIN::user-action',
    payload: { action: 'stash-search', text: generated.value.text }
  })
}
</script>
