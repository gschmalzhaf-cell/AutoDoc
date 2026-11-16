import { describe, expect, it } from 'vitest'
import { buildDiagnosticReportMarkdown, type DiagnosticReportInput } from '../diagnostic-report'
import type { AppRuntimeInfo } from '../../../shared/types'
import type { DiagnosticTrailEntry } from '../../../shared/diagnostics'

const runtimeInfo = {
  appVersion: '1.7.0',
  platform: 'win32',
  arch: 'x64',
  buildChannel: 'custom',
  whisperModel: 'medium',
  transcriptionBackend: 'whisper.cpp',
  ollamaModel: 'qwen3:4b-instruct',
  mistralEnabled: true,
  mistralModel: 'mistral-large-latest'
} as unknown as AppRuntimeInfo

const trail: DiagnosticTrailEntry[] = [
  {
    timestamp: '2026-11-10T10:00:00.000Z',
    source: 'renderer',
    category: 'settings',
    action: 'mistral_connected',
    details: { model: 'mistral-large-latest' }
  }
] as DiagnosticTrailEntry[]

function makeInput(overrides: Partial<DiagnosticReportInput> = {}): DiagnosticReportInput {
  return {
    runtimeInfo,
    diagnosticTrail: trail,
    uiLanguage: 'de',
    launchAtLogin: true,
    analyticsConsent: true,
    ollamaSetupPhase: 'ready',
    ollamaSetupPercent: 100,
    readLogTail: async () => 'error line about something',
    ...overrides
  }
}

describe('buildDiagnosticReportMarkdown', () => {
  it('contains the key sections and values', async () => {
    const report = await buildDiagnosticReportMarkdown(makeInput())

    expect(report).toContain('# AutoDoc diagnostic report')
    expect(report).toContain('App version: 1.7.0')
    expect(report).toContain('Engine: Mistral API (model: mistral-large-latest)')
    expect(report).toContain('Whisper model: medium')
    expect(report).toContain('UI language: de')
    expect(report).toContain('settings.mistral_connected')
    expect(report).toContain('error line about something')
    expect(report).toContain('no API keys or credentials')
  })

  it('falls back to the local engine when Mistral is disabled', async () => {
    const report = await buildDiagnosticReportMarkdown(
      makeInput({
        runtimeInfo: { ...runtimeInfo, mistralEnabled: false, mistralModel: undefined }
      })
    )

    expect(report).toContain('Engine: local Ollama (model: qwen3:4b-instruct)')
  })

  it('renders placeholders for empty trails and logs', async () => {
    const report = await buildDiagnosticReportMarkdown(
      makeInput({ diagnosticTrail: [], readLogTail: async () => '' })
    )

    expect(report).toContain('_No recorded events in this session._')
    expect(report).toContain('_No error log entries._')
  })
})
