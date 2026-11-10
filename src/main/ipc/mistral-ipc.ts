import { ipcMain } from 'electron'
import { BrowserWindow } from 'electron'
import type { MistralStatus, OllamaSetupStatus } from '../../shared/types'
import { getMistralNotesModel, isMistralModeEnabled } from '../services/mistral-config'
import {
  closeMistralOllamaAdapter,
  ensureMistralOllamaAdapter,
  validateMistralApiKey
} from '../services/mistral-ollama-adapter'

export interface MistralIpcDeps {
  getStoredApiKey: () => string
  setStoredApiKey: (key: string) => void
  clearStoredApiKey: () => void
  markSetupReady: () => void
  markSetupStarting: () => void
  markSetupFailed: (error: unknown) => void
  getSetupStatus: () => OllamaSetupStatus
}

export function registerMistralIpc(deps: MistralIpcDeps): void {
  const status = (): MistralStatus => ({
    enabled: isMistralModeEnabled(),
    keyStored: deps.getStoredApiKey().length > 0,
    keyFromEnv: (process.env.MISTRAL_API_KEY ?? '').trim().length > 0,
    model: getMistralNotesModel()
  })

  const broadcastSetupProgress = (setupStatus: OllamaSetupStatus): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('ollama:setup-progress', setupStatus)
    }
  }

  ipcMain.handle('mistral:get-status', (): MistralStatus => status())

  ipcMain.handle(
    'mistral:set-api-key',
    async (
      _event,
      key: unknown
    ): Promise<MistralStatus & { ok: boolean; error?: 'invalid-key' | 'unavailable' }> => {
      const trimmed = typeof key === 'string' ? key.trim() : ''
      if (trimmed.length === 0) {
        return { ...status(), ok: false, error: 'invalid-key' }
      }

      const valid = await validateMistralApiKey(trimmed)
      if (!valid) {
        return { ...status(), ok: false, error: 'invalid-key' }
      }

      deps.markSetupStarting()
      deps.setStoredApiKey(trimmed)
      try {
        await ensureMistralOllamaAdapter()
        deps.markSetupReady()
        broadcastSetupProgress(deps.getSetupStatus())
        return { ...status(), ok: true }
      } catch (error) {
        deps.clearStoredApiKey()
        deps.markSetupFailed(error)
        return { ...status(), ok: false, error: 'unavailable' }
      }
    }
  )

  ipcMain.handle('mistral:clear-api-key', async (): Promise<MistralStatus> => {
    deps.clearStoredApiKey()
    await closeMistralOllamaAdapter()
    return status()
  })
}
