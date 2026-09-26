import { authorize, body, failure } from '../../../lib/server';
import { database } from '../../../db';
import { createOrder } from '../../../lib/order-service';
export async function POST(request:Request){
 try{const user=await authorize(request);const result=await createOrder(database(),user.userId,await body(request));return Response.json(result,{status:result.repeated?200:201});}catch(error){return failure(error);}
}
