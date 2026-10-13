-- Who removed each governing document and who added each project type, so the committee's recent activity names who
-- did each thing (dashboard.md). Additive; rows from before stay null.
ALTER TABLE `governing_documents` ADD `removed_by` text;--> statement-breakpoint
ALTER TABLE `project_types` ADD `created_by` text;
