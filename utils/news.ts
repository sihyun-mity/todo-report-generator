const NEWS_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 새소식 id 형식(uuid)인지 */
export const isNewsId = (id: string) => NEWS_ID_REGEX.test(id);

/** 새소식 상세 경로(`/whats-new/<id>`)면 그 소식 id, 아니면 null */
export const newsIdFromPath = (path: string) => {
  const id = /^\/whats-new\/([^/]+)$/.exec(path)?.[1];
  return id && isNewsId(id) ? id : null;
};
