import { useState } from 'react'
import { AtSign, MessageSquare, Send } from 'lucide-react'
import { api } from '@/api/client'
import { ApiError } from '@/api/types'
import type { Incident } from '@/api/incidents'
import { Alert, Avatar, Badge, Button, EmptyState } from '@/components/ui'
import { timeAgo } from '@/lib/time'
import { PEOPLE, useActor } from '../lib'

/** Internal HSE discussion: mentions notify the mentioned user. */
export function CommentsPanel({ incident, onUpdate }: { incident: Incident; onUpdate: (i: Incident) => void }) {
  const actor = useActor()
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mention = (name: string) => {
    if (!name) return
    if (!mentions.includes(name)) setMentions((m) => [...m, name])
    setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${name} `)
  }

  const post = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.addIncidentComment(incident.id, text, mentions.filter((m) => text.includes(`@${m}`)), actor)
      onUpdate(updated)
      setText('')
      setMentions([])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post comment.')
    } finally {
      setBusy(false)
    }
  }

  const renderText = (t: string, ms: string[]) => {
    if (ms.length === 0) return t
    const pattern = new RegExp(`@(${ms.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    const parts = t.split(pattern)
    return parts.map((part, i) =>
      ms.includes(part) ? (
        <span key={i} className="font-semibold text-accent">@{part}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    )
  }

  return (
    <div className="space-y-4">
      {incident.comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No discussion yet">
          Keep the investigation conversation here instead of WhatsApp — it stays with the case record.
        </EmptyState>
      ) : (
        <ul className="space-y-3.5">
          {incident.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author} size={30} />
              <div className="min-w-0 flex-1 rounded-xl border px-3.5 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-ink">{c.author}</span>
                  <span className="text-2xs text-muted">{timeAgo(c.at)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-ink-2">{renderText(c.text, c.mentions)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border p-3">
        {error && <Alert tone="critical" className="mb-2">{error}</Alert>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Add to the investigation discussion…"
          className="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <AtSign size={13} className="text-muted" />
            <select
              value=""
              onChange={(e) => mention(e.target.value)}
              className="rounded-lg border bg-surface px-2 py-1 text-2xs text-ink-2 outline-none"
              aria-label="Mention someone"
            >
              <option value="">Mention…</option>
              {PEOPLE.map((p) => <option key={p}>{p}</option>)}
            </select>
            {mentions.filter((m) => text.includes(`@${m}`)).map((m) => (
              <Badge key={m} tone="accent">@{m}</Badge>
            ))}
          </div>
          <Button size="sm" icon={<Send size={12} />} loading={busy} disabled={!text.trim()} onClick={() => void post()}>
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
