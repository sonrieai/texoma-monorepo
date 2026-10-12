import "server-only";
import { coordinatorSlug } from "@/lib/tc/coordinators";
import type { TcCoordinator } from "@/lib/tc/discover-coordinators";
import { namedTreatmentCoordinators } from "@/lib/tc/presented-plans";

/** Ashlie and Brie — the only treatment coordinators. */
export async function loadTcCoordinatorRoster(): Promise<TcCoordinator[]> {
  return namedTreatmentCoordinators();
}

/** Sidebar links — slug + display name only. */
export async function loadTcCoordinatorLinks(): Promise<
  { slug: string; name: string }[]
> {
  const roster = await loadTcCoordinatorRoster();
  return roster.map((coordinator) => ({
    slug: coordinatorSlug(coordinator.name),
    name: coordinator.name,
  }));
}
