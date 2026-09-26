CREATE TABLE `account_items` (
	`owner_id` text NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`qty` integer NOT NULL,
	`station` text NOT NULL,
	`done_at` text,
	PRIMARY KEY(`owner_id`, `order_id`, `product_id`),
	FOREIGN KEY (`owner_id`,`order_id`) REFERENCES `account_orders`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`,`product_id`) REFERENCES `account_products`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_qty_positive" CHECK("account_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE `account_operations` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`order_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	FOREIGN KEY (`owner_id`,`order_id`) REFERENCES `account_orders`(`owner_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `account_orders` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
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
	PRIMARY KEY(`owner_id`, `id`),
	CONSTRAINT "account_order_status" CHECK("account_orders"."status" IN ('unpaid','paid','delivered','cancelled'))
);
--> statement-breakpoint
CREATE INDEX `idx_account_orders_owner_status` ON `account_orders` (`owner_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `account_products` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`station` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `id`),
	CONSTRAINT "account_stock_nonnegative" CHECK("account_products"."stock" >= 0),
	CONSTRAINT "account_price_nonnegative" CHECK("account_products"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE `legacy_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL
);
