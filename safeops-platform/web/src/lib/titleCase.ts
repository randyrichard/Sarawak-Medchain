/**
 * Title Case, for the names on screen: menu items, page and dialog titles, card and section
 * headings, tabs, buttons, table headings and the figures on Home. Sentences - descriptions,
 * hints, messages, checklist items, form field labels - stay sentences.
 *
 * Every word starts with a capital except the small joining words (a, the, and, of, to...)
 * inside a name: "Report a Near Miss", "Permits to Work", "Day-to-Day". The first and last
 * words are always capitalised ("Sign In"), as is the first word after a colon, a dash or an
 * opening bracket. Words with a capital inside them already (HSE, SafeChain, iPhone) keep it.
 *
 * `atStart`/`atEnd` say whether the text begins or ends the name, for the pieces of a label
 * that runs either side of a value: in "Assign to {name}" the "to" is not the last word.
 */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs'])
const WORD = /[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ'’]*/g
/** Verbs whose "in" or "on" belongs to them: Checked In Today, Turn On Alerts, Sign In. */
const PHRASAL = /^(check|checks|checked|checking|log|logs|logged|logging|sign|signs|signed|signing|turn|turns|turned|turning|switch|switched|fill|filled|hand|handed|opt|opted|plug|plugged|carry|carried)$/i
/** A break after which the next word starts afresh, as at the start of a name. */
const BREAK = /[:(—–]|\s-\s/

export function titleCase(text: string, { atStart = true, atEnd = true } = {}): string {
  const words = [...text.matchAll(WORD)]
  return text.replace(WORD, (word, offset: number) => {
    const i = words.findIndex((m) => m.index === offset)
    const before = i === 0 ? text.slice(0, offset) : text.slice(words[i - 1].index! + words[i - 1][0].length, offset)
    const after = i === words.length - 1 ? text.slice(offset + word.length) : text.slice(offset + word.length, words[i + 1].index)
    const first = (i === 0 && atStart) || BREAK.test(before)
    const last = (i === words.length - 1 && atEnd) || /^\s*[:—–]/.test(after)
    // Acronyms and names that carry their own capitals: HSE, PPE, SafeChain, iPhone.
    if (/[A-Z]/.test(word.slice(1))) return word
    // In a hyphenated word only the middle is small: On-Time, Day-to-Day, Check-In.
    const inCompound = text[offset - 1] === '-' && text[offset + word.length] === '-'
    const opensOrEndsCompound = !inCompound && (text[offset - 1] === '-' || text[offset + word.length] === '-')
    // "in"/"on" finishing a phrasal verb, or opening "in and out", is an adverb, not a joiner.
    const particle = /^(in|on)$/i.test(word) && (PHRASAL.test(words[i - 1]?.[0] ?? '')
      || (/^and$/i.test(words[i + 1]?.[0] ?? '') && /^(out|off)$/i.test(words[i + 2]?.[0] ?? '')))
    if (!first && !last && !opensOrEndsCompound && !particle && SMALL.has(word.toLowerCase())) return word.toLowerCase()
    return word[0].toUpperCase() + word.slice(1)
  })
}
