import { NewsDialog } from '@/components';
import {
  fetchLatestNews,
  getViewerUserId,
  hasAnyUserNewsReadHistory,
  hasUserReadNews,
  markNewsAsReadUpTo,
} from '@/lib/news';
import { createClient } from '@/lib/supabase/server';

// (app) 그룹 layout 의 하단에 마운트되어, (app) 그룹 경로에서만 동작한다.
// /login, /signup 등 (auth) 그룹 경로에서는 마운트되지 않는다.
// 매 요청마다 "이 조회자의 대상(audience)에 해당하는" 최신 새소식과
// (로그인 유저 기준) 읽음 여부를 서버에서 계산해 내려준다.
// 게스트는 userId=null 로 내려가고, 실제 표시 여부는 NewsDialog 의 localStorage 체크가 결정.
export async function NewsDialogMount() {
  const supabase = await createClient();

  // 대상 필터링을 위해 로그인 여부가 최신 소식 조회보다 먼저 확정돼야 한다.
  const userId = await getViewerUserId(supabase);
  const latestNews = await fetchLatestNews(supabase, !!userId);

  let alreadyReadByUser = false;
  if (userId && latestNews) {
    // 두 쿼리를 병렬로 — 신규 유저(읽음 이력 0)인지, 그리고 최신 새소식을 이미 읽었는지.
    const [hasAnyHistory, hasReadLatest] = await Promise.all([
      hasAnyUserNewsReadHistory(supabase, userId),
      hasUserReadNews(supabase, userId, latestNews.id),
    ]);

    if (!hasAnyHistory) {
      // 첫 접속 — 가입/사용 시점 이전의 소식은 알리지 않는다.
      // 최신 1건만 마크하면 "다이얼로그는 최신 1건만 검사한다"는 구현 세부에 기대게 되고,
      // 대상 분류가 바뀌어 더 오래된 소식이 최신 자리로 올라오면 그 소식이 뒤늦게 떠버린다.
      // 기준 시점 이전 구간 전체를 읽음 처리해 분류 변경에도 흔들리지 않게 한다.
      await markNewsAsReadUpTo(supabase, userId, latestNews.id);
      alreadyReadByUser = true;
    } else {
      alreadyReadByUser = hasReadLatest;
    }
  }

  return <NewsDialog latestNews={latestNews} userId={userId} alreadyReadByUser={alreadyReadByUser} />;
}
