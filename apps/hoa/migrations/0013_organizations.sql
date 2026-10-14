-- Better Auth's organization plugin (docs/design/people.md): the association becomes its organization, with the app's
-- settings; members hold who has an account in one and their role, and invitations who's been asked to join. The roll
-- keeps everyone, with or without an account, and loses the role and invitation it kept itself. hoa_id becomes
-- organization_id everywhere.
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `organizations` (`id`, `name`, `slug`, `settings_json`, `created_at`)
  SELECT `id`, `name`, `slug`, `settings_json`, unixepoch(`created_at`) * 1000 FROM `hoas`;
--> statement-breakpoint
DROP TABLE `hoas`;
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);
--> statement-breakpoint
ALTER TABLE `application_files` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `application_pages` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `applications` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `committee_members` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `committees` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `governing_documents` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `jobs` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `people` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `project_types` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `provisions` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `reviews` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `rulebook_questions` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `rulebook_rules` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `rulebook_terms` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `rulebooks` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `rules` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `sections` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `unit_people` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
ALTER TABLE `units` RENAME COLUMN `hoa_id` TO `organization_id`;
--> statement-breakpoint
DROP INDEX `applications_hoa_status`;
--> statement-breakpoint
CREATE INDEX `applications_organization_status` ON `applications` (`organization_id`,`status`);
--> statement-breakpoint
DROP INDEX `committees_hoa`;
--> statement-breakpoint
CREATE INDEX `committees_organization` ON `committees` (`organization_id`);
--> statement-breakpoint
DROP INDEX `governing_documents_hoa_key`;
--> statement-breakpoint
CREATE UNIQUE INDEX `governing_documents_organization_key` ON `governing_documents` (`organization_id`,`key`);
--> statement-breakpoint
DROP INDEX `governing_documents_hoa`;
--> statement-breakpoint
CREATE INDEX `governing_documents_organization` ON `governing_documents` (`organization_id`);
--> statement-breakpoint
DROP INDEX `people_hoa_email`;
--> statement-breakpoint
CREATE UNIQUE INDEX `people_organization_email` ON `people` (`organization_id`,`email`);
--> statement-breakpoint
DROP INDEX `people_hoa`;
--> statement-breakpoint
CREATE INDEX `people_organization` ON `people` (`organization_id`);
--> statement-breakpoint
DROP INDEX `project_types_hoa`;
--> statement-breakpoint
CREATE INDEX `project_types_organization` ON `project_types` (`organization_id`);
--> statement-breakpoint
DROP INDEX `rulebook_questions_hoa`;
--> statement-breakpoint
CREATE INDEX `rulebook_questions_organization` ON `rulebook_questions` (`organization_id`,`rulebook_id`);
--> statement-breakpoint
DROP INDEX `rulebook_rules_hoa`;
--> statement-breakpoint
CREATE INDEX `rulebook_rules_organization` ON `rulebook_rules` (`organization_id`,`rulebook_id`);
--> statement-breakpoint
DROP INDEX `rulebook_terms_hoa`;
--> statement-breakpoint
CREATE INDEX `rulebook_terms_organization` ON `rulebook_terms` (`organization_id`,`rulebook_id`);
--> statement-breakpoint
DROP INDEX `rulebooks_hoa_version`;
--> statement-breakpoint
CREATE UNIQUE INDEX `rulebooks_organization_version` ON `rulebooks` (`organization_id`,`version`);
--> statement-breakpoint
DROP INDEX `unit_people_hoa`;
--> statement-breakpoint
CREATE INDEX `unit_people_organization` ON `unit_people` (`organization_id`);
--> statement-breakpoint
DROP INDEX `units_hoa`;
--> statement-breakpoint
CREATE INDEX `units_organization` ON `units` (`organization_id`);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_organization_user` ON `members` (`organization_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `members_user` ON `members` (`user_id`);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitations_organization` ON `invitations` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `invitations_email` ON `invitations` (`email`);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `active_organization_id` text;
--> statement-breakpoint
-- Everyone on a roll with an account becomes a member, an administrator as an "admin".
INSERT INTO `members` (`id`, `organization_id`, `user_id`, `role`, `created_at`)
  SELECT lower(hex(randomblob(16))), `organization_id`, `user_id`,
    CASE `access` WHEN 'administrator' THEN 'admin' ELSE 'member' END, unixepoch() * 1000
  FROM `people` WHERE `user_id` IS NOT NULL AND `removed_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `access`;
--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `invited_at`;
