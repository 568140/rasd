import React, { useState, useMemo } from 'react';
import {
  MapPin,
  Compass,
  Building2,
  Navigation,
  Info,
  AlertCircle,
} from 'lucide-react';
import { useRasd } from '../context/RasdContext';

export const MapScreen: React.FC = () => {
  const {
    properties,
    fieldVisits,
    setSelectedPropertyId,
    setActiveScreen,
    showToast,
  } = useRasd();

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'locating' | 'granted' | 'denied'>('idle');
  const [selectedMarker, setSelectedMarker] = useState<{
    id: string;
    type: 'property' | 'visit';
    title: string;
    subtitle: string;
    lat: number;
    lng: number;
  } | null>(null);

  // Strictly filter ONLY real records that have valid coordinates (never fake coordinates!)
  const geoProperties = useMemo(
    () =>
      properties.filter(
        (p) =>
          p.hasCoordinates &&
          typeof p.latitude === 'number' &&
          typeof p.longitude === 'number' &&
          (p.latitude !== 0 || p.longitude !== 0)
      ),
    [properties]
  );

  const geoVisits = useMemo(
    () =>
      fieldVisits.filter(
        (v) =>
          v.hasCoordinates &&
          typeof v.latitude === 'number' &&
          typeof v.longitude === 'number' &&
          (v.latitude !== 0 || v.longitude !== 0)
      ),
    [fieldVisits]
  );

  const activePoint = useMemo(() => {
    if (selectedMarker) return { lat: selectedMarker.lat, lng: selectedMarker.lng, label: selectedMarker.title };
    if (userLocation) return { lat: userLocation.lat, lng: userLocation.lng, label: 'موقعي الحالي (GPS)' };
    if (geoProperties[0]) {
      return {
        lat: geoProperties[0].latitude,
        lng: geoProperties[0].longitude,
        label: geoProperties[0].title,
      };
    }
    if (geoVisits[0]) {
      return {
        lat: geoVisits[0].latitude,
        lng: geoVisits[0].longitude,
        label: `زيارة: ${geoVisits[0].propertyTitle}`,
      };
    }
    return null;
  }, [selectedMarker, userLocation, geoProperties, geoVisits]);

  const handleRequestGPS = () => {
    if (!navigator.geolocation) {
      showToast('جهازك لا يدعم تحديد الموقع الجغرافي (GPS).', 'error');
      return;
    }
    setGpsStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGpsStatus('granted');
        showToast('تم تحديد موقعك الجغرافي الحالي بنجاح', 'success');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
          showToast('تم رفض إذن الموقع الجغرافي (GPS). احترم النظام اختيارك ولن يتم عرض موقع افتراضي.', 'info');
        } else {
          setGpsStatus('idle');
          showToast('تعذر التقاط إشارة GPS الحالية.', 'warning');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Deep Navy Map Header */}
      <div className="rounded-3xl bg-gradient-to-l from-[#0B192C] via-[#102A46] to-[#0369A1] text-white p-5 sm:p-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold">الخريطة الميدانية</h1>
          <p className="text-xs text-slate-300 mt-0.5">
            تعرض فقط العقارات ({geoProperties.length}) والزيارات ({geoVisits.length}) التي تملك إحداثيات حقيقية مسجلة
          </p>
        </div>

        <button
          type="button"
          onClick={handleRequestGPS}
          disabled={gpsStatus === 'locating'}
          className="min-h-[46px] px-4 rounded-2xl bg-[#0D9488] hover:bg-[#0F766E] text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-colors"
        >
          <Compass className="w-4 h-4" />
          <span>{gpsStatus === 'locating' ? 'جاري قراءة GPS...' : 'تحديد موقعي الحالي (GPS)'}</span>
        </button>
      </div>

      {/* Transparency Notice on Map Provider */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 shadow-xs">
        <Info className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
        <div>
          <strong>حالة خدمة الخرائط:</strong> لم يتم تفعيل مفتاح Google Maps Platform أثناء الإعداد، لذلك يعمل التطبيق عبر <strong>الخريطة التفاعلية البديلة (OpenStreetMap) وعارض الإحداثيات الميداني الحقيقي</strong> دون اختلاق أي مواقع وهمية.
        </div>
      </div>

      {gpsStatus === 'denied' && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>رفضت منح إذن GPS. يمكنك استعراض العقارات والزيارات ذات الإحداثيات المحفوظة أدناه.</span>
        </div>
      )}

      {/* Main Map Viewport or Empty Coordinate State */}
      {!activePoint ? (
        <div className="bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-10 text-center shadow-xs">
          <MapPin className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
            لا توجد إحداثيات جغرافية مسجلة حتى الآن
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-5 leading-relaxed">
            التزامًا بمعايير الدقة في رَصْد، لا نعرض مواقع افتراضية أو وهمية على الخريطة. يرجى التقاط موقعك عبر زر GPS أعلاه أو إضافة إحداثيات لعقار أو زيارة ميدانية.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={handleRequestGPS}
              className="min-h-[44px] px-4 rounded-2xl bg-[#0B192C] dark:bg-[#0284C7] text-white text-xs font-bold cursor-pointer"
            >
              طلب إذن GPS الآن
            </button>
            <button
              type="button"
              onClick={() => setActiveScreen('properties')}
              className="min-h-[44px] px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
            >
              الانتقال لشاشة العقارات
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Interactive Map Frame */}
          <div className="lg:col-span-8 bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl overflow-hidden flex flex-col shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-500">الموقع المعروض حاليًا</div>
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">{activePoint.label}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
                  {activePoint.lat.toFixed(6)}, {activePoint.lng.toFixed(6)}
                </span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${activePoint.lat}&mlon=${activePoint.lng}#map=16/${activePoint.lat}/${activePoint.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-[#0284C7] dark:text-sky-300 text-xs font-bold flex items-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>فتح في الخرائط</span>
                </a>
              </div>
            </div>

            <div className="w-full h-[360px] bg-slate-100 dark:bg-slate-800 relative">
              <iframe
                title="خريطة الموقع الميداني"
                className="w-full h-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${activePoint.lng - 0.008}%2C${
                  activePoint.lat - 0.008
                }%2C${activePoint.lng + 0.008}%2C${activePoint.lat + 0.008}&layer=mapnik&marker=${
                  activePoint.lat
                }%2C${activePoint.lng}`}
              />
            </div>
          </div>

          {/* Real Geotagged Records List */}
          <div className="lg:col-span-4 bg-white dark:bg-[#0D1829] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-5 space-y-4 max-h-[440px] overflow-y-auto shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              المواقع الحقيقية المسجلة ({geoProperties.length + geoVisits.length})
            </h3>

            {userLocation && (
              <button
                type="button"
                onClick={() =>
                  setSelectedMarker({
                    id: 'gps',
                    type: 'visit',
                    title: 'موقعي الحالي (GPS)',
                    subtitle: 'التُقط من مستشعر الجهاز',
                    lat: userLocation.lat,
                    lng: userLocation.lng,
                  })
                }
                className="w-full text-right p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-xs cursor-pointer"
              >
                <div className="font-bold text-teal-800 dark:text-teal-300">موقعي الجغرافي الحالي</div>
                <div className="font-mono text-teal-600 mt-0.5">
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                </div>
              </button>
            )}

            <div className="space-y-2">
              {geoProperties.map((p) => (
                <div
                  key={p.id}
                  onClick={() =>
                    setSelectedMarker({
                      id: p.id,
                      type: 'property',
                      title: p.title,
                      subtitle: p.region,
                      lat: p.latitude,
                      lng: p.longitude,
                    })
                  }
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer text-xs"
                >
                  <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>{p.title}</span>
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPropertyId(p.id);
                        setActiveScreen('properties');
                      }}
                      className="text-[#0284C7] dark:text-sky-400 underline font-bold"
                    >
                      ملف العقار
                    </button>
                  </div>
                  <div className="text-slate-500 mt-1 font-mono">
                    {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}
                  </div>
                </div>
              ))}

              {geoVisits.map((v) => (
                <div
                  key={v.id}
                  onClick={() =>
                    setSelectedMarker({
                      id: v.id,
                      type: 'visit',
                      title: `زيارة: ${v.propertyTitle}`,
                      subtitle: v.visitDate,
                      lat: v.latitude,
                      lng: v.longitude,
                    })
                  }
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer text-xs"
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    زيارة ميدانية: {v.propertyTitle} ({v.visitDate})
                  </div>
                  <div className="text-slate-500 mt-1 font-mono">
                    {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
