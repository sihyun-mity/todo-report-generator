import type { ParsedReport, Project, Task, TaskDetail } from '@/types';
import { createEmptyProject, createEmptyTask, createId } from '.';

// 프로젝트 레벨로 인정하는 불릿 문자
const PROJECT_BULLETS = '*•●○◦▪‣※';
// 작업 레벨로 인정하는 불릿 문자 (하이픈 계열 + 가운뎃점)
const TASK_BULLETS = '\\-–—ㆍ·';
// 세부 항목(소분류) 레벨로 인정하는 불릿 문자. TASK_BULLETS와 겹치므로(가운뎃점 계열)
// 불릿만으로는 구분되지 않는다 — 직전 작업보다 깊게 들여쓰였을 때만 세부 항목으로 본다.
const DETAIL_BULLETS = 'ㆍ·‧∙';
// 줄바꿈 복원(restoreLineBreaks)에서 "여기서부터 새 항목"이라고 볼 불릿.
// 대시 계열(–—)은 한국어 문서에서 `핫픽스 (100%) — 운영 배포 완료`처럼 부연 설명 구분자로 훨씬 자주 쓰여,
// 항목 불릿으로 취급하면 한 작업이 둘로 쪼개진다. 줄바꿈이 살아 있으면 TASK_LINE이 여전히 인정하므로
// 여기서만 제외한다.
const SPLIT_BULLET = `[${PROJECT_BULLETS}\\-${DETAIL_BULLETS}]`;

const DATE_REGEX = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const PROJECT_LINE = new RegExp(`^\\s*[${PROJECT_BULLETS}]\\s*(.+)$`);
const TASK_LINE = new RegExp(`^\\s*[${TASK_BULLETS}]\\s*(.+)$`);
const DETAIL_LINE = new RegExp(`^\\s*[${DETAIL_BULLETS}]\\s*(.+)$`);
// 진행률 표기: (50%) · [50%] · （50％) · 괄호 없는 50% 까지 허용
const PROGRESS_SUFFIX = /^(.*?)\s*[([（]?\s*(\d{1,3})\s*[%％]\s*[)\]）]?\s*$/;

// 섹션 제목 감지 — 띄어쓰기/표현 흔들림을 허용한다.
// (생성기가 출력하는 정식 표기는 `SECTION_TODAY` / `SECTION_TOMORROW` 상수)
const SECTION_TODAY_REGEX = /(?:금일|당일|오늘)\s*업무\s*(?:진행\s*)?(?:현황|내용|사항|목록)/;
const SECTION_TOMORROW_REGEX = /(?:익일|명일|내일|차일)\s*업무\s*(?:진행\s*)?(?:예정|계획|사항|목록|현황)/;

type Section = 'today' | 'tomorrow' | null;

// 유니코드 공백/제로폭 문자를 일반 공백으로 정리한다.
// 메일·문서 편집기에서 복사하면 NBSP( )나 전각 공백(　)이 섞여 들어와
// 들여쓰기·불릿 매칭이 조용히 실패한다.
const normalizeWhitespace = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ');

// 줄바꿈이 사라진 텍스트를 논리적인 줄 단위로 되살린다.
// (HTML 메일·메신저·PDF 등에서 복사하면 줄바꿈이 공백으로 뭉개지거나 아예 사라진다)
const restoreLineBreaks = (text: string) =>
  text
    // ① 섹션 제목은 어디에 붙어 있든 독립된 줄로 떼어낸다. ("…드립니다.금일 업무 진행 현황    * …")
    .replace(new RegExp(SECTION_TODAY_REGEX.source, 'g'), '\n$&\n')
    .replace(new RegExp(SECTION_TOMORROW_REGEX.source, 'g'), '\n$&\n')
    // ② 공백 2칸 이상 뒤에 오는 불릿은 원래 줄바꿈 + 들여쓰기였다고 본다. 들여쓰기 폭은 보존한다.
    //    ③보다 먼저 돌려야 한다 — ③이 불릿 앞 공백을 소비해버리면 들여쓰기가 사라져
    //    작업/세부 항목의 계층(들여쓰기 깊이로 판정)을 복원할 수 없다.
    .replace(new RegExp(`([ \\t]{2,})(?=${SPLIT_BULLET}[ \\t])`, 'g'), '\n$1')
    // ③ 진행률 표기 `(50%)` 바로 뒤에 다음 항목이 붙어 있으면 끊는다. (공백이 하나도 없는 경우까지)
    .replace(new RegExp(`([%％][ \\t]*[)\\]）]?)[ \\t]*(?=${SPLIT_BULLET}[ \\t])`, 'g'), '$1\n');

