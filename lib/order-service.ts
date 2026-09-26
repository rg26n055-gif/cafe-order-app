import type { Product } from './catalog';
export class ServiceError extends Error { constructor(message:string, public status=400){super(message);} }
export const isId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
type InputItem={productId:string;qty:number};
export async function createOrder(db:D1Database,userId:string,input:any) {
  if(!input || !isId(input.id))throw new ServiceError('注文番号が不正です。画面を再読み込みしてください。');
  if(!['店内飲食','テイクアウト'].includes(input.usageType))throw new ServiceError('ご利用形態を選んでください。');
  if(!['前売り券','当日券'].includes(input.ticketType))throw new ServiceError('チケット種別を選んでください。');
  if(!Number.isInteger(input.customerNumber)||input.customerNumber<1||input.customerNumber>(input.usageType==='テイクアウト'?8:40))throw new ServiceError('お客様番号が範囲外です。');
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>5)throw new ServiceError('商品を1つ以上選んでください。');
  const items:InputItem[]=input.items.map((i:any)=>{
    if(!i || typeof i.productId!=='string' || !Number.isInteger(i.qty)||i.qty<1||i.qty>10)throw new ServiceError('数量は商品ごとに1〜10個で入力してください。');
    return {productId:i.productId,qty:i.qty};
  }).sort((a:InputItem,b:InputItem)=>a.productId.localeCompare(b.productId));
  if(new Set(items.map(i=>i.productId)).size!==items.length)throw new ServiceError('同じ商品が重複しています。');
  if(!items.some(i=>i.productId!=='pack'))throw new ServiceError('パック以外の商品を選んでください。');
  if(input.usageType==='テイクアウト'&&!items.some(i=>i.productId==='pack'))throw new ServiceError('テイクアウトにはパックを1個以上追加してください。');
  if(input.usageType==='店内飲食'&&items.some(i=>i.productId==='pack'))throw new ServiceError('店内飲食ではパックは選択できません。');
  const normalized=JSON.stringify({usageType:input.usageType,ticketType:input.ticketType,customerNumber:input.customerNumber,items});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const existing=async()=>{
    const row=await db.prepare('SELECT id,request_hash,created_by FROM orders WHERE id=?').bind(input.id).first<{id:string;request_hash:string;created_by:string}>();
    if(row&&(row.request_hash!==hash||row.created_by!==userId))throw new ServiceError('同じ注文番号に異なる内容は登録できません。',409);
    return row;
  };
  if(await existing())return {id:input.id,repeated:true};
  const products=(await db.prepare('SELECT * FROM products').all<Product>()).results;
  for(const item of items){const p=products.find(p=>p.id===item.productId);if(!p)throw new ServiceError('選択された商品は存在しません。');if(p.stock<item.qty)throw new ServiceError(`${p.name}の在庫が不足しています（残り${p.stock}個）。`,409);}
  const now=new Date().toISOString();
  const statements=[db.prepare('INSERT INTO orders (id,usage_type,ticket_type,customer_number,status,created_at,created_by,request_hash) VALUES (?,?,?,?,?,?,?,?)').bind(input.id,input.usageType,input.ticketType,input.customerNumber,'unpaid',now,userId,hash)];
  for(const item of items){
    // Server-side prices are snapshotted, never trusted from the browser.
    statements.push(db.prepare('INSERT INTO order_items (order_id,product_id,name,price,qty,station) SELECT ?,id,name,price,?,station FROM products WHERE id=?').bind(input.id,item.qty,item.productId));
    statements.push(db.prepare('UPDATE products SET stock=stock-? WHERE id=?').bind(item.qty,item.productId));
  }
  try{await db.batch(statements);}catch(error){
    if(await existing())return {id:input.id,repeated:true};
    if(String(error).includes('stock_nonnegative'))throw new ServiceError('別の端末で注文が入り、在庫が不足しました。数量を見直してください。',409);
    throw error;
  }
  return {id:input.id,repeated:false};
}
export async function changeOrder(db:D1Database,id:string,input:any) {
  if(!isId(id)||!input)throw new ServiceError('注文番号が不正です。');
  const order=await db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{status:string}>();
  if(!order)throw new ServiceError('注文が見つかりません。',404);
  const now=new Date().toISOString();
  if(input.action==='pay'){
    if(['paid','delivered'].includes(order.status))return;
    if(order.status!=='unpaid')throw new ServiceError('取り消した注文は会計できません。',409);
    const results=await db.batch([
      db.prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=? AND status='unpaid'").bind(now,id),
      db.prepare("UPDATE order_items SET done_at=COALESCE(done_at,?) WHERE order_id=? AND station='pack' AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')").bind(now,id,id),
    ]);
    if(!results[0].meta.changes) {const after=await db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{status:string}>();if(!['paid','delivered'].includes(after?.status||''))throw new ServiceError('注文の状態が変わりました。更新して確認してください。',409);}
    return;
  }
  if(input.action==='prepare'){
    if(!['kitchen','float'].includes(input.station))throw new ServiceError('担当が不正です。');
    if(order.status!=='paid')throw new ServiceError('会計済みの注文だけ調理完了にできます。',409);
    const result=await db.prepare("UPDATE order_items SET done_at=COALESCE(done_at,?) WHERE order_id=? AND station=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='paid')").bind(now,id,input.station,id).run();
    if(!result.meta.changes)throw new ServiceError('対象の調理品がないか、注文の状態が変わりました。',409);
    return;
  }
  if(input.action==='deliver'){
    if(order.status==='delivered')return;
    const result=await db.prepare("UPDATE orders SET status='delivered',delivered_at=? WHERE id=? AND status='paid' AND NOT EXISTS (SELECT 1 FROM order_items WHERE order_id=? AND done_at IS NULL)").bind(now,id,id).run();
    if(!result.meta.changes)throw new ServiceError('会計と、すべての商品の調理完了を確認してください。',409);
    return;
  }
  if(input.action==='cancel'){
    if(!isId(input.operationId))throw new ServiceError('操作番号が不正です。');
    const prior=await db.prepare('SELECT type,order_id FROM operations WHERE id=?').bind(input.operationId).first<{type:string;order_id:string}>();
    if(prior){if(prior.type!=='cancel'||prior.order_id!==id)throw new ServiceError('操作番号が重複しています。',409);return;}
    if(order.status==='cancelled')return;
    if(order.status!=='unpaid')throw new ServiceError('取り消せるのは未会計の注文だけです。',409);
    try{await db.batch([
      db.prepare("INSERT INTO operations (id,type,order_id,created_at) SELECT ?,'cancel',id,? FROM orders WHERE id=? AND status='unpaid'").bind(input.operationId,now,id),
      db.prepare('UPDATE products SET stock=stock+(SELECT SUM(qty) FROM order_items WHERE order_id=? AND product_id=products.id) WHERE id IN (SELECT product_id FROM order_items WHERE order_id=?) AND EXISTS (SELECT 1 FROM operations WHERE id=?)').bind(id,id,input.operationId),
      db.prepare("UPDATE orders SET status='cancelled',cancelled_at=? WHERE id=? AND EXISTS (SELECT 1 FROM operations WHERE id=?)").bind(now,id,input.operationId),
    ]);}catch(error){const done=await db.prepare('SELECT type,order_id FROM operations WHERE id=?').bind(input.operationId).first<{type:string;order_id:string}>();if(done?.type==='cancel'&&done.order_id===id)return;throw error;}
    const after=await db.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{status:string}>();
    if(after?.status!=='cancelled')throw new ServiceError('会計済みになったため取り消せません。',409);
    return;
  }
  throw new ServiceError('指定された操作はありません。');
}
export async function setStock(db:D1Database,id:string,input:any) {
  if(!input||!Number.isInteger(input.stock)||input.stock<0||input.stock>9999||!Number.isInteger(input.expectedStock))throw new ServiceError('在庫は0〜9999の整数で入力してください。');
  const result=await db.prepare('UPDATE products SET stock=? WHERE id=? AND stock=?').bind(input.stock,id,input.expectedStock).run();
  if(!result.meta.changes)throw new ServiceError('在庫が他の端末で更新されました。最新の在庫を確認して入力し直してください。',409);
}
