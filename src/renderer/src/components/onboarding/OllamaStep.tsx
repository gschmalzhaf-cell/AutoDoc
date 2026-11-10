import { useT } from '../../services/i18n'
import { useCallback, useRef, useState, useEffect } from 'react'
import type { OllamaSetupStatus } from '../../../../shared/types'
import { getOllamaSetupLabel } from '../../services/setup-status-labels'
import { toDurationBucket, trackEvent, trackFirstEventOnce } from '../../services/analytics'

export function OllamaStep({ onNext }: { onNext: () => void }) {
  const t = useT()

  const [phase, setPhase] = useState<OllamaSetupStatus['phase']>('starting')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showSkip, setShowSkip] = useState(false)
  const [mistralEnabled, setMistralEnabled] = useState(false)
  const [showMistralForm, setShowMistralForm] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [keyRejected, setKeyRejected] = useState(false)
  const setupStartedAt = useRef<number | null>(null)
  const lastFailureKey = useRef<string | null>(null)

  const markReady = useCallback(() => {
    setPhase('ready')
    setPercent(100)
    lastFailureKey.current = null
    const startedAt = setupStartedAt.current ?? performance.now()
    void trackFirstEventOnce('ollama_setup_completed', 'setup_component_completed', {
      component: 'ollama',
      duration_bucket: toDurationBucket((performance.now() - startedAt) / 1000)
    })
  }, [])

  const recordStatus = useCallback(
    (status: OllamaSetupStatus) => {
      setPhase(status.phase)
      setPercent(status.percent)
      if (status.phase === 'ready') markReady()
      if (status.phase === 'error') {
        setError(status.error ?? 'unknown')
        const failedStep = status.failedStep ?? 'unknown'
        const failureKey = `${failedStep}:${status.error ?? ''}`
        if (lastFailureKey.current !== failureKey) {
          lastFailureKey.current = failureKey
          trackEvent('setup_component_failed', {
            component: 'ollama',
            phase: failedStep,
            failure_code: failedStep,
            attempt_number: 1
          })
        }
      }
    },
    [markReady]
  )

  useEffect(() => {
    setupStartedAt.current ??= performance.now()
    trackEvent('setup_component_started', { component: 'ollama', phase: 'starting' })
    window.electronAPI.invoke('ollama:get-setup-status').then(async (status) => {
      recordStatus(status)
      if (status.phase === 'starting' && status.percent === 0) {
        await window.electronAPI.invoke('ollama:retry-setup')
      }
    })

    const unsub = window.electronAPI.on('ollama:setup-progress', (status) => {
      recordStatus(status)
    })

    return () => {
      unsub()
    }
  }, [recordStatus])

  useEffect(() => {
    void window.electronAPI
      .invoke('mistral:get-status')
      .then((status) => {
        if (status?.enabled) {
          setMistralEnabled(true)
          markReady()
        }
      })
      .catch(() => {})
  }, [markReady])

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  const connectMistral = useCallback(async () => {
    if (connecting) return
    const trimmed = apiKey.trim()
    if (trimmed.length === 0) return
    setConnecting(true)
    setKeyRejected(false)
    try {
      const result = await window.electronAPI.invoke('mistral:set-api-key', trimmed)
      if (result?.ok) {
        setMistralEnabled(true)
        markReady()
      } else {
        setKeyRejected(true)
      }
    } catch {
      setKeyRejected(true)
    } finally {
      setConnecting(false)
    }
  }, [apiKey, connecting, markReady])

  if (phase === 'ready') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-sage-light flex items-center justify-center mx-auto mb-5">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-sage-dark"
            aria-hidden="true"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="text-[20px] font-bold text-ink tracking-[-0.02em] mb-2">
          {t('ui.aIModelReady')}
        </h2>
        <p className="text-[14px] text-ink-muted leading-relaxed mb-7">
          {mistralEnabled
            ? t('ui.mistralConnectedBody')
            : t('ui.ollamaAndTheNotesModelAreInstalledAndReadyToGo')}
        </p>
        <button
          onClick={onNext}
          className="i18n-btn px-6 py-2.5 bg-sage text-on-brand rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-opacity"
        >
          {t('ui.continue')}
        </button>
      </div>
    )
  }

  if (showMistralForm) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-dusk-light flex items-center justify-center text-[28px] mx-auto mb-5">
          {t('ui.aI')}
        </div>
        <h2 className="text-[20px] font-bold text-ink tracking-[-0.02em] mb-2">
          {t('ui.mistralUseMistralApi')}
        </h2>
        <p className="text-[14px] text-ink-muted leading-relaxed mb-5 max-w-[320px] mx-auto">
          {t('ui.mistralDescription')}
        </p>

        <div className="flex flex-col items-center gap-3 mb-3">
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void connectMistral()
            }}
            placeholder={t('ui.mistralApiKeyPlaceholder')}
            className="w-[280px] rounded-lg border border-border bg-bg-card px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
          {keyRejected && (
            <p className="text-[12px] text-clay leading-relaxed">{t('ui.mistralKeyRejected')}</p>
          )}
          <button
            onClick={() => void connectMistral()}
            disabled={connecting || apiKey.trim().length === 0}
            className="i18n-btn px-6 py-2.5 bg-sage text-on-brand rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? t('ui.mistralConnecting') : t('ui.mistralConnect')}
          </button>
        </div>

        <button
          onClick={() => {
            setShowMistralForm(false)
            setKeyRejected(false)
          }}
          className="text-[13px] text-ink-faint hover:text-ink-muted transition-colors"
        >
          {t('ui.useLocalModels')}
        </button>
      </div>
    )
  }

  const statusLabel = error
    ? t('setup.aiFailed')
    : (getOllamaSetupLabel({ phase, percent }, t) ?? t('ui.preparing'))

  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-dusk-light flex items-center justify-center text-[28px] mx-auto mb-5">
        {t('ui.aI')}
      </div>
      <h2 className="text-[20px] font-bold text-ink tracking-[-0.02em] mb-2">
        {t('ui.settingUpAI')}
      </h2>
      <p className="text-[14px] text-ink-muted leading-relaxed mb-7">
        {t('ui.autoDocInstallsOllamaAndDownloadsTheNotesModelOnceSoYourNotesCanRunEntirely')}
      </p>

      <div className="w-60 h-1 bg-border rounded-full mx-auto mb-2 overflow-hidden">
        <div
          className="h-full bg-sage rounded-full transition-all duration-300"
          style={{ width: `${phase === 'starting' ? 20 : percent}%` }}
        />
      </div>
      <div className="text-[12px] text-ink-faint mb-5">{statusLabel}</div>

      {error && (
        <button
          onClick={async () => {
            setError(null)
            setPhase('starting')
            setPercent(0)
            await window.electronAPI.invoke('ollama:retry-setup')
          }}
          className="i18n-btn px-6 py-2.5 bg-ink text-on-ink rounded-[10px] text-[14px] font-semibold hover:bg-ink-secondary transition-colors"
        >
          {t('ui.retry')}
        </button>
      )}

      {!error && (
        <div className="mb-2">
          <button
            onClick={() => setShowMistralForm(true)}
            className="i18n-btn px-6 py-2.5 border border-border text-ink rounded-[10px] text-[14px] font-semibold hover:bg-surface transition-colors"
          >
            {t('ui.mistralUseMistralApi')}
          </button>
        </div>
      )}

      {showSkip && !error && (
        <button
          onClick={onNext}
          className="text-[13px] text-ink-faint hover:text-ink-muted transition-colors"
        >
          {t('ui.continueThisWillFinishInTheBackground')}
        </button>
      )}
    </div>
  )
}
