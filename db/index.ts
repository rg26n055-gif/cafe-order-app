import { env } from 'cloudflare:workers';
export function database(): D1Database {
  if (!env.DB) throw new Error('データベースに接続できません。時間を置いて再試行してください。');
  return env.DB;
}
