-- SELECT-only MySQL user for Texoma KPI dashboard (office / production).
--
-- Before running:
-- 1. On the Open Dental server, open FreeDentalConfig.xml (often next to
--    OpenDental.exe) and note ServerName + DatabaseName.
-- 2. Replace CHANGE_ME_PASSWORD with a long random password.
-- 3. Replace opendental below with DatabaseName from the XML if different.
-- 4. Run as a MySQL admin (e.g. root) — never use root as the app user.
--
-- App .env.local on the OD server should then use:
--   OD_MYSQL_HOST=127.0.0.1
--   OD_MYSQL_USER=kpi_readonly
--   OD_MYSQL_PASS=<same password>
--   OD_MYSQL_DB=<DatabaseName>

CREATE USER IF NOT EXISTS 'kpi_readonly'@'localhost' IDENTIFIED BY 'CHANGE_ME_PASSWORD';

GRANT SELECT ON opendental.* TO 'kpi_readonly'@'localhost';

FLUSH PRIVILEGES;

-- Verify (as kpi_readonly):
--   SHOW GRANTS FOR CURRENT_USER;
-- Expect SELECT only — no INSERT/UPDATE/DELETE/DROP/ALTER.
