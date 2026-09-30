/**
 * The offline demo's stateful stores, as one lazily loaded module.
 *
 * These stores - and the seed data behind them, about 170 KB of source - only ever serve
 * the credential-free demo, which runs when no API is configured. They used to be imported
 * and constructed by MockApiClient unconditionally, so every production visitor
 * downloaded and parsed them, built every seed incident, asset, audit and training record
 * at startup, and had the result written into their browser's storage. client.ts now
 * imports this module on first use in demo mode, so a production build never loads it.
 */
import { IncidentStore } from './incidents'
import { AdminStore } from './admin'
import { PermitStore } from './permits'

export { buildDashboard } from './dashboard'

type Notify = ConstructorParameters<typeof IncidentStore>[0]

export interface DemoStores {
  incidents: IncidentStore
  admin: AdminStore
  permits: PermitStore
}

export function createDemoStores(notify: Notify): DemoStores {
  return {
    incidents: new IncidentStore(notify),
    admin: new AdminStore(notify),
    permits: new PermitStore(notify),
  }
}
