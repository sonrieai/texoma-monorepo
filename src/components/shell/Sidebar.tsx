"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { AppNavLink, AppNavLinkSpinner } from "@/components/shell/AppNavLink";
import {
  getNavigationPendingHref,
  pathFromHref,
  subscribeNavigationPending,
} from "@/lib/ui/navigation-pending";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LIST_PAGE_SIZE, slicePage } from "@/lib/ui/pagination";
import { parsePeriodParams, periodToSearchString } from "@/lib/ui/period";
import { isExcludedDoctorProvider } from "@/lib/warehouse/excluded-doctor-providers";

const NAV = [
  { href: "/overview", label: "Overview", icon: "▦" },
  { href: "/doctor", label: "Doctor", icon: "✚" },
  { href: "/tc", label: "Treatment Coordinator", icon: "◆" },
  { href: "/insurance", label: "Insurance", icon: "⬡" },
  { href: "/marketing", label: "Marketing", icon: "◎" },
  { href: "/geo", label: "Patients by Area", icon: "⌖" },
  { href: "/settings", label: "Settings", icon: "⚙" },
] as const;

const SETTINGS_LINKS = [
  { href: "/settings/ghl", label: "GoHighLevel" },
  { href: "/settings/procedure-codes", label: "Procedure codes" },
] as const;

const SIDEBAR_PROVIDER_LIMIT = LIST_PAGE_SIZE;

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  open: boolean;
  onClose: () => void;
};

type FrameProps = Props & { periodQs: string };

const PROVIDERS_CLIENT_TTL_MS = 60_000;
const PROVIDERS_STORAGE_KEY = "texoma.warehouse.providers.v1";
const COORDINATORS_STORAGE_KEY = "texoma.tc.coordinators.v1";

type ProviderLink = { id: string; name: string };
type CoordinatorLink = { slug: string; name: string };

type StoredProviders = {
  expiresAt: number;
  providers: ProviderLink[];
};

type StoredCoordinators = {
  expiresAt: number;
  coordinators: CoordinatorLink[];
};

function readStoredProviders(): ProviderLink[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProviders;
    if (!parsed?.expiresAt || !Array.isArray(parsed.providers)) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed.providers.filter((p) => !isExcludedDoctorProvider(p.name));
  } catch {
    return null;
  }
}

