import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { MeetingNotesV2 } from '../../../../shared/types'
import { NotesStyleDocument } from '../NotesStyleDocument'

function makeNotes(): MeetingNotesV2 {
  return {
    schemaVersion: 2,
    meetingId: 'meeting-1',
    sourceTranscriptRevision: 'transcript-sha256:abc' as never,
    sourceAttributionRevision: 'notes-attribution-sha256:def' as never,
    revision: 'sha256:xyz' as never,
    overview: { text: 'The team aligned on the launch.', sources: [], provenance: null as never },
    keyTakeaways: [],
    sections: [],
    decisions: [
      {
        id: 'd1',
        title: 'Launch date',
        topic: null,
        owner: null,
        deadline: null,
        text: 'The launch is June 1.',
        sources: [{ startMs: 60_000, endMs: 90_000 }],
        provenance: null as never
      }
    ],
    nextSteps: [
      {
        id: 'n1',
        title: 'Send plan',
        topic: null,
        owner: 'Anna',
        deadline: 'Friday',
        text: 'Anna sends the plan.',
        sources: [{ startMs: 120_000, endMs: 150_000 }],
        provenance: null as never,
        completed: false
      }
    ]
  } as unknown as MeetingNotesV2
}

describe('NotesStyleDocument', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to the full notes view', async () => {
    await act(async () => {
      render(
        <NotesStyleDocument
          notes={makeNotes()}
          title="Kickoff"
          meetingSpan={[]}
          onSeek={vi.fn()}
          onWrite={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(screen.getByLabelText('Protocol type')).toHaveValue('full')
    expect(document.body.textContent).toContain('The team aligned on the launch.')
  })

  it('renders the action list style with owners and deadlines', async () => {
    await act(async () => {
      render(
        <NotesStyleDocument
          notes={makeNotes()}
          title="Kickoff"
          meetingSpan={[]}
          onSeek={vi.fn()}
          onWrite={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Protocol type'), { target: { value: 'actions' } })
      await Promise.resolve()
    })

    expect(screen.getByText('Anna sends the plan.')).toBeInTheDocument()
    expect(screen.getByText('(Anna)')).toBeInTheDocument()
    expect(screen.getByText('· Friday')).toBeInTheDocument()
    expect(screen.queryByText('The launch is June 1.')).not.toBeInTheDocument()
  })

  it('renders the chronological minutes sorted by timestamp', async () => {
    await act(async () => {
      render(
        <NotesStyleDocument
          notes={makeNotes()}
          title="Kickoff"
          meetingSpan={[]}
          onSeek={vi.fn()}
          onWrite={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Protocol type'), { target: { value: 'minutes' } })
      await Promise.resolve()
    })

    const items = screen.getAllByText(/The launch is June 1.|Anna sends the plan./)
    expect(items).toHaveLength(2)
    const first = items[0].textContent ?? ''
    expect(first).toContain('The launch is June 1.')
    expect(screen.getByText('1:00')).toBeInTheDocument()
    expect(screen.getByText('2:00')).toBeInTheDocument()
  })

  it('persists the selected style per meeting', async () => {
    await act(async () => {
      render(
        <NotesStyleDocument
          notes={makeNotes()}
          title="Kickoff"
          meetingSpan={[]}
          onSeek={vi.fn()}
          onWrite={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Protocol type'), { target: { value: 'decisions' } })
      await Promise.resolve()
    })

    expect(window.localStorage.getItem('autodoc-notes-style:meeting-1')).toBe('decisions')
  })
})
