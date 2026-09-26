import { authorize, body, failure } from '../../../../lib/server';
import { database } from '../../../../db';
import { setStock } from '../../../../lib/order-service';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{await authorize(request);await setStock(database(),(await params).id,await body(request));return Response.json({ok:true});}catch(error){return failure(error);}
}
