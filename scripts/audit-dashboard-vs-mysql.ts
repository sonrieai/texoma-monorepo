/**
 * Cross-check dashboard KPIs against independent Open Dental SQL.
 * Read-only. Prints aggregate numbers only (no PHI).
 *
 * Usage:
 *   npx tsx --env-file=.env.local --require ./scripts/register-server-only-stub.cjs scripts/audit-dashboard-vs-mysql.ts
 */
import type { RowDataPacket } from "mysql2";
import { loadEnvLocal } from "../src/lib/env/load-env-local";
import { loadOpenDentalSnapshot } from "../src/lib/opendental/snapshot";
import { buildOverviewFromSnapshot } from "../src/lib/warehouse/build-overview";
import { closeOpenDentalMysql, queryOpenDental } from "../src/lib/opendental/mysql";
import { getOdClinicNums } from "../src/lib/opendental/location";
import { addMonthsYmd, todayYmd } from "../src/lib/ui/period";

loadEnvLocal();

type Row = { metric: string; dashboard: number | null; mysql: number | null; unit: "$" | "n" | "%" };

const clinicNums = getOdClinicNums();

function clinic(alias: string): { sql: string; params: number[] } {
  if (!clinicNums?.length) return { sql: "", params: [] };
  return {
    sql: ` AND ${alias}.ClinicNum IN (${clinicNums.map(() => "?").join(",")})`,
    params: clinicNums,
  };
}

async function scalar(sql: string, params: unknown[]): Promise<number> {
  const rows = await queryOpenDental<RowDataPacket>(sql, params);
  return Number(rows[0]?.v ?? 0) || 0;
}

