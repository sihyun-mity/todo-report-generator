import { NewsDialog } from '@/components';
import { fetchLatestNews, hasUserReadNews } from '@/lib/news';
import { createClient } from '@/lib/supabase/server';

// (app) 그룹 layout 의 하단에 마운트되어, (app) 그룹 경로에서만 동작한다.
// /login, /signup 등 (auth) 그룹 경로에서는 마운트되지 않는다.
// 매 요청마다 최신 새소식과 (로그인 유저 기준) 읽음 여부를 서버에서 계산해 내려준다.
// 게스트는 userId=null 로 내려가고, 실제 표시 여부는 NewsDialog 의 localStorage 체크가 결정.
export async function NewsDialogMount() {
  const supabase = await createClient();

  const latestNews = await fetchLatestNews(supabase);

  // 게스트(또는 stale token) 환경에서 auth.getUser()가 예외를 던질 수 있어 방어.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  let alreadyReadByUser = false;
  if (userId && latestNews) {
    alreadyReadByUser = await hasUserReadNews(supabase, userId, latestNews.id);
  }

  return <NewsDialog latestNews={latestNews} userId={userId} alreadyReadByUser={alreadyReadByUser} />;
}
