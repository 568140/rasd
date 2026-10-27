import { DossierTabId, PropertyNavigationOrigin, ScreenId } from '../types/rasd';

export interface ParsedTaxpayerNotes {
  generalNotes: string;
  agentName: string;
  agentPhone: string;
}

/**
 * يحلل حقل الملاحظات (notes) للمكلف لفصل الملاحظات العامة عن بيانات الوكيل المدمجة
 * دون فقدان أي بيانات قديمة أو نصوص متعددة الأسطر.
 */
export function parseTaxpayerNotesAndAgent(rawNotes?: string | null): ParsedTaxpayerNotes {
  const raw = String(rawNotes || '');
  if (!raw.trim()) {
    return {
      generalNotes: '',
      agentName: '',
      agentPhone: '',
    };
  }

  const phoneMatch = raw.match(/هاتف الوكيل:\s*([0-9+\s-]+)/);
  const rawWithoutPhone = raw.replace(/هاتف الوكيل:\s*[0-9+\s-]+/g, '');
  const nameMatch = rawWithoutPhone.match(/الوكيل:\s*([^|\n،]+)/);

  const agentName = (nameMatch?.[1] || '').trim();
  const agentPhone = (phoneMatch?.[1] || '').trim();

  const cleanedLines: string[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const segments = line.split('|');
    const keptSegments: string[] = [];

    for (const seg of segments) {
      const cleanedSeg = seg
        .replace(/هاتف الوكيل:\s*[0-9+\s-]+/g, '')
        .replace(/الوكيل:\s*[^|\n،]+/g, '')
        .replace(/^[،,\s-]+|[،,\s-]+$/g, '')
        .trim();

      if (cleanedSeg) {
        keptSegments.push(cleanedSeg);
      }
    }

    if (keptSegments.length > 0) {
      cleanedLines.push(keptSegments.join(' | '));
    }
  }

  return {
    generalNotes: cleanedLines.join('\n').trim(),
    agentName,
    agentPhone,
  };
}

/**
 * يدمج الملاحظات العامة للمكلف مع بيانات الوكيل في حقل notes بطريقة آمنة ومتوافقة
 * مع السجلات القديمة وقواعد Firestore دون تكرار أو مسح لأي منهما.
 */
export function composeTaxpayerNotesWithAgent(
  generalNotes?: string | null,
  agentName?: string | null,
  agentPhone?: string | null
): string {
  const parsedFromGeneral = parseTaxpayerNotesAndAgent(generalNotes);
  const cleanGeneral = parsedFromGeneral.generalNotes;
  const finalAgentName = (agentName ?? parsedFromGeneral.agentName ?? '').trim();
  const finalAgentPhone = (agentPhone ?? parsedFromGeneral.agentPhone ?? '').trim();

  const parts: string[] = [];
  if (cleanGeneral) {
    parts.push(cleanGeneral);
  }
  if (finalAgentName) {
    parts.push(`الوكيل: ${finalAgentName}`);
  }
  if (finalAgentPhone) {
    parts.push(`هاتف الوكيل: ${finalAgentPhone}`);
  }

  return parts.join(' | ');
}

/**
 * يحسم وجهة الرجوع الصحيحة عند الضغط على سهم الرجوع من شاشة تفاصيل العقار
 * بناءً على مصدر التنقل المحفوظ.
 */
export function resolvePropertyBackTransition(params: {
  activeScreen: ScreenId;
  selectedPropertyId: string | null;
  selectedTaxpayerId: string | null;
  propertyNavigationOrigin: PropertyNavigationOrigin | null;
}): {
  nextScreen: ScreenId;
  nextSelectedPropertyId: string | null;
  nextSelectedTaxpayerId: string | null;
  nextDossierTab?: DossierTabId;
  nextOrigin: PropertyNavigationOrigin | null;
} {
  const {
    activeScreen,
    selectedPropertyId,
    selectedTaxpayerId,
    propertyNavigationOrigin,
  } = params;

  if (selectedPropertyId && activeScreen === 'properties') {
    if (
      propertyNavigationOrigin?.source === 'taxpayer_dossier' &&
      propertyNavigationOrigin.taxpayerId
    ) {
      return {
        nextScreen: 'taxpayers',
        nextSelectedPropertyId: null,
        nextSelectedTaxpayerId: propertyNavigationOrigin.taxpayerId,
        nextDossierTab: propertyNavigationOrigin.dossierTab || 'properties_and_units',
        nextOrigin: null,
      };
    }

    if (propertyNavigationOrigin?.source === 'taxpayers_properties_directory') {
      return {
        nextScreen: 'taxpayers',
        nextSelectedPropertyId: null,
        nextSelectedTaxpayerId: null,
        nextOrigin: null,
      };
    }

    return {
      nextScreen: 'properties',
      nextSelectedPropertyId: null,
      nextSelectedTaxpayerId: selectedTaxpayerId,
      nextOrigin: null,
    };
  }

  if (selectedTaxpayerId) {
    return {
      nextScreen: activeScreen,
      nextSelectedPropertyId: null,
      nextSelectedTaxpayerId: null,
      nextOrigin: null,
    };
  }

  if (selectedPropertyId) {
    return {
      nextScreen: activeScreen,
      nextSelectedPropertyId: null,
      nextSelectedTaxpayerId: null,
      nextOrigin: null,
    };
  }

  return {
    nextScreen: 'home',
    nextSelectedPropertyId: null,
    nextSelectedTaxpayerId: null,
    nextOrigin: null,
  };
}
