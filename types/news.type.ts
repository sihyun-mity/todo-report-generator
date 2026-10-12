import type { NEWS_AUDIENCE_VALUES } from '@/enums';

/** 새소식 노출 대상 — `all`(모두) · `member`(회원 전용) · `guest`(비회원 전용) */
export type NewsAudience = (typeof NEWS_AUDIENCE_VALUES)[number];

export type News = {
  id: string;
  title: string;
  content: string;
  audience: NewsAudience;
  /** ISO 8601 timestamp */
  published_at: string;
  created_at: string;
  updated_at: string;
};

export type UserNewsRead = {
  user_id: string;
  news_id: string;
  read_at: string;
};
