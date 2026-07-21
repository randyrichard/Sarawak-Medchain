// ─── Checklist templates + asset/inspection seeds ────────────────────────────

import type { Asset, AssetCategory, ChecklistItem, Inspection } from '../assets'
import { FREQUENCY_DAYS } from '../assets'

export const CHECKLISTS: Record<AssetCategory, ChecklistItem[]> = {
  fire_extinguisher: [
    { id: 'fe1', label: 'Pressure gauge needle in green zone' },
    { id: 'fe2', label: 'Safety pin and tamper seal intact' },
    { id: 'fe3', label: 'Hose and nozzle free of cracks or blockage' },
    { id: 'fe4', label: 'Body free of corrosion, dents or leakage' },
    { id: 'fe5', label: 'Service tag present and within date' },
    { id: 'fe6', label: 'Access unobstructed and signage visible' },
  ],
  forklift: [
    { id: 'fl1', label: 'Brakes, steering and horn functional' },
    { id: 'fl2', label: 'Forks free of cracks and bends' },
    { id: 'fl3', label: 'Hydraulics — no leaks, smooth lift/tilt' },
    { id: 'fl4', label: 'Tyres serviceable', measure: 'Tread depth (mm)' },
    { id: 'fl5', label: 'Seatbelt and overhead guard secure' },
    { id: 'fl6', label: 'Lights, beacon and reverse alarm working' },
    { id: 'fl7', label: 'Battery/LPG system secure, no damage' },
  ],
  ladder: [
    { id: 'ld1', label: 'Stiles free of cracks, bends and corrosion' },
    { id: 'ld2', label: 'Rungs secure, clean and undamaged' },
    { id: 'ld3', label: 'Anti-slip feet present and serviceable' },
    { id: 'ld4', label: 'Locking mechanisms operate correctly' },
    { id: 'ld5', label: 'ID and inspection tag legible' },
  ],
  scaffolding: [
    { id: 'sc1', label: 'Base plates and sole boards sound' },
    { id: 'sc2', label: 'Standards plumb, ledgers level' },
    { id: 'sc3', label: 'Bracing complete per design' },
    { id: 'sc4', label: 'Boards free of splits; no gaps > 25mm' },
    { id: 'sc5', label: 'Guardrails and toe boards complete' },
    { id: 'sc6', label: 'Ties secure at specified spacing' },
    { id: 'sc7', label: 'Green tag current and displayed' },
  ],
  machinery: [
    { id: 'mc1', label: 'Guards fitted and interlocks functional' },
    { id: 'mc2', label: 'Emergency stops accessible and working' },
    { id: 'mc3', label: 'No abnormal noise, vibration or leaks' },
    { id: 'mc4', label: 'Lubrication points serviced', measure: 'Hours run' },
    { id: 'mc5', label: 'Electrical connections secure, no damage' },
    { id: 'mc6', label: 'Housekeeping — area clear of debris' },
  ],
  electrical_panel: [
    { id: 'ep1', label: 'Panel door closes and locks; labels legible' },
    { id: 'ep2', label: 'No signs of overheating or discolouration', measure: 'Thermal scan max (°C)' },
    { id: 'ep3', label: 'No exposed conductors; glands intact' },
    { id: 'ep4', label: 'Clearance zone (1m) unobstructed' },
    { id: 'ep5', label: 'Rubber mat present and serviceable' },
  ],
  emergency_lighting: [
    { id: 'el1', label: 'All luminaires illuminate on test' },
    { id: 'el2', label: 'Battery duration test passed', measure: 'Duration (min)' },
    { id: 'el3', label: 'Charge indicators lit' },
    { id: 'el4', label: 'Fittings clean, secure and undamaged' },
    { id: 'el5', label: 'Exit routes fully covered' },
  ],
  first_aid_kit: [
    { id: 'fa1', label: 'Contents complete per contents list' },
    { id: 'fa2', label: 'No expired items' },
    { id: 'fa3', label: 'Kit sealed, clean and accessible' },
    { id: 'fa4', label: 'Signage visible; register up to date' },
  ],
  ppe: [
    { id: 'pp1', label: 'Stock levels meet minimum per register' },
    { id: 'pp2', label: 'No expired or damaged items in circulation' },
    { id: 'pp3', label: 'Harnesses: stitching, webbing, hardware sound' },
    { id: 'pp4', label: 'Storage clean, dry and organised' },
  ],
  vehicle: [
    { id: 'vh1', label: 'Tyres, lights and wipers serviceable', measure: 'Tread depth (mm)' },
    { id: 'vh2', label: 'Brakes and handbrake effective' },
    { id: 'vh3', label: 'Seatbelts functional, cabin secure' },
    { id: 'vh4', label: 'First aid kit and extinguisher on board' },
    { id: 'vh5', label: 'Road tax / permit current' },
  ],
  pressure_vessel: [
    { id: 'pv1', label: 'PMA certificate current and displayed' },
    { id: 'pv2', label: 'Safety valve within test date' },
    { id: 'pv3', label: 'Gauge functional', measure: 'Working pressure (bar)' },
    { id: 'pv4', label: 'No corrosion, leaks or vibration at mounts' },
    { id: 'pv5', label: 'Drain operated; moisture cleared' },
  ],
  custom: [
    { id: 'cu1', label: 'Asset condition acceptable' },
    { id: 'cu2', label: 'Safety devices functional' },
    { id: 'cu3', label: 'Documentation current' },
    { id: 'cu4', label: 'Area around asset safe' },
  ],
}

