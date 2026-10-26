import type { Project, ProjectsBucket, ReportFormSnapshot } from '@/types';

const BUCKET_SHORT: Record<ProjectsBucket, string> = { today: '금일', tomorrow: '익일' };

// 작업 단위로 견준다 — 교체 도구는 id 를 새로 만들어 id 로 견주면 전부 지웠다 다시 쓴 것처럼 보인다.
// 같은 프로젝트명 + 같은 작업 내용이면 같은 작업으로 본다(앞뒤 공백 무시).
// 같은 키의 작업이 여럿일 수 있어(중복) 목록으로 모으고 순서대로 짝짓는다 — 하나로 덮으면 중복으로 하나 더 넣은 것을
// "진행률 0% → 100%" 처럼 기존 작업을 고친 것으로 보여 줬다.
type DetailEntry = { id: string; content: string };

type TaskEntry = {
  projectId: string;
  project: string;
  taskId: string;
  content: string;
  progress: number;
  details: Array<DetailEntry>;
};

const taskKey = (project: string, content: string) => `${project.trim()}\u0000${content.trim()}`;

const taskEntries = (projects: ReadonlyArray<Project>) => {
  const entries = new Map<string, Array<TaskEntry>>();
  for (const p of projects) {
    for (const t of p.tasks) {
      if (t.content.trim() === '' && p.name.trim() === '') continue;
      const key = taskKey(p.name, t.content);
      const list = entries.get(key) ?? [];
      entries.set(key, list);
      list.push({
        projectId: p.id,
        project: p.name.trim() || '(이름 없음)',
        taskId: t.id,
        content: t.content.trim() || '(내용 없음)',
        progress: t.progress,
        details: t.details.map((d) => ({ id: d.id, content: d.content.trim() })).filter((d) => d.content !== ''),
      });
    }
  }
  return entries;
};

// a 에만 있는 세부 항목(같은 줄이 여럿이면 개수까지 견준다)
const missingFrom = (a: ReadonlyArray<DetailEntry>, b: ReadonlyArray<DetailEntry>) => {
  const rest = b.map((d) => d.content);
  return a.filter((detail) => {
    const at = rest.indexOf(detail.content);
    if (at === -1) return true;
    rest.splice(at, 1);
    return false;
  });
};

const hasContent = (p: Project) => p.name.trim() !== '' || p.tasks.some((t) => t.content.trim() !== '');

// 순서가 바뀐 항목 — 두 순서의 가장 긴 공통 부분열에 들지 않는 것이 옮겨진 것이다(나머지는 밀려났을 뿐이다)
const movedKeys = (before: ReadonlyArray<string>, after: ReadonlyArray<string>) => {
  const table = before.map(() => after.map(() => 0));
  const at = (i: number, j: number) => (i < before.length && j < after.length ? table[i][j] : 0);
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      table[i][j] = before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  const kept = new Set<number>();
  for (let i = 0, j = 0; i < before.length && j < after.length; ) {
    if (before[i] === after[j]) {
      kept.add(j);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return after.flatMap((key, j) => (kept.has(j) ? [] : [key]));
};

// 두 폼 상태의 차이를 사람이 읽을 줄과, 강조할 항목 id(바뀐 뒤 기준)로 돌려준다.
// 줄 머리: ＋ 추가 · － 삭제 · (없음) 바뀜 · › 세부 항목 · ↕ 순서만 바뀜. 확인 카드는 "－" 가 있으면 지워질 내용으로 본다.
// 강조(changedIds): 새 작업·바뀐 작업, 새 이름의 프로젝트, 넣은 세부 항목 줄, 순서를 옮긴 작업·프로젝트,
// 작업이 지워진 프로젝트(지운 줄은 강조할 수 없어 어디서 지웠는지를 보여 준다).
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
    const bucketStart = lines.length;
    for (const [key, list] of next) {
      const olds = prev.get(key) ?? [];
      for (const [i, t] of list.entries()) {
        const old = olds.at(i);
        const at = `${label} · ${t.project} · ${t.content}`;
        if (!old) {
          lines.push(`＋ ${at} ${t.progress}%`);
          for (const detail of t.details) lines.push(`＋ ${at} › ${detail.content}`);
          changedIds.add(t.taskId);
          for (const detail of t.details) changedIds.add(detail.id);
          if (!before[bucket].some((p) => p.name.trim() === t.project)) changedIds.add(t.projectId);
          continue;
        }
        if (old.progress !== t.progress) {
          lines.push(`${at} ${old.progress}% → ${t.progress}%`);
          changedIds.add(t.taskId);
        }
        const added = missingFrom(t.details, old.details);
        const removed = missingFrom(old.details, t.details);
        for (const detail of added) lines.push(`＋ ${at} › ${detail.content}`);
        for (const detail of removed) lines.push(`－ ${at} › ${detail.content}`);
        for (const detail of added) changedIds.add(detail.id);
        if (added.length > 0 || removed.length > 0) changedIds.add(t.taskId);
      }
    }
    for (const [key, list] of prev) {
      const kept = next.get(key)?.length ?? 0;
      for (const t of list.slice(kept)) {
        lines.push(`－ ${label} · ${t.project} · ${t.content}`);
        // 그 프로젝트에서 바뀐 작업이 이미 강조되면(작업 내용 고치기·중복 정리) 프로젝트까지 빛내지 않는다
        const remaining = after[bucket].find((p) => p.name.trim() === t.project);
        if (remaining && !remaining.tasks.some((task) => changedIds.has(task.id))) changedIds.add(remaining.id);
      }
    }

    // 더하고 뺀 게 없는데 순서가 다르면 순서만 바뀌었다고 알리고(옮기기 도구), 옮긴 작업·프로젝트를 강조한다
    if (lines.length === bucketStart) {
      const beforeProjects = before[bucket].filter(hasContent);
      const afterProjects = after[bucket].filter(hasContent);
      const taskOrder = (projects: ReadonlyArray<Project>) =>
        projects.flatMap((p) => p.tasks.map((t) => taskKey(p.name, t.content)));
      const movedProjects = movedKeys(
        beforeProjects.map((p) => p.name.trim()),
        afterProjects.map((p) => p.name.trim())
      );
      const movedTasks = movedKeys(taskOrder(beforeProjects), taskOrder(afterProjects));
      // 둘을 맞바꾼 것처럼 어느 쪽이 움직였는지 순서만으로 가를 수 없을 때가 있다 — 옮긴 항목을 아는 도구는
      // applyFormChange 의 moved 로 넘겨 이 강조를 대신한다. 프로젝트가 움직였으면 그 안 작업 순서는 보지 않는다.
      if (movedProjects.length > 0 || movedTasks.length > 0) {
        lines.push(`↕ ${label} 순서 변경`);
        for (const p of afterProjects) {
          if (movedProjects.includes(p.name.trim())) changedIds.add(p.id);
          else if (movedProjects.length === 0)
            for (const t of p.tasks) if (movedTasks.includes(taskKey(p.name, t.content))) changedIds.add(t.id);
        }
      }
    }
  }

  return { lines, changedIds: [...changedIds], dateChanged };
};

export const isSameReportForm = (a: ReportFormSnapshot, b: ReportFormSnapshot) =>
  JSON.stringify([a.reportDate, a.today, a.tomorrow]) === JSON.stringify([b.reportDate, b.today, b.tomorrow]);
