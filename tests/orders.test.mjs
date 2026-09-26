import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/order-service.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createOrder,changeOrder,setStock}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
function setup(stock=10,owners=['staff']){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 for(const owner of owners) for(const [id,name,price,station] of [['donut','ドーナツ',250,'kitchen'],['cupcake','カップケーキ',250,'kitchen'],['churro','チュロス',250,'kitchen'],['float','綿あめフロート',200,'float'],['pack','パック',50,'pack']])sqlite.prepare('INSERT INTO account_products VALUES (?,?,?,?,?,?,0)').run(owner,id,name,price,stock,station);
 const execute=(sql,args,kind)=>{const stmt=sqlite.prepare(sql);if(kind==='first')return stmt.get(...args)||null;if(kind==='all')return {results:stmt.all(...args)};return {meta:{changes:Number(stmt.run(...args).changes)}};};
 const db={prepare(sql){let args=[];return {sql,bind(...values){args=values;return this;},first(){return Promise.resolve(execute(sql,args,'first'));},all(){return Promise.resolve(execute(sql,args,'all'));},run(){return Promise.resolve(execute(sql,args,'run'));},execute(){return execute(sql,args,'run');}};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const input=(extra={})=>({id:crypto.randomUUID(),usageType:'店内飲食',ticketType:'前売り券',customerNumber:1,items:[{productId:'donut',qty:2}],...extra});
 const count=()=>sqlite.prepare('SELECT COUNT(*) AS n FROM account_orders').get().n;
 const remaining=(id,owner='staff')=>sqlite.prepare('SELECT stock FROM account_products WHERE owner_id=? AND id=?').get(owner,id).stock;
 return {db,input,count,remaining,sqlite};
}
test('order reserves stock, server price wins, retry is idempotent',async()=>{const x=setup();const order=x.input({total:1,items:[{productId:'donut',qty:2,price:1}]});await createOrder(x.db,'staff',order);await createOrder(x.db,'staff',order);assert.equal(x.count(),1);assert.equal(x.remaining('donut'),8);assert.equal(x.sqlite.prepare('SELECT SUM(price*qty) AS total FROM account_items').get().total,500);await assert.rejects(createOrder(x.db,'staff',{...order,customerNumber:2}),/異なる内容/);});
test('validation rejects negative, fractional, excessive, unknown and duplicate quantities',async()=>{const x=setup();for(const items of [[{productId:'donut',qty:-1}],[{productId:'donut',qty:1.5}],[{productId:'donut',qty:11}],[{productId:'invalid',qty:1}],[{productId:'donut',qty:1},{productId:'donut',qty:1}]])await assert.rejects(createOrder(x.db,'staff',x.input({items})));assert.equal(x.count(),0);assert.equal(x.remaining('donut'),10);});
test('takeout requires pack, seat ranges and pack-only orders enforced on server',async()=>{const x=setup();await assert.rejects(createOrder(x.db,'staff',x.input({usageType:'テイクアウト'})),/パック/);await assert.rejects(createOrder(x.db,'staff',x.input({usageType:'テイクアウト',customerNumber:9})),/範囲外/);await assert.rejects(createOrder(x.db,'staff',x.input({items:[{productId:'pack',qty:1}]})));await assert.rejects(createOrder(x.db,'staff',x.input({items:[{productId:'donut',qty:1},{productId:'pack',qty:1}]})),/店内/);await createOrder(x.db,'staff',x.input({usageType:'テイクアウト',customerNumber:8,items:[{productId:'donut',qty:1},{productId:'pack',qty:1}]}));assert.equal(x.remaining('pack'),9);});
test('two simultaneous orders for the last stock: one wins, loser rolls back all rows',async()=>{const x=setup(1);const result=await Promise.allSettled([createOrder(x.db,'staff',x.input({items:[{productId:'donut',qty:1},{productId:'float',qty:1}]})),createOrder(x.db,'staff',x.input({items:[{productId:'donut',qty:1},{productId:'float',qty:1}]}))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(x.count(),1);assert.equal(x.remaining('donut'),0);assert.equal(x.remaining('float'),0);assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM account_items').get().n,2);});
test('concurrent retry of identical request never reserves twice',async()=>{const x=setup();const input=x.input();await Promise.all([createOrder(x.db,'staff',input),createOrder(x.db,'staff',input)]);assert.equal(x.count(),1);assert.equal(x.remaining('donut'),8);});
test('cannot prepare or deliver before payment; both kitchen stations must complete',async()=>{const x=setup();const input=x.input({items:[{productId:'donut',qty:1},{productId:'float',qty:1}]});await createOrder(x.db,'staff',input);await assert.rejects(changeOrder(x.db,'staff',input.id,{action:'prepare',station:'kitchen'}));await assert.rejects(changeOrder(x.db,'staff',input.id,{action:'deliver'}));await changeOrder(x.db,'staff',input.id,{action:'pay'});await changeOrder(x.db,'staff',input.id,{action:'prepare',station:'kitchen'});await assert.rejects(changeOrder(x.db,'staff',input.id,{action:'deliver'}));await changeOrder(x.db,'staff',input.id,{action:'prepare',station:'float'});await changeOrder(x.db,'staff',input.id,{action:'deliver'});await changeOrder(x.db,'staff',input.id,{action:'deliver'});assert.equal(x.sqlite.prepare('SELECT status FROM account_orders').get().status,'delivered');});
test('concurrent cancellation returns inventory once and preserves history',async()=>{const x=setup();const input=x.input();await createOrder(x.db,'staff',input);await Promise.all([changeOrder(x.db,'staff',input.id,{action:'cancel',operationId:crypto.randomUUID()}),changeOrder(x.db,'staff',input.id,{action:'cancel',operationId:crypto.randomUUID()})]);assert.equal(x.remaining('donut'),10);assert.equal(x.count(),1);assert.equal(x.sqlite.prepare('SELECT status FROM account_orders').get().status,'cancelled');});
test('payment and cancellation race never restores stock for a paid order',async()=>{const x=setup();const input=x.input();await createOrder(x.db,'staff',input);await Promise.allSettled([changeOrder(x.db,'staff',input.id,{action:'pay'}),changeOrder(x.db,'staff',input.id,{action:'cancel',operationId:crypto.randomUUID()})]);const status=x.sqlite.prepare('SELECT status FROM account_orders').get().status;assert.ok(['paid','cancelled'].includes(status));assert.equal(x.remaining('donut'),status==='paid'?8:10);});
test('paid orders cannot be cancelled; stock edits reject stale values',async()=>{const x=setup();const input=x.input();await createOrder(x.db,'staff',input);await changeOrder(x.db,'staff',input.id,{action:'pay'});await assert.rejects(changeOrder(x.db,'staff',input.id,{action:'cancel',operationId:crypto.randomUUID()}),/未会計/);await assert.rejects(setStock(x.db,'staff','donut',{stock:20,expectedStock:10}),/更新/);await setStock(x.db,'staff','donut',{stock:20,expectedStock:8});assert.equal(x.remaining('donut'),20);await assert.rejects(setStock(x.db,'staff','donut',{stock:-1,expectedStock:20}));});

test('A, B and C have independent inventory; guessed order IDs cannot cross accounts',async()=>{
 const x=setup(10,['A','B','C']),a=x.input();await createOrder(x.db,'A',a);
 for(const user of ['B','C'])for(const action of ['pay','prepare','deliver','cancel'])await assert.rejects(changeOrder(x.db,user,a.id,{action,station:'kitchen',operationId:crypto.randomUUID()}),e=>e.status===404);
 await setStock(x.db,'B','donut',{stock:7,expectedStock:10});assert.equal(x.remaining('donut','A'),8);assert.equal(x.remaining('donut','B'),7);assert.equal(x.remaining('donut','C'),10);
 // Even identical externally supplied IDs stay independent under the composite keys.
 await createOrder(x.db,'B',{...a,items:[{productId:'donut',qty:1}],ownerId:'A'});
 await changeOrder(x.db,'B',a.id,{action:'cancel',operationId:crypto.randomUUID(),ownerId:'A'});
 assert.equal(x.remaining('donut','A'),8);assert.equal(x.remaining('donut','B'),7);
 assert.equal(x.sqlite.prepare('SELECT status FROM account_orders WHERE owner_id=?').get('A').status,'unpaid');
});
async function importTS(relative,replacements={}){
 let code=ts.transpileModule(readFileSync(new URL(relative,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const catalogSource=ts.transpileModule(readFileSync(new URL('../lib/catalog.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const catalogUrl='data:text/javascript;base64,'+Buffer.from(catalogSource).toString('base64');
const {ensureAccount,readAccountStore,importLegacy}=await importTS('../lib/account-store.ts',{"'./catalog'":JSON.stringify(catalogUrl)});
test('read API scopes active and historical orders, and initializes new accounts with zero stock',async()=>{
 const x=setup(10,['A','B']);await createOrder(x.db,'A',x.input());await createOrder(x.db,'B',x.input({customerNumber:2}));await ensureAccount(x.db,'C');
 const a=await readAccountStore(x.db,'A'),b=await readAccountStore(x.db,'B'),c=await readAccountStore(x.db,'C');
 assert.equal(a.orders.length,1);assert.equal(a.orders[0].customerNumber,1);assert.equal(b.orders[0].customerNumber,2);assert.equal(c.orders.length,0);assert.ok(c.products.every(p=>p.stock===0));
 await ensureAccount(x.db,'A');assert.equal(x.remaining('donut','A'),8);
});
test('legacy migration is owner-only, atomic, repeatable and keeps the original data',async()=>{
 const x=setup(10,[]);x.sqlite.prepare("INSERT INTO products VALUES ('donut','ドーナツ',250,12,'kitchen',0)").run();
 const id=crypto.randomUUID();x.sqlite.prepare("INSERT INTO orders (id,usage_type,ticket_type,customer_number,status,created_at,created_by,request_hash) VALUES (?,'店内飲食','前売り券',1,'unpaid',?,'old-owner','hash')").run(id,new Date().toISOString());
 x.sqlite.prepare("INSERT INTO order_items (order_id,product_id,name,price,qty,station) VALUES (?,'donut','ドーナツ',250,1,'kitchen')").run(id);
 await importLegacy(x.db,'B','b@example.com','owner@example.com');assert.equal(x.count(),0);
 await Promise.all([importLegacy(x.db,'A','owner@example.com','owner@example.com'),importLegacy(x.db,'A','owner@example.com','owner@example.com')]);
 assert.equal(x.count(),1);assert.equal(x.remaining('donut','A'),12);assert.equal(x.sqlite.prepare('SELECT stock FROM products').get().stock,12);
 await setStock(x.db,'A','donut',{stock:9,expectedStock:12});await importLegacy(x.db,'A','owner@example.com','owner@example.com');assert.equal(x.remaining('donut','A'),9);
});
