-- Application drafts (application-review.md, Applications): what the homeowner said each file is, and when they last
-- changed an application, so a review from before that can't be submitted. Additive.
ALTER TABLE `application_files` ADD `uploaded_as` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `revised_at` text;