async function sqlMetrics(from: string, to: string) {
  const pl = clinic("pl");
  const ps = clinic("ps");
  const ad = clinic("a");
  const ap = clinic("a");
  const cl = clinic("c");

  const gross = await scalar(
    `SELECT ROUND(SUM(pl.ProcFee) * 100) AS v FROM procedurelog pl
     WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}`,
    [from, to, ...pl.params],
  );
  const writeOff = await scalar(
    `SELECT ROUND(SUM(ABS(cp.WriteOff)) * 100) AS v FROM claimproc cp
     WHERE cp.Status IN (1, 4) AND cp.DateCP BETWEEN ? AND ?`,
    [from, to],
  );
  const insPay = await scalar(
    `SELECT ROUND(SUM(CASE WHEN cp.InsPayAmt > 0 THEN cp.InsPayAmt ELSE 0 END) * 100) AS v
     FROM claimproc cp WHERE cp.Status IN (1, 4) AND cp.DateCP BETWEEN ? AND ?`,
    [from, to],
  );
  const adjustments = await scalar(
    `SELECT ROUND(SUM(a.AdjAmt) * 100) AS v FROM adjustment a
     WHERE a.AdjDate BETWEEN ? AND ?${ad.sql}`,
    [from, to, ...ad.params],
  );
  const patPay = await scalar(
    `SELECT ROUND(SUM(ps.SplitAmt) * 100) AS v FROM paysplit ps
     INNER JOIN payment p ON p.PayNum = ps.PayNum
     WHERE ps.DatePay BETWEEN ? AND ?${ps.sql}`,
    [from, to, ...ps.params],
  );
  const scProd = await scalar(
    `SELECT ROUND(SUM(pl.ProcFee) * 100) AS v FROM procedurelog pl
     WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
       AND pl.PatNum IN (
         SELECT pp.PatNum FROM patplan pp
         JOIN inssub s ON s.InsSubNum = pp.InsSubNum
         JOIN insplan ip ON ip.PlanNum = s.PlanNum
         JOIN carrier c ON c.CarrierNum = ip.CarrierNum
         WHERE pp.Ordinal = 1 AND c.CarrierName REGEXP '(^|[^a-z])(sooner ?care|ohca)([^a-z]|$)'
       )`,
    [from, to, ...pl.params],
  );
  const countCode = (re: string) =>
    scalar(
      `SELECT COUNT(*) AS v FROM procedurelog pl
       JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
       WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
         AND UPPER(TRIM(pc.ProcCode)) REGEXP ?`,
      [from, to, ...pl.params, re],
    );
  const extractions = await countCode("^D(7140|7210|7220|7230|7240|7241|7250)");
  const implants = await countCode("^D(6010|6011|6040|6050)");
  const dentures = await countCode("^D(5110|5120|5130|5140)");
  const presented = await countCode("^D7777");
  const aoxCases = await scalar(
    `SELECT COUNT(DISTINCT pl.PatNum) AS v FROM procedurelog pl
     JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
       AND UPPER(TRIM(pc.ProcCode)) IN ('D6114', 'D6115', 'D1414', 'D1313', 'U-AOXS', 'U-AOXD')`,
    [from, to, ...pl.params],
  );
  const remakes = await scalar(
    `SELECT COUNT(*) AS v FROM procedurelog pl
     JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
       AND (UPPER(TRIM(pc.ProcCode)) REGEXP '^D(551[0-9]|5520|561[0-9]|562[0-9]|5630|5640|5650|6090)'
         OR LOWER(CONCAT(pc.ProcCode, ' ', pc.Descript)) LIKE '%remake%'
         OR LOWER(CONCAT(pc.ProcCode, ' ', pc.Descript)) LIKE '%repair broken complete denture%')`,
    [from, to, ...pl.params],
  );
  const presentedCents = await scalar(
    `SELECT ROUND(SUM(COALESCE((
        SELECT MAX(t.fee) FROM (
          SELECT tp.PatNum, DATE(tp.DateTP) AS d,
            SUM(IF(lp.ProcStatus = 2, lp.ProcFee, pt.FeeAmt)) AS fee
          FROM treatplan tp JOIN proctp pt ON pt.TreatPlanNum = tp.TreatPlanNum
          LEFT JOIN procedurelog lp ON lp.ProcNum = pt.ProcNumOrig
          GROUP BY tp.TreatPlanNum
        ) t WHERE t.PatNum = pl.PatNum AND t.d = pl.ProcDate), 0)) * 100) AS v
     FROM procedurelog pl JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.ProcStatus = 2 AND pc.ProcCode = 'D7777' AND pl.ProcDate BETWEEN ? AND ?${pl.sql}`,
    [from, to, ...pl.params],
  );
  const missedD9986 = await countCode("^D9986");
  const cancelD9987 = await countCode("^D9987");
  const newPatients = await scalar(
    `SELECT COUNT(*) AS v FROM patient WHERE DateFirstVisit BETWEEN ? AND ?`,
    [from, to],
  );
  const apptByStatus = async (status: number) =>
    scalar(
      `SELECT COUNT(*) AS v FROM appointment a
       WHERE a.AptStatus = ? AND a.AptDateTime >= ? AND a.AptDateTime < DATE_ADD(?, INTERVAL 1 DAY)${ap.sql}`,
      [status, `${from} 00:00:00`, to, ...ap.params],
    );
  const apptShow = await apptByStatus(2);
  const apptBroken = await apptByStatus(5);
  const nearestCode = `(
    SELECT c.ProcCode FROM procedurelog p JOIN procedurecode c ON c.CodeNum = p.CodeNum
    WHERE c.ProcCode IN ('D9986', 'D9987') AND p.ProcStatus = 2 AND p.PatNum = a.PatNum
      AND p.ProcDate BETWEEN DATE(a.AptDateTime) - INTERVAL 30 DAY AND DATE(a.AptDateTime) + INTERVAL 7 DAY
    ORDER BY ABS(DATEDIFF(DATE(a.AptDateTime), p.ProcDate)),
      p.ProcDate > DATE(a.AptDateTime), c.ProcCode
    LIMIT 1)`;
  const splitRows = await queryOpenDental<RowDataPacket>(
    `SELECT a.AptStatus AS status, ${nearestCode} AS code, COUNT(*) AS n FROM appointment a
     WHERE a.AptStatus IN (3, 5) AND a.AptDateTime >= ? AND a.AptDateTime < DATE_ADD(?, INTERVAL 1 DAY)${ap.sql}
     GROUP BY status, code`,
    [`${from} 00:00:00`, to, ...ap.params],
  );
  let apptNoShow = 0;
  let apptCancelled = 0;
  for (const r of splitRows) {
    const n = Number(r.n) || 0;
    if (r.code === "D9987") apptCancelled += n;
    else if (r.code === "D9986" || Number(r.status) === 5) apptNoShow += n;
  }
  const claimsSubmitted = await scalar(
    `SELECT COUNT(*) AS v FROM claim c
     WHERE c.DateSent BETWEEN ? AND ? AND c.ClaimStatus <> 'U' AND c.ClaimType <> 'PreAuth'${cl.sql}`,
    [from, to, ...cl.params],
  );
  const claimsPaid = await scalar(
    `SELECT COUNT(*) AS v FROM claim c
     WHERE c.DateSent BETWEEN ? AND ? AND c.ClaimStatus = 'R' AND c.ClaimType <> 'PreAuth'${cl.sql}`,
    [from, to, ...cl.params],
  );
  const preAuths = await scalar(
    `SELECT COUNT(*) AS v FROM claim c
     WHERE c.DateSent BETWEEN ? AND ? AND c.ClaimStatus <> 'U' AND c.ClaimType = 'PreAuth'${cl.sql}`,
    [from, to, ...cl.params],
  );

  const collections = patPay + insPay;
  return {
    gross,
    writeOff,
    adjustments,
    adjusted: gross - writeOff + adjustments,
    collections,
    collectionRatio: gross > 0 ? collections / gross : null,
    scProd,
    extractions,
    implants,
    dentures,
    presented,
    aoxCases,
    remakes,
    presentedCents,
    missedD9986,
    cancelD9987,
    newPatients,
    apptShow,
    apptBroken,
    apptNoShow,
    apptCancelled,
    claimsSubmitted,
    claimsPaid,
    insPay,
    preAuths,
  };
}

