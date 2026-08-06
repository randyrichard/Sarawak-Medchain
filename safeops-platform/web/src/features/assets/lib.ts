import {
  Car, FireExtinguisher, Forklift, Gauge, Lamp, Landmark, LayoutGrid, Package,
  PlugZap, Cross, Cog, Construction, ConstructionIcon, Link, Cable, HardHat,
  Wind, Radiation, Zap, Fuel, type LucideIcon,
} from 'lucide-react'
import type { AssetCategory, RiskLevel } from '@/api/assets'

export const CATEGORY_ICON: Record<AssetCategory, LucideIcon> = {
  fire_extinguisher: FireExtinguisher,
  forklift: Forklift,
  ladder: Landmark,
  scaffolding: Construction,
  machinery: Cog,
  electrical_panel: PlugZap,
  emergency_lighting: Lamp,
  first_aid_kit: Cross,
  ppe: Package,
  vehicle: Car,
  pressure_vessel: Gauge,
  crane: ConstructionIcon,
  chain_block: Link,
  lifting_sling: Cable,
  harness: HardHat,
  gas_detector: Radiation,
  scba: Wind,
  pressure_gauge: Gauge,
  electrical_tool: Zap,
  generator: Fuel,
  compressor: Wind,
  custom: LayoutGrid,
}

export const healthColor = (health: number) =>
  health >= 80 ? 'var(--good)' : health >= 60 ? 'var(--warning)' : 'var(--critical)'

export const RISK_PILL: Record<RiskLevel, 'good' | 'warning' | 'critical'> = {
  Low: 'good',
  Medium: 'warning',
  High: 'critical',
}

export const canManageAssets = (role: string | null) =>
  ['admin', 'hse_manager', 'safety_officer'].includes(role ?? '')
