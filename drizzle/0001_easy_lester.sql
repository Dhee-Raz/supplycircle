CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text NOT NULL,
	`kind` text NOT NULL,
	`password_hash` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_identifier_unique` ON `accounts` (`identifier`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_unique` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `items` ADD `added_by_id` text;--> statement-breakpoint
ALTER TABLE `items` ADD `bought_by_id` text;--> statement-breakpoint
ALTER TABLE `members` ADD `account_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_account_id_unique` ON `members` (`account_id`);