// 프로젝트 줄에 작업이 공백 한 칸으로 이어 붙은 경우를 분리한다. ("* A프로젝트 - 작업1 (10%)")
// 프로젝트명에 하이픈이 들어가는 경우("먹깨비 - React")를 오분해하지 않도록,
// 뒤쪽 조각이 모두 진행률로 끝날 때만 분리한다.
const INLINE_TASK_SPLIT = new RegExp(`[ \\t]+(?=[${TASK_BULLETS}][ \\t])`);

const splitInlineTasks = (line: string): Array<string> => {
  if (!PROJECT_LINE.test(line)) return [line];

  const parts = line.split(INLINE_TASK_SPLIT);
  if (parts.length < 2) return [line];

  const tasks = parts.slice(1);
  const isEveryTaskProgressTagged = tasks.every((part) => /[%％]\s*[)\]）]?$/.test(part.trim()));
  return isEveryTaskProgressTagged ? parts : [line];
};

const toLines = (text: string) =>
  restoreLineBreaks(normalizeWhitespace(text))
    .split('\n')
    .flatMap(splitInlineTasks)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');

const indentWidthOf = (line: string) => line.length - line.trimStart().length;

// 작업 내용에서 진행률을 분리한다. 표기가 없으면 0%.
const toTask = (raw: string): Task | null => {
  const match = raw.match(PROGRESS_SUFFIX);
  const content = (match ? match[1] : raw).trim();
  if (content === '') return null;

  const progress = match ? Math.min(100, parseInt(match[2], 10)) : 0;
  return { id: createId(), content, progress, details: [] };
};

// 세부 항목은 진행률을 갖지 않으므로 내용을 그대로 보존한다.
const toDetail = (raw: string): TaskDetail | null => {
  const content = raw.trim();
  if (content === '') return null;
  return { id: createId(), content };
};

// 섹션 결과를 폼이 기대하는 형태로 맞춘다 — 빈 섹션은 빈 프로젝트 한 개,
// 작업이 하나도 없는 프로젝트는 빈 작업 한 개를 채워 입력 칸이 사라지지 않게 한다.
const toSection = (projects: ReadonlyArray<Project>): Array<Project> => {
  if (projects.length === 0) return [createEmptyProject()];
  return projects.map((p) => (p.tasks.length > 0 ? p : { ...p, tasks: [createEmptyTask()] }));
};

