-- The demo's one HOA (docs/design/documents.md, "Phase 1 assumptions"). Safe to run more than once.
INSERT OR IGNORE INTO hoas (id, name, slug, settings_json, created_at)
VALUES (
  'demo-hoa',
  'Sudden Valley Community Association',
  'sudden-valley',
  '{"curableOutcome":"approve-with-conditions","retentionDays":365,"draftRetentionDays":30}',
  '2026-10-08T00:00:00.000Z'
);
