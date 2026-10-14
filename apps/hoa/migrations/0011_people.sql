-- Accounts and the association's people (docs/design/people.md): Better Auth's users, sessions, accounts and
-- verifications; the roll of people, units and who owns or lives in each; committees, the board among them. Additive.
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `committee_members` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`committee_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`office` text,
	`started_on` text,
	`ended_on` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `committee_members_committee` ON `committee_members` (`committee_id`);--> statement-breakpoint
CREATE INDEX `committee_members_person` ON `committee_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `committees` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE INDEX `committees_hoa` ON `committees` (`hoa_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`mailing_address` text,
	`access` text NOT NULL,
	`user_id` text,
	`invited_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`removed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_hoa_email` ON `people` (`hoa_id`,`email`);--> statement-breakpoint
CREATE INDEX `people_hoa` ON `people` (`hoa_id`);--> statement-breakpoint
CREATE INDEX `people_user` ON `people` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `unit_people` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`person_id` text NOT NULL,
	`relation` text NOT NULL,
	`started_on` text,
	`ended_on` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `unit_people_unit` ON `unit_people` (`unit_id`);--> statement-breakpoint
CREATE INDEX `unit_people_person` ON `unit_people` (`person_id`);--> statement-breakpoint
CREATE INDEX `unit_people_hoa` ON `unit_people` (`hoa_id`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`label` text NOT NULL,
	`address` text,
	`lot` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE INDEX `units_hoa` ON `units` (`hoa_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier` ON `verifications` (`identifier`);