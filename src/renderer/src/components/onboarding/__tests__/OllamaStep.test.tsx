import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { OllamaStep } from '../OllamaStep'

async function userEventTyping(input: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
  })
}

describe('OllamaStep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders AI setup heading', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'downloading', percent: 42 })
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText('Setting Up AI')).toBeInTheDocument()
    expect(screen.getByText(/downloading Ollama\.\.\. 42%/i)).toBeInTheDocument()
  })

  it('waits for confirmation when already ready', async () => {
    const onNext = vi.fn()
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'ready', percent: 100 })
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={onNext} />)
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'AI Model Ready' })).toBeInTheDocument()
    expect(
      screen.getByText(/Ollama and the notes model are installed and ready to go\./i)
    ).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(onNext).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByRole('button', { name: /^continue$/i }).click()
    })

    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('starts AI setup when onboarding reaches the step', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'starting', percent: 0 })
      }
      if (channel === 'ollama:retry-setup') {
        return Promise.resolve()
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('ollama:retry-setup')
  })

  it('shows skip link after 1.5 seconds', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'downloading', percent: 10 })
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.queryByText(/continue/i)).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(screen.getByText(/continue/i)).toBeInTheDocument()
  })

  it('shows the Mistral connected state when Mistral mode is already enabled', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'mistral:get-status') {
        return Promise.resolve({
          enabled: true,
          keyStored: true,
          keyFromEnv: false,
          model: 'mistral-small-latest'
        })
      }
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'starting', percent: 0 })
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByRole('heading', { name: 'AI Model Ready' })).toBeInTheDocument()
    expect(screen.getByText(/AutoDoc is connected to the Mistral API./i)).toBeInTheDocument()
  })

  it('offers the Mistral option and connects with a valid API key', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'downloading', percent: 40 })
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
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Use Mistral API' }).click()
      await Promise.resolve()
    })

    await act(async () => {
      const input = screen.getByPlaceholderText('API key')
      await userEventTyping(input, 'test-key')
      screen.getByRole('button', { name: 'Connect' }).click()
      await Promise.resolve()
    })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('mistral:set-api-key', 'test-key')
    expect(screen.getByRole('heading', { name: 'AI Model Ready' })).toBeInTheDocument()
    expect(screen.getByText(/AutoDoc is connected to the Mistral API./i)).toBeInTheDocument()
  })

  it('shows a rejection message when the Mistral API key is invalid', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'downloading', percent: 40 })
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
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    await act(async () => {
      screen.getByRole('button', { name: 'Use Mistral API' }).click()
      await Promise.resolve()
    })

    await act(async () => {
      const input = screen.getByPlaceholderText('API key')
      await userEventTyping(input, 'bad-key')
      screen.getByRole('button', { name: 'Connect' }).click()
      await Promise.resolve()
    })

    expect(screen.getByText(/The API key was rejected./i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use local models' })).toBeInTheDocument()
  })

  it('shows the notes model download label during model pull', async () => {
    vi.mocked(window.electronAPI.invoke).mockImplementation((channel: string) => {
      if (channel === 'ollama:get-setup-status') {
        return Promise.resolve({ phase: 'pulling', percent: 82 })
      }
      return Promise.resolve()
    })

    await act(async () => {
      render(<OllamaStep onNext={vi.fn()} />)
      await Promise.resolve()
    })

    expect(screen.getByText(/downloading notes model\.\.\. 82%/i)).toBeInTheDocument()
  })
})
