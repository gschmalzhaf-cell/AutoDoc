import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Settings } from '../Settings'

describe('Settings Mistral API section', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'mistral:get-status') {
        return Promise.resolve({
          enabled: false,
          keyStored: false,
          keyFromEnv: false,
          model: 'mistral-small-latest'
        })
      }
      if (channel === 'app:get-runtime-info') {
        return Promise.resolve({ platform: 'win32', ollamaModel: 'qwen3:4b-instruct' })
      }
      if (channel === 'updater:get-status') {
        return Promise.resolve({ state: 'idle' })
      }
      if (channel === 'app:get-version') {
        return Promise.resolve('1.5.0')
      }
      if (channel === 'calendar:get-accounts') {
        return Promise.resolve([])
      }
      if (channel === 'calendar:get-events') {
        return Promise.resolve([])
      }
      return Promise.resolve()
    })
  })

  it('shows the API key input when Mistral is not enabled', async () => {
    await act(async () => {
      render(<Settings />)
      await Promise.resolve()
    })

    expect(screen.getByText('Mistral API')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('API key')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })

  it('connects Mistral with a valid key and shows the disconnect state', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'mistral:get-status') {
        return Promise.resolve({
          enabled: true,
          keyStored: true,
          keyFromEnv: false,
          model: 'mistral-small-latest'
        })
      }
      if (channel === 'mistral:set-api-key') {
        return Promise.resolve({
          enabled: true,
          keyStored: true,
          keyFromEnv: false,
          model: 'mistral-small-latest',
          ok: true
        })
      }
      if (channel === 'app:get-runtime-info') {
        return Promise.resolve({ platform: 'win32', ollamaModel: 'qwen3:4b-instruct' })
      }
      if (channel === 'updater:get-status') {
        return Promise.resolve({ state: 'idle' })
      }
      if (channel === 'app:get-version') {
        return Promise.resolve('1.5.0')
      }
      if (channel === 'calendar:get-accounts') {
        return Promise.resolve([])
      }
      if (channel === 'calendar:get-events') {
        return Promise.resolve([])
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<Settings />)
      await Promise.resolve()
    })

    expect(screen.getByText('Mistral API')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('API key')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.getByText(/AutoDoc is connected to the Mistral API./i)).toBeInTheDocument()
  })

  it('shows a rejection message for an invalid key', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'mistral:get-status') {
        return Promise.resolve({
          enabled: false,
          keyStored: false,
          keyFromEnv: false,
          model: 'mistral-small-latest'
        })
      }
      if (channel === 'mistral:set-api-key') {
        return Promise.resolve({
          enabled: false,
          keyStored: false,
          keyFromEnv: false,
          model: 'mistral-small-latest',
          ok: false,
          error: 'invalid-key'
        })
      }
      if (channel === 'app:get-runtime-info') {
        return Promise.resolve({ platform: 'win32', ollamaModel: 'qwen3:4b-instruct' })
      }
      if (channel === 'updater:get-status') {
        return Promise.resolve({ state: 'idle' })
      }
      if (channel === 'app:get-version') {
        return Promise.resolve('1.5.0')
      }
      if (channel === 'calendar:get-accounts') {
        return Promise.resolve([])
      }
      if (channel === 'calendar:get-events') {
        return Promise.resolve([])
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<Settings />)
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('API key'), { target: { value: 'bad-key' } })
      screen.getByRole('button', { name: 'Connect' }).click()
      await Promise.resolve()
    })

    expect(screen.getByText(/The API key was rejected./i)).toBeInTheDocument()
  })
})
