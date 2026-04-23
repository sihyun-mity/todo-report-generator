export type News = {
  id: string;
  title: string;
  content: string;
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
