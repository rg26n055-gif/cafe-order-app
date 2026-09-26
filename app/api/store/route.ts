import { authorize, ensureCatalog, failure, readOrders } from '../../../lib/server';
import { database } from '../../../db';
export async function GET() {
  try {
    await authorize(); await ensureCatalog();
    const products=await database().prepare('SELECT * FROM products ORDER BY position').all();
    return Response.json({products:products.results,orders:await readOrders(),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return failure(error);}
}
