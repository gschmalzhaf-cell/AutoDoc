import { useT } from '../services/i18n'
import { useEffect, useState, type ReactElement } from 'react'
import type {
  MeetingNotesContent,
  MeetingNotesV2,
  NoteItem,
  NoteSourceRange,
  NotesStyle
} from '../../../shared/types'
import type { MessageKey } from '../../../shared/i18n'
import { NotesV2Document } from './NotesV2Document'
import { renderNoteMarkup } from './NoteMarkup'

const NOTES_COLUMN = 'mx-auto w-full max-w-[560px]'
const NOTES_STYLE_OPTIONS: NotesStyle[] = ['full', 'summary', 'actions', 'decisions', 'minutes']
const NOTES_STYLE_LABELS: Record<NotesStyle, MessageKey> = {
  full: 'ui.notesStyle.full',
  summary: 'ui.notesStyle.summary',
  actions: 'ui.notesStyle.actions',
  decisions: 'ui.notesStyle.decisions',
  minutes: 'ui.notesStyle.minutes'
}

function styleFromStorage(meetingId: string): NotesStyle {
  try {
    const stored = window.localStorage.getItem(`autodoc-notes-style:${meetingId}`)
    return NOTES_STYLE_OPTIONS.includes(stored as NotesStyle) ? (stored as NotesStyle) : 'full'
  } catch {
    return 'full'
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function earliestStartMs(item: NoteItem): number | null {
  if (item.sources.length === 0) return null
  return item.sources.reduce(
    (min, source) => Math.min(min, source.startMs),
    item.sources[0].startMs
  )
}

function ItemMeta({
  item,
  onSeek
}: {
  item: NoteItem
  onSeek: (startMs: number) => void
}): ReactElement | null {
  const startMs = earliestStartMs(item)
  const owner = item.owner?.trim()
  const deadline = item.deadline?.trim()
  if (startMs == null && !owner && !deadline) return null
  return (
    <span className="ml-1.5 text-[11.5px] text-ink-muted">
      {startMs != null ? (
        <button type="button" className="font-mono hover:underline" onClick={() => onSeek(startMs)}>
          {formatClock(startMs)}
        </button>
      ) : null}
      {owner ? <span className="ml-1.5">({owner})</span> : null}
      {deadline ? <span className="ml-1.5">· {deadline}</span> : null}
    </span>
  )
}

function ItemList({
  items,
  onSeek,
  showCheckbox
}: {
  items: readonly NoteItem[]
  onSeek: (startMs: number) => void
  showCheckbox?: boolean
}): ReactElement {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="text-[13px] text-ink leading-relaxed">
          {showCheckbox ? (
            <span className="mr-1.5 inline-block">{item.completed ? '☑' : '☐'}</span>
          ) : (
            <span className="mr-1.5 inline-block text-ink-faint">•</span>
          )}
          {item.title ? <strong className="font-semibold">{item.title}: </strong> : null}
          {renderNoteMarkup(item.text)}
          <ItemMeta item={item} onSeek={onSeek} />
        </li>
      ))}
    </ul>
  )
}

function StyleSection({
  heading,
  items,
  onSeek,
  showCheckbox
}: {
  heading: string
  items: readonly NoteItem[]
  onSeek: (startMs: number) => void
  showCheckbox?: boolean
}): ReactElement | null {
  if (items.length === 0) return null
  return (
    <section className={`${NOTES_COLUMN} border-t border-border pt-4`}>
      <h3 className="mb-2 text-[17px] font-semibold text-ink">{heading}</h3>
      <ItemList items={items} onSeek={onSeek} showCheckbox={showCheckbox} />
    </section>
  )
}

interface MinutesEntry {
  id: string
  label: string
  startMs: number | null
  item: NoteItem
}

