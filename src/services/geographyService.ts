/**
 * Hierarchical Geographical Service for RASD
 * Governorate (المحافظة) -> Directorate (المديرية) -> Zone / Neighborhood (الحي / الحارة / المربع)
 */
import { YEMEN_LOCATIONS_HIERARCHY } from '../utils/yemenLocations';

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

export const DEFAULT_GOVERNORATES: GeoGovernorate[] = YEMEN_LOCATIONS_HIERARCHY.map((g) => ({
  id: g.id === 'gov_amanat_sanaa' ? 'gov_sanaa' : g.id,
  name: g.name,
}));

export const DEFAULT_DIRECTORATES: GeoDirectorate[] = YEMEN_LOCATIONS_HIERARCHY.flatMap((g) => {
  const govId = g.id === 'gov_amanat_sanaa' ? 'gov_sanaa' : g.id;
  return g.districts.map((d, idx) => {
    let dirId = `dir_${govId}_${idx}`;
    if (d.name === 'مديرية الثورة') dirId = 'dir_thawra';
    else if (d.name === 'مديرية بني الحارث') dirId = 'dir_bani_harith';
    else if (d.name === 'مديرية السبعين') dirId = 'dir_sabeen';
    else if (d.name === 'مديرية الوحدة') dirId = 'dir_wahdah';
    else if (d.name === 'مديرية الصافية') dirId = 'dir_safia';
    else if (d.name === 'مديرية معين') dirId = 'dir_main';
    else if (d.name === 'مديرية صيرة (كريتر)') dirId = 'dir_crater';
    else if (d.name === 'مديرية المنصورة') dirId = 'dir_mansoura';
    else if (d.name === 'مديرية خور مكسر') dirId = 'dir_khormaksar';
    else if (d.name === 'مديرية المعلا') dirId = 'dir_mualla';
    else if (d.name === 'مديرية التواهي') dirId = 'dir_tawahi';
    else if (d.name === 'مديرية الشيخ عثمان') dirId = 'dir_sheikh_othman';

    return {
      id: dirId,
      governorateId: govId,
      name: d.name,
    };
  });
});

export const DEFAULT_ZONES: GeoZone[] = YEMEN_LOCATIONS_HIERARCHY.flatMap((g) => {
  const govId = g.id === 'gov_amanat_sanaa' ? 'gov_sanaa' : g.id;
  return g.districts.flatMap((d, dIdx) => {
    const matchedDir = DEFAULT_DIRECTORATES.find(
      (dir) => dir.governorateId === govId && dir.name === d.name
    );
    const dirId = matchedDir ? matchedDir.id : `dir_${govId}_${dIdx}`;

    return d.subDistricts.flatMap((s, sIdx) =>
      s.neighborhoods.map((n, nIdx) => ({
        id: `zone_${dirId}_${sIdx}_${nIdx}`,
        directorateId: dirId,
        name: n,
      }))
    );
  });
});

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
    if (
      text.includes(g.name) ||
      text.includes(g.name.replace('محافظة ', '').replace('أمانة العاصمة ', ''))
    ) {
      result.governorate = g;
      return result;
    }
  }

  return result;
}
