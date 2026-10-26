import type { Project, ProjectsBucket, ReportFormSnapshot } from '@/types';

const BUCKET_SHORT: Record<ProjectsBucket, string> = { today: '금일', tomorrow: '익일' };

// 작업 단위로 견준다 — 교체 도구는 id 를 새로 만들어 id 로 견주면 전부 지웠다 다시 쓴 것처럼 보인다.
// 같은 프로젝트명 + 같은 작업 내용이면 같은 작업으로 본다(앞뒤 공백 무시).
const taskEntries = (projects: ReadonlyArray<Project>) => {
  const entries = new Map<
    string,
    { projectId: string; project: string; taskId: string; content: string; progress: number; details: number }
  >();
  for (const p of projects) {
    for (const t of p.tasks) {
      if (t.content.trim() === '' && p.name.trim() === '') continue;
      entries.set(`${p.name.trim()}\u0000${t.content.trim()}`, {
        projectId: p.id,
        project: p.name.trim() || '(이름 없음)',
        taskId: t.id,
        content: t.content.trim() || '(내용 없음)',
        progress: t.progress,
        details: t.details.filter((d) => d.content.trim() !== '').length,
      });
    }
  }
  return entries;
};

// 두 폼 상태의 차이를 사람이 읽을 줄과, 강조할 항목 id(바뀐 뒤 기준)로 돌려준다
export const diffReportForm = (
  before: ReportFormSnapshot,
  after: ReportFormSnapshot
): { lines: Array<string>; changedIds: Array<string>; dateChanged: boolean } => {
  const lines: Array<string> = [];
  const changedIds = new Set<string>();

  const dateChanged =
    before.reportDate.month !== after.reportDate.month || before.reportDate.day !== after.reportDate.day;
  if (dateChanged)
    lines.push(
      `날짜 ${before.reportDate.month}월 ${before.reportDate.day}일 → ${after.reportDate.month}월 ${after.reportDate.day}일`
    );

  for (const bucket of ['today', 'tomorrow'] as const) {
    const prev = taskEntries(before[bucket]);
    const next = taskEntries(after[bucket]);
    const label = BUCKET_SHORT[bucket];
    for (const [key, t] of next) {
      const old = prev.get(key);
      if (!old) {
        lines.push(`＋ ${label} · ${t.project} · ${t.content} ${t.progress}%`);
        changedIds.add(t.taskId);
        if (!before[bucket].some((p) => p.name.trim() === t.project)) changedIds.add(t.projectId);
      } else if (old.progress !== t.progress) {
        lines.push(`${label} · ${t.project} · ${t.content} ${old.progress}% → ${t.progress}%`);
        changedIds.add(t.taskId);
      } else if (old.details !== t.details) {
        lines.push(`${label} · ${t.project} · ${t.content} 세부 항목 ${old.details}개 → ${t.details}개`);
        changedIds.add(t.taskId);
      }
    }
    for (const [key, t] of prev) {
      if (!next.has(key)) lines.push(`－ ${label} · ${t.project} · ${t.content}`);
    }
  }

  return { lines, changedIds: [...changedIds], dateChanged };
};

export const isSameReportForm = (a: ReportFormSnapshot, b: ReportFormSnapshot) =>
  JSON.stringify([a.reportDate, a.today, a.tomorrow]) === JSON.stringify([b.reportDate, b.today, b.tomorrow]);
