import { ipcMain, shell } from 'electron'
import type { AppRuntimeInfo } from '../../shared/types'
import type { DiagnosticTrailEntry } from '../../shared/diagnostics'
import {
  buildDiagnosticReportMarkdown,
  saveDiagnosticReport,
  type DiagnosticReportInput
} from '../services/diagnostic-report'

export interface ReportIpcDeps {
  getRuntimeInfo: () => AppRuntimeInfo
  getDiagnosticTrail: () => DiagnosticTrailEntry[]
  getUiLanguage: () => string
  getLaunchAtLogin: () => boolean
  getAnalyticsConsent: () => boolean | null
  getOllamaSetupPhase: () => string
  getOllamaSetupPercent: () => number | null
}

export function registerReportIpc(deps: ReportIpcDeps): void {
  ipcMain.handle('report:generate', async (): Promise<string> => {
    const input: DiagnosticReportInput = {
      runtimeInfo: deps.getRuntimeInfo(),
      diagnosticTrail: deps.getDiagnosticTrail(),
      uiLanguage: deps.getUiLanguage(),
      launchAtLogin: deps.getLaunchAtLogin(),
      analyticsConsent: deps.getAnalyticsConsent(),
      ollamaSetupPhase: deps.getOllamaSetupPhase(),
      ollamaSetupPercent: deps.getOllamaSetupPercent()
    }
    return buildDiagnosticReportMarkdown(input)
  })

  ipcMain.handle('report:save', async (_event, markdown: unknown): Promise<string> => {
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
      throw new Error('A report requires non-empty markdown content.')
    }
    return saveDiagnosticReport(markdown)
  })

  ipcMain.handle('report:show-in-folder', (_event, filePath: unknown): void => {
    if (typeof filePath === 'string' && filePath.length > 0) {
      shell.showItemInFolder(filePath)
    }
  })
}
