import { ServiceError } from "./order-service";
import { getChatGPTUser } from '../app/chatgpt-auth';
import { database } from '../db';
import { catalog } from './catalog';
export class AppError extends Error { constructor(message:string, public status=400){ super(message); } }
export async function authorize(request?:Request) {
  const user=await getChatGPTUser();
  if(!user) throw new AppError('ログインが必要です。ページを再読み込みしてください。',401);
  if(request && request.method!=='GET') {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw new AppError('この操作は許可されていません。',403);
    if(!request.headers.get('content-type')?.includes('application/json')) throw new AppError('送信形式が正しくありません。',415);
  }
  return user;
}
export function failure(error:unknown) {
  if(error instanceof AppError || error instanceof ServiceError) return Response.json({error:error.message},{status:error.status,headers:{'Cache-Control':'no-store'}});
  console.error('Cafe operation failed',error);
  return Response.json({error:'処理を完了できませんでした。通信状態を確認して、再試行してください。'},{status:503,headers:{'Cache-Control':'no-store'}});
}
export async function body(request:Request) {
  const text=await request.text();
  if(text.length>12000)throw new AppError('送信内容が大きすぎます。');
  try {return JSON.parse(text);} catch {throw new AppError('送信内容を読み取れません。');}
}
export const validId=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function ensureCatalog() {
  const db=database();
  const count=await db.prepare('SELECT COUNT(*) AS count FROM products').first<{count:number}>();
  if(count?.count===catalog.length)return;
  await db.batch(catalog.map(p=>db.prepare('INSERT OR IGNORE INTO products (id,name,price,stock,station,position) VALUES (?,?,?,0,?,?)').bind(p.id,p.name,p.price,p.station,p.position)));
}
export async function readOrders() {
  const db=database();
  // Active orders plus today's completed/cancelled orders. Day boundary uses JST.
  const result=await db.prepare(`SELECT * FROM orders WHERE status IN ('unpaid','paid') OR date(created_at,'+9 hours')=date('now','+9 hours') OR date(paid_at,'+9 hours')=date('now','+9 hours') ORDER BY created_at DESC`).all<Record<string,unknown>>();
  const lines=await db.prepare(`SELECT i.* FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status IN ('unpaid','paid') OR date(o.created_at,'+9 hours')=date('now','+9 hours') OR date(o.paid_at,'+9 hours')=date('now','+9 hours')`).all<Record<string,unknown>>();
  return result.results.map(o=>{
    const items=lines.results.filter(i=>i.order_id===o.id).map(i=>({productId:i.product_id,name:i.name,price:i.price,qty:i.qty,station:i.station,doneAt:i.done_at}));
    return {id:o.id,usageType:o.usage_type,ticketType:o.ticket_type,customerNumber:o.customer_number,status:o.status,createdAt:o.created_at,paidAt:o.paid_at,deliveredAt:o.delivered_at,items,total:items.reduce((sum,i)=>sum+Number(i.price)*Number(i.qty),0)};
  });
}
