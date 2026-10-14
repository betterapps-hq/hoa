-- The day a seat's term is due to end, apart from the day it did: someone keeps the seat until it's ended or their
-- next term starts.
ALTER TABLE `committee_members` ADD `term_ends_on` text;
