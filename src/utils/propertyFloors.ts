import {
  OccupancyStatus,
  Property,
  PropertyUnit,
  RentPeriod,
  UnitType,
} from '../types/rasd';

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  apartment: 'شقة',
  shop: 'محل تجاري',
  office: 'مكتب',
  warehouse: 'مستودع',
  annex: 'ملحق',
  other: 'وحدة أخرى',
};

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  occupied: 'مؤجرة',
  vacant: 'شاغرة',
  owner_used: 'يستخدمها المالك بنفسه',
  under_maintenance: 'تحت الصيانة',
};

export const OCCUPANCY_BADGE_STYLES: Record<
  OccupancyStatus,
  { bg: string; text: string; border: string; dot: string }
> = {
  occupied: {
    bg: 'bg-[#ECFDF5] dark:bg-emerald-950/60',
    text: 'text-[#059669] dark:text-emerald-300',
    border: 'border-[#A7F3D0]/80 dark:border-emerald-800/70',
    dot: 'bg-[#10B981]',
  },
  vacant: {
    bg: 'bg-[#FEF3C7] dark:bg-amber-950/60',
    text: 'text-[#D97706] dark:text-amber-300',
    border: 'border-amber-300/80 dark:border-amber-800/70',
    dot: 'bg-[#F59E0B]',
  },
  owner_used: {
    bg: 'bg-sky-50 dark:bg-sky-950/60',
    text: 'text-[#0284C7] dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-800/70',
    dot: 'bg-[#0284C7]',
  },
  under_maintenance: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
};

export const RENT_PERIOD_LABELS: Record<RentPeriod, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
};

export const RENT_PERIOD_SHORT_LABELS: Record<RentPeriod, string> = {
  monthly: 'شهريًا',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنويًا',
};

const ARABIC_ORDINAL_FLOORS: string[] = [
  'الطابق الأرضي',
  'الطابق الأول',
  'الطابق الثاني',
  'الطابق الثالث',
  'الطابق الرابع',
  'الطابق الخامس',
  'الطابق السادس',
  'الطابق السابع',
  'الطابق الثامن',
  'الطابق التاسع',
  'الطابق العاشر',
];

export function getCanonicalFloorLabelByIndex(floorIndex: number): string {
  if (floorIndex < 0) return 'البدروم (القبو)';
  if (floorIndex === 0) return 'الطابق الأرضي';
  if (floorIndex < ARABIC_ORDINAL_FLOORS.length) {
    return ARABIC_ORDINAL_FLOORS[floorIndex];
  }
  return `الطابق ${floorIndex}`;
}

/**
 * Normalizes legacy or free-text floor strings to canonical Arabic floor labels
 * without losing custom floor names if a user entered a specific label.
 */
export function normalizeFloorLabel(rawFloor: string | undefined, unitType?: UnitType): string {
  const clean = (rawFloor || '').trim();
  if (!clean) {
    if (unitType === 'annex') return 'السطح / الملاحق';
    if (unitType === 'shop') return 'الطابق الأرضي';
    return 'الطابق الأرضي';
  }

  const lower = clean.toLowerCase();

  if (
    lower.includes('بدروم') ||
    lower.includes('قبو') ||
    lower === '-1' ||
    lower.includes('basement')
  ) {
    return 'البدروم (القبو)';
  }

  if (
    lower.includes('سطح') ||
    lower.includes('ملحق') ||
    lower.includes('ملاحق') ||
    lower.includes('روف')
  ) {
    return 'السطح / الملاحق';
  }

  if (
    lower.includes('أرضي') ||
    lower.includes('ارضي') ||
    lower === '0' ||
    lower === 'الدور 0' ||
    lower === 'الطابق 0'
  ) {
    return 'الطابق الأرضي';
  }

  // Match "الدور 1" or "الطابق 1"
  const numMatch = clean.match(/(?:الدور|الطابق|دور|طابق)\s*(\d+)/);
  if (numMatch?.[1]) {
    const n = parseInt(numMatch[1], 10);
    if (!isNaN(n)) {
      // Note: In legacy voice creation, "الدور 1" was the first floor or ground floor.
      // Map 1 -> الطابق الأول, 2 -> الطابق الثاني, etc.
      return getCanonicalFloorLabelByIndex(n);
    }
  }

  if (/^\d+$/.test(clean)) {
    const n = parseInt(clean, 10);
    return getCanonicalFloorLabelByIndex(n);
  }

  if (lower.includes('الأول') || lower.includes('الاول')) return 'الطابق الأول';
  if (lower.includes('الثاني')) return 'الطابق الثاني';
  if (lower.includes('الثالث')) return 'الطابق الثالث';
  if (lower.includes('الرابع')) return 'الطابق الرابع';
  if (lower.includes('الخامس')) return 'الطابق الخامس';
  if (lower.includes('السادس')) return 'الطابق السادس';
  if (lower.includes('السابع')) return 'الطابق السابع';

  if (lower.startsWith('غير محدد')) {
    return 'الطابق الأرضي';
  }

  return clean;
}

