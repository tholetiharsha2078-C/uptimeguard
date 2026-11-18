CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`website_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`started_at` integer NOT NULL,
	`resolved_at` integer,
	`cause` text NOT NULL,
	`last_status_code` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `incidents_website_started_idx` ON `incidents` (`website_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `incidents_status_idx` ON `incidents` (`status`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_one_open_uq` ON `incidents` (`website_id`) WHERE status = 'open';--> statement-breakpoint
CREATE TABLE `monitor_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`locked_until` integer NOT NULL,
	`sites_checked` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `monitoring_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`website_id` text NOT NULL,
	`checked_at` integer NOT NULL,
	`status_code` integer,
	`response_time_ms` integer,
	`result` text NOT NULL,
	`is_up` integer NOT NULL,
	`error_message` text,
	`redirected_to` text,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `logs_website_checked_idx` ON `monitoring_logs` (`website_id`,`checked_at`);--> statement-breakpoint
CREATE INDEX `logs_checked_idx` ON `monitoring_logs` (`checked_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`website_id` text,
	`incident_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_agent` text,
	`ip` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`default_interval_minutes` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `websites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`hostname` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`is_paused` integer DEFAULT false NOT NULL,
	`check_interval_minutes` integer DEFAULT 5 NOT NULL,
	`last_checked_at` integer,
	`last_status_code` integer,
	`last_response_time_ms` integer,
	`last_error` text,
	`next_check_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `websites_user_url_uq` ON `websites` (`user_id`,`url`);--> statement-breakpoint
CREATE INDEX `websites_user_idx` ON `websites` (`user_id`);--> statement-breakpoint
CREATE INDEX `websites_next_check_idx` ON `websites` (`is_paused`,`next_check_at`);