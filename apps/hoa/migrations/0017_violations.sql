-- Violations (docs/design/violations.md): a broken rule on a unit, the rules it breaks, who answers for it, its
-- photos, and what happened, in order.
CREATE TABLE `violation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`violation_id` text NOT NULL,
	`kind` text NOT NULL,
	`occurred_on` text NOT NULL,
	`note` text,
	`details_json` text,
	`recorded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `violation_events_violation` ON `violation_events` (`violation_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `violation_people` (
	`organization_id` text NOT NULL,
	`violation_id` text NOT NULL,
	`person_id` text NOT NULL,
	`party` text NOT NULL,
	PRIMARY KEY(`violation_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX `violation_people_person` ON `violation_people` (`person_id`);
--> statement-breakpoint
CREATE TABLE `violation_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`violation_id` text NOT NULL,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `violation_photos_violation` ON `violation_photos` (`violation_id`);
--> statement-breakpoint
CREATE TABLE `violation_rules` (
	`organization_id` text NOT NULL,
	`violation_id` text NOT NULL,
	`rule_key` text NOT NULL,
	PRIMARY KEY(`violation_id`, `rule_key`)
);
--> statement-breakpoint
CREATE TABLE `violations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`observed_on` text NOT NULL,
	`status` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`reported_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `violations_organization_status` ON `violations` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `violations_unit` ON `violations` (`unit_id`);
