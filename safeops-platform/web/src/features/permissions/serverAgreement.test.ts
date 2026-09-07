import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { capabilitiesOf, type Capability } from './permissions'
import { ROLE_LABEL, type Role } from '@/api/types'

/** Every role the product ships, read through the same map the UI labels them with. */
const ROLES = Object.keys(ROLE_LABEL) as Role[]

/**
 * The navigation and the API must agree about what a role may do.
 *
 * Permissions are declared twice on purpose - a capability matrix decides what the browser
 * shows, and each service decides what it will actually do - and that is right: hiding a
 * nav item is not a permission, and the server has to refuse regardless of what the client
 * believes. What is not right is the two disagreeing, and with no test they have.
 *
 * The failure this exists to prevent has already happened once. The executive role held
 * four capabilities and could not open Incidents from the navigation, while the API
 * returned incidents to them perfectly happily: the product hid from somebody what they
 * were entitled to read, for months, and it took a person noticing to find it. The
 * opposite drift is just as bad and louder - a screen offered and then answered 403 on the
 * first click.
 *
 * So this reads the server's own role lists out of its source and compares them to the
 * matrix. Reading source is not elegant. The alternative is a third declaration for both
 * sides to derive from, which is the right end state and a refactor across twelve services;
 * this catches the drift today without one, and fails loudly rather than quietly if the
 * shape it parses ever changes.
 */
const API = resolve(process.cwd(), '../api/src/lib')

/**
 * Skipped, with a reason, when the API package is not beside this one - a web-only
 * checkout is a legitimate state. Never silently: a drift test that stops checking without
 * saying so is worse than no test, because it still reads as coverage.
 */
const hasApi = existsSync(API)
const d = hasApi ? describe : describe.skip

/**
 * Pulls `const NAME: Role[] = ['a', 'b']` out of a service.
 *
 * Throws when it finds nothing. A rename or a reformat on the server side must break this
 * test rather than turn it into one that passes by comparing against an empty list.
 */
function serverRoles(file: string, name: string): Role[] {
  const source = readFileSync(resolve(API, `${file}.ts`), 'utf8')
  const match = source.match(new RegExp(`const ${name}: Role\\[\\] = \\[([^\\]]*)\\]`))
  if (!match) {
    throw new Error(
      `Could not find ${name} in ${file}.ts. It was renamed or reformatted - update this `
      + 'test to match, rather than leaving it comparing against nothing.',
    )
  }
  const roles = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as Role)
  if (roles.length === 0) throw new Error(`${name} in ${file}.ts parsed as empty.`)
  return roles
}

/**
 * Roles the matrix grants a capability to.
 *
 * Read through `capabilitiesOf`, the function the application itself uses, rather than by
 * exporting the table for the test's benefit. A test that reaches past the public surface
 * can keep passing after that surface has stopped agreeing with what is behind it.
 */
function clientRoles(capability: Capability): Role[] {
  return ROLES.filter((r) => capabilitiesOf(r).includes(capability))
}

const sorted = (r: Role[]) => [...r].sort()

/**
 * The pairs where one screen and one server guard answer the same question.
 *
 * Deliberately only the unambiguous ones. Most reads are guarded by membership rather than
 * by role, and inventing a mapping for those would make this test assert a correspondence
 * the product does not actually claim - which is how a test starts failing for reasons
 * nobody can act on.
 */
const PAIRS: { capability: Capability; file: string; constant: string; what: string }[] = [
  {
    capability: 'reports:view',
    file: 'reportService',
    constant: 'REPORT_ROLES',
    what: 'running and scheduling reports',
  },
  {
    capability: 'incidents:manage',
    file: 'incidentService',
    constant: 'MANAGE_ROLES',
    what: 'moving an incident through its stages',
  },
  {
    capability: 'compliance:manage',
    file: 'auditService',
    constant: 'MANAGE_ROLES',
    what: 'planning and conducting audits',
  },
  {
    capability: 'visitors:view',
    file: 'visitorService',
    constant: 'GATE_ROLES',
    what: 'signing visitors through the gate',
  },
]

d('the navigation and the API agree about roles', () => {
  it.each(PAIRS)('$what', ({ capability, file, constant }) => {
    expect(sorted(clientRoles(capability))).toEqual(sorted(serverRoles(file, constant)))
  })

  it('declares the same set of roles on both sides', () => {
    // A role added to one side only is the cheapest possible version of this drift, and
    // the one most likely to happen while adding a role for a customer.
    const server = serverRoles('orgAdminService', 'ROLES')
    expect(sorted(ROLES)).toEqual(sorted(server))
  })

  it('gives every role a way in', () => {
    /*
     * Not a comparison, a floor. A role with no capabilities signs in to a shell with no
     * navigation and no way to do the one thing everybody must be able to do - say that
     * something unsafe happened.
     */
    for (const role of ROLES) {
      expect(capabilitiesOf(role), role).toContain('dashboard:view')
      expect(capabilitiesOf(role), role).toContain('reports:submit')
    }
  })

  it('fails loudly when the server has been reshaped', () => {
    // The guard on the guard. If this ever stops throwing, every assertion above is
    // comparing against nothing and passing for that reason.
    expect(() => serverRoles('reportService', 'NO_SUCH_CONSTANT')).toThrow(/Could not find/)
  })
})
