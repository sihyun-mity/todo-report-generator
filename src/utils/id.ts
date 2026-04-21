// 프로젝트/태스크 등에 사용하는 짧은 고유 ID 생성기
// (deprecated된 String.prototype.substr 대신 substring 사용)
export const createId = () => Math.random().toString(36).substring(2, 11);
