import "server-only";
import { isOpenDentalMysqlConfigured } from "@/lib/opendental/config";
import { getOdClinicNums } from "@/lib/opendental/location";
import {
  mapOdAppointmentType,
  mapOdProvider,
} from "@/lib/opendental/mappers";
import {
  listOdAppointmentProvidersByType,
  listOdAppointmentTypes,
  listOdProviders,
} from "@/lib/opendental/queries";
import { readCachedOpenDentalSnapshot } from "@/lib/opendental/snapshot";
import {
  discoverTcCoordinators,
  resolveTcAppointmentTypeIds,
  type TcCoordinator,
} from "@/lib/tc/discover-coordinators";
import type { AppointmentRecord } from "@/lib/warehouse/types";

const ROSTER_TTL_MS = 5 * 60 * 1000;
const APPOINTMENT_LOOKBACK_DAYS = 365;
const APPOINTMENT_LOOKAHEAD_DAYS = 365;

type RosterCacheBox = {
  roster: TcCoordinator[];
  cachedAtMs: number;
};

const rosterCache: { current: RosterCacheBox | null } = ((
  globalThis as { __texomaTcRoster?: { current: RosterCacheBox | null } }
).__texomaTcRoster ??= { current: null });

function ymdOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function readRosterCache(): TcCoordinator[] | null {
  const hit = rosterCache.current;
  if (!hit) return null;
  if (Date.now() - hit.cachedAtMs > ROSTER_TTL_MS) return null;
  return hit.roster;
}

function writeRosterCache(roster: TcCoordinator[]): TcCoordinator[] {
  rosterCache.current = { roster, cachedAtMs: Date.now() };
  return roster;
}

function rosterFromSnapshot(): TcCoordinator[] | null {
  const snapshot = readCachedOpenDentalSnapshot();
  if (!snapshot) return null;
  return discoverTcCoordinators({
    plans: snapshot.treatmentPlans,
    appointments: snapshot.appointments,
    appointmentTypes: snapshot.appointmentTypes,
    providers: snapshot.providers.filter((provider) => !provider.inactive),
  });
}

/** Names only: appointment types, providers, and TC-type appointments. */
async function rosterFromOpenDental(): Promise<TcCoordinator[]> {
  const [providerRows, typeRows] = await Promise.all([
    listOdProviders(),
    listOdAppointmentTypes(),
  ]);
  const appointmentTypes = typeRows.map(mapOdAppointmentType);
  const { ids } = resolveTcAppointmentTypeIds(appointmentTypes);
  const appointmentRows = await listOdAppointmentProvidersByType(
    {
      startYmd: ymdOffset(-APPOINTMENT_LOOKBACK_DAYS),
      endYmd: ymdOffset(APPOINTMENT_LOOKAHEAD_DAYS),
    },
    ids,
    getOdClinicNums(),
  );
  const appointments: AppointmentRecord[] = appointmentRows.map((row) => ({
    provider_id: row.ProvNum,
    appointment_type_id: row.AppointmentTypeNum,
  }));
  return discoverTcCoordinators({
    plans: [],
    appointments,
    appointmentTypes,
    providers: providerRows
      .map(mapOdProvider)
      .filter((provider) => !provider.inactive),
  });
}

/** Coordinator roster from live Open Dental treatment plans + appointments. */
export async function loadTcCoordinatorRoster(): Promise<TcCoordinator[]> {
  if (!isOpenDentalMysqlConfigured()) return [];

  const cached = readRosterCache();
  if (cached) return cached;

  const fromSnapshot = rosterFromSnapshot();
  if (fromSnapshot) return writeRosterCache(fromSnapshot);

  return writeRosterCache(await rosterFromOpenDental());
}

/** Sidebar links — slug + display name only. */
export async function loadTcCoordinatorLinks(): Promise<
  { slug: string; name: string }[]
> {
  const roster = await loadTcCoordinatorRoster();
  return roster.map((coordinator) => ({
    slug: coordinator.slug,
    name: coordinator.name,
  }));
}
