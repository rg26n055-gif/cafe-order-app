import { env } from 'cloudflare:workers';
import { authorize, failure } from '../../../lib/server';
import { ensureAccount, readAccountStore, importLegacy } from '../../../lib/account-store';
import { database } from '../../../db';
export async function GET(request:Request) {
 try {
  const user=await authorize(request),db=database();
  const settings=env as unknown as {LEGACY_OWNER_EMAIL?:string};
  await importLegacy(db,user.userId,user.email,settings.LEGACY_OWNER_EMAIL);
  await ensureAccount(db,user.userId);
  return Response.json(await readAccountStore(db,user.userId),{headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
 }catch(error){return failure(error);}
}
