import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerReportIpc } from '../report-ipc'

const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const shellShowItemInFolder = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  },
  shell: {
    showItemInFolder: (...args: unknown[]) => shellShowItemInFolder(...args)
  }
}))

vi.mock('../../services/diagnostic-report', () => ({
  buildDiagnosticReportMarkdown: vi.fn().mockResolvedValue('# report'),
  saveDiagnosticReport: vi.fn().mockResolvedValue('/downloads/AutoDoc/autodoc-report.md')
}))

function register() {
  registerReportIpc({
    getRuntimeInfo: vi.fn().mockReturnValue({ appVersion: '1.7.0', platform: 'win32' }),
    getDiagnosticTrail: vi.fn().mockReturnValue([]),
    getUiLanguage: vi.fn().mockReturnValue('de'),
    getLaunchAtLogin: vi.fn().mockReturnValue(true),
    getAnalyticsConsent: vi.fn().mockReturnValue(true),
    getOllamaSetupPhase: vi.fn().mockReturnValue('ready'),
    getOllamaSetupPercent: vi.fn().mockReturnValue(100)
  })
}

describe('report-ipc', () => {
  beforeEach(() => {
    handlers.clear()
    shellShowItemInFolder.mockClear()
  })

  it('generates the markdown report', async () => {
    register()

    const markdown = (await handlers.get('report:generate')!(undefined)) as string

    expect(markdown).toBe('# report')
  })

  it('saves a report and returns the file path', async () => {
    register()

    const path = (await handlers.get('report:save')!(undefined, '# report')) as string

    expect(path).toBe('/downloads/AutoDoc/autodoc-report.md')
  })

  it('rejects an empty report payload', async () => {
    register()

    await expect(handlers.get('report:save')!(undefined, '   ')).rejects.toThrow()
  })

  it('reveals a saved report in the file manager', () => {
    register()

    handlers.get('report:show-in-folder')!(undefined, '/downloads/AutoDoc/autodoc-report.md')

    expect(shellShowItemInFolder).toHaveBeenCalledWith('/downloads/AutoDoc/autodoc-report.md')
  })
})
