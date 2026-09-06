"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  SESSION_HEARTBEAT_DEBOUNCE_MS,
  SESSION_IDLE_CHECK_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
} from "@/lib/auth/session-constants";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

type SessionActivityGuardProps = {
  children: React.ReactNode;
};

export function SessionActivityGuard({ children }: SessionActivityGuardProps) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const logoutStartedRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let enabled = false;

    async function expireSession(reason: "timeout" | "expired") {
      if (logoutStartedRef.current) return;
      logoutStartedRef.current = true;

      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Still redirect even if logout fails.
      }

      const loginUrl =
        reason === "timeout" ? "/login?reason=timeout" : "/login?reason=expired";
      router.replace(loginUrl);
      router.refresh();
    }

    function scheduleIdleExpiry() {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        expireSession("timeout");
      }, SESSION_INACTIVITY_TIMEOUT_MS);
    }

    async function sendHeartbeat() {
      try {
        const response = await fetch("/api/auth/heartbeat", { method: "POST" });
        if (response.status === 401) {
          await expireSession("expired");
          return false;
        }
        return response.ok;
      } catch {
        return false;
      }
    }

    function registerActivity() {
      if (!enabled || logoutStartedRef.current) return;
      lastActivityRef.current = Date.now();
      scheduleIdleExpiry();

      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setTimeout(() => {
        void sendHeartbeat();
      }, SESSION_HEARTBEAT_DEBOUNCE_MS);
    }

    async function verifySession() {
      try {
        const response = await fetch("/api/auth/me");
        const data = (await response.json()) as {
          authenticated?: boolean;
          enabled?: boolean;
        };
        if (!data.enabled) {
          enabled = false;
          return;
        }
        if (!data.authenticated) {
          await expireSession("expired");
          return;
        }
        enabled = true;
        registerActivity();
      } catch {
        enabled = false;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
        void expireSession("timeout");
        return;
      }
      void sendHeartbeat();
    }

    void verifySession();

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, registerActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    pollTimerRef.current = setInterval(() => {
      void verifySession();
    }, SESSION_IDLE_CHECK_MS);

    return () => {
      enabled = false;
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, registerActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return children;
}
