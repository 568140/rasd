export interface YemenNeighborhood {
  name: string;
}

export interface YemenSubDistrict {
  name: string;
  neighborhoods: string[];
}

export interface YemenDistrict {
  name: string;
  subDistricts: YemenSubDistrict[];
}

export interface YemenGovernorate {
  id: string;
  name: string;
  districts: YemenDistrict[];
}

export interface StructuredLocation {
  governorate: string;
  district: string;
  subDistrict: string;
  neighborhood: string;
  streetAddress: string;
}

export const MANUAL_OPTION_VALUE = '__MANUAL_ENTRY__';

export const YEMEN_LOCATIONS_HIERARCHY: YemenGovernorate[] = [
  {
    id: 'gov_amanat_sanaa',
    name: 'أمانة العاصمة صنعاء',
    districts: [
      {
        name: 'مديرية السبعين',
        subDistricts: [
          {
            name: 'عزلة السبعين (قطاع حدة والجزيرة)',
            neighborhoods: [
              'حي حدة السكني',
              'حي المدينة السياحية',
              'حي فج عطان',
              'حي الكميم',
              'حي بير زاهر',
            ],
          },
          {
            name: 'عزلة الأصبحي وبيت بوس',
            neighborhoods: [
              'حي الأصبحي الجديد',
              'حي الأصبحي القديم',
              'حي بيت بوس',
              'حي المثلث الذهبي',
              'حي الشباب',
            ],
          },
          {
            name: 'عزلة شميلة ودار سلم',
            neighborhoods: [
              'حي شميلة',
              'حي دار سلم',
              'حي الجرداء',
              'حي النهدين',
              'حي السبعين الجنوبي',
            ],
          },
        ],
      },
      {
        name: 'مديرية بني الحارث',
        subDistricts: [
          {
            name: 'عزلة الروضة',
            neighborhoods: [
              'الروضة',
              'سوق العنب',
              'حارة قريش',
              'حي المطار',
              'حي الكليات',
            ],
          },
          {
            name: 'عزلة جدر وبني حوات',
            neighborhoods: [
              'حي جدر',
              'حي بني حوات',
              'حي العروق',
              'حي المصعبين',
            ],
          },
          {
            name: 'عزلة الحتارش وصرف',
            neighborhoods: [
              'حي الحتارش',
              'حي صرف',
              'حي بيت دغيش',
              'حي الملكة',
            ],
          },
        ],
      },
      {
        name: 'مديرية الثورة',
        subDistricts: [
          {
            name: 'عزلة الحصبة والجراف',
            neighborhoods: [
              'الحصبة',
              'حي الجراف الشرقي',
              'حي الجراف الغربي',
              'حي التلفزيون',
              'حي مازدا',
            ],
          },
          {
            name: 'عزلة صوفان والنهضة',
            neighborhoods: [
              'حي صوفان',
              'حي النهضة',
              'حي السنينة الشمالي',
              'حي الملعب',
            ],
          },
        ],
      },
      {
        name: 'مديرية معين',
        subDistricts: [
          {
            name: 'عزلة السنينة ومذبح',
            neighborhoods: [
              'حي السنينة',
              'حي مذبح',
              'حي شملان',
              'حي الجامعة الجديدة',
            ],
          },
          {
            name: 'عزلة الدائري والستين الغربي',
            neighborhoods: [
              'حي الدائري الغربي',
              'حي هائل',
              'حي الرقاص',
              'حي القبة',
              'حي عصر',
            ],
          },
        ],
      },
      {
        name: 'مديرية الوحدة',
        subDistricts: [
          {
            name: 'عزلة حدة الوسطى والزبيري',
            neighborhoods: [
              'حي الزبيري',
              'حي بغداد',
              'حي الجزائر',
              'حي عمان',
            ],
          },
          {
            name: 'عزلة عصر والبلقة',
            neighborhoods: [
              'حي البلقة',
              'حي الستين الوسطى',
              'حي الكرامة',
              'حي الرباط',
            ],
          },
        ],
      },
      {
        name: 'مديرية التحرير',
        subDistricts: [
          {
            name: 'عزلة التحرير والقاع',
            neighborhoods: [
              'حي التحرير',
              'حي القاع',
              'حي جمال',
              'حي السفيه',
              'حي المتوكل',
            ],
          },
        ],
      },
      {
        name: 'مديرية الصافية',
        subDistricts: [
          {
            name: 'عزلة الصافية والغراسي',
            neighborhoods: [
              'حي الصافية الشرقية',
              'حي الصافية الغربية',
              'حي المالية',
              'حي الخفجي',
              'حي السائلة',
            ],
          },
        ],
      },
      {
        name: 'مديرية شعوب',
        subDistricts: [
          {
            name: 'عزلة شعوب والحشيشية',
            neighborhoods: [
              'حي شعوب',
              'حي الحشيشية',
              'حي سعوان الشمالي',
              'حي هبره',
              'حي مسيك',
              'حي الجبانة',
            ],
          },
        ],
      },
      {
        name: 'مديرية أزال',
        subDistricts: [
          {
            name: 'عزلة نقم وسعوان',
            neighborhoods: [
              'حي سعوان',
              'حي نقم',
              'حي الفردوس',
              'حي الأربعين',
              'حي شيراتون',
            ],
          },
        ],
      },
      {
        name: 'مديرية صنعاء القديمة',
        subDistricts: [
          {
            name: 'عزلة صنعاء القديمة وباب اليمن',
            neighborhoods: [
              'حارة باب اليمن',
              'حارة الجامع الكبير',
              'حارة القاسمي',
              'حارة الأبهر',
              'حارة الفليحي',
              'حارة الطبرى',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_sanaa_prov',
    name: 'محافظة صنعاء',
    districts: [
      {
        name: 'مديرية سنحان وبني بهلول',
        subDistricts: [
          {
            name: 'عزلة سنحان المركز (حزيز ودار سلم)',
            neighborhoods: ['حي حزيز', 'حي قاع القيضي', 'حي ريمة حميد', 'حي بيت بوس الجنوبي'],
          },
          {
            name: 'عزلة سيان وبيت حاضر',
            neighborhoods: ['حي سيان', 'حي بيت حاضر', 'حي مقولة'],
          },
        ],
      },
      {
        name: 'مديرية همدان',
        subDistricts: [
          {
            name: 'عزلة ضلاع وشملان',
            neighborhoods: ['حي ضلاع همدان', 'حي وادي ظهر', 'حي طيبة', 'حي الأزرقين'],
          },
          {
            name: 'عزلة ربع همدان',
            neighborhoods: ['حي الجاهلية', 'حي بيت نعم', 'حي المنقب'],
          },
        ],
      },
      {
        name: 'مديرية بني مطر',
        subDistricts: [
          {
            name: 'عزلة الصباحة ومتنة',
            neighborhoods: ['حي الصباحة', 'حي متنة', 'حي عصر الأعلى', 'حي بيت عذران'],
          },
        ],
      },
      {
        name: 'مديرية بني حشيش',
        subDistricts: [
          {
            name: 'عزلة سعوان وصرف',
            neighborhoods: ['حي بيت حنبص', 'حي رجام', 'حي سعوان الشرقي', 'حي الشرية'],
          },
        ],
      },
      {
        name: 'مديرية أرحب',
        subDistricts: [
          {
            name: 'عزلة بيت مران والخشب',
            neighborhoods: ['حي الهجر', 'حي بيت مران', 'حي يحيص'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_aden',
    name: 'محافظة عدن',
    districts: [
      {
        name: 'مديرية صيرة (كريتر)',
        subDistricts: [
          {
            name: 'قطاع كريتر التجاري والسكني',
            neighborhoods: ['حي العيدروس', 'حي الميدان', 'حي القطيع', 'حي الطويلة', 'حي الخساف'],
          },
        ],
      },
      {
        name: 'مديرية المنصورة',
        subDistricts: [
          {
            name: 'قطاع المنصورة وريمي',
            neighborhoods: ['حي ريمي', 'حي القاهرة', 'حي كابوتا', 'حي عبد العزيز', 'حي التقنية'],
          },
        ],
      },
      {
        name: 'مديرية خور مكسر',
        subDistricts: [
          {
            name: 'قطاع خور مكسر والساحل',
            neighborhoods: ['حي السعادة', 'حي الملاحات', 'حي العريش', 'حي الشابات', 'حي النصر'],
          },
        ],
      },
      {
        name: 'مديرية الشيخ عثمان',
        subDistricts: [
          {
            name: 'قطاع الشيخ عثمان والممدارة',
            neighborhoods: ['حي الهاشمي', 'حي الممدارة', 'حي السيلة', 'حي المحاريق'],
          },
        ],
      },
      {
        name: 'مديرية المعلا',
        subDistricts: [
          {
            name: 'قطاع المعلا الرئيسي',
            neighborhoods: ['حي الشارع الرئيسي', 'حي الدكة', 'حي الشيخ إسحاق', 'حي كاسترو'],
          },
        ],
      },
      {
        name: 'مديرية التواهي',
        subDistricts: [
          {
            name: 'قطاع التواهي والقلوعة',
            neighborhoods: ['حي القلوعة', 'حي الروضة التواهي', 'حي الفتح', 'حي جولدمور'],
          },
        ],
      },
      {
        name: 'مديرية دار سعد',
        subDistricts: [
          {
            name: 'قطاع دار سعد والبساتين',
            neighborhoods: ['حي البساتين', 'حي دار سعد الشرقية', 'حي دار سعد الغربية'],
          },
        ],
      },
      {
        name: 'مديرية البريقة',
        subDistricts: [
          {
            name: 'قطاع البريقة وإنماء',
            neighborhoods: ['مدينة إنماء السكنية', 'حي الشعب', 'حي المصفاة', 'حي الحسوة'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_taiz',
    name: 'محافظة تعز',
    districts: [
      {
        name: 'مديرية القاهرة',
        subDistricts: [
          {
            name: 'قطاع القاهرة وعصيفرة',
            neighborhoods: ['حي الروضة تعز', 'حي المسبح', 'حي عصيفرة', 'حي التحرير الأسفل'],
          },
        ],
      },
      {
        name: 'مديرية المظفر',
        subDistricts: [
          {
            name: 'قطاع المظفر والحصب',
            neighborhoods: ['حي الحصب', 'حي بئر باشا', 'حي المجلية', 'حي صينة'],
          },
        ],
      },
      {
        name: 'مديرية صالة',
        subDistricts: [
          {
            name: 'قطاع صالة والجحملية',
            neighborhoods: ['حي الجحملية', 'حي حوض الأشراف', 'حي الكنب', 'حي ثعبات'],
          },
        ],
      },
      {
        name: 'مديرية التعزية (الحوبان)',
        subDistricts: [
          {
            name: 'عزلة الحوبان والجند',
            neighborhoods: ['حي الحوبان', 'حي الجند', 'حي القصر', 'حي مفرق ماوية'],
          },
        ],
      },
      {
        name: 'مديرية الشمايتين (التربة)',
        subDistricts: [
          {
            name: 'عزلة التربة المركز',
            neighborhoods: ['حي التربة التجاري', 'حي السوق القديم', 'حي النور'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_ibb',
    name: 'محافظة إب',
    districts: [
      {
        name: 'مديرية المشنة',
        subDistricts: [
          {
            name: 'قطاع المشنة وتفرعاته',
            neighborhoods: ['حي شارع تعز', 'حي المعاين', 'حي جرافة', 'حي السبل'],
          },
        ],
      },
      {
        name: 'مديرية الظهار',
        subDistricts: [
          {
            name: 'قطاع الظهار والدائري',
            neighborhoods: ['حي الظهار', 'حي السحول', 'حي شارع الثلاثين', 'حي العدين'],
          },
        ],
      },
      {
        name: 'مديرية يريم',
        subDistricts: [
          {
            name: 'عزلة يريم المركز',
            neighborhoods: ['حي السوق العام', 'حي كتاب', 'حي الدائري يريم'],
          },
        ],
      },
      {
        name: 'مديرية ذي السفال (القاعدة)',
        subDistricts: [
          {
            name: 'عزلة القاعدة',
            neighborhoods: ['حي مدينة القاعدة', 'حي السوق التجاري', 'حي النجد'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_hodeidah',
    name: 'محافظة الحديدة',
    districts: [
      {
        name: 'مديرية الحوك',
        subDistricts: [
          {
            name: 'قطاع الحوك وشارع صنعاء',
            neighborhoods: ['حي شارع صنعاء', 'حي الصديقية', 'حي غليل', 'حي الربصة'],
          },
        ],
      },
      {
        name: 'مديرية الحالي',
        subDistricts: [
          {
            name: 'قطاع الحالي والسبعين',
            neighborhoods: ['حي 7 يوليو', 'حي الكورنيش', 'حي السلخانة', 'حي التاج'],
          },
        ],
      },
      {
        name: 'مديرية الميناء',
        subDistricts: [
          {
            name: 'قطاع الميناء والتجاري',
            neighborhoods: ['حي الشهداء', 'حي التجاري', 'حي القلعة', 'حي المغتربين'],
          },
        ],
      },
      {
        name: 'مديرية باجل',
        subDistricts: [
          {
            name: 'عزلة باجل المركز',
            neighborhoods: ['حي باجل التجاري', 'حي المصنع', 'حي النصر'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_hadramaut',
    name: 'محافظة حضرموت',
    districts: [
      {
        name: 'مديرية مدينة المكلا',
        subDistricts: [
          {
            name: 'قطاع المكلا وفوة والديس',
            neighborhoods: ['حي الديس', 'حي الشرج', 'حي فوة', 'حي خلف', 'حي بويش'],
          },
        ],
      },
      {
        name: 'مديرية سيئون',
        subDistricts: [
          {
            name: 'قطاع سيئون المركز',
            neighborhoods: ['حي القرن', 'حي السحيل', 'حي الحوطة', 'حي تاربة'],
          },
        ],
      },
      {
        name: 'مديرية تريم',
        subDistricts: [
          {
            name: 'قطاع تريم وعيديد',
            neighborhoods: ['حي عيديد', 'حي الخليف', 'حي السحيل تريم'],
          },
        ],
      },
      {
        name: 'مديرية الشحر',
        subDistricts: [
          {
            name: 'قطاع الشحر الساحلي',
            neighborhoods: ['حي المنصورة الشحر', 'حي الخور', 'حي المجورة'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_dhamar',
    name: 'محافظة ذمار',
    districts: [
      {
        name: 'مديرية مدينة ذمار',
        subDistricts: [
          {
            name: 'قطاع مدينة ذمار',
            neighborhoods: ['حي الحوطة', 'حي الجمارك', 'حي الدائري', 'حي رداع ذمار'],
          },
        ],
      },
      {
        name: 'مديرية جهران (معبر)',
        subDistricts: [
          {
            name: 'عزلة معبر',
            neighborhoods: ['حي مدينة معبر', 'حي السوق التجاري'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_amran',
    name: 'محافظة عمران',
    districts: [
      {
        name: 'مديرية عمران',
        subDistricts: [
          {
            name: 'عزلة مدينة عمران',
            neighborhoods: ['حي السوق القديم', 'حي القشلة', 'حي المصنع'],
          },
        ],
      },
      {
        name: 'مديرية ريدة',
        subDistricts: [
          {
            name: 'عزلة ريدة المركز',
            neighborhoods: ['حي ريدة العام', 'حي السوق'],
          },
        ],
      },
      {
        name: 'مديرية خمر',
        subDistricts: [
          {
            name: 'عزلة خمر المركز',
            neighborhoods: ['حي خمر العام', 'حي السلام'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_marib',
    name: 'محافظة مأرب',
    districts: [
      {
        name: 'مديرية مدينة مأرب',
        subDistricts: [
          {
            name: 'عزلة المجمع والروضة',
            neighborhoods: ['حي المجمع', 'حي الروضة مأرب', 'حي الشركة', 'حي الجفينة'],
          },
        ],
      },
      {
        name: 'مديرية الوادي',
        subDistricts: [
          {
            name: 'عزلة الوادي',
            neighborhoods: ['حي الوادي', 'حي صافر'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_hajjah',
    name: 'محافظة حجة',
    districts: [
      {
        name: 'مديرية مدينة حجة',
        subDistricts: [
          {
            name: 'عزلة مدينة حجة',
            neighborhoods: ['حي الظفير', 'حي حورة', 'حي المجمع'],
          },
        ],
      },
      {
        name: 'مديرية عبس',
        subDistricts: [
          {
            name: 'عزلة شفر وعبس',
            neighborhoods: ['حي سوق شفر', 'حي عبس العام'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_saada',
    name: 'محافظة صعدة',
    districts: [
      {
        name: 'مديرية مدينة صعدة',
        subDistricts: [
          {
            name: 'عزلة مدينة صعدة',
            neighborhoods: ['حي صعدة القديمة', 'حي الجعملة', 'حي القصر'],
          },
        ],
      },
      {
        name: 'مديرية سحار',
        subDistricts: [
          {
            name: 'عزلة الطلح وسحار',
            neighborhoods: ['حي سوق الطلح', 'حي آل عمار'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_bayda',
    name: 'محافظة البيضاء',
    districts: [
      {
        name: 'مديرية مدينة البيضاء',
        subDistricts: [
          {
            name: 'عزلة مدينة البيضاء',
            neighborhoods: ['حي الشارع العام', 'حي الغريق', 'حي الدائري'],
          },
        ],
      },
      {
        name: 'مديرية رداع',
        subDistricts: [
          {
            name: 'عزلة مدينة رداع',
            neighborhoods: ['حي العامرية', 'حي القلعة', 'حي المصلى'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_lahj',
    name: 'محافظة لحج',
    districts: [
      {
        name: 'مديرية الحوطة',
        subDistricts: [
          {
            name: 'قطاع الحوطة المركز',
            neighborhoods: ['حي الحوطة العام', 'حي الدولة', 'حي الجامع'],
          },
        ],
      },
      {
        name: 'مديرية تبن',
        subDistricts: [
          {
            name: 'عزلة صبر والوهط',
            neighborhoods: ['حي صبر', 'حي الوهط', 'حي الفيوش'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_abyan',
    name: 'محافظة أبين',
    districts: [
      {
        name: 'مديرية زنجبار',
        subDistricts: [
          {
            name: 'قطاع زنجبار المركز',
            neighborhoods: ['حي سواحل', 'حي الطميسي', 'حي النصر'],
          },
        ],
      },
      {
        name: 'مديرية خنفر (جعار)',
        subDistricts: [
          {
            name: 'قطاع جعار والكود',
            neighborhoods: ['حي مدينة جعار', 'حي الكود', 'حي المخزن'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_shabwah',
    name: 'محافظة شبوة',
    districts: [
      {
        name: 'مديرية عتق',
        subDistricts: [
          {
            name: 'قطاع مدينة عتق',
            neighborhoods: ['حي النصب', 'حي الشهيد', 'حي المطار'],
          },
        ],
      },
      {
        name: 'مديرية بيحان',
        subDistricts: [
          {
            name: 'عزلة العليا بيحان',
            neighborhoods: ['حي مدينة العليا', 'حي السوق العام'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_mahrah',
    name: 'محافظة المهرة',
    districts: [
      {
        name: 'مديرية الغيضة',
        subDistricts: [
          {
            name: 'قطاع مدينة الغيضة',
            neighborhoods: ['حي الغيضة التجاري', 'حي الكورنيش', 'حي المطار'],
          },
        ],
      },
      {
        name: 'مديرية شحن',
        subDistricts: [
          {
            name: 'قطاع منفذ شحن',
            neighborhoods: ['حي شحن التجاري', 'حي الجمارك'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_mahwit',
    name: 'محافظة المحويت',
    districts: [
      {
        name: 'مديرية مدينة المحويت',
        subDistricts: [
          {
            name: 'عزلة مدينة المحويت',
            neighborhoods: ['حي المجمع', 'حي السوق القديم'],
          },
        ],
      },
      {
        name: 'مديرية شبام كوكبان',
        subDistricts: [
          {
            name: 'عزلة شبام كوكبان',
            neighborhoods: ['حي شبام', 'حي كوكبان'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_raymah',
    name: 'محافظة ريمة',
    districts: [
      {
        name: 'مديرية الجبين',
        subDistricts: [
          {
            name: 'عزلة الجبين المركز',
            neighborhoods: ['حي المجمع الحكومي', 'حي السوق'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_dhale',
    name: 'محافظة الضالع',
    districts: [
      {
        name: 'مديرية الضالع',
        subDistricts: [
          {
            name: 'قطاع مدينة الضالع',
            neighborhoods: ['حي الجليلة', 'حي العرشي', 'حي الشارع العام'],
          },
        ],
      },
      {
        name: 'مديرية قعطبة',
        subDistricts: [
          {
            name: 'عزلة قعطبة والفاخر',
            neighborhoods: ['حي قعطبة العام', 'حي الفاخر'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_jawf',
    name: 'محافظة الجوف',
    districts: [
      {
        name: 'مديرية الحزم',
        subDistricts: [
          {
            name: 'عزلة مدينة الحزم',
            neighborhoods: ['حي المجمع', 'حي السوق العام'],
          },
        ],
      },
    ],
  },
  {
    id: 'gov_socotra',
    name: 'محافظة أرخبيل سقطرى',
    districts: [
      {
        name: 'مديرية حديبو',
        subDistricts: [
          {
            name: 'قطاع مدينة حديبو',
            neighborhoods: ['حي حديبو المركز', 'حي الميناء', 'حي المطار'],
          },
        ],
      },
    ],
  },
];

/**
 * Formats structured location into Firestore-compliant `region` (<= 120 chars)
 * and `address` (<= 300 chars) fields.
 * - `region`: "المحافظة - المديرية"
 * - `address`: "العزلة - الحي - الشارع"
 */
export function composeRegionAndAddressFromLocation(loc: StructuredLocation): {
  region: string;
  address: string;
  zoneLabel: string;
} {
  const gov = (loc.governorate || '').trim();
  const dist = (loc.district || '').trim();
  const sub = (loc.subDistrict || '').trim();
  const neigh = (loc.neighborhood || '').trim();
  const street = (loc.streetAddress || '').trim();

  const regionParts = [gov, dist].filter(Boolean);
  const rawRegion = regionParts.length > 0 ? regionParts.join(' - ') : 'أمانة العاصمة صنعاء';
  const region = rawRegion.slice(0, 120);

  const addressParts = [sub, neigh, street].filter(Boolean);
  const rawAddress = addressParts.length > 0 ? addressParts.join(' - ') : street || neigh || sub || '';
  const address = rawAddress.slice(0, 300);

  const zoneLabel = neigh || sub || dist || gov || 'عام';

  return { region, address, zoneLabel };
}

/**
 * Parses `region` and `address` strings back into `{ governorate, district, subDistrict, neighborhood, streetAddress }`.
 * Handles both structured ("أمانة العاصمة صنعاء - مديرية السبعين") and legacy free-text ("صنعاء", "شارع الستين") seamlessly.
 */
export function parseLocationFromRegionAndAddress(
  regionRaw: string,
  addressRaw: string
): StructuredLocation {
  const cleanRegion = (regionRaw || '').trim();
  const cleanAddress = (addressRaw || '').trim();

  // 1. Parse region ("Governorate - District" or single value)
  let governorate = '';
  let district = '';

  if (cleanRegion.includes(' - ')) {
    const [rGov, ...rDistParts] = cleanRegion.split(' - ').map((s) => s.trim());
    governorate = rGov || '';
    district = rDistParts.join(' - ').trim();
  } else if (cleanRegion) {
    // Normalize common shorthand like "صنعاء" -> "أمانة العاصمة صنعاء"
    if (cleanRegion === 'صنعاء' || cleanRegion === 'أمانة العاصمة' || cleanRegion === 'أمانة العاصمة / صنعاء') {
      governorate = 'أمانة العاصمة صنعاء';
    } else if (cleanRegion === 'عدن') {
      governorate = 'محافظة عدن';
    } else if (cleanRegion === 'تعز') {
      governorate = 'محافظة تعز';
    } else if (cleanRegion === 'إب') {
      governorate = 'محافظة إب';
    } else if (cleanRegion === 'الحديدة') {
      governorate = 'محافظة الحديدة';
    } else if (cleanRegion === 'حضرموت') {
      governorate = 'محافظة حضرموت';
    } else {
      // Check if it matches a known governorate or district
      const matchedGov = YEMEN_LOCATIONS_HIERARCHY.find(
        (g) => g.name === cleanRegion || g.name.includes(cleanRegion)
      );
      if (matchedGov) {
        governorate = matchedGov.name;
      } else {
        // Check if it matches a known district
        for (const g of YEMEN_LOCATIONS_HIERARCHY) {
          const d = g.districts.find(
            (distItem) =>
              distItem.name === cleanRegion ||
              distItem.name.replace('مديرية ', '') === cleanRegion
          );
          if (d) {
            governorate = g.name;
            district = d.name;
            break;
          }
        }
        if (!governorate) {
          governorate = cleanRegion;
        }
      }
    }
  } else {
    governorate = 'أمانة العاصمة صنعاء';
  }

  // 2. Parse address ("SubDistrict - Neighborhood - Street" or free text)
  let subDistrict = '';
  let neighborhood = '';
  let streetAddress = '';

  if (cleanAddress.includes(' - ')) {
    const parts = cleanAddress
      .split(' - ')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      subDistrict = parts[0] || '';
      neighborhood = parts[1] || '';
      streetAddress = parts.slice(2).join(' - ');
    } else if (parts.length === 2) {
      // Could be Neighborhood - Street or SubDistrict - Neighborhood
      const govObj = YEMEN_LOCATIONS_HIERARCHY.find((g) => g.name === governorate);
      const distObj = govObj?.districts.find((d) => d.name === district);
      const isFirstSubDistrict = distObj?.subDistricts.some((s) => s.name === parts[0]);
      if (isFirstSubDistrict) {
        subDistrict = parts[0] || '';
        neighborhood = parts[1] || '';
      } else {
        neighborhood = parts[0] || '';
        streetAddress = parts[1] || '';
      }
    } else if (parts.length === 1) {
      streetAddress = parts[0] || '';
    }
  } else if (cleanAddress) {
    // Check if cleanAddress matches any known neighborhood in the hierarchy
    let matchedKnown = false;
    for (const g of YEMEN_LOCATIONS_HIERARCHY) {
      for (const d of g.districts) {
        for (const s of d.subDistricts) {
          const foundNeigh = s.neighborhoods.find((n) => cleanAddress === n);
          if (foundNeigh) {
            if (!governorate || governorate === 'أمانة العاصمة صنعاء') governorate = g.name;
            if (!district) district = d.name;
            subDistrict = s.name;
            neighborhood = foundNeigh;
            matchedKnown = true;
            break;
          }
        }
        if (matchedKnown) break;
      }
      if (matchedKnown) break;
    }
    if (!matchedKnown) {
      streetAddress = cleanAddress;
    }
  }

  // If neighborhood is known inside our hierarchy but subDistrict or district was empty, auto-resolve parent
  if (neighborhood && (!subDistrict || !district)) {
    for (const g of YEMEN_LOCATIONS_HIERARCHY) {
      if (governorate && g.name !== governorate) continue;
      for (const d of g.districts) {
        if (district && d.name !== district) continue;
        for (const s of d.subDistricts) {
          if (s.neighborhoods.includes(neighborhood)) {
            if (!governorate) governorate = g.name;
            if (!district) district = d.name;
            if (!subDistrict) subDistrict = s.name;
            break;
          }
        }
      }
    }
  }

  return {
    governorate,
    district,
    subDistrict,
    neighborhood,
    streetAddress,
  };
}
