/**
 * Breaking long strings into short groups - Miller's law.
 *
 * Working memory holds a handful of chunks, not a long run of characters. Twelve digits read
 * as one string are twelve things to hold while comparing them against a card or typing
 * them into an app; the same twelve as 900101-13-5678 are three. This is why phone numbers,
 * card numbers and authenticator keys are always printed in groups, and why anything
 * SafeOps asks a person to read, compare or retype should be too.
 *
 * Display only. What is stored, searched and matched is the original value, so a blacklist
 * check never depends on how a number happened to be typed.
 */

/** "JBSWY3DPEHPK3PXP" -> "JBSW Y3DP EHPK 3PXP". */
export function chunk(value: string, size = 4, separator = ' '): string {
  const compact = value.replace(/\s+/g, '')
  if (size < 1 || compact.length <= size) return compact
  return compact.match(new RegExp(`.{1,${size}}`, 'g'))!.join(separator)
}

/**
 * A Malaysian IC (MyKad) number in its printed form, YYMMDD-PB-###G: date of birth, place
 * of birth, serial. Anything else - a passport, a foreign ID - is returned as entered,
 * because guessing at its structure would print it wrongly.
 */
export function formatIdNumber(value: string | null | undefined): string {
  if (!value) return ''
  const digits = value.replace(/[\s-]/g, '')
  if (/^\d{12}$/.test(digits)) return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`
  return value.trim()
}
