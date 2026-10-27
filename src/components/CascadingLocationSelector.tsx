import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapPin, Edit3, ListFilter } from 'lucide-react';
import {
  YEMEN_LOCATIONS_HIERARCHY,
  MANUAL_OPTION_VALUE,
  parseLocationFromRegionAndAddress,
  composeRegionAndAddressFromLocation,
} from '../utils/yemenLocations';

export interface CascadingLocationChangePayload {
  region: string;
  address: string;
  governorate: string;
  district: string;
  subDistrict: string;
  neighborhood: string;
  streetAddress: string;
  zoneLabel: string;
}

interface CascadingLocationSelectorProps {
  region: string;
  address: string;
  onChange: (payload: CascadingLocationChangePayload) => void;
  title?: string;
  streetPlaceholder?: string;
  streetRequired?: boolean;
}

export const CascadingLocationSelector: React.FC<CascadingLocationSelectorProps> = ({
  region,
  address,
  onChange,
  title = 'الموقع الجغرافي المتسلسل (المحافظة ← المديرية ← العزلة ← الحي ← الشارع)',
  streetPlaceholder = 'اسم الشارع، رقم المبنى، أو أقرب معلم بارز (مثال: شارع الستين جوار جولة المصباحي)',
  streetRequired = false,
}) => {
  const initialParsed = useMemo(
    () => parseLocationFromRegionAndAddress(region, address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [governorate, setGovernorate] = useState<string>(initialParsed.governorate);
  const [district, setDistrict] = useState<string>(initialParsed.district);
  const [subDistrict, setSubDistrict] = useState<string>(initialParsed.subDistrict);
  const [neighborhood, setNeighborhood] = useState<string>(initialParsed.neighborhood);
  const [streetAddress, setStreetAddress] = useState<string>(initialParsed.streetAddress);

  // Manual entry mode flags per level
  const [manualGov, setManualGov] = useState<boolean>(false);
  const [manualDist, setManualDist] = useState<boolean>(false);
  const [manualSub, setManualSub] = useState<boolean>(false);
  const [manualNeigh, setManualNeigh] = useState<boolean>(false);

  const lastEmittedRef = useRef<{ region: string; address: string }>({
    region,
    address,
  });

  // Sync when external `region` or `address` changes (e.g., modal opened for a different record)
  useEffect(() => {
    if (
      region === lastEmittedRef.current.region &&
      address === lastEmittedRef.current.address
    ) {
      return;
    }
    const parsed = parseLocationFromRegionAndAddress(region, address);
    setGovernorate(parsed.governorate);
    setDistrict(parsed.district);
    setSubDistrict(parsed.subDistrict);
    setNeighborhood(parsed.neighborhood);
    setStreetAddress(parsed.streetAddress);

    const govObj = YEMEN_LOCATIONS_HIERARCHY.find((g) => g.name === parsed.governorate);
    const isGovCustom = Boolean(parsed.governorate && !govObj);
    setManualGov(isGovCustom);

    const distObj = govObj?.districts.find((d) => d.name === parsed.district);
    const isDistCustom = Boolean(parsed.district && !distObj);
    setManualDist(isDistCustom);

    const subObj = distObj?.subDistricts.find((s) => s.name === parsed.subDistrict);
    const isSubCustom = Boolean(parsed.subDistrict && !subObj);
    setManualSub(isSubCustom);

    const isNeighCustom = Boolean(
      parsed.neighborhood && !subObj?.neighborhoods.includes(parsed.neighborhood)
    );
    setManualNeigh(isNeighCustom);

    lastEmittedRef.current = { region, address };
  }, [region, address]);

  // Available options at each cascading level
  const selectedGovObj = useMemo(
    () => YEMEN_LOCATIONS_HIERARCHY.find((g) => g.name === governorate) || null,
    [governorate]
  );

  const availableDistricts = useMemo(
    () => selectedGovObj?.districts || [],
    [selectedGovObj]
  );

  const selectedDistObj = useMemo(
    () => availableDistricts.find((d) => d.name === district) || null,
    [availableDistricts, district]
  );

  const availableSubDistricts = useMemo(
    () => selectedDistObj?.subDistricts || [],
    [selectedDistObj]
  );

  const selectedSubObj = useMemo(
    () => availableSubDistricts.find((s) => s.name === subDistrict) || null,
    [availableSubDistricts, subDistrict]
  );

  const availableNeighborhoods = useMemo(
    () => selectedSubObj?.neighborhoods || [],
    [selectedSubObj]
  );

  const emitLocationUpdate = (next: {
    governorate: string;
    district: string;
    subDistrict: string;
    neighborhood: string;
    streetAddress: string;
  }) => {
    const composed = composeRegionAndAddressFromLocation(next);
    lastEmittedRef.current = {
      region: composed.region,
      address: composed.address,
    };
    onChange({
      region: composed.region,
      address: composed.address,
      zoneLabel: composed.zoneLabel,
      ...next,
    });
  };

  // Handlers for level changes
  const handleGovernorateSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualGov(true);
      setManualDist(true);
      setManualSub(true);
      setManualNeigh(true);
      setGovernorate('');
      setDistrict('');
      setSubDistrict('');
      setNeighborhood('');
      emitLocationUpdate({
        governorate: '',
        district: '',
        subDistrict: '',
        neighborhood: '',
        streetAddress,
      });
      return;
    }

    setManualGov(false);
    setManualDist(false);
    setManualSub(false);
    setManualNeigh(false);

    const govObj = YEMEN_LOCATIONS_HIERARCHY.find((g) => g.name === val);
    const firstDist = govObj?.districts[0]?.name || '';
    const firstSub = govObj?.districts[0]?.subDistricts[0]?.name || '';
    const firstNeigh = govObj?.districts[0]?.subDistricts[0]?.neighborhoods[0] || '';

    setGovernorate(val);
    setDistrict(firstDist);
    setSubDistrict(firstSub);
    setNeighborhood(firstNeigh);

    emitLocationUpdate({
      governorate: val,
      district: firstDist,
      subDistrict: firstSub,
      neighborhood: firstNeigh,
      streetAddress,
    });
  };

  const handleDistrictSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualDist(true);
      setManualSub(true);
      setManualNeigh(true);
      setDistrict('');
      setSubDistrict('');
      setNeighborhood('');
      emitLocationUpdate({
        governorate,
        district: '',
        subDistrict: '',
        neighborhood: '',
        streetAddress,
      });
      return;
    }

    setManualDist(false);
    setManualSub(false);
    setManualNeigh(false);

    const distObj = availableDistricts.find((d) => d.name === val);
    const firstSub = distObj?.subDistricts[0]?.name || '';
    const firstNeigh = distObj?.subDistricts[0]?.neighborhoods[0] || '';

    setDistrict(val);
    setSubDistrict(firstSub);
    setNeighborhood(firstNeigh);

    emitLocationUpdate({
      governorate,
      district: val,
      subDistrict: firstSub,
      neighborhood: firstNeigh,
      streetAddress,
    });
  };

  const handleSubDistrictSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualSub(true);
      setManualNeigh(true);
      setSubDistrict('');
      setNeighborhood('');
      emitLocationUpdate({
        governorate,
        district,
        subDistrict: '',
        neighborhood: '',
        streetAddress,
      });
      return;
    }

    setManualSub(false);
    setManualNeigh(false);

    const subObj = availableSubDistricts.find((s) => s.name === val);
    const firstNeigh = subObj?.neighborhoods[0] || '';

    setSubDistrict(val);
    setNeighborhood(firstNeigh);

    emitLocationUpdate({
      governorate,
      district,
      subDistrict: val,
      neighborhood: firstNeigh,
      streetAddress,
    });
  };

  const handleNeighborhoodSelect = (val: string) => {
    if (val === MANUAL_OPTION_VALUE) {
      setManualNeigh(true);
      setNeighborhood('');
      emitLocationUpdate({
        governorate,
        district,
        subDistrict,
        neighborhood: '',
        streetAddress,
      });
      return;
    }

    setManualNeigh(false);
    setNeighborhood(val);

    emitLocationUpdate({
      governorate,
      district,
      subDistrict,
      neighborhood: val,
      streetAddress,
    });
  };

  const isDistManualEffective = manualGov || manualDist || availableDistricts.length === 0;
  const isSubManualEffective =
    isDistManualEffective || manualSub || availableSubDistricts.length === 0;
  const isNeighManualEffective =
    isSubManualEffective || manualNeigh || availableNeighborhoods.length === 0;

  return (
    <div className="p-3.5 rounded-2xl bg-[#F4F6F9] dark:bg-slate-900/90 border border-[#E2E8F0] dark:border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#0B192C] dark:text-white">
          <MapPin className="w-4 h-4 text-[#0D9488] shrink-0" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          اختر من القوائم المتسلسلة أو اضغط «إدخال يدوي» عند عدم توفر المنطقة
        </span>
      </div>

      {/* 4 Cascading Levels Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Level 1: Governorate (المحافظة / المنطقة) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              1. المحافظة / المنطقة *
            </label>
            <button
              type="button"
              onClick={() => {
                if (manualGov) {
                  const defaultGov = YEMEN_LOCATIONS_HIERARCHY[0];
                  handleGovernorateSelect(defaultGov.name);
                } else {
                  handleGovernorateSelect(MANUAL_OPTION_VALUE);
                }
              }}
              className="text-[10px] font-bold text-[#0284C7] dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {manualGov ? (
                <>
                  <ListFilter className="w-3 h-3" />
                  <span>اختيار من القائمة</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3 h-3" />
                  <span>إدخال يدوي</span>
                </>
              )}
            </button>
          </div>

          {manualGov ? (
            <input
              type="text"
              value={governorate}
              onChange={(e) => {
                const v = e.target.value;
                setGovernorate(v);
                emitLocationUpdate({
                  governorate: v,
                  district,
                  subDistrict,
                  neighborhood,
                  streetAddress,
                });
              }}
              placeholder="اكتب اسم المحافظة أو المنطقة يدويًا..."
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 text-xs font-bold"
            />
          ) : (
            <select
              value={governorate}
              onChange={(e) => handleGovernorateSelect(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-white"
            >
              {!YEMEN_LOCATIONS_HIERARCHY.some((g) => g.name === governorate) && governorate && (
                <option value={governorate}>{governorate}</option>
              )}
              {YEMEN_LOCATIONS_HIERARCHY.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
              <option value={MANUAL_OPTION_VALUE}>✍️ أخرى (إدخال محافظة يدويًا)...</option>
            </select>
          )}
        </div>

        {/* Level 2: District (المديرية) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              2. المديرية {availableDistricts.length > 0 && !isDistManualEffective ? `(${availableDistricts.length})` : ''}
            </label>
            {!manualGov && availableDistricts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (manualDist) {
                    handleDistrictSelect(availableDistricts[0]?.name || '');
                  } else {
                    handleDistrictSelect(MANUAL_OPTION_VALUE);
                  }
                }}
                className="text-[10px] font-bold text-[#0284C7] dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {manualDist ? (
                  <>
                    <ListFilter className="w-3 h-3" />
                    <span>قائمة المديريات</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3 h-3" />
                    <span>إدخال يدوي</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isDistManualEffective ? (
            <input
              type="text"
              value={district}
              onChange={(e) => {
                const v = e.target.value;
                setDistrict(v);
                emitLocationUpdate({
                  governorate,
                  district: v,
                  subDistrict,
                  neighborhood,
                  streetAddress,
                });
              }}
              placeholder="اكتب اسم المديرية يدويًا (مثال: مديرية السبعين)..."
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 text-xs font-bold"
            />
          ) : (
            <select
              value={district}
              onChange={(e) => handleDistrictSelect(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-white"
            >
              <option value="">-- اختر المديرية --</option>
              {!availableDistricts.some((d) => d.name === district) && district && (
                <option value={district}>{district}</option>
              )}
              {availableDistricts.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
              <option value={MANUAL_OPTION_VALUE}>✍️ أخرى (إدخال مديرية يدويًا)...</option>
            </select>
          )}
        </div>

        {/* Level 3: Sub-District / Sector (العزلة / القطاع) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              3. العزلة / القطاع {availableSubDistricts.length > 0 && !isSubManualEffective ? `(${availableSubDistricts.length})` : ''}
            </label>
            {!isDistManualEffective && availableSubDistricts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (manualSub) {
                    handleSubDistrictSelect(availableSubDistricts[0]?.name || '');
                  } else {
                    handleSubDistrictSelect(MANUAL_OPTION_VALUE);
                  }
                }}
                className="text-[10px] font-bold text-[#0284C7] dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {manualSub ? (
                  <>
                    <ListFilter className="w-3 h-3" />
                    <span>قائمة العزل</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3 h-3" />
                    <span>إدخال يدوي</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isSubManualEffective ? (
            <input
              type="text"
              value={subDistrict}
              onChange={(e) => {
                const v = e.target.value;
                setSubDistrict(v);
                emitLocationUpdate({
                  governorate,
                  district,
                  subDistrict: v,
                  neighborhood,
                  streetAddress,
                });
              }}
              placeholder="اكتب اسم العزلة أو القطاع يدويًا..."
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 text-xs font-bold"
            />
          ) : (
            <select
              value={subDistrict}
              onChange={(e) => handleSubDistrictSelect(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-white"
            >
              <option value="">-- اختر العزلة / القطاع --</option>
              {!availableSubDistricts.some((s) => s.name === subDistrict) && subDistrict && (
                <option value={subDistrict}>{subDistrict}</option>
              )}
              {availableSubDistricts.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
              <option value={MANUAL_OPTION_VALUE}>✍️ أخرى (إدخال عزلة يدويًا)...</option>
            </select>
          )}
        </div>

        {/* Level 4: Neighborhood (الحي / الحارة) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              4. الحي / الحارة {availableNeighborhoods.length > 0 && !isNeighManualEffective ? `(${availableNeighborhoods.length})` : ''}
            </label>
            {!isSubManualEffective && availableNeighborhoods.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (manualNeigh) {
                    handleNeighborhoodSelect(availableNeighborhoods[0] || '');
                  } else {
                    handleNeighborhoodSelect(MANUAL_OPTION_VALUE);
                  }
                }}
                className="text-[10px] font-bold text-[#0284C7] dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {manualNeigh ? (
                  <>
                    <ListFilter className="w-3 h-3" />
                    <span>قائمة الأحياء</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3 h-3" />
                    <span>إدخال يدوي</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isNeighManualEffective ? (
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => {
                const v = e.target.value;
                setNeighborhood(v);
                emitLocationUpdate({
                  governorate,
                  district,
                  subDistrict,
                  neighborhood: v,
                  streetAddress,
                });
              }}
              placeholder="اكتب اسم الحي أو الحارة يدويًا (مثال: حي حدة)..."
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 text-xs font-bold"
            />
          ) : (
            <select
              value={neighborhood}
              onChange={(e) => handleNeighborhoodSelect(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-bold text-[#0B192C] dark:text-white"
            >
              <option value="">-- اختر الحي / الحارة --</option>
              {!availableNeighborhoods.includes(neighborhood) && neighborhood && (
                <option value={neighborhood}>{neighborhood}</option>
              )}
              {availableNeighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={MANUAL_OPTION_VALUE}>✍️ أخرى (إدخال حي يدويًا)...</option>
            </select>
          )}
        </div>
      </div>

      {/* Level 5: Detailed Street Address (العنوان التفصيلي / الشارع) */}
      <div>
        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
          5. العنوان التفصيلي (الشارع / المعلم القريب) {streetRequired ? '*' : ''}
        </label>
        <input
          type="text"
          required={streetRequired && !subDistrict && !neighborhood}
          value={streetAddress}
          onChange={(e) => {
            const v = e.target.value;
            setStreetAddress(v);
            emitLocationUpdate({
              governorate,
              district,
              subDistrict,
              neighborhood,
              streetAddress: v,
            });
          }}
          placeholder={streetPlaceholder}
          className="w-full min-h-[40px] px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs"
        />
      </div>

      {/* Live Preview of Formatted Location */}
      <div className="px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="text-slate-600 dark:text-slate-300 truncate">
          <span className="font-bold text-[#0B192C] dark:text-white">النطاق الإداري: </span>
          <span>{[governorate, district].filter(Boolean).join(' - ') || 'غير محدد'}</span>
        </div>
        <div className="text-slate-600 dark:text-slate-300 truncate">
          <span className="font-bold text-[#0D9488] dark:text-teal-400">العنوان المسجل: </span>
          <span>
            {[subDistrict, neighborhood, streetAddress].filter(Boolean).join(' - ') ||
              'يرجى اختيار الحي أو كتابة الشارع'}
          </span>
        </div>
      </div>
    </div>
  );
};
