'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Project, ProjectsBucket, Task } from '@/types';
import { useReportFormStore } from '@/stores';
import { ProjectItemPreview, TaskItemPreview } from '.';

const BUCKETS: ReadonlyArray<ProjectsBucket> = ['today', 'tomorrow'];

// 드래그 중인 프로젝트 id가 어느 버킷에 속하는지 판별.
// id가 버킷 droppable 자체('today'/'tomorrow')면 그 버킷, 아니면 프로젝트가 들어있는 버킷을 반환.
const findContainer = (
  id: string,
  today: ReadonlyArray<Project>,
  tomorrow: ReadonlyArray<Project>
): ProjectsBucket | null => {
  if (id === 'today' || id === 'tomorrow') return id;
  if (today.some((p) => p.id === id)) return 'today';
  if (tomorrow.some((p) => p.id === id)) return 'tomorrow';
  return null;
};

type TaskLocation = { bucket: ProjectsBucket; projectId: string };

// 작업 id가 어느 버킷의 어느 프로젝트에 속하는지 판별.
const findTaskLocation = (
  taskId: string,
  today: ReadonlyArray<Project>,
  tomorrow: ReadonlyArray<Project>
): TaskLocation | null => {
  for (const bucket of BUCKETS) {
    const list = bucket === 'today' ? today : tomorrow;
    for (const p of list) {
      if (p.tasks.some((t) => t.id === taskId)) return { bucket, projectId: p.id };
    }
  }
  return null;
};

// 작업 드래그 중 over id → 대상 프로젝트. over가 작업이면 그 작업의 프로젝트, 프로젝트면 그 프로젝트.
const findProjectTarget = (
  overId: string,
  today: ReadonlyArray<Project>,
  tomorrow: ReadonlyArray<Project>
): { bucket: ProjectsBucket; project: Project } | null => {
  for (const bucket of BUCKETS) {
    const list = bucket === 'today' ? today : tomorrow;
    const asProject = list.find((p) => p.id === overId);
    if (asProject) return { bucket, project: asProject };
    const owner = list.find((p) => p.tasks.some((t) => t.id === overId));
    if (owner) return { bucket, project: owner };
  }
  return null;
};

// 프로젝트 드래그와 작업 드래그가 하나의 DndContext를 공유하므로, 드래그 종류에 맞는 droppable만
// 후보로 남겨 서로 간섭하지 않게 한다.
// - 프로젝트 드래그: 버킷 + 프로젝트 droppable만 (작업 제외).
// - 작업 드래그: 모든 작업(자기 자신 포함) + 프로젝트(빈 프로젝트 포함) droppable만 (버킷 제외).
//   자기 자신을 후보에 포함해야, 원래 자리로 돌아왔을 때 over===active가 되어 "그대로 놓으면 변경 없음"이 된다.
// 추가로, 포인터가 어떤 droppable 위에도 없으면(리스트 바깥) 대상 없음(over=null)으로 둔다 →
// 그대로 놓으면 handleDragEnd가 원래 상태로 초기화한다(Esc 취소와 동일 결과).
const collisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  const { today, tomorrow } = useReportFormStore.getState();
  const projectIds = new Set([...today, ...tomorrow].map((p) => p.id));
  const isProjectDrag = projectIds.has(activeId);

  const containers = args.droppableContainers.filter((c) => {
    const id = String(c.id);
    if (isProjectDrag) return id === 'today' || id === 'tomorrow' || projectIds.has(id);
    return id !== 'today' && id !== 'tomorrow';
  });
  const filteredArgs = { ...args, droppableContainers: containers };

  // 키보드 드래그(방향키)는 포인터 좌표가 없다 — 좌표 게이팅을 건너뛰고 정렬만 한다.
  if (args.pointerCoordinates == null) return closestCorners(filteredArgs);
  // 포인터가 리스트 바깥이라 어떤 droppable 위에도 없으면 대상 없음으로 둔다 → 그대로 놓으면 초기화.
  if (pointerWithin(filteredArgs).length === 0) return [];
  return closestCorners(filteredArgs);
};

