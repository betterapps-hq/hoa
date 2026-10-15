CREATE TABLE `ledger_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`from_entry_id` text NOT NULL,
	`to_entry_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_allocations_from` ON `ledger_allocations` (`from_entry_id`);
--> statement-breakpoint
CREATE INDEX `ledger_allocations_to` ON `ledger_allocations` (`to_entry_id`);
--> statement-breakpoint
CREATE INDEX `ledger_allocations_unit` ON `ledger_allocations` (`organization_id`,`unit_id`);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`posted_on` text NOT NULL,
	`due_on` text,
	`category` text,
	`description` text NOT NULL,
	`reference` text,
	`rule_key` text,
	`rulebook_id` text,
	`source_type` text NOT NULL,
	`source_id` text,
	`reverses_id` text,
	`posting_key` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_unit` ON `ledger_entries` (`organization_id`,`unit_id`,`posted_on`);
--> statement-breakpoint
CREATE INDEX `ledger_entries_source` ON `ledger_entries` (`source_type`,`source_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_posting_key` ON `ledger_entries` (`organization_id`,`posting_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_reverses` ON `ledger_entries` (`reverses_id`);
