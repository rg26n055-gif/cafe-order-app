'use client';
import { firebaseAuth } from '../lib/firebase-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { catalog, type Store, type Product, type Order } from '../lib/catalog';
const tabs=['注文受付','会計','厨房','綿あめ','在庫'] as const;
type Tab=typeof tabs[number];
type Draft={id:string;usageType:string;ticketType:string;customerNumber:number;items:{productId:string;qty:number}[]};
const yen=(n:number)=>'¥'+n.toLocaleString('ja-JP');
const clock=(value:string)=>new Date(value).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const day=(value:string)=>new Date(value).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
const labels:Record<string,string>={unpaid:'未会計',paid:'準備中',delivered:'提供済み',cancelled:'取消済み'};
async function authenticatedApi(userId:string,url:string,method='GET',body?:unknown){
 const user=firebaseAuth().currentUser;
 if(!user||user.uid!==userId)throw new Error('アカウントが変更されました。ログインし直してください。');
 const token=await user.getIdToken();
 if(firebaseAuth().currentUser?.uid!==userId)throw new Error('アカウントが変更されました。');
 const response=await fetch(url,{method,cache:'no-store',headers:{'Authorization':'Bearer '+token,...(method==='GET'?{}:{'Content-Type':'application/json'})},body:body?JSON.stringify(body):undefined});
 let data:any;try{data=await response.json();}catch{throw new Error('サーバーから応答を受け取れませんでした。再試行してください。');}
 if(!response.ok){const error=new Error(data.error||'処理できませんでした。') as Error&{status:number};error.status=response.status;throw error;}
 return data;
}
export default function CafeApp({userName,userId,onLogout}:{userName:string;userId:string;onLogout:()=>Promise<void>}){
 const PENDING_KEY='cafe.pending-order.v2.'+userId;
 const api=useCallback((url:string,method='GET',body?:unknown)=>authenticatedApi(userId,url,method,body),[userId]);
 const [tab,setTab]=useState<Tab>('注文受付'),[store,setStore]=useState<Store|null>(null);
 const [loadError,setLoadError]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [usage,setUsage]=useState('店内飲食'),[ticket,setTicket]=useState('前売り券'),[number,setNumber]=useState('');
 const [quantities,setQuantities]=useState<Record<string,number>>({});
 const [pending,setPending]=useState<Draft|null>(null),[ready,setReady]=useState(false);
 const [filter,setFilter]=useState('unpaid'),[floatIndex,setFloatIndex]=useState(0);
 const [confirmAction,setConfirmAction]=useState<{title:string;description:string;run:()=>Promise<void>}|null>(null);
 const generation=useRef(0),actionLock=useRef(false),pollLock=useRef(false),pendingRef=useRef<Draft|null>(null);
 const refresh=useCallback(async()=>{
  const version=++generation.current;
  try{const data=await api('/api/store');if(version===generation.current){setStore(data);setLoadError('');}}
  catch(e){if(version===generation.current)setLoadError((e as Error).message);}
 },[api]);
 useEffect(()=>{
  try{const raw=sessionStorage.getItem(PENDING_KEY);if(raw){const d=JSON.parse(raw) as Draft;if(d.id&&Array.isArray(d.items)){pendingRef.current=d;setPending(d);setUsage(d.usageType);setTicket(d.ticketType);setNumber(String(d.customerNumber));setQuantities(Object.fromEntries(d.items.map(i=>[i.productId,i.qty])));}}}catch{}
  setReady(true);refresh();
  const interval=setInterval(()=>{if(!actionLock.current&&!pollLock.current){pollLock.current=true;refresh().finally(()=>pollLock.current=false);}},10000);
  const focus=()=>{if(!actionLock.current)refresh();};window.addEventListener('focus',focus);
  return ()=>{clearInterval(interval);window.removeEventListener('focus',focus);generation.current++;};
 },[refresh,PENDING_KEY]);
 useEffect(()=>{
  const context=(document as Document & {modelContext?:{registerTool:(tool:object,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=(tool:object)=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(console.error);}catch(e){console.error(e);}};
  register({name:'read_cafe_status',title:'カフェの稼働状況を確認',description:'最新の在庫と未会計・提供待ちの件数を読み取る。注文を変更しない。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('引数は空のオブジェクトにしてください。');const data:Store=await api('/api/store');return {products:data.products,unpaid:data.orders.filter(o=>o.status==='unpaid').length,waiting:data.orders.filter(o=>o.status==='paid').length};}});
  register({name:'open_cafe_section',title:'業務画面を開く',description:'注文受付・会計・厨房・綿あめ・在庫の画面を開く。注文の登録や会計処理は行わない。',inputSchema:{type:'object',properties:{section:{type:'string',enum:[...tabs]}},required:['section'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:unknown)=>{const value=input as {section?:Tab};if(!value||!tabs.includes(value.section as Tab)||Object.keys(value).some(k=>k!=='section'))throw new Error('画面名が正しくありません。');setTab(value.section!);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return {section:value.section};}});
  return ()=>lifecycle.abort();
 },[api]);
 const products=store?.products||[];
 const orders=store?.orders||[];
 const active=orders.filter(o=>o.status==='paid');
 const unpaid=orders.filter(o=>o.status==='unpaid');
 const floats=active.filter(o=>o.items.some(i=>i.station==='float'&&!i.doneAt)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const currentFloat=floats[Math.min(floatIndex,Math.max(floats.length-1,0))];
 const cart=products.filter(p=>(quantities[p.id]||0)>0);
 const total=cart.reduce((sum,p)=>sum+p.price*quantities[p.id],0);
 const pack=products.find(p=>p.id==='pack');
 const disabled=busy||!store||!!loadError;
 const today=day(new Date().toISOString());
 const sales=orders.filter(o=>['paid','delivered'].includes(o.status)&&o.paidAt&&day(o.paidAt)===today).reduce((s,o)=>s+o.total,0);
 function remember(d:Draft|null){pendingRef.current=d;setPending(d);try{if(d)sessionStorage.setItem(PENDING_KEY,JSON.stringify(d));else sessionStorage.removeItem(PENDING_KEY);}catch{}}
 async function act(task:()=>Promise<void>){if(actionLock.current)return;actionLock.current=true;setBusy(true);setError('');setMessage('');try{await task();return true;}catch(e){setError((e as Error).message);return false;}finally{await refresh();actionLock.current=false;setBusy(false);}}
 function changeQuantity(p:Product,delta:number){if(pendingRef.current||busy)return;setQuantities(q=>({...q,[p.id]:Math.max(0,Math.min(10,p.stock,(q[p.id]||0)+delta))}));}
 function changeUsage(next:string){setUsage(next);setNumber('');if(next==='店内飲食')setQuantities(q=>({...q,pack:0}));}
 async function submit(){
  if(!number){setError('お客様番号を選択してください。');return;}
  if(!cart.some(p=>p.id!=='pack')){setError('商品を1つ以上選んでください。');return;}
  if(usage==='テイクアウト'&&!(quantities.pack>0)){setError('テイクアウトにはパックを1個以上追加してください。');return;}
  const payload=pendingRef.current||{id:crypto.randomUUID(),usageType:usage,ticketType:ticket,customerNumber:Number(number),items:cart.map(p=>({productId:p.id,qty:quantities[p.id]}))};
  await act(async()=>{
   remember(payload);
   try{await api('/api/orders','POST',payload);}catch(e){const status=(e as Error&{status?:number}).status;if(status&&status>=400&&status<500)remember(null);throw e;}
   remember(null);setQuantities({});setNumber('');setMessage(`お客様番号 ${payload.customerNumber} の注文を登録しました。会計画面で確認してください。`);
  });
 }
 async function orderAction(order:Order,action:string,station?:string){await act(async()=>{await api('/api/orders/'+order.id,'PATCH',{action,station,operationId:crypto.randomUUID()});setMessage(action==='pay'?'会計済みにしました。厨房に注文を送りました。':action==='cancel'?'注文を取り消し、在庫を戻しました。':action==='deliver'?'提供済みにしました。':'調理完了を記録しました。');});}
 function ask(order:Order,action:string){setConfirmAction({title:action==='pay'?'会計済みにしますか？':action==='cancel'?'この注文を取り消しますか？':'提供済みにしますか？',description:`${order.usageType}・お客様番号 ${order.customerNumber} ／ ${yen(order.total)}${action==='pay'?'。代金・チケットを受け取ったことを確認してください。':action==='cancel'?'。予約していた在庫を戻します。':'。すべての商品をお渡ししたことを確認してください。'}`,run:()=>orderAction(order,action)});}
 const ordered=orders.filter(o=>filter==='all'||o.status===filter);
 return <div className="shell">
  <aside className="sidebar"><div className="brand"><span className="brand-symbol">c.</span><div><strong>CAFE ORDER</strong><small>あなた専用のワークスペース</small></div></div><nav aria-label="業務メニュー">{tabs.map((t,i)=><button type="button" aria-current={tab===t?'page':undefined} className={tab===t?'selected':''} onClick={()=>{setTab(t);setError('');}} key={t}><span aria-hidden="true">{['＋','¥','▤','◉','▦'][i]}</span>{t}{t==='会計'&&unpaid.length>0&&<b>{unpaid.length}</b>}{t==='厨房'&&active.length>0&&<b>{active.length}</b>}</button>)}</nav><div className="staff"><span className="avatar">S</span><div><strong>ログイン中</strong><small title={userName}>{userName}</small><button className="text-button" disabled={busy} onClick={()=>onLogout().catch(e=>setError(e.message))}>ログアウト</button></div></div></aside>
  <main className="workspace"><header><div><p className="eyebrow">CAFE WORKSPACE</p><h1>{tab}</h1></div><div className="header-actions"><span className="sync">{store?`${clock(store.updatedAt)} 更新`:'接続中…'}</span><button className="secondary" disabled={busy} onClick={refresh}>↻ 更新</button></div></header>
  <div className="stats"><div><span>未会計</span><strong>{unpaid.length}<small>件</small></strong></div><div><span>提供待ち</span><strong>{active.length}<small>件</small></strong></div><div><span>本日の会計済み金額</span><strong>{yen(sales)}</strong></div></div>
  {loadError&&<div className="alert" role="alert">{loadError} <button onClick={refresh}>再読み込み</button></div>}
  {error&&<div className="alert" role="alert">{error}</div>}
  {message&&<div className="success" role="status">{message}</div>}
  {!store&&!loadError&&<div className="notice" role="status">注文と在庫を読み込んでいます…</div>}
  {tab==='注文受付'&&<>
   {store&&products.every(p=>p.stock===0)&&<div className="notice">まだ在庫がありません。<button className="text-button" onClick={()=>setTab('在庫')}>在庫を設定する →</button></div>}
   {pending&&<div className="notice">前の送信結果が未確認です。内容を変更せず「登録結果を確認・再送」を押してください。同じ注文は重複登録されません。</div>}
   <div className="order-layout"><section><div className="panel"><h2>お客様情報</h2><div className="fields"><label>ご利用形態<select value={usage} disabled={busy||!!pending} onChange={e=>changeUsage(e.target.value)}><option>店内飲食</option><option disabled={!pack?.stock}>テイクアウト</option></select></label><label>お客様番号<select value={number} disabled={busy||!!pending} onChange={e=>setNumber(e.target.value)}><option value="">番号を選択</option>{Array.from({length:usage==='テイクアウト'?8:40},(_,i)=><option value={i+1} key={i}>{String(i+1).padStart(2,'0')}</option>)}</select></label><label>チケット<select value={ticket} disabled={busy||!!pending} onChange={e=>setTicket(e.target.value)}><option>前売り券</option><option>当日券</option></select></label></div>{store&&!pack?.stock&&<p className="hint">パックが売り切れのため、テイクアウトは受付できません。</p>}</div>
   <h2 className="section-title">メニュー <small>全{products.length}商品</small></h2><div className="menu-grid">{products.map(p=>{const blocked=disabled||!!pending||(p.id==='pack'&&usage==='店内飲食');const q=quantities[p.id]||0;return <article className={'product '+(q?'in-cart':'')} key={p.id}><div className={'product-art '+p.id}><span aria-hidden="true">{catalog.find(c=>c.id===p.id)?.icon}</span>{p.stock===0&&<span className="soldout">売り切れ</span>}</div><div className="product-body"><small className={p.stock<=5?'low':''}>残り {p.stock} 個</small><h3>{p.name}</h3><div className="product-bottom"><strong>{yen(p.price)}</strong><div className="stepper"><button aria-label={p.name+'を減らす'} disabled={blocked||q===0} onClick={()=>changeQuantity(p,-1)}>−</button><output aria-label={p.name+'の数量'}>{q}</output><button aria-label={p.name+'を追加'} disabled={blocked||q>=Math.min(10,p.stock)} onClick={()=>changeQuantity(p,1)}>＋</button></div></div>{p.id==='pack'&&<small className="pack-note">テイクアウト専用</small>}</div></article>;})}</div></section>
   <aside className="panel cart"><p className="eyebrow">CURRENT ORDER</p><h2>今回の注文 <small>{cart.reduce((s,p)=>s+quantities[p.id],0)}点</small></h2>{cart.length?<div className="cart-lines">{cart.map(p=><div key={p.id}><span>{p.name}<small> × {quantities[p.id]}</small></span><strong>{yen(p.price*quantities[p.id])}</strong></div>)}</div>:<div className="empty"><span>＋</span><p>商品を選ぶと<br/>ここに表示されます。</p></div>}<div className="total"><span>合計</span><strong>{yen(total)}</strong></div><button className="primary" disabled={!ready||disabled||!cart.length} onClick={submit}>{busy?'登録中…':pending?'登録結果を確認・再送':'注文を登録する'}</button><p className="hint">登録時に在庫を確保します。<br/>代金の受け取りは会計画面で記録します。</p></aside></div>
  </>}
  {tab==='会計'&&<><div className="section-heading"><h2>注文一覧</h2><label className="filter">表示<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="unpaid">未会計</option><option value="paid">会計済み・提供待ち</option><option value="delivered">本日の提供済み</option><option value="cancelled">本日の取消済み</option><option value="all">進行中・本日の履歴</option></select></label></div><p className="hint">代金・チケットを受け取ってから「会計済みにする」を押してください。オンライン決済は行いません。</p><div className="orders-grid">{ordered.map(o=><OrderCard key={o.id} order={o}><div className="order-amount"><span>合計</span><strong>{yen(o.total)}</strong></div>{o.status==='unpaid'&&<div className="actions"><button className="primary" disabled={disabled} onClick={()=>ask(o,'pay')}>会計済みにする</button><button className="danger" disabled={disabled} onClick={()=>ask(o,'cancel')}>取り消す</button></div>}</OrderCard>)}</div>{store&&!ordered.length&&<Empty text="該当する注文はありません。"/>}</>}
  {tab==='厨房'&&<><div className="section-heading"><h2>提供待ちの注文</h2><span className="pill">10秒ごとに更新</span></div><p className="hint">会計済みの注文が表示されます。厨房・綿あめの準備がそろってから提供してください。</p><div className="orders-grid">{[...active].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(o=>{const food=o.items.filter(i=>i.station==='kitchen'),float=o.items.filter(i=>i.station==='float'),allReady=o.items.every(i=>i.doneAt);return <OrderCard key={o.id} order={o}><div className="preparation"><span className={food.every(i=>i.doneAt)?'done':''}>厨房：{!food.length?'対象なし':food.every(i=>i.doneAt)?'調理完了':'準備中'}</span><span className={float.every(i=>i.doneAt)?'done':''}>綿あめ：{!float.length?'対象なし':float.every(i=>i.doneAt)?'調理完了':'準備中'}</span></div><div className="actions">{food.some(i=>!i.doneAt)&&<button className="secondary" disabled={disabled} onClick={()=>orderAction(o,'prepare','kitchen')}>厨房の調理完了</button>}<button className="primary" disabled={disabled||!allReady} onClick={()=>ask(o,'deliver')}>{allReady?'提供済みにする':'すべての調理完了を待機'}</button></div></OrderCard>;})}</div>{store&&!active.length&&<Empty text="提供待ちの注文はありません。"/>}</>}
  {tab==='綿あめ'&&<><div className="section-heading"><h2>綿あめフロート専用</h2><span className="pill">未調理 {floats.length}件</span></div><p className="hint">会計済みの綿あめ注文を、受付順に表示します。</p>{currentFloat?<div className="float-layout"><OrderCard order={currentFloat}><div className="float-qty"><span>綿あめフロート</span><strong>{currentFloat.items.filter(i=>i.station==='float').reduce((s,i)=>s+i.qty,0)}<small>個</small></strong></div><button className="primary" disabled={disabled} onClick={()=>orderAction(currentFloat,'prepare','float')}>綿あめの調理完了</button><div className="pager"><button disabled={floatIndex<=0} onClick={()=>setFloatIndex(i=>Math.max(0,i-1))}>← 前へ</button><span>{Math.min(floatIndex+1,floats.length)} / {floats.length}</span><button disabled={floatIndex>=floats.length-1} onClick={()=>setFloatIndex(i=>i+1)}>次へ →</button></div></OrderCard><div className="panel queue"><h2>待機中の注文</h2>{floats.map((o,i)=><button className={o.id===currentFloat.id?'selected':''} onClick={()=>setFloatIndex(i)} key={o.id}><strong>{String(o.customerNumber).padStart(2,'0')}</strong><span>{o.usageType}<small>{clock(o.createdAt)} 受付</small></span><b>{o.items.filter(x=>x.station==='float').reduce((s,x)=>s+x.qty,0)}個</b></button>)}</div></div>:store&&<Empty text="綿あめフロートの未調理注文はありません。"/>}</>}
  {tab==='在庫'&&<><div className="section-heading"><h2>販売可能な在庫</h2><span className="pill">注文時に自動で減算</span></div><p className="hint">初期在庫は0です。販売開始前に残数を設定してください。ここに入力するのは、注文で確保した分を除く販売可能数です。</p><div className="inventory-list">{products.map(p=><StockEditor key={p.id} product={p} disabled={disabled} save={(stock,expectedStock)=>act(async()=>{await api('/api/products/'+p.id,'PATCH',{stock,expectedStock});setMessage(p.name+'の在庫を更新しました。');})}/>)}</div></>}
  </main>
  {confirmAction&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setConfirmAction(null);}}><section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal" onKeyDown={e=>{if(e.key==='Escape'&&!busy)setConfirmAction(null);}}><h2 id="confirm-title">{confirmAction.title}</h2><p>{confirmAction.description}</p><div className="actions"><button autoFocus className="secondary" disabled={busy} onClick={()=>setConfirmAction(null)}>戻る</button><button className="primary" disabled={busy} onClick={async()=>{const action=confirmAction;setConfirmAction(null);await action.run();}}>確認して記録する</button></div></section></div>}
 </div>;
}
function OrderCard({order:o,children}:{order:Order;children:React.ReactNode}){return <article className={'panel order-card '+(o.usageType==='テイクアウト'?'takeout':'')}><div className="order-top"><div><small>お客様番号</small><strong className="customer-no">{String(o.customerNumber).padStart(2,'0')}</strong></div><div className="order-meta"><span className={'status-badge '+o.status}>{labels[o.status]}</span><small>{day(o.createdAt)} {clock(o.createdAt)}</small></div></div><div className="order-tags"><span>{o.usageType}</span><span>{o.ticketType}</span><small>#{o.id.slice(0,8)}</small></div><ul className="order-lines">{o.items.map(i=><li key={i.productId}><span>{i.name}</span><strong>× {i.qty}</strong></li>)}</ul>{children}</article>}
function Empty({text}:{text:string}){return <div className="panel empty"><span>✓</span><p>{text}</p></div>}
function StockEditor({product:p,disabled,save}:{product:Product;disabled:boolean;save:(stock:number,expected:number)=>Promise<boolean|undefined>}){
 const [draft,setDraft]=useState(''),[base,setBase]=useState(p.stock),[editing,setEditing]=useState(false);
 return <form className="panel inventory-row" onSubmit={async e=>{e.preventDefault();const value=Number(draft);if(!draft||!Number.isInteger(value)||value<0||value>9999)return;if(await save(value,base)){setEditing(false);setDraft('');}}}><span className={'mini-art '+p.id}>{catalog.find(c=>c.id===p.id)?.icon}</span><div className="inventory-name"><h3>{p.name}</h3><small>{yen(p.price)} / 個</small></div><div className={'stock-number '+(p.stock<=5?'low':'')}><small>販売可能</small><strong>{p.stock}<small>個</small></strong></div><label>新しい残数<input aria-label={p.name+'の新しい残数'} type="number" min="0" max="9999" step="1" required value={draft} placeholder={String(p.stock)} disabled={disabled} onChange={e=>{if(!editing){setBase(p.stock);setEditing(true);}setDraft(e.target.value);}}/></label><button className="secondary" disabled={disabled||draft===''} type="submit">更新</button>{editing&&base!==p.stock&&<p className="hint">別の操作で在庫が変わりました。更新後、最新の数で再入力してください。</p>}</form>;
}
