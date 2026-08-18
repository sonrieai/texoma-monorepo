import "server-only";
import {
  COLLECTIONS,
  getCollection,
  isMongoConfigured,
} from "@/lib/mongo/client";
import type {
  AppointmentDoc,
  AppointmentTypeDoc,
  ProviderDoc,
  TreatmentPlanDoc,
} from "@/lib/mongo/types";
import {
  discoverTcCoordinators,
  type TcCoordinator,
} from "@/lib/tc/discover-coordinators";

/** Coordinator roster from warehouse treatment plans + TC appointments (no env names). */
export async function loadTcCoordinatorRoster(): Promise<TcCoordinator[]> {
  if (!isMongoConfigured()) return [];

  const locationId = Number(process.env.NEXHEALTH_LOCATION_ID || 0);
  if (!locationId) return [];

  const [plans, appointments, appointmentTypes, providers] = await Promise.all([
    getCollection<TreatmentPlanDoc>(COLLECTIONS.treatmentPlans).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<AppointmentDoc>(COLLECTIONS.appointments).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<AppointmentTypeDoc>(COLLECTIONS.appointmentTypes).then((c) =>
      c.find({ locationId }).toArray(),
    ),
    getCollection<ProviderDoc>(COLLECTIONS.providers).then((c) =>
      c.find({ locationId, inactive: false }).toArray(),
    ),
  ]);

  return discoverTcCoordinators({
    plans: plans.map((d) => d.raw),
    appointments: appointments.map((d) => d.raw),
    appointmentTypes: appointmentTypes.map((d) => d.raw),
    providers: providers.map((d) => d.raw),
  });
}

/** Sidebar links — slug + display name only. */
export async function loadTcCoordinatorLinks(): Promise<
  { slug: string; name: string }[]
> {
  const roster = await loadTcCoordinatorRoster();
  return roster.map((c) => ({ slug: c.slug, name: c.name }));
}
