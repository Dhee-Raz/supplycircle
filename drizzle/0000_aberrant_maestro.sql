CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`store` text NOT NULL,
	`name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`added_by` text NOT NULL,
	`bought_by` text,
	`created` text NOT NULL,
	`bought_at` text
);
--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`business` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL
);
