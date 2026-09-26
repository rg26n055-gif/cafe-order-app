import { catalog } from './catalog';
// UID comes only from the server-verified Firebase token, never from request input.
export async function ensureAccount(db:D1Database,uid:string){
 const count=await db.prepare('SELECT COUNT(*) AS n FROM account_products WHERE owner_id=?').bind(uid).first<{n:number}>();
 if(count?.n===catalog.length)return;
 await db.batch(catalog.map(p=>db.prepare('INSERT OR IGNORE INTO account_products (owner_id,id,name,price,stock,station,position) VALUES (?,?,?,?,0,?,?)').bind(uid,p.id,p.name,p.price,p.station,p.position)));
}
export async function readAccountStore(db:D1Database,uid:string){
 const products=await db.prepare('SELECT id,name,price,stock,station,position FROM account_products WHERE owner_id=? ORDER BY position').bind(uid).all();
 const active="(status IN ('unpaid','paid') OR date(created_at,'+9 hours')=date('now','+9 hours') OR date(paid_at,'+9 hours')=date('now','+9 hours'))";
 const orders=await db.prepare(`SELECT * FROM account_orders WHERE owner_id=? AND ${active} ORDER BY created_at DESC`).bind(uid).all<Record<string,unknown>>();
 const lines=await db.prepare(`SELECT i.* FROM account_items i JOIN account_orders o ON o.owner_id=i.owner_id AND o.id=i.order_id WHERE o.owner_id=? AND ${active}`).bind(uid).all<Record<string,unknown>>();
 return {products:products.results,orders:orders.results.map(o=>{
  const items=lines.results.filter(i=>i.order_id===o.id).map(i=>({productId:i.product_id,name:i.name,price:Number(i.price),qty:Number(i.qty),station:i.station,doneAt:i.done_at}));
  return {id:o.id,usageType:o.usage_type,ticketType:o.ticket_type,customerNumber:o.customer_number,status:o.status,createdAt:o.created_at,paidAt:o.paid_at,deliveredAt:o.delivered_at,items,total:items.reduce((s,i)=>s+i.price*i.qty,0)};
 }),updatedAt:new Date().toISOString()};
}
// Backfill is separate from schema migrations. The original data is never deleted.
export async function importLegacy(db:D1Database,uid:string,email:string,ownerEmail:string|undefined){
 if(!ownerEmail||email.toLowerCase()!==ownerEmail.toLowerCase())return;
 const prior=()=>db.prepare("SELECT owner_id FROM legacy_imports WHERE id='original'").first();
 if(await prior())return;
 try{await db.batch([
  db.prepare("INSERT INTO legacy_imports (id,owner_id,created_at) VALUES ('original',?,?)").bind(uid,new Date().toISOString()),
  db.prepare('INSERT INTO account_products (owner_id,id,name,price,stock,station,position) SELECT ?,id,name,price,stock,station,position FROM products').bind(uid),
  db.prepare('INSERT INTO account_orders (owner_id,id,usage_type,ticket_type,customer_number,status,created_at,paid_at,delivered_at,created_by,cancelled_at,request_hash) SELECT ?,id,usage_type,ticket_type,customer_number,status,created_at,paid_at,delivered_at,?,cancelled_at,request_hash FROM orders').bind(uid,uid),
  db.prepare('INSERT INTO account_items (owner_id,order_id,product_id,name,price,qty,station,done_at) SELECT ?,order_id,product_id,name,price,qty,station,done_at FROM order_items').bind(uid),
  db.prepare('INSERT INTO account_operations (owner_id,id,type,order_id,created_at) SELECT ?,id,type,order_id,created_at FROM operations WHERE order_id IS NOT NULL').bind(uid),
 ]);}catch(error){if(await prior())return;throw error;}
}
