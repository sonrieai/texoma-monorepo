"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, ComboStat, SectionHeading } from "@/components/ui/Cards";
import { InlineSpinner } from "@/components/ui/States";

type GhlStatus = {
  ok: boolean;
  configured: boolean;
  source: "json" | "env" | null;
  jsonConfigured: boolean;
  envConfigured: boolean;
  locationId: string | null;
  locationName: string | null;
  apiKeyMasked: string | null;
  baseUrl: string;
  sourceCustomFieldId: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  pipelineCount: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
  error?: string;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function connectionLabel(status: GhlStatus | null): string {
  if (!status?.configured) return "Not configured";
  if (status.lastTestOk === false) return "Connection failed";
  if (status.source === "env") return "Connected (env)";
  return "Connected";
}

export function GhlSettingsPanel() {
  const [status, setStatus] = useState<GhlStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [sourceCustomFieldId, setSourceCustomFieldId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ghl", { cache: "no-store" });
      const data = (await res.json()) as GhlStatus;
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setStatus(data);
      setLocationId((prev) => prev || data.locationId || "");
      setBaseUrl((prev) => prev || data.baseUrl || "");
      setSourceCustomFieldId(
        (prev) => prev || data.sourceCustomFieldId || "",
      );
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Unable to load GoHighLevel status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function saveCredentials(testOnly = false) {
    if (testOnly) setTesting(true);
    else setSaving(true);
    setFormError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ghl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          locationId: locationId.trim(),
          baseUrl: baseUrl.trim() || undefined,
          sourceCustomFieldId: sourceCustomFieldId.trim() || null,
          testOnly,
        }),
      });
      const data = (await res.json()) as GhlStatus & {
        error?: string;
        test?: { pipelineCount?: number; error?: string };
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (HTTP ${res.status})`);
      }
      if (testOnly) {
        const count = data.test?.pipelineCount ?? data.pipelineCount;
        setMessage(
          data.ok
            ? `Connection OK — ${count ?? 0} pipeline(s) found.`
            : (data.error ?? "Connection test failed"),
        );
      } else {
        setStatus(data);
        setApiKey("");
        setMessage("GoHighLevel credentials saved.");
        await refreshStatus();
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      setTesting(false);
    }
  }

  async function retestSaved() {
    setTesting(true);
    setFormError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ghl", { method: "PATCH" });
      const data = (await res.json()) as GhlStatus & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Test failed (HTTP ${res.status})`);
      }
      setStatus(data);
      setMessage(
        data.lastTestOk
          ? `Connection OK — ${data.pipelineCount ?? 0} pipeline(s).`
          : (data.lastTestError ?? "Connection test failed"),
      );
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function clearCredentials() {
    if (
      !window.confirm(
        "Remove saved GoHighLevel credentials? Env vars will still apply if set.",
      )
    ) {
      return;
    }
    setClearing(true);
    setFormError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ghl", { method: "DELETE" });
      const data = (await res.json()) as GhlStatus & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Clear failed (HTTP ${res.status})`);
      }
      setStatus(data);
      setApiKey("");
      setMessage("Saved credentials removed.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  }

  const canSave =
    locationId.trim().length > 0 &&
    (apiKey.trim().length > 0 || Boolean(status?.apiKeyMasked)) &&
    !saving &&
    !testing;

  return (
    <>
      <SectionHeading title="GoHighLevel" tag="Marketing + TC journey" />

      {loadError ? (
        <p className="mb-4 text-[12px] text-bad">{loadError}</p>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ComboStat
          label="Connection"
          value={loading ? "…" : connectionLabel(status)}
          note={
            status?.source === "env"
              ? "Using .env fallback — save here to store them in JSON"
              : status?.locationName ?? status?.locationId ?? "No location"
          }
          status={
            !status?.configured
              ? "warn"
              : status.lastTestOk === false
                ? "bad"
                : "good"
          }
        />
        <ComboStat
          label="Pipelines"
          value={
            status?.pipelineCount != null ? String(status.pipelineCount) : "—"
          }
          note="Call Center / Appointment System"
        />
        <ComboStat
          label="Last tested"
          value={formatWhen(status?.lastTestedAt ?? null)}
          note={status?.updatedBy ? `Updated by ${status.updatedBy}` : undefined}
        />
      </div>

      <Card
        title="Credentials"
        subtitle="Private Integration token and Location ID from your GHL sub-account. Keys are encrypted in the local JSON store and never sent back to the browser after save."
        className="mb-6"
      >
        {status?.source === "env" ? (
          <p className="mb-3 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[12px] text-warn">
            Credentials are currently loaded from environment variables. Save
            below to store them in the local JSON file.
          </p>
        ) : null}
        {status?.lastTestError && status.lastTestOk === false ? (
          <p className="mb-3 rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
            Last test: {status.lastTestError}
          </p>
        ) : null}

        <div className="grid max-w-xl gap-3">
          <label className="grid gap-1 text-[12px]">
            <span className="font-semibold text-foreground">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                status?.apiKeyMasked
                  ? `Saved ${status.apiKeyMasked} — leave blank to keep`
                  : "Private Integration token"
              }
              className="min-h-10 rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground"
            />
          </label>
          <label className="grid gap-1 text-[12px]">
            <span className="font-semibold text-foreground">Location ID</span>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="GHL sub-account location ID"
              className="min-h-10 rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground"
            />
            <span className="text-muted">
              Sub-account → Settings → Business Profile → Company ID / Location
              ID
            </span>
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="justify-self-start text-[12px] font-semibold text-accent2"
          >
            {showAdvanced ? "Hide advanced" : "Advanced options"}
          </button>

          {showAdvanced ? (
            <>
              <label className="grid gap-1 text-[12px]">
                <span className="font-semibold text-foreground">Base URL</span>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://services.leadconnectorhq.com"
                  className="min-h-10 rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground"
                />
              </label>
              <label className="grid gap-1 text-[12px]">
                <span className="font-semibold text-foreground">
                  Source custom field ID
                </span>
                <input
                  type="text"
                  value={sourceCustomFieldId}
                  onChange={(e) => setSourceCustomFieldId(e.target.value)}
                  placeholder="Optional — lead source custom field"
                  className="min-h-10 rounded-lg border border-line bg-background px-3 py-2 text-[13px] text-foreground"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void saveCredentials(false)}
            aria-busy={saving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent2 px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <>
                <InlineSpinner className="border-white/30 border-t-white" />
                Saving…
              </>
            ) : (
              "Save & test"
            )}
          </button>
          <button
            type="button"
            disabled={
              !locationId.trim() ||
              (!apiKey.trim() && !status?.apiKeyMasked) ||
              testing ||
              saving
            }
            onClick={() => void saveCredentials(true)}
            className="inline-flex min-h-10 items-center rounded-lg border border-line bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-accent/40 disabled:opacity-60"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {status?.configured && status.source === "json" ? (
            <button
              type="button"
              disabled={testing || clearing}
              onClick={() => void retestSaved()}
              className="inline-flex min-h-10 items-center rounded-lg border border-line bg-background px-4 py-2 text-[13px] font-semibold text-foreground transition hover:border-accent/40 disabled:opacity-60"
            >
              Retest saved
            </button>
          ) : null}
          {status?.source === "json" ? (
            <button
              type="button"
              disabled={clearing || saving}
              onClick={() => void clearCredentials()}
              className="inline-flex min-h-10 items-center rounded-lg border border-bad/30 px-4 py-2 text-[13px] font-semibold text-bad transition hover:bg-bad/5 disabled:opacity-60"
            >
              {clearing ? "Clearing…" : "Clear saved"}
            </button>
          ) : null}
        </div>

        {message ? (
          <p className="mt-3 text-[12px] text-good">{message}</p>
        ) : null}
        {formError ? (
          <p className="mt-3 rounded-lg border border-bad/20 bg-bad/5 px-3 py-2 text-[12px] text-bad">
            {formError}
          </p>
        ) : null}

        <p className="mb-0 mt-4 text-[11px] text-muted">
          Powers{" "}
          <Link href="/marketing" className="font-semibold text-accent2">
            Marketing
          </Link>{" "}
          funnel tables and{" "}
          <Link href="/tc" className="font-semibold text-accent2">
            Treatment Coordinator
          </Link>{" "}
          patient journey by channel. Contact names are never stored in the
          dashboard.
        </p>
      </Card>
    </>
  );
}
