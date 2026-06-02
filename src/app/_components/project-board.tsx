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
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Project, ProjectsBucket } from '@/types';
import { useReportFormStore } from '@/stores';
import { ProjectItemPreview } from '.';

// 드래그 중인 id가 어느 버킷에 속하는지 판별.
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

// 금일/익일 두 ProjectList를 감싸는 단일 DndContext.
// 같은 버킷 내 정렬은 SortableContext가 자동 처리하고, 버킷 간 이동만 onDragOver에서 직접 옮긴다.
// store를 직접 읽고/쓰므로 별도 prop 전달 없이 자기완결적으로 동작한다.
export const ProjectBoard = ({ children }: Readonly<{ children: ReactNode }>) => {
  // DndContext가 자동 생성하는 id는 SSR/CSR에서 달라져 hydration 경고가 난다 — useId로 고정.
  const dndContextId = useId();
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
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
    setActiveProjectId(String(event.active.id));
  };

  // 버킷 경계를 넘는 순간 프로젝트를 대상 버킷으로 실제로 옮긴다(라이브 미리보기).
  // 같은 버킷 내 이동은 여기서 처리하지 않고 SortableContext의 자동 정렬에 맡긴다.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const state = useReportFormStore.getState();
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
    setActiveProjectId(null);
    snapshotRef.current = null;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    const state = useReportFormStore.getState();
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
    setActiveProjectId(null);
  };

  const activeProject = activeProjectId
    ? ([...today, ...tomorrow].find((p) => p.id === activeProjectId) ?? null)
    : null;

  return (
    <DndContext
      id={dndContextId}
      sensors={sensors}
      collisionDetection={closestCorners}
      // 항목 높이가 제각각(작업 수에 따라)이고 버킷 간 이동으로 목록 구성이 바뀌므로,
      // 매 프레임 droppable rect를 다시 측정해 정렬 애니메이션이 끊기지 않게 한다.
      // (기본값 WhileDragging은 드래그 시작 시 한 번만 측정 → 아래로 밀 때 자리가 한 번에 생김)
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay>{activeProject ? <ProjectItemPreview project={activeProject} /> : null}</DragOverlay>
    </DndContext>
  );
};
