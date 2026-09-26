import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
const config='data:text/javascript;base64,'+Buffer.from("export const firebaseConfig={projectId:'cafe-order-48b34'};").toString('base64');
let source=ts.transpileModule(readFileSync(new URL('../lib/google-auth.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace("'jose'",JSON.stringify(import.meta.resolve('jose'))).replace("'./firebase-config'",JSON.stringify(config));
const {verifyGoogleToken,authenticate}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'test',alg:'RS256'};const keys=createLocalJWKSet({keys:[jwk]});
const now=Math.floor(Date.now()/1000);
async function token(overrides={},key=privateKey){return new SignJWT({iss:'https://securetoken.google.com/cafe-order-48b34',aud:'cafe-order-48b34',sub:'account-A',iat:now,exp:now+3600,auth_time:now,email:'a@example.com',email_verified:true,firebase:{sign_in_provider:'google.com'},...overrides}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(key);}
test('only a signed, verified Google identity in this Firebase project is accepted',async()=>{
 const user=await verifyGoogleToken(await token(),keys);assert.equal(user.userId,'account-A');
 for(const payload of [{aud:'another-project'},{iss:'https://example.com'},{exp:now-1},{sub:''},{email_verified:false},{firebase:{sign_in_provider:'password'}},{auth_time:now+100},{iat:now+100}])await assert.rejects(verifyGoogleToken(await token(payload),keys),e=>e.status===401);
 const foreign=await generateKeyPair('RS256');await assert.rejects(verifyGoogleToken(await token({},foreign.privateKey),keys));
 await assert.rejects(verifyGoogleToken('not-a-token',keys));
});
test('missing credentials and forged Sites headers are rejected',async()=>{
 await assert.rejects(authenticate(new Request('https://example.test/api/store',{headers:{'oai-authenticated-user-id':'victim','oai-authenticated-user-email':'victim@example.com'}})),e=>e.status===401);
});
