'use client';

import { Project } from './types';

interface ProjectPreviewProps {
  title: string;
  dotClassName: string;
  projects: Project[];
}

// 텍스트 가져오기 모달에서 금일/익일 각 섹션에 동일하게 쓰이던 프로젝트 프리뷰 리스트
// - 이름이 비어있는 프로젝트는 필터링
// - 내용이 없으면 placeholder 표시
const ProjectPreview = ({ title, dotClassName, projects }: ProjectPreviewProps) => {
  const filled = projects.filter((p) => p.name);

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
        {title} ({filled.length})
      </p>
      <div className="max-h-48 space-y-3 overflow-y-auto pr-2">
        {filled.length === 0 ? (
          <p className="text-zinc-400 italic">내용 없음</p>
        ) : (
          filled.map((p) => (
            <div key={p.id} className="space-y-1">
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">• {p.name}</p>
              <ul className="space-y-0.5 pl-3">
                {p.tasks.map((t) => (
                  <li key={t.id} className="text-zinc-500 dark:text-zinc-400">
                    - {t.content} ({t.progress}%)
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectPreview;
