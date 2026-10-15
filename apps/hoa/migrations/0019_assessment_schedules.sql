CREATE TABLE `assessment_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`frequency` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`unit_amounts_json` text,
	`first_due_on` text NOT NULL,
	`last_due_on` text,
	`posts_from` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assessment_schedules_organization` ON `assessment_schedules` (`organization_id`,`status`);
