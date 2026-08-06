// ─── Inspection catalogue ────────────────────────────────────────────────────
// The checklist for each asset category and the interval each category is inspected on.
//
// This is the authoritative copy; `web/src/api/mock/assets.ts` carries the same lists so
// the runner can render the form before a round trip. The server re-checks the answers
// against the list below, so a client that submits a short or invented checklist is
// rejected rather than recorded as a completed inspection.
//
// Plain "CO2"/"°C" style notation is avoided in stored text for the same reason as the
// permit catalogue: a cluster initialised under a Windows locale is WIN1252.

import type { AssetCategory, InspectionFrequency } from '@prisma/client'

export const ASSET_CATEGORIES = [
  'fire_extinguisher', 'forklift', 'ladder', 'scaffolding', 'machinery', 'electrical_panel',
  'emergency_lighting', 'first_aid_kit', 'ppe', 'vehicle', 'pressure_vessel',
  // Lifting gear, breathing apparatus and measuring instruments. Added when equipment
  // became a permit prerequisite: these are the categories a permit actually names.
  'crane', 'chain_block', 'lifting_sling', 'harness', 'gas_detector', 'scba',
  'pressure_gauge', 'electrical_tool', 'generator', 'compressor',
  'custom',
] as const satisfies readonly AssetCategory[]

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  fire_extinguisher: 'Fire Extinguisher',
  forklift: 'Forklift',
  ladder: 'Ladder',
  scaffolding: 'Scaffolding',
  machinery: 'Machinery',
  electrical_panel: 'Electrical Panel',
  emergency_lighting: 'Emergency Lighting',
  first_aid_kit: 'First Aid Kit',
  ppe: 'PPE Inventory',
  vehicle: 'Vehicle',
  pressure_vessel: 'Pressure Vessel',
  crane: 'Crane',
  chain_block: 'Chain Block',
  lifting_sling: 'Lifting Sling',
  harness: 'Fall Arrest Harness',
  gas_detector: 'Gas Detector',
  scba: 'SCBA Set',
  pressure_gauge: 'Pressure Gauge',
  electrical_tool: 'Electrical Test Tool',
  generator: 'Generator',
  compressor: 'Air Compressor',
  custom: 'Custom Asset',
}

/** How often each frequency falls due, in days. */
export const FREQUENCY_DAYS: Record<InspectionFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  annual: 365,
}

