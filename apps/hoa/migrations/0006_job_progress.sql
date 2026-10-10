-- A job's steps with their counts and times, for the build's progress (encoding.md, UX). Additive.
ALTER TABLE `jobs` ADD `progress_json` text;