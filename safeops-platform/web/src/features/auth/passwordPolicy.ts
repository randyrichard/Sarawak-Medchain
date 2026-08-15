/**
 * The password rules, mirrored from the server so a user is told before a round trip
 * rather than after.
 *
 * One copy. It was written out separately on the reset screen and the invitation screen,
 * and a third was about to appear on the forced-change screen — at which point a policy
 * change lands in one or two of them and the others quietly disagree with the server.
 */
export function policyProblem(pw: string): string | null {
  if (pw.length < 12) return 'At least 12 characters.'
  if (!/[a-z]/.test(pw)) return 'Include a lowercase letter.'
  if (!/[A-Z]/.test(pw)) return 'Include an uppercase letter.'
  if (!/[0-9]/.test(pw)) return 'Include a number.'
  return null
}
