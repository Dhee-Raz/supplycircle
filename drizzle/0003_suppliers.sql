CREATE TABLE `suppliers` (
  `id` text PRIMARY KEY NOT NULL,
  `business` text NOT NULL,
  `name` text NOT NULL,
  `phone` text,
  `email` text,
  `address` text,
  `active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `supplier_id` text;
--> statement-breakpoint
ALTER TABLE `items` ADD `order_reference` text;
--> statement-breakpoint
ALTER TABLE `items` ADD `expected_delivery` text;
