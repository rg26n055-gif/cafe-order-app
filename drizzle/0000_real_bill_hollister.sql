CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`qty` integer NOT NULL,
	`station` text NOT NULL,
	`done_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "qty_positive" CHECK("order_items"."qty" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_items_order` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`usage_type` text NOT NULL,
	`ticket_type` text NOT NULL,
	`customer_number` integer NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`created_at` text NOT NULL,
	`paid_at` text,
	`delivered_at` text,
	`created_by` text NOT NULL,
	`cancelled_at` text,
	`request_hash` text NOT NULL,
	CONSTRAINT "order_status" CHECK("orders"."status" IN ('unpaid','paid','delivered','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_orders_status_created` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`station` text NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT "stock_nonnegative" CHECK("products"."stock" >= 0),
	CONSTRAINT "price_nonnegative" CHECK("products"."price" >= 0)
);
