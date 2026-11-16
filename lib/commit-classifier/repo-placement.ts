import { COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD } from '@/constants';
import type { Project } from '@/types';
import { textSimilarity } from './registered-tasks';

// 보고서를 저장할 때 저장소 → 프로젝트를 무엇으로 기억할지 정한다.
// 예전에는 "분류기가 처음 넣은 프로젝트"가 폼에 남아 있으면 그 이름을 그대로 기억했다. 분류기가 두 저장소의 같은 작업
// (예: 두 서비스의 Next.js 업데이트)을 한 프로젝트로 묶고 사용자가 새 프로젝트를 만들어 나눠 적어도, 처음 프로젝트가
// 남아 있으니 잘못 묶인 저장소까지 그 프로젝트로 굳었고 다음 가져오기는 AI 판정 없이 매번 같은 곳에 넣었다.
// 그래서 그 저장소 커밋으로 넣은 작업이 저장 시점에 **실제로 놓인 프로젝트**를 본다.
// - 작업을 끌어 옮겼으면 id 로 찾는다.
// - 지우고 다른 프로젝트에 새로 적었으면 넣을 때의 이름(또는 지금 이름)과 비슷한 작업으로 찾는다. 다른 가져온 작업 자리는
//   이름이 비슷해도 세지 않는다(그 작업은 그 작업의 연결이 판단한다).
// - 한 작업(커밋이 여러 저장소)이 여러 프로젝트에 나뉘어 있으면 저장소마다 어디로 갔는지 작업만으로는 모른다. 다른 작업으로
//   위치가 정해진 저장소를 빼고 남은 저장소·프로젝트가 하나씩이면 짝짓고, 그래도 모르면 기억한 이름이 남은 프로젝트 중
//   하나를 가리키는 저장소만 그대로 둔다. 끝내 모르는 저장소는 기억을 지워(그 프로젝트들 중 하나를 가리키던 경우만) 다음
//   가져오기에서 AI 가 다시 판단하게 한다 — 틀린 기억을 붙들고 있는 것보다 낫다.

export type PlacedTaskLink = {
  repos: ReadonlyArray<string>;
  taskId: string;
  content: string;
};

export type RepoPlacement = {
  // 기억할 저장소 → 프로젝트명
  learned: Record<string, string>;
  // 기억을 지울 저장소(어느 프로젝트인지 알 수 없게 나뉜 경우)
  forget: Array<string>;
  // 이 판단이 맡은 저장소. 여기 없는 저장소는 예전 방식(처음 넣은 프로젝트의 이름)으로 기억한다 — 이 연결이 생기기 전에
  // 만든 저장 대기 연결이다.
  decided: Set<string>;
};

type Split = { repos: ReadonlyArray<string>; projectIds: ReadonlyArray<string> };

export const resolveRepoPlacement = (
  projects: ReadonlyArray<Project>,
  placed: ReadonlyArray<PlacedTaskLink>,
  remembered: Readonly<Record<string, string>>
): RepoPlacement => {
  const named = projects.filter((p) => p.name.trim());
  const nameOf = new Map(named.map((p) => [p.id, p.name.trim()]));
  const projectOfTask = new Map(named.flatMap((p) => p.tasks.map((t) => [t.id, p] as const)));
  const claimed = new Set(placed.map((l) => l.taskId).filter((id) => projectOfTask.has(id)));

  const placesOf = (link: PlacedTaskLink): Array<string> => {
    const own = projectOfTask.get(link.taskId);
    const ownTask = own?.tasks.find((t) => t.id === link.taskId);
    const names = [link.content, ownTask?.content ?? ''].map((n) => n.trim()).filter(Boolean);
    const ids = new Set<string>(own ? [own.id] : []);
    for (const project of named) {
      const copied = project.tasks.some(
        (t) =>
          !claimed.has(t.id) &&
          t.content.trim() &&
          names.some((n) => textSimilarity(t.content, n) >= COMMIT_IMPORT_SIMILAR_TASK_THRESHOLD)
      );
      if (copied) ids.add(project.id);
    }
    return [...ids];
  };

  const decided = new Set(placed.flatMap((l) => l.repos));
  const votes = new Map<string, Map<string, number>>();
  const splits: Array<Split> = [];
  for (const link of placed) {
    const projectIds = placesOf(link);
    if (!projectIds.length) continue;
    if (projectIds.length > 1) {
      splits.push({ repos: link.repos, projectIds });
      continue;
    }
    for (const repo of link.repos) {
      const count = votes.get(repo) ?? new Map<string, number>();
      count.set(projectIds[0], (count.get(projectIds[0]) ?? 0) + 1);
      votes.set(repo, count);
    }
  }

  // 한 곳에만 놓인 작업으로 정해지는 위치. 저장소 작업이 여러 프로젝트에 흩어졌으면 가장 많은 곳(같으면 정하지 않는다).
  const pinned = new Map<string, string>();
  for (const [repo, count] of votes) {
    const ranked = [...count].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) pinned.set(repo, ranked[0][0]);
  }

  // 나뉜 작업: 위치가 정해진 저장소가 덮지 못한 프로젝트를 남은 저장소와 짝짓는다. 하나가 정해지면 다른 나뉜 작업도
  // 풀릴 수 있어 바뀌지 않을 때까지 되풀이한다.
  const rememberedIn = (repo: string, ids: ReadonlyArray<string>) =>
    ids.filter((id) => nameOf.get(id) === remembered[repo]?.trim());
  for (let changed = true; changed; ) {
    changed = false;
    for (const split of splits) {
      const free = split.repos.filter((r) => !pinned.has(r));
      if (!free.length) continue;
      const covered = new Set(split.repos.map((r) => pinned.get(r)));
      const uncovered = split.projectIds.filter((id) => !covered.has(id));
      if (free.length === 1 && uncovered.length === 1) {
        pinned.set(free[0], uncovered[0]);
        changed = true;
        continue;
      }
      // 기억한 이름으로 가린다 — 남은 프로젝트(없으면 나뉜 프로젝트 전체) 중 하나를 그 저장소만 가리킬 때
      const pool = uncovered.length ? uncovered : split.projectIds;
      for (const repo of free) {
        const hits = rememberedIn(repo, pool);
        const shared = free.some((other) => other !== repo && rememberedIn(other, pool).includes(hits[0]));
        if (hits.length === 1 && !shared) {
          pinned.set(repo, hits[0]);
          changed = true;
        }
      }
    }
  }

  const learned: Record<string, string> = {};
  for (const [repo, projectId] of pinned) learned[repo] = nameOf.get(projectId)!;
  const forget = [
    ...new Set(
      splits.flatMap((split) =>
        split.repos.filter((r) => !pinned.has(r) && rememberedIn(r, split.projectIds).length > 0)
      )
    ),
  ];
  return { learned, forget, decided };
};
