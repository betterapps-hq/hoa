-- Local development's people (docs/design/people.md): the demo HOA's administrator and a homeowner, each with an
-- account, their units, the board and the architectural committee. The accounts keep the demo roles' user ids, so
-- what those roles did before accounts still names them. Sign in with either email: the code prints in the dev
-- server's log. Safe to run more than once.
-- Sam is also one of the platform's operators (users.role "admin"), to try viewing the app as someone locally.
INSERT OR IGNORE INTO users (id, name, email, email_verified, role, created_at, updated_at) VALUES
  ('demo-administrator', 'Sam Rivera', 'sam@example.com', 1, 'admin', 1791936000000, 1791936000000),
  ('demo-homeowner', 'Jordan Avery', 'jordan@example.com', 1, NULL, 1791936000000, 1791936000000);

INSERT OR IGNORE INTO people (id, organization_id, name, email, phone, mailing_address, user_id, created_at, updated_at, removed_at) VALUES
  ('person-sam', 'demo-hoa', 'Sam Rivera', 'sam@example.com', '360-555-0101', NULL, 'demo-administrator', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL),
  ('person-jordan', 'demo-hoa', 'Jordan Avery', 'jordan@example.com', '360-555-0102', NULL, 'demo-homeowner', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL),
  ('person-casey', 'demo-hoa', 'Casey Morgan', 'casey@example.com', NULL, '88 Harbor Road, Bellingham, WA 98226', NULL, '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL),
  ('person-riley', 'demo-hoa', 'Riley Chen', NULL, '360-555-0104', NULL, NULL, '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL);

-- Their memberships: Sam administers the association, Jordan is a member.
INSERT OR IGNORE INTO members (id, organization_id, user_id, role, created_at) VALUES
  ('member-sam', 'demo-hoa', 'demo-administrator', 'admin', 1791936000000),
  ('member-jordan', 'demo-hoa', 'demo-homeowner', 'member', 1791936000000);

INSERT OR IGNORE INTO units (id, organization_id, label, street, city, state, postal_code, created_at, updated_at, removed_at) VALUES
  ('unit-12', 'demo-hoa', '12 Lakeview Drive', '12 Lakeview Drive', 'Bellingham', 'WA', '98229', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL),
  ('unit-14', 'demo-hoa', '14 Lakeview Drive', '14 Lakeview Drive', 'Bellingham', 'WA', '98229', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL),
  ('unit-31', 'demo-hoa', '31 Fir Court', '31 Fir Court', 'Bellingham', 'WA', '98229', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL);

INSERT OR IGNORE INTO unit_people (id, organization_id, unit_id, person_id, relation, started_on, ended_on, created_at) VALUES
  ('unit-person-1', 'demo-hoa', 'unit-12', 'person-jordan', 'owner', '2019-06-01', NULL, '2026-10-13T00:00:00.000Z'),
  ('unit-person-2', 'demo-hoa', 'unit-14', 'person-sam', 'owner', '2015-03-15', NULL, '2026-10-13T00:00:00.000Z'),
  ('unit-person-3', 'demo-hoa', 'unit-31', 'person-casey', 'owner', '2021-09-01', NULL, '2026-10-13T00:00:00.000Z'),
  ('unit-person-4', 'demo-hoa', 'unit-31', 'person-riley', 'tenant', '2024-01-01', NULL, '2026-10-13T00:00:00.000Z');

INSERT OR IGNORE INTO committees (id, organization_id, name, kind, created_at, removed_at) VALUES
  ('committee-board', 'demo-hoa', 'Board of Directors', 'board', '2026-10-13T00:00:00.000Z', NULL),
  ('committee-acc', 'demo-hoa', 'Architectural Control Committee', 'architectural', '2026-10-13T00:00:00.000Z', NULL);

INSERT OR IGNORE INTO committee_members (id, organization_id, committee_id, person_id, role, office, started_on, ended_on, created_at) VALUES
  ('member-1', 'demo-hoa', 'committee-board', 'person-sam', 'chair', 'President', '2025-01-01', NULL, '2026-10-13T00:00:00.000Z'),
  ('member-2', 'demo-hoa', 'committee-acc', 'person-sam', 'member', NULL, '2025-01-01', NULL, '2026-10-13T00:00:00.000Z'),
  ('member-3', 'demo-hoa', 'committee-acc', 'person-casey', 'chair', NULL, '2025-01-01', NULL, '2026-10-13T00:00:00.000Z');
