-- A person's mailing address in parts, as the address search fills it. What was typed before keeps its text as the street.
ALTER TABLE `people` ADD `mailing_address_json` text;
--> statement-breakpoint
UPDATE `people` SET `mailing_address_json` = json_object('street', trim(`mailing_address`), 'unitNumber', NULL, 'city', NULL, 'state', NULL, 'postalCode', NULL, 'place', NULL) WHERE trim(coalesce(`mailing_address`, '')) != '';
--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `mailing_address`;
