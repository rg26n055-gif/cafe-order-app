import { ServiceError } from "./order-service";
import { authenticate, AuthError } from './google-auth';
export class AppError extends Error { constructor(message:string, public status=400){ super(message); } }
export async function authorize(request:Request) {
  const user=await authenticate(request);
  if(!user) throw new AppError('ログインが必要です。ページを再読み込みしてください。',401);
  if(request && request.method!=='GET') {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new AppError('この操作は許可されていません。',403);
    if(!request.headers.get('content-type')?.includes('application/json')) throw new AppError('送信形式が正しくありません。',415);
  }
  return user;
}
export function failure(error:unknown) {
  if(error instanceof AppError || error instanceof ServiceError || error instanceof AuthError) return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('Cafe operation failed',error);
  return Response.json({error:'処理を完了できませんでした。通信状態を確認して、再試行してください。'},{status:503,headers:{'Cache-Control':'no-store'}});
}
export async function body(request:Request) {
  const text=await request.text();
  if(text.length>12000)throw new AppError('送信内容が大きすぎます。');
  try {return JSON.parse(text);} catch {throw new AppError('送信内容を読み取れません。');}
}
export const validId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
