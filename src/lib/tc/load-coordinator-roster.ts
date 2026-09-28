import "server-only";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import { loadOpenDentalSnapshot } from "@/lib/opendental/snapshot";
import {
  discoverTcCoordinators,
  type TcCoordinator,
} from "@/lib/tc/discover-coordinators";

/** Coordinator roster from live Open Dental treatment plans + appointments. */
export async function loadTcCoordinatorRoster(): Promise<TcCoordinator[]> {
  if (!isOpenDentalMysqlConfigured()) return [];

  const snapshot = await loadOpenDentalSnapshot();
  return discoverTcCoordinators({
    plans: snapshot.treatmentPlans,
    appointments: snapshot.appointments,
    appointmentTypes: snapshot.appointmentTypes,
    providers: snapshot.providers.filter((p) => !p.inactive),
  });
}

/** Sidebar links — slug + display name only. */
export async function loadTcCoordinatorLinks(): Promise<
  { slug: string; name: string }[]
> {
  const roster = await loadTcCoordinatorRoster();
  return roster.map((c) => ({ slug: c.slug, name: c.name }));
}
