import React, { useState, useEffect } from 'react';
import {
  Palette,
  X,
  Check,
  Sun,
  Moon,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  themeEngine,
  RASD_THEME_PALETTES,
  ThemeSettings,
  ThemePaletteId,
  CardTemplateStyle,
} from '../services/themeEngine';
import { useRasd } from '../context/RasdContext';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { darkMode, toggleDarkMode, showToast } = useRasd();
  const [settings, setSettings] = useState<ThemeSettings>(() => themeEngine.getSettings());

  useEffect(() => {
    return themeEngine.subscribe((updated) => {
      setSettings({ ...updated });
    });
  }, []);

  if (!isOpen) return null;

  const handleSelectPalette = (paletteId: ThemePaletteId, name: string) => {
    themeEngine.updateSettings({ paletteId });
    showToast(`تم تطبيق القالب اللوني: ${name}`, 'success');
  };

  const handleSelectCardStyle = (cardStyle: CardTemplateStyle, label: string) => {
    themeEngine.updateSettings({ cardStyle });
    showToast(`تم تطبيق نمط البطاقات: ${label}`, 'info');
  };

  const cardStyleOptions: { id: CardTemplateStyle; label: string; desc: string }[] = [
    {
      id: 'elevated',
      label: 'بطاقات مرتفعة ناعمة',
      desc: 'ظلال متعددة الطبقات مع تباين مريح للعين',
    },
    {
      id: 'glass',
      label: 'بطاقات زجاجية عصرية',
      desc: 'تأثير زجاجي شفاف (Glassmorphism) مع حدود مضيئة',
    },
    {
      id: 'bordered',
      label: 'بطاقات معمارية محددة',
      desc: 'خطوط هندسية واضحة بدون ظلال لتباين حاد في الميدان',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-[#0D1829] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0D9488] text-white flex items-center justify-center shadow-xs">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                القوالب الاحترافية والألوان العصرية
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                اختر الهوية اللونية ونمط البطاقات لجميع شاشات تطبيق رَصْد
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
          {/* 1. Light / Dark Mode Switch */}
          <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {darkMode ? (
                <Moon className="w-5 h-5 text-amber-400" />
              ) : (
                <Sun className="w-5 h-5 text-amber-500" />
              )}
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  إضاءة الواجهة ({darkMode ? 'الوضع الليلي الداكن' : 'الوضع النهاري الساطع'})
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  يتكيف كل قالب لوني تلقائيًا مع الوضع النهاري والليلي
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleDarkMode}
              className="min-h-[38px] px-4 rounded-xl bg-[#0B192C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-sky-200" />}
              <span>{darkMode ? 'تفعيل النهاري' : 'تفعيل الليلي'}</span>
            </button>
          </div>

          {/* 2. Color Palettes Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#0D9488]" />
                <span>القوالب اللونية المعتمدة (6 قوالب احترافية)</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RASD_THEME_PALETTES.map((palette) => {
                const isSelected = settings.paletteId === palette.id;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => handleSelectPalette(palette.id, palette.name)}
                    className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-slate-900 border-[#0D9488] ring-2 ring-[#0D9488]/25 shadow-sm'
                        : 'bg-white dark:bg-slate-900/50 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{palette.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {palette.subtitle}
                        </p>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#0D9488] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    {/* Swatch Preview Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 w-full">
                      <div className="flex items-center gap-1.5">
                        {palette.previewSwatches.map((hex, i) => (
                          <span
                            key={i}
                            className="w-6 h-6 rounded-lg border border-black/10 dark:border-white/15 shadow-2xs"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {palette.badgeText}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Card Template Style Selector */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5">
              <Layers className="w-4 h-4 text-[#0284C7]" />
              <span>تصميم قوالب البطاقات والأسطح</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {cardStyleOptions.map((opt) => {
                const active = settings.cardStyle === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectCardStyle(opt.id, opt.label)}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      active
                        ? 'bg-slate-50 dark:bg-slate-900 border-[#0D9488] ring-2 ring-[#0D9488]/20'
                        : 'bg-white dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {opt.label}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-[#0D9488]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-6 rounded-2xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
          >
            اعتماد وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