function writeStoredProviders(providers: ProviderLink[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredProviders = {
      expiresAt: Date.now() + PROVIDERS_CLIENT_TTL_MS,
      providers,
    };
    sessionStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

function writeStoredCoordinators(coordinators: CoordinatorLink[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredCoordinators = {
      expiresAt: Date.now() + PROVIDERS_CLIENT_TTL_MS,
      coordinators,
    };
    sessionStorage.setItem(COORDINATORS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

function readStoredCoordinators(): CoordinatorLink[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COORDINATORS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCoordinators;
    if (!parsed?.expiresAt || !Array.isArray(parsed.coordinators)) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed.coordinators;
  } catch {
    return null;
  }
}

function withPeriod(href: string, qs: string) {
  return qs ? `${href}?${qs}` : href;
}

export function Sidebar(props: Props) {
  return (
    <Suspense fallback={<SidebarFrame {...props} periodQs="" />}>
      <SidebarWithPeriod {...props} />
    </Suspense>
  );
}

function SidebarWithPeriod(props: Props) {
  const searchParams = useSearchParams();
  const periodQs = periodToSearchString(parsePeriodParams(searchParams));
  return <SidebarFrame {...props} periodQs={periodQs} />;
}

function SidebarFrame({ open, onClose, periodQs }: FrameProps) {
  const pathname = usePathname();
  const pendingHref = useSyncExternalStore(
    subscribeNavigationPending,
    getNavigationPendingHref,
    () => null,
  );
  const effectivePath = pendingHref
    ? pathFromHref(pendingHref)
    : pathname;
  const doctorOpen = effectivePath.startsWith("/doctor");
  const tcOpen = effectivePath.startsWith("/tc");
  const settingsOpen = effectivePath.startsWith("/settings");
  // Start empty so SSR and first client paint match; hydrate from storage in useEffect.
  const [providers, setProviders] = useState<ProviderLink[]>([]);
  const [coordinators, setCoordinators] = useState<CoordinatorLink[]>([]);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const cached = readStoredProviders();
    if (cached) {
      setProviders(cached);
      return;
    }

    let cancelled = false;
    fetch("/api/metrics/providers")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !Array.isArray(j.providers)) return;
        const providers = j.providers.filter(
          (p: ProviderLink) => !isExcludedDoctorProvider(p.name),
        );
        writeStoredProviders(providers);
        setProviders(providers);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cached = readStoredCoordinators();
    if (cached) {
      setCoordinators(cached);
      return;
    }

    let cancelled = false;
    fetch("/api/metrics/coordinators")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !Array.isArray(j.coordinators)) return;
        writeStoredCoordinators(j.coordinators);
        setCoordinators(j.coordinators);
      })
      .catch(() => {
        if (!cancelled) setCoordinators([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j: { guest?: boolean }) => {
        if (!cancelled) setIsGuest(j.guest === true);
      })
      .catch(() => {
        if (!cancelled) setIsGuest(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  const providerLinks = slicePage(providers, 1, SIDEBAR_PROVIDER_LIMIT);
  const moreProviders = providers.length > SIDEBAR_PROVIDER_LIMIT;

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-[min(220px,88vw)] shrink-0 flex-col bg-sidebar px-3 py-4 text-sidebar-text transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-3.5 flex items-center justify-between gap-2 px-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <BrandLogo size="sm" className="shrink-0" />
            <div className="min-w-0">
              <h1 className="m-0 text-[12.5px] font-bold leading-tight tracking-wide text-white">
                Texoma Dentures & Implants
              </h1>
              <span className="block text-[10.5px] font-medium text-sidebar-muted">
                Practice Dashboard
              </span>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text hover:bg-sidebar-2 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[1px] text-sidebar-muted">
          Views
        </div>
        <nav className="scrollbar-none flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain">
          {NAV.filter((item) => !isGuest || item.href !== "/settings").map((item) => {
            const active = navActive(effectivePath, item.href);
            const showDoctorSubs = item.href === "/doctor" && doctorOpen;
            const showTcSubs =
              item.href === "/tc" && tcOpen && coordinators.length > 0;
            const showSettingsSubs = item.href === "/settings" && settingsOpen;

            return (
              <div key={item.href}>
                <AppNavLink
                  href={withPeriod(item.href, periodQs)}
                  onNavigate={onClose}
                  className={`mb-px flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium no-underline transition-colors ${
                    active
                      ? "bg-sidebar-active font-semibold text-white"
                      : "text-sidebar-text hover:bg-sidebar-2"
                  }`}
                >
                  <span className="flex w-4 shrink-0 items-center justify-center opacity-90">
                    <AppNavLinkSpinner fallback={item.icon} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </AppNavLink>
                {showDoctorSubs &&
                  providerLinks.map((p) => (
                    <AppNavLink
                      key={p.id}
                      href={withPeriod(`/doctor/${p.id}`, periodQs)}
                      onNavigate={onClose}
                      className={`mb-px block truncate rounded-lg py-1.5 pl-9 pr-2.5 text-[12px] no-underline ${
                        effectivePath === `/doctor/${p.id}`
                          ? "bg-sidebar-active font-semibold text-white"
                          : "text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-text"
                      }`}
                    >
                      {p.name}
                    </AppNavLink>
                  ))}
                {showDoctorSubs && moreProviders ? (
                  <AppNavLink
                    href={withPeriod("/doctor", periodQs)}
                    onNavigate={onClose}
                    className="mb-px block rounded-lg py-1.5 pl-9 pr-2.5 text-[11.5px] font-semibold text-sidebar-muted no-underline hover:bg-sidebar-2 hover:text-sidebar-text"
                  >
                    View all ({providers.length})
                  </AppNavLink>
                ) : null}
                {showTcSubs &&
                  coordinators.map((c) => (
                    <AppNavLink
                      key={c.slug}
                      href={withPeriod(`/tc/${c.slug}`, periodQs)}
                      onNavigate={onClose}
                      className={`mb-px block truncate rounded-lg py-1.5 pl-9 pr-2.5 text-[12px] no-underline ${
                        effectivePath === `/tc/${c.slug}`
                          ? "bg-sidebar-active font-semibold text-white"
                          : "text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-text"
                      }`}
                    >
                      {c.name}
                    </AppNavLink>
                  ))}
                {showSettingsSubs &&
                  SETTINGS_LINKS.map((link) => (
                    <AppNavLink
                      key={link.href}
                      href={link.href}
                      onNavigate={onClose}
                      className={`mb-px block truncate rounded-lg py-1.5 pl-9 pr-2.5 text-[12px] no-underline ${
                        effectivePath === link.href ||
                        effectivePath.startsWith(`${link.href}/`)
                          ? "bg-sidebar-active font-semibold text-white"
                          : "text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-text"
                      }`}
                    >
                      {link.label}
                    </AppNavLink>
                  ))}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 space-y-2 px-1 pb-2 pt-2">
          <LogoutButton variant="sidebar" />
        </div>

        <div className="shrink-0 border-t border-sidebar-line px-2 pt-3 text-[11px] text-sidebar-muted">
          <b className="block text-[12px] font-semibold text-sidebar-text">
            Texoma Dentures & Implants
          </b>
          {isGuest ? "Signed in as guest" : "Practice dashboard"}
        </div>
      </aside>
    </>
  );
}
