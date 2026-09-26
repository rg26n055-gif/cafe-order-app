import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import CafeApp from './cafe-app';
export const dynamic='force-dynamic';
export default async function Home() {
  const user=await getChatGPTUser();
  if(!user) return <main className="login-screen"><div className="brand-symbol">c.</div><p className="eyebrow">CAFE ORDER</p><h1>カフェの一日を、<br/>ひとつの画面で。</h1><p>注文受付・会計・厨房・在庫をつなぐ<br/>スタッフ専用の管理画面です。</p><a className="primary button" href={chatGPTSignInPath('/')} target="_top">ログインして開く</a><small>注文や在庫の操作にはログインが必要です。</small></main>;
  return <CafeApp userName={user.displayName}/>;
}
