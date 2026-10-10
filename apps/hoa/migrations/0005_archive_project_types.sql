-- Project types are archived, not retired (application-review.md, Project types). The status column is text, so
-- nothing is added or dropped: rows that say "retired" now say "archived".
UPDATE `project_types` SET `status` = 'archived' WHERE `status` = 'retired';
