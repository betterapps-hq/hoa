CREATE TABLE `provisions` (
	`hoa_id` text NOT NULL,
	`document_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`parent_key` text,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`provision_json` text NOT NULL,
	PRIMARY KEY(`hoa_id`, `key`)
);
--> statement-breakpoint
CREATE INDEX `provisions_document` ON `provisions` (`document_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `rulebook_questions` (
	`hoa_id` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`id` text NOT NULL,
	`question_json` text NOT NULL,
	`answer_json` text,
	PRIMARY KEY(`rulebook_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `rulebook_questions_hoa` ON `rulebook_questions` (`hoa_id`,`rulebook_id`);--> statement-breakpoint
CREATE TABLE `rulebook_rules` (
	`hoa_id` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`rule_key` text NOT NULL,
	`kind` text NOT NULL,
	`request_types` text NOT NULL,
	`applies_to` text,
	`review_status` text NOT NULL,
	`content_hash` text NOT NULL,
	`rule_json` text NOT NULL,
	PRIMARY KEY(`rulebook_id`, `rule_key`)
);
--> statement-breakpoint
CREATE INDEX `rulebook_rules_hoa` ON `rulebook_rules` (`hoa_id`,`rulebook_id`);--> statement-breakpoint
CREATE TABLE `rulebook_terms` (
	`hoa_id` text NOT NULL,
	`rulebook_id` text NOT NULL,
	`term_key` text NOT NULL,
	`kind` text NOT NULL,
	`review_status` text NOT NULL,
	`content_hash` text NOT NULL,
	`term_json` text NOT NULL,
	PRIMARY KEY(`rulebook_id`, `term_key`)
);
--> statement-breakpoint
CREATE INDEX `rulebook_terms_hoa` ON `rulebook_terms` (`hoa_id`,`rulebook_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_governing_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hoa_id` text NOT NULL,
	`lineage_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text NOT NULL,
	`amends` text,
	`title` text NOT NULL,
	`effective_date` text,
	`file_name` text,
	`media_type` text,
	`size_bytes` integer,
	`sha256` text,
	`page_count` integer,
	`status` text NOT NULL,
	`error_json` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`key` text,
	`document_json` text
);
--> statement-breakpoint
INSERT INTO `__new_governing_documents`("id", "hoa_id", "lineage_id", "version", "kind", "amends", "title", "effective_date", "file_name", "media_type", "size_bytes", "sha256", "page_count", "status", "error_json", "uploaded_by", "uploaded_at") SELECT "id", "hoa_id", "lineage_id", "version", "kind", "amends", "title", "effective_date", "file_name", "media_type", "size_bytes", "sha256", "page_count", "status", "error_json", "uploaded_by", "uploaded_at" FROM `governing_documents`;--> statement-breakpoint
DROP TABLE `governing_documents`;--> statement-breakpoint
ALTER TABLE `__new_governing_documents` RENAME TO `governing_documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `governing_documents_lineage_version` ON `governing_documents` (`lineage_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `governing_documents_hoa_key` ON `governing_documents` (`hoa_id`,`key`);--> statement-breakpoint
CREATE INDEX `governing_documents_hoa` ON `governing_documents` (`hoa_id`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `rules_file_sha256` text;--> statement-breakpoint
ALTER TABLE `rulebooks` ADD `settings_json` text;--> statement-breakpoint
ALTER TABLE `rulebooks` ADD `file_key` text;--> statement-breakpoint
ALTER TABLE `rulebooks` ADD `file_sha256` text;--> statement-breakpoint
ALTER TABLE `rulebooks` ADD `coverage_json` text;