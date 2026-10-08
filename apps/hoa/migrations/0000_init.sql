CREATE TABLE `application_files` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`application_id` text NOT NULL,
	`parent_file_id` text,
	`ordinal` integer,
	`context_text` text,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`page_count` integer,
	`kind` text,
	`status` text NOT NULL,
	`error_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `application_files_application` ON `application_files` (`application_id`);--> statement-breakpoint
CREATE TABLE `application_pages` (
	`hoa_id` text NOT NULL,
	`file_id` text NOT NULL,
	`page_index` integer NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`file_id`, `page_index`)
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`project_type` text NOT NULL,
	`description` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text NOT NULL,
	`review_id` text,
	`submitted_review_id` text,
	`submitted_at` text,
	`decision_json` text,
	`delete_after` text
);
--> statement-breakpoint
CREATE INDEX `applications_hoa_status` ON `applications` (`hoa_id`,`status`);--> statement-breakpoint
CREATE INDEX `applications_delete_after` ON `applications` (`delete_after`);--> statement-breakpoint
CREATE TABLE `governing_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`amends` text,
	`title` text NOT NULL,
	`effective_date` text,
	`file_name` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text,
	`page_count` integer,
	`status` text NOT NULL,
	`error_json` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `governing_documents_lineage_version` ON `governing_documents` (`lineage_id`,`version`);--> statement-breakpoint
CREATE INDEX `governing_documents_hoa` ON `governing_documents` (`hoa_id`);--> statement-breakpoint
CREATE TABLE `hoas` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`settings_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hoas_slug_unique` ON `hoas` (`slug`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`done` integer NOT NULL,
	`total` integer NOT NULL,
	`prompt_versions_json` text NOT NULL,
	`failures_json` text NOT NULL,
	`error_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_subject` ON `jobs` (`subject_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`application_id` text NOT NULL,
	`job_id` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`recommendation` text NOT NULL,
	`cost_usd` real NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_application` ON `reviews` (`application_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rulebooks` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`version` integer,
	`status` text NOT NULL,
	`error_json` text,
	`catalog_version` integer NOT NULL,
	`source_document_ids_json` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` text NOT NULL,
	`published_by` text,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rulebooks_hoa_version` ON `rulebooks` (`hoa_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `rulebooks_one_building` ON `rulebooks` (`hoa_id`) WHERE status = 'building';--> statement-breakpoint
CREATE UNIQUE INDEX `rulebooks_one_draft` ON `rulebooks` (`hoa_id`) WHERE status = 'draft';--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`rule_key` text NOT NULL,
	`rule_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rules_rulebook_key` ON `rules` (`rulebook_id`,`rule_key`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`document_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`number` text,
	`heading` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`page_start` integer NOT NULL,
	`page_end` integer NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`references_json` text NOT NULL,
	`routing_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_document_ordinal` ON `sections` (`document_id`,`ordinal`);