import { loadOpenDentalSnapshot } from "@/lib/opendental/snapshot";
import {
  aggregatePaymentMix,
  classifyPayment,
  paymentCollectionCents,
} from "@/lib/warehouse/payment-mix";
import { inYmdRange } from "@/lib/warehouse/conversion";

const from = process.argv[2] ?? "2026-01-01";
const to = process.argv[3] ?? "2026-10-07";

async function main() {
const snapshot = await loadOpenDentalSnapshot();
const payments = snapshot.payments.filter(
  (p) => !p.deleted_at && inYmdRange(p.paid_at, from, to),
);
const c = snapshot.paymentTypeClassification;
const opts = {
  insurancePaymentTypeDefNums: new Set(c.insurance),
  soonercarePaymentTypeDefNums: new Set(c.soonercare),
  financedPaymentTypeDefNums: new Set(c.financed),
  cashPaymentTypeDefNums: new Set(c.cash),
};

const mix = aggregatePaymentMix(payments, opts);
console.log("mix", mix);

const byType = new Map<string, number>();
for (const p of payments) {
  const cents = paymentCollectionCents(p);
  if (cents <= 0) continue;
  const bucket = classifyPayment(p, opts);
  const key = `${p.payment_type ?? "EMPTY"}|${bucket}`;
  byType.set(key, (byType.get(key) ?? 0) + cents);
}

console.log("\nUnknown by PayType name:");
for (const [key, cents] of [...byType.entries()]
  .filter(([k]) => k.endsWith("|unknown"))
  .sort((a, b) => b[1] - a[1])) {
  console.log(key, (cents / 100).toFixed(2));
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
