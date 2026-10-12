-- An administrator can remove a governing document (encoding.md, UX): builds and the documents list leave it out.
-- Additive.
ALTER TABLE `governing_documents` ADD `removed_at` text;
