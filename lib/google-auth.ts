import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { firebaseConfig } from './firebase-config';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export class AuthError extends Error { status=401; }
export async function verifyGoogleToken(token:string,keySet:JWTVerifyGetKey=keys){
 try {
  const {payload}=await jwtVerify(token,keySet,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${firebaseConfig.projectId}`,audience:firebaseConfig.projectId,requiredClaims:['exp','iat','auth_time','sub']});
  const now=Math.floor(Date.now()/1000);
  const firebase=payload.firebase as {sign_in_provider?:string}|undefined;
  if(!payload.sub||payload.sub.length>128||typeof payload.email!=='string'||payload.email_verified!==true||firebase?.sign_in_provider!=='google.com'||typeof payload.auth_time!=='number'||payload.auth_time>now||typeof payload.iat!=='number'||payload.iat>now)throw new Error('Invalid identity');
  return {userId:payload.sub,email:payload.email,displayName:typeof payload.name==='string'?payload.name:payload.email};
 }catch{throw new AuthError('ログインを確認できませんでした。一度ログアウトして、Googleでログインし直してください。');}
}
export async function authenticate(request:Request){
 const authorization=request.headers.get('authorization');
 if(!authorization?.startsWith('Bearer ')||authorization.length>16000)throw new AuthError('Googleアカウントでログインしてください。');
 return verifyGoogleToken(authorization.slice(7));
}
