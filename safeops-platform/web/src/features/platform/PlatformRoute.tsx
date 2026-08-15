import { usePlatformAdmin } from './usePlatformAdmin'
import { PlatformForbidden, PlatformPage } from './PlatformPage'

/**
 * Chooses between the console and an explanation.
 *
 * Presentation only. Every call the console makes is re-authorized server-side against the
 * database, so rendering the page to somebody who is not staff would show them an empty
 * shell and a refusal rather than any customer's data - this simply says so politely
 * instead.
 */
export function PlatformRoute() {
  return usePlatformAdmin() ? <PlatformPage /> : <PlatformForbidden />
}
