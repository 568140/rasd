export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export type ScreenId =
  | 'home'
  | 'properties'
  | 'voice'
  | 'appointments'
  | 'more'
  | 'taxpayers'
  | 'visits'
  | 'map'
  | 'assessments'
  | 'transactions'
  | 'reports'
  | 'team'
  | 'audit'
  | 'notifications'
  | 'settings'
  | 'platform_admin';

export type DossierTabId =
  | 'properties_and_units'
  | 'financial_file'
  | 'visits_and_appointments'
  | 'activity_timeline';

export interface PropertyNavigationOrigin {
  source: 'taxpayer_dossier' | 'properties_list' | 'taxpayers_properties_directory';
  taxpayerId?: string | null;
  dossierTab?: DossierTabId;
}

export type WorkspaceRole = 'owner' | 'field_assistant' | 'finance_assistant' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'suspended';

export interface SyncMeta {
  id: string;
  isPendingSync?: boolean;
  fromCache?: boolean;
}

export interface UserProfile extends SyncMeta {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  jobTitle: string;
  activeWorkspaceId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CurrencyCode =
  | 'YER'
  | 'SAR'
  | 'AED'
  | 'EGP'
  | 'JOD'
  | 'IQD'
  | 'KWD'
  | 'OMR'
  | 'QAR'
  | 'BHD'
  | 'USD';

export const CURRENCY_LIST: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'YER', label: 'الريال اليمني (YER)', symbol: 'ر.ي' },
  { code: 'SAR', label: 'الريال السعودي (SAR)', symbol: 'ر.س' },
  { code: 'USD', label: 'الدولار الأمريكي (USD)', symbol: '$' },
  { code: 'AED', label: 'الدرهم الإماراتي (AED)', symbol: 'د.إ' },
  { code: 'EGP', label: 'الجنيه المصري (EGP)', symbol: 'ج.م' },
  { code: 'JOD', label: 'الدينار الأردني (JOD)', symbol: 'د.أ' },
  { code: 'IQD', label: 'الدينار العراقي (IQD)', symbol: 'د.ع' },
  { code: 'KWD', label: 'الدينار الكويتي (KWD)', symbol: 'د.ك' },
  { code: 'OMR', label: 'الريال العماني (OMR)', symbol: 'ر.ع' },
  { code: 'QAR', label: 'الريال القطري (QAR)', symbol: 'ر.ق' },
  { code: 'BHD', label: 'الدينار البحريني (BHD)', symbol: 'د.ب' },
];

