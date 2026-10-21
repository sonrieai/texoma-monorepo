/**
 * Item 25 — production fee expression for SQL aggregates.
 * Default: ProcFee only. Set OD_PRODUCTION_USE_UNITS=1 after compare:production-units matches OD P&I.
 */

export function odProductionUseUnits(): boolean {
  return process.env.OD_PRODUCTION_USE_UNITS?.trim() === "1";
}

/** SQL expression for fee before rounding to cents (alias defaults to procedurelog). */
export function odProductionFeeSql(alias = "pl"): string {
  if (odProductionUseUnits()) {
    return `${alias}.ProcFee * (${alias}.UnitQty + ${alias}.BaseUnits)`;
  }
  return `${alias}.ProcFee`;
}
