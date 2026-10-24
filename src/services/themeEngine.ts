/**
 * RASD Modern Color Palette & Visual Template Engine
 * Provides 6 curated enterprise & architectural color themes + card style templates
 * that dynamically style the entire application via CSS custom properties.
 */

export type ThemePaletteId =
  | 'emerald_luxury'
  | 'modern_indigo'
  | 'royal_graphite'
  | 'sapphire_breeze'
  | 'desert_terracotta'
  | 'classic_navy';

export type CardTemplateStyle = 'elevated' | 'glass' | 'bordered';

export interface ThemePaletteDefinition {
  id: ThemePaletteId;
  name: string;
  subtitle: string;
  badgeText: string;
  previewSwatches: [string, string, string];
  vars: {
    // Primary dark brand color (headers, primary buttons, deep surfaces)
    primary: string;
    primaryHover: string;
    // Accent 1 (Teal / Emerald / Indigo interactive highlight)
    accent: string;
    accentHover: string;
    // Accent 2 (Secondary blue / violet / gold highlight)
    secondary: string;
    // Hero banner gradient stops
    heroFrom: string;
    heroVia: string;
    heroTo: string;
    // Light mode canvas & card surfaces
    bgLight: string;
    cardLight: string;
    cardSubtleLight: string;
    borderLight: string;
    // Dark mode canvas & card surfaces
    bgDark: string;
    cardDark: string;
    cardSubtleDark: string;
    borderDark: string;
    // Soft tint for icon badges
    tintBgLight: string;
    tintBgDark: string;
  };
}

export interface ThemeSettings {
  paletteId: ThemePaletteId;
  cardStyle: CardTemplateStyle;
}

const STORAGE_KEY = 'rasd_ui_theme_settings_v1';

export const RASD_THEME_PALETTES: ThemePaletteDefinition[] = [
  {
    id: 'emerald_luxury',
    name: 'الزمرد السيادي العصري',
    subtitle: 'أخضر زمردي فاخر مع لمسات تيل مشرقة وخلفيات نقية عالية التباين',
    badgeText: 'الافتراضي العصري',
    previewSwatches: ['#064E3B', '#059669', '#0EA5E9'],
    vars: {
      primary: '#064E3B',
      primaryHover: '#065F46',
      accent: '#059669',
      accentHover: '#047857',
      secondary: '#0284C7',
      heroFrom: '#042F2E',
      heroVia: '#064E3B',
      heroTo: '#0F766E',
      bgLight: '#F3F7F5',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#EDF4F1',
      borderLight: '#D5E3DC',
      bgDark: '#041311',
      cardDark: '#091E1A',
      cardSubtleDark: '#0D2924',
      borderDark: '#163B34',
      tintBgLight: '#ECFDF5',
      tintBgDark: '#064E3B',
    },
  },
  {
    id: 'modern_indigo',
    name: 'الأنديجو الرقمي الاحترافي',
    subtitle: 'طابع الأنظمة المالية الحديثة بتدرجات الأنديجو والبنفسجي المشرق',
    badgeText: 'تقني حديث',
    previewSwatches: ['#1E1B4B', '#4F46E5', '#06B6D4'],
    vars: {
      primary: '#1E1B4B',
      primaryHover: '#312E81',
      accent: '#4F46E5',
      accentHover: '#4338CA',
      secondary: '#0891B2',
      heroFrom: '#1E1B4B',
      heroVia: '#312E81',
      heroTo: '#4338CA',
      bgLight: '#F4F5FA',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#EEF0F8',
      borderLight: '#DCE0F0',
      bgDark: '#09081A',
      cardDark: '#12112B',
      cardSubtleDark: '#1A183B',
      borderDark: '#292654',
      tintBgLight: '#EEF2FF',
      tintBgDark: '#1E1B4B',
    },
  },
  {
    id: 'royal_graphite',
    name: 'الجرافيت والذهب المعماري',
    subtitle: 'فحمي تنفيذي أنيق مع لمسات كهرمانية ذهبية لإدارة العقارات والأصول',
    badgeText: 'تنفيذي فاخر',
    previewSwatches: ['#18181B', '#D97706', '#0D9488'],
    vars: {
      primary: '#18181B',
      primaryHover: '#27272A',
      accent: '#D97706',
      accentHover: '#B45309',
      secondary: '#0D9488',
      heroFrom: '#09090B',
      heroVia: '#18181B',
      heroTo: '#78350F',
      bgLight: '#F8F7F4',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#F2EFE9',
      borderLight: '#E4DFD5',
      bgDark: '#09090B',
      cardDark: '#141417',
      cardSubtleDark: '#1F1F23',
      borderDark: '#2E2E36',
      tintBgLight: '#FFFBEB',
      tintBgDark: '#451A03',
    },
  },
  {
    id: 'sapphire_breeze',
    name: 'الياقوت الأزرق التفاعلي',
    subtitle: 'أزرق ملكي ساطع وواضح للقراءة السريعة تحت أشعة الشمس الميدانية',
    badgeText: 'وضوح ميداني',
    previewSwatches: ['#0F172A', '#2563EB', '#0EA5E9'],
    vars: {
      primary: '#0F172A',
      primaryHover: '#1E293B',
      accent: '#2563EB',
      accentHover: '#1D4ED8',
      secondary: '#0284C7',
      heroFrom: '#0F172A',
      heroVia: '#1E3A8A',
      heroTo: '#0284C7',
      bgLight: '#F1F5F9',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#E8EFF7',
      borderLight: '#CBD5E1',
      bgDark: '#050B16',
      cardDark: '#0C1629',
      cardSubtleDark: '#13223D',
      borderDark: '#1E3359',
      tintBgLight: '#EFF6FF',
      tintBgDark: '#172554',
    },
  },
  {
    id: 'desert_terracotta',
    name: 'أصالة العمارة النجدية',
    subtitle: 'ألوان الحجر الدافئ والتراكوتا النحاسي مع أخضر الواحات',
    badgeText: 'هوية عمرانية',
    previewSwatches: ['#431407', '#EA580C', '#0D9488'],
    vars: {
      primary: '#431407',
      primaryHover: '#5C1D0C',
      accent: '#EA580C',
      accentHover: '#C2410C',
      secondary: '#0D9488',
      heroFrom: '#3B1106',
      heroVia: '#7C2D12',
      heroTo: '#0F766E',
      bgLight: '#FAF6F2',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#F4EDE6',
      borderLight: '#E6D8CB',
      bgDark: '#140804',
      cardDark: '#210E08',
      cardSubtleDark: '#2E150D',
      borderDark: '#472216',
      tintBgLight: '#FFF7ED',
      tintBgDark: '#431407',
    },
  },
  {
    id: 'classic_navy',
    name: 'الكحلي والتركواز الرسمي',
    subtitle: 'الهوية الكلاسيكية المتزنة باللون الكحلي العميق والتركواز الميداني',
    badgeText: 'كلاسيكي',
    previewSwatches: ['#0B192C', '#0D9488', '#0284C7'],
    vars: {
      primary: '#0B192C',
      primaryHover: '#132A46',
      accent: '#0D9488',
      accentHover: '#0F766E',
      secondary: '#0284C7',
      heroFrom: '#0B192C',
      heroVia: '#102A46',
      heroTo: '#0B4F6C',
      bgLight: '#F4F7FA',
      cardLight: '#FFFFFF',
      cardSubtleLight: '#EDF2F7',
      borderLight: '#DCE4EE',
      bgDark: '#060D18',
      cardDark: '#0D1829',
      cardSubtleDark: '#132238',
      borderDark: '#1E2F4D',
      tintBgLight: '#F0FDFA',
      tintBgDark: '#042F2E',
    },
  },
];

