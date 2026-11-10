import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: any[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler)
    })
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

const validateMistralApiKey = vi.fn()
const ensureMistralOllamaAdapter = vi.fn()
const closeMistralOllamaAdapter = vi.fn()

vi.mock('../../services/mistral-ollama-adapter', () => ({
  validateMistralApiKey: (...args: unknown[]) => validateMistralApiKey(...args),
  ensureMistralOllamaAdapter: (...args: unknown[]) => ensureMistralOllamaAdapter(...args),
  closeMistralOllamaAdapter: (...args: unknown[]) => closeMistralOllamaAdapter(...args)
}))

vi.mock('../../services/mistral-config', () => ({
  getMistralNotesModel: () => 'mistral-small-latest',
  isMistralModeEnabled: () => true
}))

import { registerMistralIpc } from '../mistral-ipc'

function handler(channel: string): (...args: any[]) => unknown {
  const registered = handlers.get(channel)
  if (!registered) throw new Error(`Missing handler for ${channel}`)
  return registered
}

function createDeps() {
  return {
    getStoredApiKey: vi.fn().mockReturnValue(''),
    setStoredApiKey: vi.fn(),
    clearStoredApiKey: vi.fn(),
    getStoredModel: vi.fn().mockReturnValue(undefined),
    setStoredModel: vi.fn(),
    markSetupReady: vi.fn(),
    markSetupStarting: vi.fn(),
    markSetupFailed: vi.fn(),
    getSetupStatus: vi.fn().mockReturnValue({ phase: 'ready', percent: 100 })
  }
}

function register(deps = createDeps()) {
  registerMistralIpc(deps)
  return deps
}

describe('mistral IPC', () => {
  beforeEach(() => {
    handlers.clear()
    validateMistralApiKey.mockReset()
    ensureMistralOllamaAdapter.mockReset()
    closeMistralOllamaAdapter.mockReset()
    validateMistralApiKey.mockResolvedValue(true)
    ensureMistralOllamaAdapter.mockResolvedValue({})
    closeMistralOllamaAdapter.mockResolvedValue(undefined)
    delete process.env.MISTRAL_API_KEY
  })

  it('reports the current mistral status', async () => {
    const deps = register()
    deps.getStoredApiKey.mockReturnValue('stored-key')

    const status = (await handler('mistral:get-status')()) as {
      enabled: boolean
      keyStored: boolean
      model: string
    }

    expect(status).toEqual({
      enabled: true,
      keyStored: true,
      keyFromEnv: false,
      model: 'mistral-small-latest'
    })
  })

  it('validates, stores, and activates the key', async () => {
    const deps = register()

    const result = (await handler('mistral:set-api-key')(undefined, ' new-key ')) as {
      ok: boolean
      keyStored: boolean
    }

    expect(validateMistralApiKey).toHaveBeenCalledWith('new-key')
    expect(deps.setStoredApiKey).toHaveBeenCalledWith('new-key')
    expect(ensureMistralOllamaAdapter).toHaveBeenCalled()
    expect(deps.markSetupReady).toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(result.keyStored).toBe(false) // getStoredApiKey still returns '' in this fixture
  })

  it('rejects an invalid key without storing it', async () => {
    const deps = register()
    validateMistralApiKey.mockResolvedValue(false)

    const result = (await handler('mistral:set-api-key')(undefined, 'bad-key')) as {
      ok: boolean
      error?: string
    }

    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid-key')
    expect(deps.setStoredApiKey).not.toHaveBeenCalled()
    expect(ensureMistralOllamaAdapter).not.toHaveBeenCalled()
  })

  it('rejects an empty key', async () => {
    register()

    const result = (await handler('mistral:set-api-key')(undefined, '   ')) as {
      ok: boolean
      error?: string
    }

    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid-key')
    expect(validateMistralApiKey).not.toHaveBeenCalled()
  })

  it('clears the stored key and stops the adapter', async () => {
    const deps = register()
    process.env.MISTRAL_API_KEY = 'env-key'

    await handler('mistral:clear-api-key')()

    expect(deps.clearStoredApiKey).toHaveBeenCalled()
    expect(closeMistralOllamaAdapter).toHaveBeenCalled()
    expect(process.env.MISTRAL_API_KEY).toBeUndefined()
  })

  it('stores a selected chat model', async () => {
    const deps = register()

    const status = (await handler('mistral:set-model')(undefined, ' mistral-large-latest ')) as {
      model: string
    }

    expect(deps.setStoredModel).toHaveBeenCalledWith('mistral-large-latest')
    expect(status.model).toBe('mistral-small-latest')
  })

  it('ignores an empty model', async () => {
    const deps = register()

    await handler('mistral:set-model')(undefined, '   ')

    expect(deps.setStoredModel).not.toHaveBeenCalled()
  })
})
