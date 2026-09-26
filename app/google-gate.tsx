'use client';
import { useEffect, useState } from 'react';
import { browserSessionPersistence, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithPopup, signOut, type User } from 'firebase/auth';
import { firebaseAuth } from '../lib/firebase-client';
import CafeApp from './cafe-app';
export default function GoogleGate(){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;let unsubscribe:(()=>void)|undefined;const auth=firebaseAuth();setPersistence(auth,browserSessionPersistence).then(()=>{if(active)unsubscribe=onAuthStateChanged(auth,u=>{setUser(u);setReady(true);},()=>{setError('ログイン状態を確認できません。ページを再読み込みしてください。');setReady(true);});}).catch(()=>{if(active){setError('ブラウザーの保存領域を利用できません。通常のブラウザーで開いてください。');setReady(true);}});return()=>{active=false;unsubscribe?.();};},[]);
 async function login(){
  if(busy)return;setBusy(true);setError('');
  try{const auth=firebaseAuth();const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
  catch(e){const code=(e as {code?:string}).code;setError(code==='auth/popup-closed-by-user'?'ログインをキャンセルしました。':code==='auth/popup-blocked'?'ポップアップがブロックされています。ブラウザーで許可して、もう一度お試しください。':code==='auth/unauthorized-domain'?'このアドレスからのログイン設定が完了していません。管理者に連絡してください。':'ログインできませんでした。通信を確認し、ChromeまたはSafariで開いて再試行してください。');}
  finally{setBusy(false);}
 }
 async function logout(){await signOut(firebaseAuth());}
 if(ready&&user)return <CafeApp key={user.uid} userName={user.displayName||user.email||'利用者'} userId={user.uid} onLogout={logout}/>;
 return <main className="login-screen"><div className="brand-symbol">c.</div><p className="eyebrow">CAFE ORDER</p><h1>あなたのカフェを、<br/>ひとつの画面で。</h1><p>Googleアカウントごとに、<br/>専用の注文・在庫管理を使えます。</p>{error&&<div role="alert" className="alert">{error}</div>}<button className="primary button" disabled={!ready||busy} onClick={login}>{!ready?'ログインを確認中…':busy?'Googleで確認中…':'Googleでログイン'}</button><small>他のアカウントの注文や在庫は表示されません。<br/>同じアカウントでログインすると、別の端末でも共有できます。</small></main>;
}