async function arMetrics() {
  const cols = await queryOpenDental<RowDataPacket>(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patient'
       AND COLUMN_NAME IN ('TotBal', 'BalTotal')`,
  );
  const names = cols.map((r) => String(r.c));
  const col = names.includes("TotBal") ? "TotBal" : names.includes("BalTotal") ? "BalTotal" : "EstBalance";
  const total = await scalar(
    `SELECT ROUND(SUM(GREATEST(0, ${col})) * 100) AS v FROM patient WHERE PatNum = Guarantor`,
    [],
  );
  const patient = await scalar(
    `SELECT ROUND(SUM(GREATEST(0, GREATEST(0, ${col}) - InsEst)) * 100) AS v FROM patient WHERE PatNum = Guarantor`,
    [],
  );
  const over90 = await scalar(
    `SELECT ROUND(SUM(BalOver90) * 100) AS v FROM patient WHERE PatNum = Guarantor`,
    [],
  );
  return { total, patient, over90, col };
}

/** Doctor page: per-ProvNum production and attendance. */
async function providerMetrics(from: string, to: string) {
  const pl = clinic("pl");
  const ap = clinic("a");
  const gross = await queryOpenDental<RowDataPacket>(
    `SELECT pl.ProvNum AS prov, ROUND(SUM(pl.ProcFee) * 100) AS v FROM procedurelog pl
     WHERE pl.ProcStatus = 2 AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
     GROUP BY pl.ProvNum`,
    [from, to, ...pl.params],
  );
  const nearestCode = `(
    SELECT c.ProcCode FROM procedurelog p JOIN procedurecode c ON c.CodeNum = p.CodeNum
    WHERE c.ProcCode IN ('D9986', 'D9987') AND p.ProcStatus = 2 AND p.PatNum = a.PatNum
      AND p.ProcDate BETWEEN DATE(a.AptDateTime) - INTERVAL 30 DAY AND DATE(a.AptDateTime) + INTERVAL 7 DAY
    ORDER BY ABS(DATEDIFF(DATE(a.AptDateTime), p.ProcDate)),
      p.ProcDate > DATE(a.AptDateTime), c.ProcCode
    LIMIT 1)`;
  const attendance = await queryOpenDental<RowDataPacket>(
    `SELECT a.ProvNum AS prov, a.AptStatus AS status,
       IF(a.AptStatus IN (3, 5), ${nearestCode}, NULL) AS code, COUNT(*) AS n
     FROM appointment a
     WHERE a.AptStatus IN (2, 3, 5) AND a.AptDateTime >= ? AND a.AptDateTime < DATE_ADD(?, INTERVAL 1 DAY)${ap.sql}
     GROUP BY prov, status, code`,
    [`${from} 00:00:00`, to, ...ap.params],
  );
  const out = new Map<number, { gross: number; show: number; noShow: number; cancelled: number }>();
  const get = (prov: number) => {
    let row = out.get(prov);
    if (!row) {
      row = { gross: 0, show: 0, noShow: 0, cancelled: 0 };
      out.set(prov, row);
    }
    return row;
  };
  for (const r of gross) get(Number(r.prov)).gross = Number(r.v) || 0;
  for (const r of attendance) {
    const row = get(Number(r.prov));
    const n = Number(r.n) || 0;
    if (Number(r.status) === 2) row.show += n;
    else if (r.code === "D9987") row.cancelled += n;
    else if (r.code === "D9986" || Number(r.status) === 5) row.noShow += n;
  }
  return out;
}

/**
 * TC page: completed D7777 attributed to N9210 (Ashlie) / N9410 (Brie) —
 * completed code on the visit, then completed code that patient-day,
 * then treatment-planned code that patient-day.
 */
async function coordinatorPresented(from: string, to: string) {
  const pl = clinic("pl");
  const marker = (where: string, status: number) => `(
    SELECT c2.ProcCode FROM procedurelog p2 JOIN procedurecode c2 ON c2.CodeNum = p2.CodeNum
    WHERE ${where} AND p2.ProcStatus = ${status} AND UPPER(TRIM(c2.ProcCode)) IN ('N9210', 'N9410')
    ORDER BY p2.ProcNum LIMIT 1)`;
  const sameDay = "p2.PatNum = pl.PatNum AND p2.ProcDate = pl.ProcDate";
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT UPPER(TRIM(COALESCE(
        IF(pl.AptNum > 0, ${marker("p2.AptNum = pl.AptNum", 2)}, NULL),
        ${marker(sameDay, 2)},
        ${marker(sameDay, 1)}
      ))) AS coord, COUNT(*) AS n
     FROM procedurelog pl JOIN procedurecode pc ON pc.CodeNum = pl.CodeNum
     WHERE pl.ProcStatus = 2 AND UPPER(TRIM(pc.ProcCode)) = 'D7777'
       AND pl.ProcDate BETWEEN ? AND ?${pl.sql}
     GROUP BY coord`,
    [from, to, ...pl.params],
  );
  const byCode = new Map(rows.map((r) => [String(r.coord ?? ""), Number(r.n) || 0]));
  return { Ashlie: byCode.get("N9210") ?? 0, Brie: byCode.get("N9410") ?? 0 };
}