export interface ChecklistItem {
  id: string
  label: string
  /** Optional measurement prompt, e.g. "Tread depth (mm)". */
  measure?: string
}

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
    { id: 'ep2', label: 'No signs of overheating or discolouration', measure: 'Thermal scan max (deg C)' },
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
  crane: [
    { id: 'cr1', label: 'Load chart legible and matches configuration' },
    { id: 'cr2', label: 'Hook, latch and swivel free of deformation' },
    { id: 'cr3', label: 'Wire rope free of broken wires, kinks and birdcaging' },
    { id: 'cr4', label: 'Limit switches and overload cut-out functional' },
    { id: 'cr5', label: 'Outriggers, pads and level indicator serviceable' },
    { id: 'cr6', label: 'Brakes and slew lock hold under load' },
    { id: 'cr7', label: 'Statutory load test certificate within date' },
    { id: 'cr8', label: 'Safe working load marked and correct', measure: 'SWL (tonnes)' },
  ],
  chain_block: [
    { id: 'cb1', label: 'Chain free of stretch, nicks, gouges and twist' },
    { id: 'cb2', label: 'Top and bottom hooks undeformed, latches close' },
    { id: 'cb3', label: 'Brake holds the load without creep' },
    { id: 'cb4', label: 'Body and covers secure, no cracks' },
    { id: 'cb5', label: 'SWL tag legible', measure: 'SWL (tonnes)' },
    { id: 'cb6', label: 'Colour code for the current period present' },
  ],
  lifting_sling: [
    { id: 'ls1', label: 'No cuts, abrasion, fraying or heat damage' },
    { id: 'ls2', label: 'Stitching intact, no pulled or broken threads' },
    { id: 'ls3', label: 'Eyes and end fittings undamaged' },
    { id: 'ls4', label: 'Identification tag legible and attached' },
    { id: 'ls5', label: 'No chemical staining or UV degradation' },
    { id: 'ls6', label: 'SWL and length marked', measure: 'SWL (tonnes)' },
  ],
  harness: [
    { id: 'hn1', label: 'Webbing free of cuts, burns, fraying and chemical damage' },
    { id: 'hn2', label: 'Stitching complete at all load-bearing points' },
    { id: 'hn3', label: 'D-rings undeformed and free of corrosion' },
    { id: 'hn4', label: 'Buckles and adjusters operate and lock' },
    { id: 'hn5', label: 'Fall indicator not deployed' },
    { id: 'hn6', label: 'Label legible with date of manufacture' },
    { id: 'hn7', label: 'Within manufacturer life from date of manufacture' },
  ],
  gas_detector: [
    { id: 'gd1', label: 'Bump test passed against certified gas' },
    { id: 'gd2', label: 'Calibration certificate current' },
    { id: 'gd3', label: 'Sensors respond on all channels' },
    { id: 'gd4', label: 'Audible, visual and vibrating alarms functional' },
    { id: 'gd5', label: 'Battery charged and runtime adequate for the shift' },
    { id: 'gd6', label: 'Pump, hose and probe free of leaks and blockage' },
    { id: 'gd7', label: 'Filter clean and unobstructed' },
  ],
  scba: [
    { id: 'sc1', label: 'Cylinder at full charge', measure: 'Pressure (bar)' },
    { id: 'sc2', label: 'Cylinder within hydrostatic test date' },
    { id: 'sc3', label: 'Face mask seal, visor and straps serviceable' },
    { id: 'sc4', label: 'Demand valve delivers and shuts off correctly' },
    { id: 'sc5', label: 'Low-pressure warning whistle sounds at set point' },
    { id: 'sc6', label: 'Harness, backplate and cylinder strap secure' },
    { id: 'sc7', label: 'No leakage on positive pressure test' },
  ],
  pressure_gauge: [
    { id: 'pg1', label: 'Calibration certificate current' },
    { id: 'pg2', label: 'Needle returns to zero when vented' },
    { id: 'pg3', label: 'Dial and glass intact and legible' },
    { id: 'pg4', label: 'Case, threads and connection undamaged' },
    { id: 'pg5', label: 'Range appropriate for the service', measure: 'Range (bar)' },
  ],
  electrical_tool: [
    { id: 'et1', label: 'Calibration certificate current' },
    { id: 'et2', label: 'Leads, probes and clips free of damage' },
    { id: 'et3', label: 'Fused probes fitted and of the correct rating' },
    { id: 'et4', label: 'Category rating suitable for the circuit' },
    { id: 'et5', label: 'Self-test and proving unit check passed' },
    { id: 'et6', label: 'Case and battery compartment secure' },
  ],
  generator: [
    { id: 'gn1', label: 'Fuel and oil levels correct, no leaks' },
    { id: 'gn2', label: 'Earth connection and bonding in place' },
    { id: 'gn3', label: 'RCD trips within time on test' },
    { id: 'gn4', label: 'Outlets, sockets and covers undamaged' },
    { id: 'gn5', label: 'Exhaust intact and routed away from occupied areas' },
    { id: 'gn6', label: 'Guards fitted and emergency stop functional' },
    { id: 'gn7', label: 'Output voltage within tolerance', measure: 'Voltage (V)' },
  ],
  compressor: [
    { id: 'cp1', label: 'Pressure relief valve tested and sealed' },
    { id: 'cp2', label: 'Receiver within statutory examination date' },
    { id: 'cp3', label: 'Hoses, couplings and whip checks serviceable' },
    { id: 'cp4', label: 'Gauges legible and reading correctly' },
    { id: 'cp5', label: 'Guards over belts and moving parts secure' },
    { id: 'cp6', label: 'Condensate drained, no oil carry-over' },
    { id: 'cp7', label: 'Working pressure within rating', measure: 'Pressure (bar)' },
  ],
  custom: [
    { id: 'cu1', label: 'Asset condition acceptable' },
    { id: 'cu2', label: 'Safety devices functional' },
    { id: 'cu3', label: 'Documentation current' },
    { id: 'cu4', label: 'Area around asset safe' },
  ],
}

/** Days a defect action gets before it falls due. */
export const DEFECT_DUE_DAYS = 7
