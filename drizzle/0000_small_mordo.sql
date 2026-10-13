CREATE TABLE `alert_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`address` text NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	`source` text NOT NULL,
	`view` text NOT NULL,
	`interval` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
