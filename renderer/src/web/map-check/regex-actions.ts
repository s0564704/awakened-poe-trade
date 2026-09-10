import { ref } from 'vue'
import { MainProcess } from '@/web/background/IPC'

const COPIED_SHOWN_FOR = 2000

/**
 * The two ways to get a generated search out of the app, shared by the settings
 * generator and the overlay panel bar.
 *
 * They are not interchangeable: `searchStash` borrows the clipboard and hands it
 * back (see `HostClipboard.restoreShortly`), so it leaves nothing to paste.
 */
export function useRegexActions (text: () => string) {
  const copied = ref(false)
  let clearCopied: ReturnType<typeof setTimeout> | undefined

  async function copy () {
    try {
      await navigator.clipboard.writeText(text())
      copied.value = true
      clearTimeout(clearCopied)
      clearCopied = setTimeout(() => { copied.value = false }, COPIED_SHOWN_FOR)
    } catch {
      // The overlay may not hold focus; the search button still works.
    }
  }

  function searchStash () {
    MainProcess.sendEvent({
      name: 'CLIENT->MAIN::user-action',
      payload: { action: 'stash-search', text: text() }
    })
  }

  return { copied, copy, searchStash }
}