function minutesEntries(notes: MeetingNotesV2, t: ReturnType<typeof useT>): MinutesEntry[] {
  const entries: MinutesEntry[] = []
  for (const item of notes.keyTakeaways) {
    entries.push({
      id: `takeaway:${item.id}`,
      label: t('ui.keyTakeaways'),
      startMs: earliestStartMs(item),
      item
    })
  }
  for (const section of notes.sections) {
    for (const item of section.keyPoints) {
      entries.push({
        id: `point:${item.id}`,
        label: section.title,
        startMs: earliestStartMs(item),
        item
      })
    }
    for (const item of section.supportingDetails) {
      entries.push({
        id: `detail:${item.id}`,
        label: section.title,
        startMs: earliestStartMs(item),
        item
      })
    }
  }
  for (const item of notes.decisions) {
    entries.push({
      id: `decision:${item.id}`,
      label: t('segment.decision'),
      startMs: earliestStartMs(item),
      item
    })
  }
  for (const item of notes.nextSteps) {
    entries.push({
      id: `step:${item.id}`,
      label: t('segment.action_item'),
      startMs: earliestStartMs(item),
      item
    })
  }
  return entries.sort(
    (a, b) => (a.startMs ?? Number.MAX_SAFE_INTEGER) - (b.startMs ?? Number.MAX_SAFE_INTEGER)
  )
}

export function NotesStyleDocument({
  notes,
  title,
  meetingSpan,
  onSeek,
  onWrite
}: {
  notes: MeetingNotesV2
  title: string | undefined
  meetingSpan: readonly NoteSourceRange[]
  onSeek: (startMs: number) => void
  onWrite: (content: MeetingNotesContent) => void
}): ReactElement {
  const t = useT()
  const [style, setStyle] = useState<NotesStyle>(() => styleFromStorage(notes.meetingId))

  useEffect(() => {
    try {
      window.localStorage.setItem(`autodoc-notes-style:${notes.meetingId}`, style)
    } catch {
      // The style is a cosmetic preference; failing to persist it is harmless.
    }
  }, [notes.meetingId, style])

  const overview = notes.overview?.text.trim()
  const minutes = minutesEntries(notes, t)

  return (
    <>
      <div className={NOTES_COLUMN}>
        <label htmlFor="notes-style-select" className="sr-only">
          {t('ui.notesStyle')}
        </label>
        <select
          id="notes-style-select"
          value={style}
          onChange={(event) => setStyle(event.target.value as NotesStyle)}
          className="mb-2 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-[12px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          {NOTES_STYLE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(NOTES_STYLE_LABELS[option])}
            </option>
          ))}
        </select>
      </div>

      {style === 'full' ? (
        <NotesV2Document
          notes={notes}
          title={title}
          meetingSpan={meetingSpan}
          onSeek={onSeek}
          onWrite={onWrite}
        />
      ) : style === 'summary' ? (
        <>
          {overview ? (
            <section className={`${NOTES_COLUMN} border-t border-border pt-4`}>
              <h3 className="mb-2 text-[17px] font-semibold text-ink">{t('ui.summary')}</h3>
              <p className="text-[13px] text-ink leading-relaxed">{renderNoteMarkup(overview)}</p>
            </section>
          ) : null}
          <StyleSection heading={t('segment.decision')} items={notes.decisions} onSeek={onSeek} />
          <StyleSection
            heading={t('segment.action_item')}
            items={notes.nextSteps}
            onSeek={onSeek}
            showCheckbox
          />
          {!overview && notes.decisions.length === 0 && notes.nextSteps.length === 0 ? (
            <p className={`${NOTES_COLUMN} text-[13px] text-ink-muted`}>
              {t('ui.notesStyleEmpty')}
            </p>
          ) : null}
        </>
      ) : style === 'actions' ? (
        <StyleSection
          heading={t('segment.action_item')}
          items={notes.nextSteps}
          onSeek={onSeek}
          showCheckbox
        />
      ) : style === 'decisions' ? (
        <StyleSection heading={t('segment.decision')} items={notes.decisions} onSeek={onSeek} />
      ) : (
        <section className={`${NOTES_COLUMN} border-t border-border pt-4`}>
          <h3 className="mb-2 text-[17px] font-semibold text-ink">{t('ui.notesStyle.minutes')}</h3>
          {minutes.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{t('ui.notesStyleEmpty')}</p>
          ) : (
            <ol className="space-y-2">
              {minutes.map((entry) => (
                <li key={entry.id} className="text-[13px] text-ink leading-relaxed">
                  {entry.startMs != null ? (
                    <button
                      type="button"
                      className="mr-1.5 font-mono text-[11.5px] text-ink-muted hover:underline"
                      onClick={() => onSeek(entry.startMs as number)}
                    >
                      {formatClock(entry.startMs)}
                    </button>
                  ) : null}
                  <span className="mr-1.5 text-[11.5px] font-semibold text-ink-muted">
                    {entry.label}
                  </span>
                  {renderNoteMarkup(entry.item.text)}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </>
  )
}
