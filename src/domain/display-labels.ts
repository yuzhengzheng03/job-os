import type {
  CompanyStatusValue,
  OpportunityStatusValue,
  SourceTypeValue,
  TimelineActorTypeValue,
  TimelineEventTypeValue
} from "@/src/domain/domain-values";
import { sourceTypes } from "@/src/domain/domain-values";

export const opportunityStatusLabels: Record<OpportunityStatusValue, string> = {
  DISCOVERED: "新发现",
  ANALYZING: "分析中",
  READY: "待评估",
  WATCHING: "重点关注",
  APPLIED: "已投递",
  INTERVIEW: "面试中",
  OFFER: "已获录用",
  CLOSED: "已结束"
};

export const companyStatusLabels: Record<CompanyStatusValue, string> = {
  CANDIDATE: "待确认",
  MONITORING: "持续关注",
  PAUSED: "暂停关注",
  ARCHIVED: "已归档"
};

export const timelineActorLabels: Record<TimelineActorTypeValue, string> = {
  SYSTEM: "系统",
  AI: "AI",
  USER: "我"
};

export const timelineEventLabels: Record<TimelineEventTypeValue, string> = {
  OPPORTUNITY_DISCOVERED: "发现机会",
  AI_ANALYSIS_STARTED: "开始分析",
  AI_ANALYSIS_COMPLETED: "分析完成",
  STATUS_CHANGED: "状态变更",
  NOTE_CREATED: "新增备注",
  FILE_UPLOADED: "上传材料",
  APPLIED: "完成投递",
  INTERVIEW: "进入面试",
  OFFER: "获得录用",
  JOB_UPDATED: "岗位更新",
  JOB_CLOSED: "岗位关闭",
  SOURCE_ERROR: "采集异常",
  ANALYSIS_ERROR: "分析异常",
  DATA_ERROR: "数据异常"
};

export function getOpportunityStatusLabel(status: string): string {
  return opportunityStatusLabels[status as OpportunityStatusValue] ?? status;
}

export function getCompanyStatusLabel(status: string): string {
  return companyStatusLabels[status as CompanyStatusValue] ?? status;
}

export function getTimelineActorLabel(actorType: string): string {
  return timelineActorLabels[actorType as TimelineActorTypeValue] ?? actorType;
}

export function getTimelineEventLabel(eventType: string): string {
  return timelineEventLabels[eventType as TimelineEventTypeValue] ?? eventType;
}

export function getSourceDisplayLabel(sourceType?: SourceTypeValue | string, sourceName?: string): string {
  if (sourceType === sourceTypes.OFFICIAL_SITE || sourceName?.includes("招聘页") || sourceName?.includes("公司监控")) {
    return "企业招聘官网";
  }
  if (sourceType === sourceTypes.BOSS) return "Boss 直聘";
  if (sourceType === sourceTypes.WECHAT) return "公众号";
  if (sourceType === sourceTypes.LINKEDIN) return "LinkedIn";
  if (sourceType === sourceTypes.NIUKE) return "牛客";
  if (sourceName?.includes("猎聘")) return "猎聘";
  return sourceName ?? "-";
}

export function getDisplayOpportunityTitle(title: string): string {
  return title
    .replace(/\s*[-—|｜]?\s*20\d{2}\s*(秋招|春招|校招|社招|实习|提前批|补录)\s*/g, "")
    .replace(/\s*[-—|｜]?\s*(秋招|春招|校招|社招|实习|提前批|补录)\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || title;
}
