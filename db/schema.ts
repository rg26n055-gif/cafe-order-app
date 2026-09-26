import { sqliteTable, text, integer, index, check, primaryKey, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const products = sqliteTable('products', {
  id: text('id').primaryKey(), name: text('name').notNull(), price: integer('price').notNull(),
  stock: integer('stock').notNull().default(0), station: text('station').notNull(), position: integer('position').notNull(),
}, table => [check('stock_nonnegative', sql`${table.stock} >= 0`), check('price_nonnegative', sql`${table.price} >= 0`)]);
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(), usageType: text('usage_type').notNull(), ticketType: text('ticket_type').notNull(),
  customerNumber: integer('customer_number').notNull(), status: text('status').notNull().default('unpaid'),
  createdAt: text('created_at').notNull(), paidAt: text('paid_at'), deliveredAt: text('delivered_at'), createdBy: text('created_by').notNull(),
  cancelledAt: text('cancelled_at'), requestHash: text('request_hash').notNull(),
}, table => [index('idx_orders_status_created').on(table.status, table.createdAt), check('order_status',sql`${table.status} IN ('unpaid','paid','delivered','cancelled')`)]);
export const orderItems = sqliteTable('order_items', {
  orderId: text('order_id').notNull().references(()=>orders.id), productId: text('product_id').notNull().references(()=>products.id),
  name: text('name').notNull(), price: integer('price').notNull(), qty: integer('qty').notNull(), station: text('station').notNull(),
  doneAt: text('done_at'),
}, table => [index('idx_items_order').on(table.orderId), check('qty_positive',sql`${table.qty} > 0`)]);
export const operations = sqliteTable('operations', {
  id:text('id').primaryKey(), type:text('type').notNull(), orderId:text('order_id'), createdAt:text('created_at').notNull(),
});

// Original tables above remain intact as the pre-Google migration backup.
export const accountProducts = sqliteTable('account_products', {
  ownerId:text('owner_id').notNull(), id:text('id').notNull(), name:text('name').notNull(),
  price:integer('price').notNull(), stock:integer('stock').notNull().default(0), station:text('station').notNull(),position:integer('position').notNull(),
}, t=>[primaryKey({columns:[t.ownerId,t.id]}),check('account_stock_nonnegative',sql`${t.stock} >= 0`),check('account_price_nonnegative',sql`${t.price} >= 0`)]);
export const accountOrders = sqliteTable('account_orders', {
  ownerId:text('owner_id').notNull(),id:text('id').notNull(),usageType:text('usage_type').notNull(),ticketType:text('ticket_type').notNull(),customerNumber:integer('customer_number').notNull(),status:text('status').notNull().default('unpaid'),createdAt:text('created_at').notNull(),paidAt:text('paid_at'),deliveredAt:text('delivered_at'),createdBy:text('created_by').notNull(),cancelledAt:text('cancelled_at'),requestHash:text('request_hash').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.id]}),index('idx_account_orders_owner_status').on(t.ownerId,t.status,t.createdAt),check('account_order_status',sql`${t.status} IN ('unpaid','paid','delivered','cancelled')`)]);
export const accountItems = sqliteTable('account_items', {
  ownerId:text('owner_id').notNull(),orderId:text('order_id').notNull(),productId:text('product_id').notNull(),name:text('name').notNull(),price:integer('price').notNull(),qty:integer('qty').notNull(),station:text('station').notNull(),doneAt:text('done_at'),
},t=>[primaryKey({columns:[t.ownerId,t.orderId,t.productId]}),foreignKey({columns:[t.ownerId,t.orderId],foreignColumns:[accountOrders.ownerId,accountOrders.id]}),foreignKey({columns:[t.ownerId,t.productId],foreignColumns:[accountProducts.ownerId,accountProducts.id]}),check('account_qty_positive',sql`${t.qty} > 0`)]);
export const accountOperations = sqliteTable('account_operations', {
 ownerId:text('owner_id').notNull(),id:text('id').notNull(),type:text('type').notNull(),orderId:text('order_id').notNull(),createdAt:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.id]}),foreignKey({columns:[t.ownerId,t.orderId],foreignColumns:[accountOrders.ownerId,accountOrders.id]})]);
export const legacyImports = sqliteTable('legacy_imports',{id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),createdAt:text('created_at').notNull()});