export function getFloorSortOrder(floorLabel: string): number {
  const norm = normalizeFloorLabel(floorLabel);
  if (norm === 'البدروم (القبو)') return -1;
  if (norm === 'الطابق الأرضي') return 0;
  const idx = ARABIC_ORDINAL_FLOORS.indexOf(norm);
  if (idx >= 0) return idx;
  const numMatch = norm.match(/الطابق\s*(\d+)/);
  if (numMatch?.[1]) {
    return parseInt(numMatch[1], 10);
  }
  if (norm === 'السطح / الملاحق') return 900;
  return 500;
}

/**
 * Extracts architectural metrics for a property, combining structured metadata,
 * legacy note patterns, and actual child units.
 */
export interface PropertyArchitecturalSummary {
  floorsCount: number;
  hasBasement: boolean;
  apartmentsCount: number;
  shopsCount: number;
  officesCount: number;
  annexesCount: number;
  totalUnitsCount: number;
}

export function extractLegacyFloorsFromNotes(notes: string | undefined): number {
  if (!notes) return 0;
  const m = notes.match(/عدد (?:الأدوار|الطوابق):\s*(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

export function getPropertyArchitecturalSummary(
  property: Property,
  units: PropertyUnit[]
): PropertyArchitecturalSummary {
  const unitApts = units.filter((u) => u.unitType === 'apartment').length;
  const unitShops = units.filter((u) => u.unitType === 'shop').length;
  const unitOffices = units.filter((u) => u.unitType === 'office').length;
  const unitAnnexes = units.filter(
    (u) => u.unitType === 'annex' || normalizeFloorLabel(u.floor, u.unitType) === 'السطح / الملاحق'
  ).length;
  const hasBasementUnit = units.some(
    (u) => normalizeFloorLabel(u.floor, u.unitType) === 'البدروم (القبو)'
  );

  const legacyFloors = extractLegacyFloorsFromNotes(property.notes);
  const distinctRegularFloors = new Set(
    units
      .map((u) => normalizeFloorLabel(u.floor, u.unitType))
      .filter((f) => f !== 'البدروم (القبو)' && f !== 'السطح / الملاحق')
  ).size;

  const floorsCount =
    typeof property.floorsCount === 'number' && property.floorsCount > 0
      ? property.floorsCount
      : legacyFloors > 0
      ? legacyFloors
      : Math.max(1, distinctRegularFloors);

  const hasBasement =
    typeof property.hasBasement === 'boolean' ? property.hasBasement : hasBasementUnit;

  const declaredApts = typeof property.apartmentsCount === 'number' ? property.apartmentsCount : 0;
  const declaredShops = typeof property.shopsCount === 'number' ? property.shopsCount : 0;
  const declaredOffices = typeof property.officesCount === 'number' ? property.officesCount : 0;
  const declaredAnnexes = typeof property.annexesCount === 'number' ? property.annexesCount : 0;

  const apartmentsCount = Math.max(unitApts, declaredApts);
  const shopsCount = Math.max(unitShops, declaredShops);
  const officesCount = Math.max(unitOffices, declaredOffices);
  const annexesCount = Math.max(unitAnnexes, declaredAnnexes);

  const sumOfCategories = apartmentsCount + shopsCount + officesCount + annexesCount;
  const totalUnitsCount = Math.max(units.length, sumOfCategories, property.unitsCount || 0);

  return {
    floorsCount,
    hasBasement,
    apartmentsCount,
    shopsCount,
    officesCount,
    annexesCount,
    totalUnitsCount,
  };
}

export interface FloorGroup {
  floorLabel: string;
  floorOrder: number;
  units: PropertyUnit[];
}

/**
 * Builds the ordered list of Floor Accordions for a property (e.g. البدروم، الطابق الأرضي، الطابق الأول...، السطح)
 * and places each unit under its corresponding floor.
 */
export function groupPropertyUnitsByFloor(
  property: Property,
  units: PropertyUnit[]
): FloorGroup[] {
  const arch = getPropertyArchitecturalSummary(property, units);
  const floorMap = new Map<string, PropertyUnit[]>();

  // 1. Seed expected floors from property structure so even empty floors appear clearly
  if (arch.hasBasement) {
    floorMap.set('البدروم (القبو)', []);
  }

  const totalFloors = Math.max(1, Math.min(25, arch.floorsCount || 1));
  for (let i = 0; i < totalFloors; i++) {
    const label = getCanonicalFloorLabelByIndex(i);
    if (!floorMap.has(label)) {
      floorMap.set(label, []);
    }
  }

  if (arch.annexesCount > 0) {
    floorMap.set('السطح / الملاحق', []);
  }

  // 2. Assign every existing unit to its canonical or custom floor
  for (const unit of units) {
    const label = normalizeFloorLabel(unit.floor, unit.unitType);
    const list = floorMap.get(label) || [];
    list.push(unit);
    floorMap.set(label, list);
  }

  // 3. Sort floors in architectural order (Basement -> Ground -> 1st -> 2nd -> ... -> Roof/Annexes)
  const groups: FloorGroup[] = Array.from(floorMap.entries()).map(([floorLabel, floorUnits]) => ({
    floorLabel,
    floorOrder: getFloorSortOrder(floorLabel),
    units: floorUnits,
  }));

  groups.sort((a, b) => a.floorOrder - b.floorOrder);
  return groups;
}

/**
 * Generates standard floor options for unit select/datalist inputs based on the property's structure.
 */
export function getAvailableFloorOptions(property?: Property | null): string[] {
  const floorsCount = Math.max(
    4,
    property?.floorsCount || extractLegacyFloorsFromNotes(property?.notes) || 4
  );
  const options: string[] = ['البدروم (القبو)', 'الطابق الأرضي'];
  for (let i = 1; i < floorsCount; i++) {
    options.push(getCanonicalFloorLabelByIndex(i));
  }
  options.push('السطح / الملاحق');
  return options;
}

/**
 * Resolves the effective rent display for a single unit without guessing or converting legacy values.
 */
export function getUnitRentDisplayInfo(unit: PropertyUnit): {
  activeRentAmount: number;
  rentPeriod: RentPeriod | null;
  periodLabel: string;
  isLegacyEstimateOnly: boolean;
} {
  if (unit.occupancyStatus !== 'occupied') {
    return {
      activeRentAmount: 0,
      rentPeriod: null,
      periodLabel: '',
      isLegacyEstimateOnly: false,
    };
  }

  if (typeof unit.rentAmount === 'number' && unit.rentAmount > 0 && unit.rentPeriod) {
    return {
      activeRentAmount: unit.rentAmount,
      rentPeriod: unit.rentPeriod,
      periodLabel: RENT_PERIOD_LABELS[unit.rentPeriod],
      isLegacyEstimateOnly: false,
    };
  }

  if (unit.rentPeriod && (unit.rentAmount || unit.annualRentEstimate)) {
    const amt = Number(unit.rentAmount ?? unit.annualRentEstimate) || 0;
    return {
      activeRentAmount: amt,
      rentPeriod: unit.rentPeriod,
      periodLabel: RENT_PERIOD_LABELS[unit.rentPeriod],
      isLegacyEstimateOnly: false,
    };
  }

  // Legacy record that only has annualRentEstimate and no explicit rentPeriod
  const legacyAmt = Number(unit.annualRentEstimate) || 0;
  if (legacyAmt > 0) {
    return {
      activeRentAmount: legacyAmt,
      rentPeriod: null,
      periodLabel: 'تقدير سابق (حدد الفترة)',
      isLegacyEstimateOnly: true,
    };
  }

  return {
    activeRentAmount: 0,
    rentPeriod: null,
    periodLabel: '',
    isLegacyEstimateOnly: false,
  };
}

export interface UnitsRentalSummary {
  totalUnits: number;
  occupiedCount: number;
  vacantCount: number;
  ownerUsedCount: number;
  underMaintenanceCount: number;
  byPeriod: Record<RentPeriod, { count: number; totalAmount: number }>;
  legacyUnclassifiedCount: number;
  legacyUnclassifiedTotal: number;
}

/**
 * Computes a standalone summary of unit rentals strictly from occupied units,
 * grouped by explicit rentPeriod, completely separate from tax contract/obligations.
 */
export function computeUnitsRentalSummary(units: PropertyUnit[]): UnitsRentalSummary {
  const byPeriod: Record<RentPeriod, { count: number; totalAmount: number }> = {
    monthly: { count: 0, totalAmount: 0 },
    quarterly: { count: 0, totalAmount: 0 },
    semi_annual: { count: 0, totalAmount: 0 },
    annual: { count: 0, totalAmount: 0 },
  };

  let occupiedCount = 0;
  let vacantCount = 0;
  let ownerUsedCount = 0;
  let underMaintenanceCount = 0;
  let legacyUnclassifiedCount = 0;
  let legacyUnclassifiedTotal = 0;

  for (const u of units) {
    if (u.occupancyStatus === 'occupied') {
      occupiedCount += 1;
      const rentInfo = getUnitRentDisplayInfo(u);
      if (rentInfo.activeRentAmount > 0) {
        if (rentInfo.rentPeriod) {
          byPeriod[rentInfo.rentPeriod].count += 1;
          byPeriod[rentInfo.rentPeriod].totalAmount += rentInfo.activeRentAmount;
        } else {
          legacyUnclassifiedCount += 1;
          legacyUnclassifiedTotal += rentInfo.activeRentAmount;
        }
      }
    } else if (u.occupancyStatus === 'vacant') {
      vacantCount += 1;
    } else if (u.occupancyStatus === 'owner_used') {
      ownerUsedCount += 1;
    } else if (u.occupancyStatus === 'under_maintenance') {
      underMaintenanceCount += 1;
    }
  }

  return {
    totalUnits: units.length,
    occupiedCount,
    vacantCount,
    ownerUsedCount,
    underMaintenanceCount,
    byPeriod,
    legacyUnclassifiedCount,
    legacyUnclassifiedTotal,
  };
}