export interface Workspace extends SyncMeta {
  name: string;
  ownerId: string;
  ownerName: string;
  defaultCurrency: CurrencyCode;
  taxRatePercent: number;
  regionName: string;
  inviteCode: string;
  memberUids: string[];
  memberCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WorkspaceMember extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  userId: string;
  displayName: string;
  email: string;
  role: WorkspaceRole;
  status: MemberStatus;
  canApproveFinancials: boolean;
  canDeleteRecords: boolean;
  memberUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TaxpayerStatus = 'active' | 'under_review' | 'archived';

export interface Taxpayer extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  fullName: string;
  internalCode: string;
  nationalOrCommercialId: string;
  phone: string;
  email: string;
  address: string;
  region: string;
  status: TaxpayerStatus;
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PropertyType = 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed';
export type PropertyStatus = 'active' | 'under_inspection' | 'disputed' | 'exempt' | 'archived';
export type UnitType = 'apartment' | 'shop' | 'office' | 'warehouse' | 'annex' | 'other';
export type OccupancyStatus = 'occupied' | 'vacant' | 'owner_used' | 'under_maintenance';
export type RentPeriod = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export interface PropertyFloorConfig {
  floorKey: string;
  floorLabel: string;
  floorOrder: number;
  apartmentsCount: number;
  shopsCount: number;
  officesCount: number;
  annexesCount: number;
}

export interface Property extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  taxpayerId: string;
  taxpayerName: string;
  title: string;
  code: string;
  propertyType: PropertyType;
  status: PropertyStatus;
  region: string;
  address: string;
  governorateId?: string;
  directorateId?: string;
  zone?: string;
  street?: string;
  latitude: number;
  longitude: number;
  hasCoordinates: boolean;
  unitsCount: number;
  areaSqm: number;
  floorsCount?: number;
  hasBasement?: boolean;
  apartmentsCount?: number;
  shopsCount?: number;
  officesCount?: number;
  annexesCount?: number;
  floorsConfig?: PropertyFloorConfig[];
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PropertyUnit extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  propertyId: string;
  propertyTitle: string;
  taxpayerId: string;
  unitNumber: string;
  unitType: UnitType;
  floor: string;
  areaSqm: number;
  occupancyStatus: OccupancyStatus;
  tenantName: string;
  rentAmount?: number;
  rentPeriod?: RentPeriod;
  annualRentEstimate: number;
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type VisitPurpose =
  | 'initial_survey'
  | 'periodic_inspection'
  | 'valuation_verify'
  | 'collection_followup'
  | 'dispute_check';

export type VisitStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'postponed'
  | 'impeded'
  | 'cancelled'
  | 'requires_followup'
  | 'occupant_absent'
  | 'access_denied';

export interface FieldVisit extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  propertyId: string;
  propertyTitle: string;
  taxpayerId: string;
  taxpayerName: string;
  visitDate: string;
  visitTime: string;
  purpose: VisitPurpose;
  status: VisitStatus;
  latitude: number;
  longitude: number;
  hasCoordinates: boolean;
  photoSummary: string;
  notes: string;
  memberUids: string[];
  officerId: string;
  officerName: string;
  linkedAppointmentId?: string;
  governorate?: string;
  directorate?: string;
  zone?: string;
  dailyPlanId?: string;
  impedimentReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AppointmentStatus =
  | 'upcoming'
  | 'due'
  | 'postponed'
  | 'completed'
  | 'cancelled'
  | 'missed';

export interface Appointment extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  title: string;
  propertyId: string;
  propertyTitle: string;
  taxpayerId: string;
  taxpayerName: string;
  scheduledDate: string;
  scheduledTime: string;
  locationText: string;
  status: AppointmentStatus;
  postponeCount: number;
  lastPostponeReason: string;
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  reminderMinutesBefore?: number;
  linkedVisitId?: string;
  durationMinutes?: number;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppointmentPostponement extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  appointmentId: string;
  previousDate: string;
  previousTime: string;
  newDate: string;
  newTime: string;
  reason: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
}

export type AssessmentStatus = 'draft' | 'approved' | 'cancelled';

export interface FinancialAssessment extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  propertyId: string;
  propertyTitle: string;
  taxpayerId: string;
  taxpayerName: string;
  contractValue?: number;
  amount: number;
  currency: string;
  periodLabel: string;
  assessmentDate: string;
  status: AssessmentStatus;
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TransactionType = 'payment' | 'fee' | 'adjustment' | 'reversal';
export type TransactionStatus = 'pending' | 'approved' | 'reversed';

export interface FinancialTransaction extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  propertyId: string;
  propertyTitle: string;
  taxpayerId: string;
  taxpayerName: string;
  assessmentId: string;
  transactionType: TransactionType;
  amount: number;
  currency: string;
  transactionDate: string;
  referenceNumber: string;
  status: TransactionStatus;
  notes: string;
  memberUids: string[];
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type NotificationCategory = 'appointment' | 'visit' | 'finance' | 'team' | 'system';

export interface NotificationItem extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  isRead: boolean;
  memberUids: string[];
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reverse'
  | 'postpone'
  | 'team_change'
  | 'voice_command';

export type AuditEntityType =
  | 'taxpayer'
  | 'property'
  | 'unit'
  | 'visit'
  | 'appointment'
  | 'assessment'
  | 'transaction'
  | 'member'
  | 'workspace';

export interface AuditLog extends SyncMeta {
  workspaceId: string;
  ownerId: string;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  actorId: string;
  actorName: string;
  memberUids: string[];
  createdAt?: unknown;
}

// ============================================================================
// نظام إدارة المنصة والاشتراكات والتراخيص (المرحلة الأولى — تأسيس الأنواع)
// ============================================================================

export type PermanentPlatformOwnerEmail =
  | 'am1075022@gmail.com'
  | 'ahah26@gmail.com'
  | 'ahah26h@gmail.com';

