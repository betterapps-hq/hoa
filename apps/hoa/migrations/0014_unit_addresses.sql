-- Units' addresses in parts (street, unit number, city, state, ZIP code), as the address search fills them, and the
-- place it found with where that is. The one-line address moves to the street until someone edits the unit. Units no
-- longer keep a lot.
ALTER TABLE `units` ADD `street` text;--> statement-breakpoint
ALTER TABLE `units` ADD `unit_number` text;--> statement-breakpoint
ALTER TABLE `units` ADD `city` text;--> statement-breakpoint
ALTER TABLE `units` ADD `state` text;--> statement-breakpoint
ALTER TABLE `units` ADD `postal_code` text;--> statement-breakpoint
ALTER TABLE `units` ADD `place_id` text;--> statement-breakpoint
ALTER TABLE `units` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `units` ADD `longitude` real;--> statement-breakpoint
UPDATE `units` SET `street` = `address`;--> statement-breakpoint
ALTER TABLE `units` DROP COLUMN `address`;--> statement-breakpoint
ALTER TABLE `units` DROP COLUMN `lot`;
