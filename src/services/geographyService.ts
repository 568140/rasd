/**
 * Hierarchical Geographical Service for RASD
 * Governorate (المحافظة) -> Directorate (المديرية) -> Zone / Neighborhood (الحي / الحارة / المربع)
 */

export interface GeoGovernorate {
  id: string;
  name: string;
}

export interface GeoDirectorate {
  id: string;
  governorateId: string;
  name: string;
}

export interface GeoZone {
  id: string;
  directorateId: string;
  name: string;
}

export const DEFAULT_GOVERNORATES: GeoGovernorate[] = [
  { id: 'gov_sanaa', name: 'أمانة العاصمة / صنعاء' },
  { id: 'gov_aden', name: 'محافظة عدن' },
  { id: 'gov_taiz', name: 'محافظة تعز' },
  { id: 'gov_hod', name: 'محافظة الحديدة' },
  { id: 'gov_had', name: 'محافظة حضرموت' },
];

export const DEFAULT_DIRECTORATES: GeoDirectorate[] = [
  // Sana'a Directorates
  { id: 'dir_thawra', governorateId: 'gov_sanaa', name: 'مديرية الثورة' },
  { id: 'dir_bani_harith', governorateId: 'gov_sanaa', name: 'مديرية بني الحارث' },
  { id: 'dir_sabeen', governorateId: 'gov_sanaa', name: 'مديرية السبعين' },
  { id: 'dir_wahdah', governorateId: 'gov_sanaa', name: 'مديرية الوحدة' },
  { id: 'dir_safia', governorateId: 'gov_sanaa', name: 'مديرية الصافية' },
  { id: 'dir_main', governorateId: 'gov_sanaa', name: 'مديرية معين' },

  // Aden Directorates
  { id: 'dir_crater', governorateId: 'gov_aden', name: 'مديرية صيرة (كريتر)' },
  { id: 'dir_mansoura', governorateId: 'gov_aden', name: 'مديرية المنصورة' },
  { id: 'dir_khormaksar', governorateId: 'gov_aden', name: 'مديرية خور مكسر' },
  { id: 'dir_mualla', governorateId: 'gov_aden', name: 'مديرية المعلا' },
  { id: 'dir_tawahi', governorateId: 'gov_aden', name: 'مديرية التواهي' },
  { id: 'dir_sheikh_othman', governorateId: 'gov_aden', name: 'مديرية الشيخ عثمان' },
];

export const DEFAULT_ZONES: GeoZone[] = [
  // Under Bani Harith & Thawra (Sana'a)
  { id: 'zone_rawdah', directorateId: 'dir_bani_harith', name: 'الروضة' },
  { id: 'zone_souq_inab', directorateId: 'dir_bani_harith', name: 'سوق العنب' },
  { id: 'zone_quraish', directorateId: 'dir_bani_harith', name: 'حارة قريش' },
  { id: 'zone_matar', directorateId: 'dir_bani_harith', name: 'حي المطار' },
  { id: 'zone_hasabah', directorateId: 'dir_thawra', name: 'الحصبة' },
  { id: 'zone_jaraf', directorateId: 'dir_thawra', name: 'حي الجراف' },
  { id: 'zone_tahrir', directorateId: 'dir_wahdah', name: 'حي التحرير' },

  // Under Mansoura & Crater (Aden)
  { id: 'zone_rimy', directorateId: 'dir_mansoura', name: 'حي ريمي' },
  { id: 'zone_qahera', directorateId: 'dir_mansoura', name: 'حي القاهرة' },
  { id: 'zone_saada', directorateId: 'dir_khormaksar', name: 'حي السعادة' },
  { id: 'zone_mallaha', directorateId: 'dir_khormaksar', name: 'حي الملاحات' },
  { id: 'zone_aidroos', directorateId: 'dir_crater', name: 'حي العيدروس' },
];

/**
 * Parses free text address into geographical parts if matching known zones
 */
export function detectGeographyFromText(text: string): {
  governorate?: GeoGovernorate;
  directorate?: GeoDirectorate;
  zone?: GeoZone;
} {
  const result: { governorate?: GeoGovernorate; directorate?: GeoDirectorate; zone?: GeoZone } = {};
  if (!text) return result;

  for (const z of DEFAULT_ZONES) {
    if (text.includes(z.name)) {
      result.zone = z;
      const d = DEFAULT_DIRECTORATES.find((dir) => dir.id === z.directorateId);
      if (d) {
        result.directorate = d;
        result.governorate = DEFAULT_GOVERNORATES.find((g) => g.id === d.governorateId);
      }
      return result;
    }
  }

  for (const d of DEFAULT_DIRECTORATES) {
    if (text.includes(d.name) || text.includes(d.name.replace('مديرية ', ''))) {
      result.directorate = d;
      result.governorate = DEFAULT_GOVERNORATES.find((g) => g.id === d.governorateId);
      return result;
    }
  }

  for (const g of DEFAULT_GOVERNORATES) {
    if (text.includes(g.name) || text.includes(g.name.replace('محافظة ', '').replace('أمانة العاصمة / ', ''))) {
      result.governorate = g;
      return result;
    }
  }

  return result;
}
