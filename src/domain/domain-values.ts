export const sourceTypes = {
  OFFICIAL_SITE: "OFFICIAL_SITE",
  WORKDAY: "WORKDAY",
  GREENHOUSE: "GREENHOUSE",
  BOSS: "BOSS",
  LINKEDIN: "LINKEDIN",
  NIUKE: "NIUKE",
  WECHAT: "WECHAT",
  OTHER: "OTHER"
} as const;

export const companyStatuses = {
  CANDIDATE: "CANDIDATE",
  MONITORING: "MONITORING",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED"
} as const;

export const opportunityStatuses = {
  DISCOVERED: "DISCOVERED",
  ANALYZING: "ANALYZING",
  READY: "READY",
  WATCHING: "WATCHING",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  CLOSED: "CLOSED"
} as const;

export const timelineActorTypes = {
  SYSTEM: "SYSTEM",
  AI: "AI",
  USER: "USER"
} as const;

export const timelineEventTypes = {
  OPPORTUNITY_DISCOVERED: "OPPORTUNITY_DISCOVERED",
  AI_ANALYSIS_STARTED: "AI_ANALYSIS_STARTED",
  AI_ANALYSIS_COMPLETED: "AI_ANALYSIS_COMPLETED",
  STATUS_CHANGED: "STATUS_CHANGED",
  NOTE_CREATED: "NOTE_CREATED",
  FILE_UPLOADED: "FILE_UPLOADED",
  APPLIED: "APPLIED",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  JOB_UPDATED: "JOB_UPDATED",
  JOB_CLOSED: "JOB_CLOSED",
  SOURCE_ERROR: "SOURCE_ERROR",
  ANALYSIS_ERROR: "ANALYSIS_ERROR",
  DATA_ERROR: "DATA_ERROR"
} as const;

export type SourceTypeValue = (typeof sourceTypes)[keyof typeof sourceTypes];
export type CompanyStatusValue = (typeof companyStatuses)[keyof typeof companyStatuses];
export type OpportunityStatusValue = (typeof opportunityStatuses)[keyof typeof opportunityStatuses];
export type TimelineActorTypeValue = (typeof timelineActorTypes)[keyof typeof timelineActorTypes];
export type TimelineEventTypeValue = (typeof timelineEventTypes)[keyof typeof timelineEventTypes];