const day = 86400_000
const dISO = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10)
const tISO = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()

let seedIdx = 0
const sid = () => `seed${(++seedIdx).toString(36)}`

export function buildAssetSeeds(): Asset[] {
  const mk = (a: Omit<Asset, 'id' | 'qrKey' | 'documents'> & { documents?: Asset['documents'] }): Asset => ({
    ...a,
    id: a.code.toLowerCase(),
    qrKey: a.code,
    documents: a.documents ?? [],
  })
  return [
    mk({
      code: 'AST-1001', name: 'CO₂ Extinguisher — Dock 2 pillar', category: 'fire_extinguisher',
      serialNumber: 'FE-CO2-8841', manufacturer: 'Eversafe', model: 'ECS-5',
      companyId: 'big', siteId: 'sen', department: 'Warehouse', owner: 'Grace Lim',
      location: 'Dock 2, pillar D2-04', status: 'In Service', frequency: 'monthly',
      commissionDate: '2024-03-12', warrantyUntil: '2029-03-12',
      lastInspectedAt: tISO(-18), nextDueDate: dISO(12),
    }),
    mk({
      code: 'AST-1002', name: 'Reach truck RT-07', category: 'forklift',
      serialNumber: 'RT07-2211-MY', manufacturer: 'Toyota', model: 'BT Reflex RRE160',
      companyId: 'big', siteId: 'sen', department: 'Warehouse', owner: 'Grace Lim',
      location: 'Charging bay 3', status: 'In Service', frequency: 'weekly',
      commissionDate: '2022-11-02', lastInspectedAt: tISO(-10), nextDueDate: dISO(-3),
      documents: [{ id: sid(), name: 'RT-07 service manual.pdf', kind: 'pdf' }],
    }),
    mk({
      code: 'AST-1003', name: 'Extension ladder 6m — Maint. store', category: 'ladder',
      serialNumber: 'LDR-6M-114', manufacturer: 'Werner', model: 'D1224-2',
      companyId: 'big', siteId: 'kch', department: 'Maintenance', owner: 'Ganesh Pillai',
      location: 'Maintenance store, rack L2', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-28), nextDueDate: dISO(2),
    }),
    mk({
      code: 'AST-1004', name: 'Scaffold — Module M-04 L12', category: 'scaffolding',
      serialNumber: 'SCF-M04-12', manufacturer: 'Layher', model: 'Allround',
      companyId: 'big', siteId: 'mri', department: 'Contractors', owner: 'Vincent Chai',
      location: 'Module M-04, level 12', status: 'In Service', frequency: 'weekly',
      lastInspectedAt: tISO(-8), nextDueDate: dISO(-1),
    }),
    mk({
      code: 'AST-1005', name: 'Conveyor line 2 drive unit', category: 'machinery',
      serialNumber: 'CNV-L2-DRV', manufacturer: 'SEW-Eurodrive', model: 'K87 DRN132',
      companyId: 'big', siteId: 'kch', department: 'Production', owner: 'Sarah Wong',
      location: 'Line 2, drive end', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-12), nextDueDate: dISO(18),
    }),
    mk({
      code: 'AST-1006', name: 'MCC Panel B — compressor house', category: 'electrical_panel',
      serialNumber: 'MCC-B-0442', manufacturer: 'Schneider', model: 'BlokSeT',
      companyId: 'big', siteId: 'btu', department: 'Maintenance', owner: 'Faizal Omar',
      location: 'Compressor house, bay 2', status: 'In Service', frequency: 'quarterly',
      lastInspectedAt: tISO(-40), nextDueDate: dISO(51),
      documents: [{ id: sid(), name: 'Thermal survey 2026-05.pdf', kind: 'pdf' }],
    }),
    mk({
      code: 'AST-1007', name: 'Emergency lighting loop — SRU', category: 'emergency_lighting',
      serialNumber: 'EML-SRU-01', manufacturer: 'Legrand', model: 'URA34',
      companyId: 'big', siteId: 'btu', department: 'HSE', owner: 'Amirul Hassan',
      location: 'Sulfur recovery unit, all levels', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-36), nextDueDate: dISO(-5),
    }),
    mk({
      code: 'AST-1008', name: 'First aid kit — Mill control room', category: 'first_aid_kit',
      serialNumber: 'FAK-MILL-3', manufacturer: 'St John', model: 'Workplace B',
      companyId: 'big', siteId: 'twu', department: 'Mill', owner: 'Dayang Nurul',
      location: 'Mill control room', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-22), nextDueDate: dISO(6),
    }),
    mk({
      code: 'AST-1009', name: 'Fall-arrest harness inventory', category: 'ppe',
      serialNumber: 'PPE-HAR-SET', manufacturer: 'Petzl', model: 'AVAO BOD (x24)',
      companyId: 'big', siteId: 'mri', department: 'Contractors', owner: 'Vincent Chai',
      location: 'PPE store, cage 2', status: 'In Service', frequency: 'quarterly',
      lastInspectedAt: tISO(-70), nextDueDate: dISO(20),
    }),
    mk({
      code: 'AST-1010', name: 'Standby diesel genset 500kVA', category: 'machinery',
      serialNumber: 'GEN-500-TWU', manufacturer: 'Cummins', model: 'C500D5',
      companyId: 'big', siteId: 'twu', department: 'Mill', owner: 'Dayang Nurul',
      location: 'Genset house', status: 'Under Maintenance', frequency: 'monthly',
      lastInspectedAt: tISO(-4), nextDueDate: dISO(26),
      documents: [{ id: sid(), name: 'Load bank test 2026-02.pdf', kind: 'pdf' }],
    }),
    mk({
      code: 'AST-1011', name: 'Hilux crew cab — QSK 8812', category: 'vehicle',
      serialNumber: 'QSK8812', manufacturer: 'Toyota', model: 'Hilux 2.8G',
      companyId: 'big', siteId: 'sbu', department: 'Logistics', owner: 'Grace Lim',
      location: 'Depot parking A', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-14), nextDueDate: dISO(16),
    }),
    mk({
      code: 'AST-1012', name: 'Air receiver AR-2 (statutory)', category: 'pressure_vessel',
      serialNumber: 'AR2-KCH-1998', manufacturer: 'Atlas Copco', model: 'LV-3000',
      companyId: 'big', siteId: 'kch', department: 'Maintenance', owner: 'Ganesh Pillai',
      location: 'Compressor room', status: 'In Service', frequency: 'annual',
      lastInspectedAt: tISO(-325), nextDueDate: dISO(40),
      documents: [
        { id: sid(), name: 'PMA certificate PMT-4/2026.pdf', kind: 'certificate' },
        { id: sid(), name: 'Hydro test report.pdf', kind: 'pdf' },
      ],
    }),
    mk({
      code: 'AST-K101', name: 'Tower scaffold — Zone B lift shaft', category: 'scaffolding',
      serialNumber: 'TWR-B-07', manufacturer: 'PERI', model: 'PERI UP',
      companyId: 'kcs', siteId: 'pjy', department: 'Civil Works', owner: 'Azlan Mahmud',
      location: 'Zone B lift shaft', status: 'In Service', frequency: 'weekly',
      lastInspectedAt: tISO(-9), nextDueDate: dISO(-2),
    }),
    mk({
      code: 'AST-K102', name: 'Site genset 250kVA', category: 'machinery',
      serialNumber: 'GEN-250-SMH', manufacturer: 'Denyo', model: 'DCA-220',
      companyId: 'kcs', siteId: 'smh', department: 'M&E Installation', owner: 'Lau Tze Ming',
      location: 'Laydown east', status: 'In Service', frequency: 'monthly',
      lastInspectedAt: tISO(-11), nextDueDate: dISO(19),
    }),
  ]
}