// 금일/익일 두 ProjectList를 감싸는 단일 DndContext.
// 프로젝트 정렬·버킷 간 이동과 작업 정렬·프로젝트 간 이동을 모두 여기서 처리한다.
// 같은 컨테이너(버킷/프로젝트) 내 정렬은 SortableContext가 자동 처리하고, 컨테이너 경계를 넘는
// 이동만 onDragOver에서 직접 옮긴다. store를 직접 읽고/쓰므로 별도 prop 전달 없이 자기완결적으로 동작한다.
export const ProjectBoard = ({ children }: Readonly<{ children: ReactNode }>) => {
  // DndContext가 자동 생성하는 id는 SSR/CSR에서 달라져 hydration 경고가 난다 — useId로 고정.
  const dndContextId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'project' | 'task' | null>(null);
  // 드래그 취소 시 onDragOver로 옮겨둔 상태를 되돌리기 위한 스냅샷.
  const snapshotRef = useRef<{ today: Array<Project>; tomorrow: Array<Project> } | null>(null);

  const today = useReportFormStore((s) => s.today);
  const tomorrow = useReportFormStore((s) => s.tomorrow);

  // ProjectList / ProjectItem의 sensor와 동일 정책 — input 클릭/스크롤과 충돌 방지.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const state = useReportFormStore.getState();
    snapshotRef.current = { today: state.today, tomorrow: state.tomorrow };
    const id = String(event.active.id);
    const isProject = [...state.today, ...state.tomorrow].some((p) => p.id === id);
    setActiveType(isProject ? 'project' : 'task');
    setActiveId(id);
  };

  // 프로젝트의 버킷 간 이동만 여기서 라이브로 옮긴다(라이브 미리보기).
  // 작업의 프로젝트 간 이동은 여기서 하지 않는다 — 드래그 내내 원래 위치를 드롭 슬롯으로 남겨두어,
  // 사용자가 원래 자리에 그대로 놓으면 변경 없이 취소되도록 하기 위함이다(실제 이동은 onDragEnd에서).
  // 같은 컨테이너 내 정렬 미리보기는 (프로젝트·작업 모두) SortableContext가 자동 처리한다.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const state = useReportFormStore.getState();
    // 드래그 종류는 React state(activeType) 대신 실제 id로 판별 — dragStart 직후의 리렌더 타이밍에 의존하지 않는다.
    // 작업 드래그는 onDragOver에서 아무 것도 하지 않는다(원래 슬롯 유지).
    if (findTaskLocation(activeId, state.today, state.tomorrow)) return;

    // 프로젝트 드래그: 버킷 경계를 넘는 이동만 처리.
    const activeContainer = findContainer(activeId, state.today, state.tomorrow);
    const overContainer = findContainer(overId, state.today, state.tomorrow);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    const overItems = state[overContainer];
    let newIndex: number;
    if (overId === overContainer) {
      // 빈 버킷의 droppable 영역 위 — 맨 끝에 삽입.
      newIndex = overItems.length;
    } else {
      const overIndex = overItems.findIndex((p) => p.id === overId);
      const translated = active.rect.current.translated;
      // 드래그 중인 항목의 중심이 over 항목의 중간보다 아래면 그 아래에 끼워 넣는다.
      const isBelowOverItem = translated != null && translated.top > over.rect.top + over.rect.height / 2;
      newIndex = overIndex >= 0 ? overIndex + (isBelowOverItem ? 1 : 0) : overItems.length;
    }
    state.moveProjectToBucket(activeContainer, overContainer, activeId, newIndex);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const snapshot = snapshotRef.current;
    setActiveId(null);
    setActiveType(null);
    snapshotRef.current = null;
    // 유효한 드롭 대상 없이(리스트 바깥에) 놓으면 onDragOver로 옮겨둔 상태를 버리고 원래 자리로 되돌린다.
    if (!over) {
      if (snapshot) useReportFormStore.setState({ today: snapshot.today, tomorrow: snapshot.tomorrow });
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const state = useReportFormStore.getState();
    const activeLoc = findTaskLocation(activeId, state.today, state.tomorrow);

    if (activeLoc) {
      const target = findProjectTarget(overId, state.today, state.tomorrow);
      if (!target) return;
      if (target.project.id === activeLoc.projectId) {
        // 같은 프로젝트 내 재정렬. (원래 자리에 놓으면 위의 activeId===overId 분기에서 이미 걸러져 변경 없음)
        if (overId !== target.project.id) {
          state.reorderTasks(activeLoc.bucket, activeLoc.projectId, activeId, overId);
        }
        return;
      }
      // 다른 프로젝트로 이동 — 원래 슬롯을 유지하려고 미뤄둔 실제 이동을 드롭 시점에 수행한다.
      const overTasks = target.project.tasks;
      let newIndex: number;
      if (overId === target.project.id) {
        // 프로젝트 본문(빈 프로젝트 포함) 위 — 맨 끝에 삽입.
        newIndex = overTasks.length;
      } else {
        const overIndex = overTasks.findIndex((t) => t.id === overId);
        const translated = active.rect.current.translated;
        const isBelowOverItem = translated != null && translated.top > over.rect.top + over.rect.height / 2;
        newIndex = overIndex >= 0 ? overIndex + (isBelowOverItem ? 1 : 0) : overTasks.length;
      }
      state.moveTaskToProject(
        activeLoc.bucket,
        activeLoc.projectId,
        target.bucket,
        target.project.id,
        activeId,
        newIndex
      );
      return;
    }

    const activeContainer = findContainer(activeId, state.today, state.tomorrow);
    const overContainer = findContainer(overId, state.today, state.tomorrow);
    if (!activeContainer || !overContainer) return;
    // 버킷 간 이동은 onDragOver에서 이미 끝났다. 여기서는 같은 버킷 내 최종 위치만 확정한다.
    if (activeContainer === overContainer && overId !== overContainer) {
      state.reorderProjects(activeContainer, activeId, overId);
    }
  };

  const handleDragCancel = () => {
    const snapshot = snapshotRef.current;
    if (snapshot) {
      useReportFormStore.setState({ today: snapshot.today, tomorrow: snapshot.tomorrow });
    }
    snapshotRef.current = null;
    setActiveId(null);
    setActiveType(null);
  };

  const allProjects = [...today, ...tomorrow];
  const activeProject =
    activeType === 'project' && activeId ? (allProjects.find((p) => p.id === activeId) ?? null) : null;
  let activeTask: Task | null = null;
  if (activeType === 'task' && activeId) {
    for (const p of allProjects) {
      const found = p.tasks.find((t) => t.id === activeId);
      if (found) {
        activeTask = found;
        break;
      }
    }
  }

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      // 항목 높이가 제각각(작업 수에 따라)이고 컨테이너 간 이동으로 목록 구성이 바뀌므로,
      // 매 프레임 droppable rect를 다시 측정해 정렬 애니메이션이 끊기지 않게 한다.
      // (기본값 WhileDragging은 드래그 시작 시 한 번만 측정 → 아래로 밀 때 자리가 한 번에 생김)
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay>
        {activeProject ? (
          <ProjectItemPreview project={activeProject} />
        ) : activeTask ? (
          <TaskItemPreview task={activeTask} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
