-- The association's own mailing address, in the same parts as a unit's, with the place the address search found.
ALTER TABLE `organizations` ADD `street` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `unit_number` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `city` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `state` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `postal_code` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `place_id` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `organizations` ADD `longitude` real;
