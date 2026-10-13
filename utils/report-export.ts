import type { ReportExportFormat, ReportHistoryItem } from '@/types';
import { kstDateKey, reportItemDateKey } from '@/utils';

// JSON 내보내기 스키마 버전. 필드 구성이 바뀌면 올린다.
const REPORT_EXPORT_VERSION = 1;

// 사람이 읽는 아카이브 — 보고서 본문을 날짜 구분선과 함께 이어 붙인다.
// 본문 첫 줄에는 연도가 없으므로 구분선에 'YYYY-MM-DD'를 적어 둔다.
const buildTextExport = (items: ReadonlyArray<ReportHistoryItem>) =>
  items.map((item) => [`===== ${reportItemDateKey(item)} =====`, item.content].join('\n')).join('\n\n\n') + '\n';

// 구조화 데이터 — 프로젝트/작업/세부 항목 계층과 진행률을 그대로 보존한다.
const buildJsonExport = (items: ReadonlyArray<ReportHistoryItem>) =>
  JSON.stringify(
    {
      version: REPORT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      count: items.length,
      reports: items.map((item) => ({
        date: reportItemDateKey(item),
        text: item.content,
        todayProjects: item.todayProjects,
        tomorrowProjects: item.tomorrowProjects,
        updatedAt: new Date(item.timestamp).toISOString(),
      })),
    },
    null,
    2
  );

const MIME_TYPES: Record<ReportExportFormat, string> = {
  txt: 'text/plain;charset=utf-8',
  json: 'application/json;charset=utf-8',
};

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // 일부 브라우저는 click 직후 revoke 하면 다운로드가 취소되므로 한 틱 미룬다.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** 보고서 기록 전체를 파일로 내려받는다. items 는 날짜 오름차순으로 넘긴다. */
export const downloadReportHistory = (items: ReadonlyArray<ReportHistoryItem>, format: ReportExportFormat) => {
  const content = format === 'txt' ? buildTextExport(items) : buildJsonExport(items);
  downloadFile(content, `일일업무보고_전체기록_${kstDateKey()}.${format}`, MIME_TYPES[format]);
};
