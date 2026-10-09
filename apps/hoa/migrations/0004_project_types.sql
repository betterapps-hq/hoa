CREATE TABLE `project_types` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`rulebook_id` text,
	`definition_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_types_hoa` ON `project_types` (`hoa_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `project_type_id` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `answers_json` text;