const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  paletteId: 'emerald_luxury',
  cardStyle: 'elevated',
};

class ThemeEngineService {
  private settings: ThemeSettings = DEFAULT_THEME_SETTINGS;
  private listeners: Set<(settings: ThemeSettings) => void> = new Set();

  constructor() {
    this.loadSettings();
    this.applyToDOM();
  }

  private loadSettings() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
        const exists = RASD_THEME_PALETTES.some((p) => p.id === parsed.paletteId);
        this.settings = {
          paletteId: exists && parsed.paletteId ? parsed.paletteId : DEFAULT_THEME_SETTINGS.paletteId,
          cardStyle: parsed.cardStyle || DEFAULT_THEME_SETTINGS.cardStyle,
        };
      }
    } catch {
      this.settings = DEFAULT_THEME_SETTINGS;
    }
  }

  private saveSettings() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore storage errors
    }
    this.applyToDOM();
    this.listeners.forEach((cb) => cb(this.settings));
  }

  public getSettings(): ThemeSettings {
    return { ...this.settings };
  }

  public getActivePalette(): ThemePaletteDefinition {
    return (
      RASD_THEME_PALETTES.find((p) => p.id === this.settings.paletteId) || RASD_THEME_PALETTES[0]
    );
  }

  public updateSettings(partial: Partial<ThemeSettings>): ThemeSettings {
    this.settings = {
      ...this.settings,
      ...partial,
    };
    this.saveSettings();
    return this.getSettings();
  }

  public subscribe(cb: (settings: ThemeSettings) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public applyToDOM() {
    if (typeof document === 'undefined') return;
    const palette = this.getActivePalette();
    const root = document.documentElement;

    root.style.setProperty('--rasd-primary', palette.vars.primary);
    root.style.setProperty('--rasd-primary-hover', palette.vars.primaryHover);
    root.style.setProperty('--rasd-accent', palette.vars.accent);
    root.style.setProperty('--rasd-accent-hover', palette.vars.accentHover);
    root.style.setProperty('--rasd-secondary', palette.vars.secondary);
    root.style.setProperty('--rasd-hero-from', palette.vars.heroFrom);
    root.style.setProperty('--rasd-hero-via', palette.vars.heroVia);
    root.style.setProperty('--rasd-hero-to', palette.vars.heroTo);

    root.style.setProperty('--rasd-bg-light', palette.vars.bgLight);
    root.style.setProperty('--rasd-card-light', palette.vars.cardLight);
    root.style.setProperty('--rasd-card-subtle-light', palette.vars.cardSubtleLight);
    root.style.setProperty('--rasd-border-light', palette.vars.borderLight);

    root.style.setProperty('--rasd-bg-dark', palette.vars.bgDark);
    root.style.setProperty('--rasd-card-dark', palette.vars.cardDark);
    root.style.setProperty('--rasd-card-subtle-dark', palette.vars.cardSubtleDark);
    root.style.setProperty('--rasd-border-dark', palette.vars.borderDark);

    root.dataset.rasdPalette = palette.id;
    root.dataset.rasdCardStyle = this.settings.cardStyle;
  }
}

export const themeEngine = new ThemeEngineService();
