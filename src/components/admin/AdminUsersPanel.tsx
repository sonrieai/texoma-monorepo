"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Cards";
import { DASHBOARD_ROLE_DETAILS, type DashboardRole } from "@/lib/auth/roles";
import { isExcludedDoctorProvider } from "@/lib/warehouse/excluded-doctor-providers";

type PublicUser = {
  id: string;
  username: string;
  email: string;
  role: DashboardRole;
  providerId: string | null;
  isActive: boolean;
};

type ProviderLink = { id: string; name: string };

const inputClass =
  "w-full rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground outline-none ring-accent/30 transition focus:ring-2";

export function AdminUsersPanel({ initialUsers }: { initialUsers: PublicUser[] }) {
  const [users, setUsers] = useState<PublicUser[]>(initialUsers);
  const [providers, setProviders] = useState<ProviderLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadError(null);
    try {
      const usersResponse = await fetch("/api/admin/users");
      const usersBody = (await usersResponse.json()) as {
        users?: PublicUser[];
        error?: string;
      };
      if (!usersResponse.ok) {
        setLoadError(usersBody.error ?? "Unable to load users");
        return;
      }
      setUsers(Array.isArray(usersBody.users) ? usersBody.users : []);
    } catch {
      setLoadError("Unable to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      const providersResponse = await fetch("/api/metrics/providers");
      const providersBody = (await providersResponse.json()) as {
        providers?: ProviderLink[];
      };
      setProviders(
        Array.isArray(providersBody.providers)
          ? providersBody.providers.filter(
              (provider) => provider?.name && !isExcludedDoctorProvider(provider.name),
            )
          : [],
      );
    } catch {
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadProviders();
  }, [loadUsers, loadProviders]);

  return (
    <div className="space-y-4">
      <CreateUserForm providers={providers} onCreated={() => void loadUsers()} />
      <Card title="People" subtitle="Role changes apply on the next page they open.">
        {loadError ? (
          <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
            {loadError}
          </p>
        ) : null}
        {loading ? (
          <p className="m-0 text-[13px] text-muted">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">No dashboard users yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Email</th>
                  <th className="px-2 py-2 font-semibold">Role</th>
                  <th className="px-2 py-2 font-semibold">Provider</th>
                  <th className="px-2 py-2 font-semibold">Active</th>
                  <th className="px-2 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    providers={providers}
                    onSaved={() => void loadUsers()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateUserForm({
  providers,
  onCreated,
}: {
  providers: ProviderLink[];
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<DashboardRole>("office_manager");
  const [providerId, setProviderId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
          role,
          providerId: role === "doctor" ? providerId : null,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Unable to create user");
        return;
      }
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("office_manager");
      setProviderId("");
      onCreated();
    } catch {
      setError("Unable to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Add user" subtitle="They sign in with this email and password.">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="block text-[12px] font-semibold text-foreground">
          Name
          <input
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={`${inputClass} mt-1.5 font-normal`}
          />
        </label>
        <label className="block text-[12px] font-semibold text-foreground">
          Email
          <input
            required
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`${inputClass} mt-1.5 font-normal`}
          />
        </label>
        <label className="block text-[12px] font-semibold text-foreground">
          Password
          <input
            required
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${inputClass} mt-1.5 font-normal`}
          />
        </label>
        <RoleFields
          role={role}
          providerId={providerId}
          providers={providers}
          onRole={setRole}
          onProvider={setProviderId}
        />
        {error ? (
          <p className="rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad sm:col-span-2">
            {error}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving || (role === "doctor" && !providerId)}
            className="rounded-lg bg-accent2 px-3 py-2 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create user"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function UserRow({
  user,
  providers,
  onSaved,
}: {
  user: PublicUser;
  providers: ProviderLink[];
  onSaved: () => void;
}) {
  const [role, setRole] = useState<DashboardRole>(user.role);
  const [providerId, setProviderId] = useState(user.providerId ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const providerKnown =
    !user.providerId || providers.some((provider) => provider.id === user.providerId);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          providerId: role === "doctor" ? providerId : null,
          isActive,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Unable to update user");
        return;
      }
      onSaved();
    } catch {
      setError("Unable to update user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-b border-line align-top last:border-b-0">
      <td className="px-2 py-3 font-medium">{user.username}</td>
      <td className="px-2 py-3 text-muted">{user.email}</td>
      <td className="px-2 py-3">
        <RoleSelect role={role} onRole={setRole} />
        {error ? <p className="mb-0 mt-1 text-[11px] text-bad">{error}</p> : null}
      </td>
      <td className="px-2 py-3">
        {role === "doctor" ? (
          <select
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            className={inputClass}
            aria-label={`Provider for ${user.username}`}
          >
            <option value="">Select provider</option>
            {!providerKnown && user.providerId ? (
              <option value={user.providerId}>{user.providerId}</option>
            ) : null}
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-2 py-3">
        <label className="inline-flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active
        </label>
      </td>
      <td className="px-2 py-3 text-right">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || (role === "doctor" && !providerId)}
          className="rounded-lg border border-line bg-background px-2.5 py-1.5 text-[12px] font-semibold text-foreground hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}

function RoleFields({
  role,
  providerId,
  providers,
  onRole,
  onProvider,
}: {
  role: DashboardRole;
  providerId: string;
  providers: ProviderLink[];
  onRole: (role: DashboardRole) => void;
  onProvider: (providerId: string) => void;
}) {
  return (
    <>
      <label className="block text-[12px] font-semibold text-foreground">
        Role
        <RoleSelect role={role} onRole={onRole} className="mt-1.5" />
      </label>
      {role === "doctor" ? (
        <label className="block text-[12px] font-semibold text-foreground sm:col-span-2">
          Provider
          <select
            required
            value={providerId}
            onChange={(event) => onProvider(event.target.value)}
            className={`${inputClass} mt-1.5 font-normal`}
          >
            <option value="">Select provider</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}

function RoleSelect({
  role,
  onRole,
  className = "",
}: {
  role: DashboardRole;
  onRole: (role: DashboardRole) => void;
  className?: string;
}) {
  return (
    <select
      value={role}
      onChange={(event) => onRole(event.target.value as DashboardRole)}
      className={`${inputClass} ${className}`}
    >
      {DASHBOARD_ROLE_DETAILS.map((item) => (
        <option key={item.role} value={item.role}>
          {item.label} — {item.summary}
        </option>
      ))}
    </select>
  );
}
