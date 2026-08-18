/**
 * Patient directory from Mongo warehouse (no NexHealth calls on page load).
 */

import "server-only";
import { COLLECTIONS, getCollection, isMongoConfigured } from "@/lib/mongo/client";
import type { PatientDoc } from "@/lib/mongo/types";
import type { NexPatient } from "@/lib/nexhealth/client";

const WAREHOUSE_NOT_CONFIGURED =
  "Practice data warehouse is not configured. Set MONGODB_URI in .env.local and run npm run sync:nexhealth.";

export async function loadWarehousePatientRaws(): Promise<NexPatient[]> {
  if (!isMongoConfigured()) {
    throw new Error(WAREHOUSE_NOT_CONFIGURED);
  }

  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  if (!locationId) return [];

  const docs = await getCollection<PatientDoc>(COLLECTIONS.patients).then((c) =>
    c.find({ locationId }).toArray(),
  );
  return docs.map((d) => d.raw);
}