/** Marketing page: first-visit patients per referral source (earliest attach wins). */
async function marketingLeads(from: string, to: string): Promise<Map<string, number>> {
  const refYmd = "IF(ra2.RefDate IS NULL OR ra2.RefDate < '1900-01-01', '9999-99-99', DATE_FORMAT(ra2.RefDate, '%Y-%m-%d'))";
  const rows = await queryOpenDental<RowDataPacket>(
    `SELECT CASE
         WHEN r.ReferralNum IS NULL THEN 'Unknown'
         WHEN TRIM(COALESCE(r.FName, '')) <> '' THEN 'Patient referral'
         WHEN TRIM(COALESCE(r.LName, '')) = '' THEN 'Unknown'
         ELSE TRIM(r.LName) END AS source, COUNT(*) AS n
     FROM patient p
     LEFT JOIN refattach ra ON ra.RefAttachNum = (
       SELECT ra2.RefAttachNum FROM refattach ra2
       JOIN referral r2 ON r2.ReferralNum = ra2.ReferralNum
       WHERE ra2.PatNum = p.PatNum
       ORDER BY ${refYmd}, ra2.ItemOrder, ra2.RefAttachNum LIMIT 1)
     LEFT JOIN referral r ON r.ReferralNum = ra.ReferralNum
     WHERE p.DateFirstVisit BETWEEN ? AND ?
     GROUP BY source`,
    [from, to],
  );
  return new Map(rows.map((r) => [String(r.source), Number(r.n) || 0]));
}