export type PlatformOwnerRole = 'primary_owner' | 'backup_owner';

export type LicenseStatus = 'pending' | 'active' | 'expired' | 'suspended';

export type SubscriptionPlanId =
  | 'owner_permanent'
  | 'lifetime'
  | 'trial'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'custom';

export type SubscriptionBillingCycle =
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'lifetime'
  | 'custom';

export interface SubscriptionPackage {
  id: SubscriptionPlanId;
  nameAr: string;
  descriptionAr: string;
  billingCycle: SubscriptionBillingCycle;
  /** عدد أيام الباقة، أو null للباقات الدائمة / مدى الحياة */
  durationDays: number | null;
  isLifetime: boolean;
  isFreeOwnerPlan?: boolean;
  defaultMaxMembers: number;
  priceAmount: number;
  currency: CurrencyCode;
  isActive: boolean;
}

export interface AccountLicense extends SyncMeta {
  /** مطابق لمعرف الوثيقة في /account_licenses/{workspaceId} */
  workspaceId: string;
  ownerId: string;
  ownerEmail: string;
  planId: SubscriptionPlanId;
  status: LicenseStatus;
  startsAt: unknown;
  expiresAt: unknown;
  maxMembers: number;
  notes: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type PlatformStaffStatus = 'active' | 'suspended';

export interface PlatformStaffPermissions {
  canViewRequests: boolean;
  canApproveAndRenew: boolean;
  canManagePackages: boolean;
}

export interface PlatformStaff extends SyncMeta {
  uid: string;
  email: string;
  displayName: string;
  status: PlatformStaffStatus;
  permissions: PlatformStaffPermissions;
  assignedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ============================================================================
// نظام طلبات تسجيل العملاء وبوابة الموافقة (المرحلة الثانية — استقبال الطلبات)
// ============================================================================

export type AccountApprovalGateStatus =
  | 'checking'
  | 'approved'
  | 'legacy_active'
  | 'pending_approval'
  | 'suspended';

export type AccountApprovalReasonCode =
  | 'permanent_owner'
  | 'active_license'
  | 'grandfathered_existing_account'
  | 'invited_team_member'
  | 'expired_license_not_enforced_yet'
  | 'new_account_pending_approval'
  | 'existing_pending_request'
  | 'account_suspended';

export interface RegistrationRequestMetadata {
  applicantUid: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  workspaceId: string;
  workspaceName: string;
  requestedPlanId: SubscriptionPlanId;
  status: LicenseStatus;
  requestedAtIso: string;
  source: 'account_licenses' | 'workspace_member_marker' | 'local_cache';
  notes: string;
}

// ============================================================================
// لوحة إدارة منصة «رَصْد» (المرحلة الثالثة — إدارة الطلبات، الاشتراكات، الباقات، والمساعدين)
// ============================================================================

export type PlatformAdminOperation =
  | 'view_admin_dashboard'
  | 'decide_registration_request'
  | 'activate_subscription'
  | 'renew_subscription'
  | 'suspend_subscription'
  | 'reactivate_subscription'
  | 'manage_packages'
  | 'manage_platform_staff'
  | 'permission_denied_attempt';

export interface PlatformClientAccountSummary {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  regionName: string;
  defaultCurrency: CurrencyCode;
  currentMembersCount: number;
  maxMembers: number;
  planId: SubscriptionPlanId;
  planNameAr: string;
  licenseStatus: LicenseStatus;
  effectiveStatus: LicenseStatus;
  isPermanentOwner: boolean;
  isLifetime: boolean;
  isGrandfatheredLegacy: boolean;
  isExpired: boolean;
  remainingDays: number | null;
  startsAtIso: string;
  expiresAtIso: string;
  notes: string;
  source: 'permanent_owner' | 'account_licenses' | 'legacy_workspace';
}

export interface PlatformAdminAuditEntry {
  id: string;
  operation: PlatformAdminOperation;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId: string;
  targetWorkspaceId: string;
  targetOwnerEmail?: string;
  summary: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  actorRole: 'permanent_owner' | 'platform_staff';
  createdAtIso: string;
  persistedToFirestore: boolean;
}