/** History + upcoming schedule. One seeded FAILED inspection (genset) with
 *  two defects that exist as corrective actions (see standalone seeds). */
export function buildInspectionSeeds(assets: Asset[]): Inspection[] {
  const list: Inspection[] = []
  let n = 2050

  const passAnswers = (cat: AssetCategory) =>
    CHECKLISTS[cat].map((c) => ({ itemId: c.id, label: c.label, result: 'pass' as const }))

  // history: one passed inspection per asset (at lastInspectedAt)
  for (const a of assets) {
    if (!a.lastInspectedAt) continue
    if (a.code === 'AST-1010') continue // gets a failed record below
    list.push({
      id: `ins-${n}`, code: `INS-${n++}`, assetId: a.id, companyId: a.companyId, siteId: a.siteId,
      scheduledFor: a.lastInspectedAt.slice(0, 10), assignedTo: a.owner, status: 'Completed',
      completedAt: a.lastInspectedAt, completedBy: a.owner, outcome: 'passed',
      answers: passAnswers(a.category), photoCount: 1, signature: a.owner, actionIds: [],
    })
  }

  // the failed genset inspection → 2 defects, actions sa-insp-1/2
  const gen = assets.find((a) => a.code === 'AST-1010')!
  list.push({
    id: 'ins-2043', code: 'INS-2043', assetId: gen.id, companyId: 'big', siteId: 'twu',
    scheduledFor: dISO(-4), assignedTo: 'Dayang Nurul', status: 'Completed',
    completedAt: tISO(-4), completedBy: 'Dayang Nurul', outcome: 'failed',
    answers: CHECKLISTS.machinery.map((c) => {
      if (c.id === 'mc3') return { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Coolant hose perished at radiator end — weeping under load.' }
      if (c.id === 'mc5') return { itemId: c.id, label: c.label, result: 'fail' as const, comment: 'Battery terminals heavily corroded; starter cranking slow.' }
      if (c.id === 'mc4') return { itemId: c.id, label: c.label, result: 'pass' as const, measurement: '1,240 h' }
      return { itemId: c.id, label: c.label, result: 'pass' as const }
    }),
    comments: 'Set to Under Maintenance pending hose replacement. Monthly load test deferred.',
    photoCount: 3, gps: '4.2448° N, 117.8911° E', signature: 'Dayang Nurul',
    actionIds: ['sa-insp-1', 'sa-insp-2'],
  })

  // upcoming: one scheduled inspection per asset at its nextDueDate
  for (const a of assets) {
    list.push({
      id: `ins-${n}`, code: `INS-${n++}`, assetId: a.id, companyId: a.companyId, siteId: a.siteId,
      scheduledFor: a.nextDueDate, assignedTo: a.owner, status: 'Scheduled', actionIds: [],
    })
  }

  return list
}

export { FREQUENCY_DAYS }