function fmt(value: number | null, unit: Row["unit"]): string {
  if (value == null) return "—";
  if (unit === "$") return `$${(value / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (unit === "%") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString("en-US");
}

function verdict(r: Row): string {
  if (r.dashboard == null && r.mysql == null) return "OK";
  if (r.dashboard == null || r.mysql == null) return "MISMATCH";
  const diff = Math.abs(r.dashboard - r.mysql);
  const tol = r.unit === "$" ? 100 : r.unit === "%" ? 0.001 : 0;
  if (diff <= tol) return "OK";
  const base = Math.max(Math.abs(r.mysql), 1);
  return `MISMATCH (${((diff / base) * 100).toFixed(1)}%)`;
}

async function main() {
  const today = todayYmd();
  const periods = [
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "Year to date", from: `${today.slice(0, 4)}-01-01`, to: today },
    { label: "Last 12 months", from: addMonthsYmd(today, -12), to: today },
    {
      label: "Last calendar year",
      from: `${Number(today.slice(0, 4)) - 1}-01-01`,
      to: `${Number(today.slice(0, 4)) - 1}-12-31`,
    },
  ];

  console.log(`Clinic filter: ${clinicNums?.length ? "on" : "off"}`);
  const snapshot = await loadOpenDentalSnapshot();
  console.log(`Snapshot appointments from: ${snapshot.appointmentsLoadedFromYmd}`);
  const ar = await arMetrics();

  for (const period of periods) {
    const ov = buildOverviewFromSnapshot(snapshot, { start: period.from, end: period.to });
    const s = await sqlMetrics(period.from, period.to);
    const p = ov.production;
    const rows: Row[] = [
      { metric: "Gross production", dashboard: p.grossProductionCents, mysql: s.gross, unit: "$" },
      { metric: "Adjusted production", dashboard: p.netProductionCents, mysql: s.adjusted, unit: "$" },
      { metric: "Collections", dashboard: p.collectionsCents, mysql: s.collections, unit: "$" },
      { metric: "Collection ratio", dashboard: p.collectionRatio, mysql: s.collectionRatio, unit: "%" },
      { metric: "SC production", dashboard: p.scProductionCents, mysql: s.scProd, unit: "$" },
      { metric: "Extractions", dashboard: p.procedureVolume.extractions, mysql: s.extractions, unit: "n" },
      { metric: "Implants placed", dashboard: p.procedureVolume.implants, mysql: s.implants, unit: "n" },
      { metric: "Dentures delivered", dashboard: p.procedureVolume.dentures, mysql: s.dentures, unit: "n" },
      { metric: "New patients (first visit)", dashboard: ov.conversion.newPatients, mysql: s.newPatients, unit: "n" },
      { metric: "TX plans presented (D7777)", dashboard: ov.tcMetrics.tpPresentedCount, mysql: s.presented, unit: "n" },
      { metric: "Presented ($, same-day plan)", dashboard: ov.tcMetrics.tpPresentedCents, mysql: s.presentedCents, unit: "$" },
      { metric: "$ Financed: TC vs Overview mix", dashboard: ov.tcMetrics.financingVendorMix.totalCents, mysql: p.paymentMix.financed, unit: "$" },
      { metric: "AOX cases (patients)", dashboard: p.procedureVolume.aox, mysql: s.aoxCases, unit: "n" },
      { metric: "Denture remakes", dashboard: p.procedureVolume.remakes, mysql: s.remakes, unit: "n" },
      { metric: "Appointments shown (Complete)", dashboard: ov.appointments.show, mysql: s.apptShow, unit: "n" },
      { metric: "No-shows (nearest D9986 / plain Broken)", dashboard: ov.appointments.noShow, mysql: s.apptNoShow, unit: "n" },
      { metric: "Cancellations (nearest D9987)", dashboard: ov.appointments.cancelled, mysql: s.apptCancelled, unit: "n" },
      { metric: "Claims submitted", dashboard: ov.insurance.claimsSubmitted, mysql: s.claimsSubmitted, unit: "n" },
      { metric: "Claims paid", dashboard: ov.insurance.claimsPaid, mysql: s.claimsPaid, unit: "n" },
      { metric: "Insurance collected", dashboard: ov.insurance.collectedCents, mysql: s.insPay, unit: "$" },
      { metric: "Pre-auths submitted", dashboard: ov.insurance.preAuthsSubmitted, mysql: s.preAuths, unit: "n" },
    ];
    console.log("");
    console.log(`=== ${period.label} (${period.from} to ${period.to}) ===`);
    for (const r of rows) {
      console.log(
        `${r.metric.padEnd(40)} dashboard ${fmt(r.dashboard, r.unit).padStart(14)}   mysql ${fmt(r.mysql, r.unit).padStart(14)}   ${verdict(r)}`,
      );
    }
    console.log(
      `  (reference: AptStatus Broken ${s.apptBroken}, D9986 posted ${s.missedD9986}, D9987 posted ${s.cancelD9987})`,
    );
  }

  const ytd = periods[1]!;
  const ytdOv = buildOverviewFromSnapshot(snapshot, { start: ytd.from, end: ytd.to });
  const byProv = await providerMetrics(ytd.from, ytd.to);
  console.log("");
  console.log(`=== Doctor pages, ${ytd.label} (provider id only) ===`);
  for (const prov of ytdOv.providers) {
    const s = byProv.get(prov.sourceId) ?? { gross: 0, show: 0, noShow: 0, cancelled: 0 };
    const rows: Row[] = [
      { metric: `Prov ${prov.sourceId} gross production`, dashboard: prov.production.grossProductionCents, mysql: s.gross, unit: "$" },
      { metric: `Prov ${prov.sourceId} shows`, dashboard: prov.showCount, mysql: s.show, unit: "n" },
      { metric: `Prov ${prov.sourceId} no-shows`, dashboard: prov.noShowCount, mysql: s.noShow, unit: "n" },
      { metric: `Prov ${prov.sourceId} cancellations`, dashboard: prov.cancelledCount, mysql: s.cancelled, unit: "n" },
    ];
    for (const r of rows) {
      console.log(
        `${r.metric.padEnd(40)} dashboard ${fmt(r.dashboard, r.unit).padStart(14)}   mysql ${fmt(r.mysql, r.unit).padStart(14)}   ${verdict(r)}`,
      );
    }
  }

  const tc = await coordinatorPresented(ytd.from, ytd.to);
  console.log("");
  console.log(`=== TC pages, ${ytd.label} ===`);
  for (const row of ytdOv.tcCoordinators) {
    const name = row.name as keyof typeof tc;
    const r: Row = {
      metric: `${row.name} plans presented (D7777)`,
      dashboard: row.metrics.tpPresentedCount,
      mysql: tc[name] ?? null,
      unit: "n",
    };
    console.log(
      `${r.metric.padEnd(40)} dashboard ${fmt(r.dashboard, r.unit).padStart(14)}   mysql ${fmt(r.mysql, r.unit).padStart(14)}   ${verdict(r)}`,
    );
  }

  const leads = await marketingLeads(ytd.from, ytd.to);
  const dashLeads = new Map(ytdOv.marketing.channels.map((c) => [c.name, c.leads]));
  console.log("");
  console.log(`=== Marketing page leads by source, ${ytd.label} ===`);
  const sources = new Set([...leads.keys(), ...dashLeads.keys()]);
  const leadRows: Row[] = [
    { metric: "Total leads", dashboard: ytdOv.marketing.totals.leads, mysql: [...leads.values()].reduce((a, b) => a + b, 0), unit: "n" },
    ...[...sources]
      .filter((name) => (leads.get(name) ?? 0) > 0 || (dashLeads.get(name) ?? 0) > 0)
      .sort((a, b) => (leads.get(b) ?? 0) - (leads.get(a) ?? 0))
      .map((name) => ({
        metric: `Leads: ${name.slice(0, 32)}`,
        dashboard: dashLeads.get(name) ?? 0,
        mysql: leads.get(name) ?? 0,
        unit: "n" as const,
      })),
  ];
  for (const r of leadRows) {
    console.log(
      `${r.metric.padEnd(40)} dashboard ${fmt(r.dashboard, r.unit).padStart(14)}   mysql ${fmt(r.mysql, r.unit).padStart(14)}   ${verdict(r)}`,
    );
  }

  const ov = buildOverviewFromSnapshot(snapshot, { start: today, end: today });
  console.log("");
  console.log(`=== AR snapshot (column ${ar.col}) ===`);
  const arRows: Row[] = [
    { metric: "Total AR", dashboard: ov.accountsReceivable.totalArCents, mysql: ar.total, unit: "$" },
    { metric: "AR over 90", dashboard: ov.accountsReceivable.arOver90Cents, mysql: ar.over90, unit: "$" },
    { metric: "Patient AR (BalTotal - InsEst)", dashboard: ov.accountsReceivable.patientArCents, mysql: ar.patient, unit: "$" },
  ];
  for (const r of arRows) {
    console.log(
      `${r.metric.padEnd(40)} dashboard ${fmt(r.dashboard, r.unit).padStart(14)}   mysql ${fmt(r.mysql, r.unit).padStart(14)}   ${verdict(r)}`,
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeOpenDentalMysql());
