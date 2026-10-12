-- Law is federal law, state law, county ordinances and city ordinances (schema.md, Rank and conflicts), each kind
-- ranked above every document an organization writes. Documents of the old kinds `statute` and `ordinance` take the
-- new kind their title names, and orders of authority start with law's ranks. Data only.
UPDATE `governing_documents`
SET `kind` = CASE
  WHEN `kind` = 'statute' AND (`title` LIKE '%U.S.C%' OR `title` LIKE '%C.F.R%' OR `title` LIKE '%CFR%'
    OR `title` LIKE '%federal%' OR `title` LIKE '%FCC%' OR `title` LIKE '%Internal Revenue%'
    OR `title` LIKE '%United States%') THEN 'federal-law'
  WHEN `kind` = 'statute' THEN 'state-law'
  WHEN `title` LIKE '%city%' OR `title` LIKE '%town%' OR `title` LIKE '%municipal%' THEN 'city-ordinance'
  ELSE 'county-ordinance'
END
WHERE `kind` IN ('statute', 'ordinance');
--> statement-breakpoint
UPDATE `governing_documents`
SET `document_json` = json_set(`document_json`, '$.kind', `kind`)
WHERE `document_json` IS NOT NULL AND json_extract(`document_json`, '$.kind') IN ('statute', 'ordinance');
--> statement-breakpoint
UPDATE `rulebooks`
SET `settings_json` = replace(
  replace(
    replace(`settings_json`, '["statute","ordinance"]', '["federal-law"],["state-law"],["county-ordinance","city-ordinance"]'),
    '"statute"', '"state-law"'
  ),
  '"ordinance"', '"county-ordinance"'
)
WHERE `settings_json` LIKE '%"statute"%' OR `settings_json` LIKE '%"ordinance"%';
