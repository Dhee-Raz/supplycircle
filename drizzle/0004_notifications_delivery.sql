ALTER TABLE `items` ADD `delivery_status` text;
--> statement-breakpoint
ALTER TABLE `items` ADD `delivery_note` text;
--> statement-breakpoint
CREATE TABLE `notifications` (
 `id` text PRIMARY KEY NOT NULL,
 `business` text NOT NULL,
 `account_id` text NOT NULL,
 `item_id` text,
 `message` text NOT NULL,
 `kind` text NOT NULL,
 `created` text NOT NULL,
 `read_at` text
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`business`, `account_id`);
