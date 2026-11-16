import { app } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { getAutodocLogPath } from './autodoc-log'
import { sanitizeDiagnosticLogTail } from './diagnostic-log-upload'
import type { AppRuntimeInfo } from '../../shared/types'
import type { DiagnosticTrailEntry } from '../../shared/diagnostics'

const LOG_TAIL_BYTES = 8_000

export interface DiagnosticReportInput {
  runtimeInfo: AppRuntimeInfo
  diagnosticTrail: DiagnosticTrailEntry[]
  uiLanguage: string
  launchAtLogin: boolean
  analyticsConsent: boolean | null
  ollamaSetupPhase: string
  ollamaSetupPercent: number | null
  readLogTail?: () => Promise<string>
}

function formatTrailEntry(entry: DiagnosticTrailEntry): string {
  const details = entry.details ? JSON.stringify(entry.details) : ''
  return `| ${entry.timestamp} | ${entry.source} | ${entry.category}.${entry.action} | ${details.replace(/\|/g, '\\|')} |`
}

async function readLogTail(): Promise<string> {
  try {
    const content = await readFile(getAutodocLogPath(), 'utf-8')
    return content.length > LOG_TAIL_BYTES ? content.slice(-LOG_TAIL_BYTES) : content
  } catch {
    return ''
  }
}

export async function buildDiagnosticReportMarkdown(input: DiagnosticReportInput): Promise<string> {
  const readTail = input.readLogTail ?? readLogTail
  const logTail = sanitizeDiagnosticLogTail(await readTail())
  const runtime = input.runtimeInfo

  const lines: string[] = [
    '# AutoDoc diagnostic report',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- App version: ${runtime.appVersion}`,
    `- Platform: ${runtime.platform} (${runtime.arch})`,
    `- Build channel: ${runtime.buildChannel}`,
    `- Electron: ${process.versions.electron ?? 'unknown'} · Node: ${process.versions.node ?? 'unknown'}`,
    '',
    '## AI engine',
    '',
    runtime.mistralEnabled
      ? `- Engine: Mistral API (model: ${runtime.mistralModel ?? 'unknown'})`
      : `- Engine: local Ollama (model: ${runtime.ollamaModel ?? 'unknown'})`,
    `- Ollama setup phase: ${input.ollamaSetupPhase}` +
      (input.ollamaSetupPercent != null ? ` (${input.ollamaSetupPercent}%)` : ''),
    '',
    '## Transcription',
    '',
    `- Whisper model: ${runtime.whisperModel ?? 'unknown'}`,
    `- Backend: ${runtime.transcriptionBackend ?? 'unknown'}`,
    '',
    '## Settings (non-sensitive)',
    '',
    `- UI language: ${input.uiLanguage}`,
    `- Launch at login: ${input.launchAtLogin}`,
    `- Analytics consent: ${input.analyticsConsent}`,
    '',
    '## Recent events (diagnostic trail)',
    ''
  ]

  if (input.diagnosticTrail.length === 0) {
    lines.push('_No recorded events in this session._')
  } else {
    lines.push('| Timestamp | Source | Event | Details |', '| --- | --- | --- | --- |')
    for (const entry of input.diagnosticTrail) {
      lines.push(formatTrailEntry(entry))
    }
  }

  lines.push('', '## Error log (last entries, sanitized)', '')
  if (logTail.trim().length === 0) {
    lines.push('_No error log entries._')
  } else {
    lines.push('```', logTail.trim(), '```')
  }

  lines.push('', '## Privacy', '')
  lines.push(
    'This report contains no transcripts, no meeting content, no calendar data, and no API keys or credentials.'
  )

  return lines.join('\n')
}

export async function saveDiagnosticReport(markdown: string): Promise<string> {
  const downloadsDir = app.getPath('downloads')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const targetDir = join(downloadsDir, 'AutoDoc')
  await mkdir(targetDir, { recursive: true })
  const filePath = join(targetDir, `autodoc-report-${stamp}.md`)
  await writeFile(filePath, markdown, 'utf-8')
  return filePath
}
