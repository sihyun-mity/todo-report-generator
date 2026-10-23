-- GitHub 커밋 가져오기 보정 메모리: 회원별로 한 행. 저장소 → 프로젝트명, `저장소#scope` → 작업명,
-- 세부 항목·진행률 보정, 제외한 저장소 등을 JSONB 하나에 담는다(구조는 types/commit-import.type.ts 의
-- CommitImportMemory). 이전에는 브라우저 localStorage 에만 있어 기기마다 따로 쌓였다.
--
-- - 읽기·쓰기는 브라우저 Supabase 클라이언트가 직접 한다(lib/commit-classifier/memory.ts). 본인 행만 RLS 로 허용.
-- - 내용은 애플리케이션이 해석하므로 DB 는 형태를 검사하지 않는다.
-- Generated for todo-report-generator on 2026-10-23

create table if not exists public.commit_import_memories (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  memory     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.commit_import_memories enable row level security;

-- 본인 메모리만 조회/등록/수정/삭제
create policy "own commit import memory"
  on public.commit_import_memories
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