// 텍스트로 작성된 보고서를 구조화된 데이터로 파싱
// 지원 형식:
//   N월 N일 ...
//   금일 업무 진행 현황
//       * 프로젝트명
//           - 작업 내용 (NN%)
//               · 세부 내용
//   익일 업무 진행 예정
//       * 프로젝트명
//           - 작업 내용
// 줄바꿈이 뭉개졌거나 불릿이 없는(들여쓰기만 있는) 텍스트도 최대한 복원한다.
export const parseReportText = (text: string): ParsedReport | null => {
  if (!text || text.trim() === '') return null;

  // 날짜 추출 (예: "2월 24일")
  const dateMatch = text.match(DATE_REGEX);
  const month = dateMatch?.[1] ?? '';
  const day = dateMatch?.[2] ?? '';

  const todayProjects: Array<Project> = [];
  const tomorrowProjects: Array<Project> = [];

  const lines = toLines(text);
  // 섹션 제목이 하나도 없으면(제목 없이 항목만 붙여넣은 경우) 전체를 금일 업무로 본다.
  const hasSectionHeading = lines.some((line) => SECTION_TODAY_REGEX.test(line) || SECTION_TOMORROW_REGEX.test(line));

  let currentSection: Section = hasSectionHeading ? null : 'today';
  let currentProject: Project | null = null;
  let currentProjectIndent = 0;
  let currentTask: Task | null = null;
  let currentTaskIndent = 0;

  const startProject = (name: string, indent: number) => {
    currentProject = { id: createId(), name: name.trim(), tasks: [] };
    currentProjectIndent = indent;
    currentTask = null;
    (currentSection === 'today' ? todayProjects : tomorrowProjects).push(currentProject);
  };

  const addTask = (raw: string, indent: number) => {
    const task = toTask(raw);
    if (!task) return;
    currentProject?.tasks.push(task);
    currentTask = task;
    currentTaskIndent = indent;
  };

  const addDetail = (raw: string) => {
    const detail = toDetail(raw);
    if (detail) currentTask?.details.push(detail);
  };

  // 세부 항목으로 볼 수 있는 줄인지 — 직전 작업이 있고 그보다 깊게 들여쓰였을 때만 성립.
  // (들여쓰기가 같거나 얕으면 형제 작업이므로 기존처럼 작업으로 처리한다)
  const isUnderCurrentTask = (indent: number) => currentTask !== null && indent > currentTaskIndent;

  for (const line of lines) {
    const trimmed = line.trim();

    if (SECTION_TODAY_REGEX.test(trimmed)) {
      currentSection = 'today';
      currentProject = null;
      currentTask = null;
      continue;
    }
    if (SECTION_TOMORROW_REGEX.test(trimmed)) {
      currentSection = 'tomorrow';
      currentProject = null;
      currentTask = null;
      continue;
    }
    if (!currentSection) continue;

    const indent = indentWidthOf(line);

    // 프로젝트 라인: 새 프로젝트로 전환
    const projectMatch = line.match(PROJECT_LINE);
    if (projectMatch) {
      startProject(projectMatch[1], indent);
      continue;
    }

    // 세부 항목 라인 — 가운뎃점 계열 불릿 + 직전 작업보다 깊은 들여쓰기.
    // 조건이 맞지 않으면 아래 작업 라인 처리로 흘려보내 기존 동작(가운뎃점 = 작업)을 유지한다.
    const detailMatch = line.match(DETAIL_LINE);
    if (detailMatch && isUnderCurrentTask(indent)) {
      addDetail(detailMatch[1]);
      continue;
    }

    // 작업 라인
    const taskMatch = line.match(TASK_LINE);
    if (taskMatch) {
      // 프로젝트 불릿 없이 작업만 나열된 경우를 위해 무명 프로젝트를 만들어 담는다.
      if (!currentProject) startProject('', indent);
      addTask(taskMatch[1], indent);
      continue;
    }

    // 불릿이 전혀 없는 형식(들여쓰기로만 계층을 표현) 폴백.
    // 들여쓰기가 없는 줄은 인사말·맺음말일 가능성이 높아 무시한다.
    if (indent === 0) continue;
    if (isUnderCurrentTask(indent)) addDetail(trimmed);
    else if (currentProject && indent > currentProjectIndent) addTask(trimmed, indent);
    else startProject(trimmed, indent);
  }

  // 내용이 있는 프로젝트가 하나도 없으면 분석 실패로 간주한다.
  // (날짜만 얻어걸린 텍스트를 "분석 성공"으로 보여주면 빈 폼이 적용된다)
  const parsedProjects = [...todayProjects, ...tomorrowProjects];
  if (parsedProjects.length === 0) return null;
  if (parsedProjects.every((p) => p.name === '' && p.tasks.length === 0)) return null;

  return {
    month,
    day,
    todayProjects: toSection(todayProjects),
    tomorrowProjects: toSection(tomorrowProjects),
  };
};
