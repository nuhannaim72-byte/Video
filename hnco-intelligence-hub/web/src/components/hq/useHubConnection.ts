"use client";

import { useEffect } from "react";
import { getAccessToken } from "@/lib/auth";
import { BackendClient, probeBackend, setActiveClient, type HubClient } from "@/lib/client";
import { LocalSimulator } from "@/lib/sim/simulator";
import { useHub } from "@/lib/store";

/**
 * Connects the office to its event source: the HN.CO backend if one answers on the
 * same-origin proxy, otherwise the in-browser simulation. `?mode=simulation` forces the latter.
 */
export function useHubConnection() {
  useEffect(() => {
    const apply = useHub.getState().apply;
    const set = useHub.getState().set;
    let client: HubClient | null = null;
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const forceSim = params.get("mode") === "simulation";
      const q = params.get("quality");
      if (q === "low" || q === "balanced" || q === "high") set({ quality: q });
      set({ connection: forceSim ? "local" : "connecting" });
      const health = forceSim ? null : await probeBackend();
      if (cancelled) return;
      if (health) {
        set({ execution: health.execution, backendUrl: "/api/hub" });
        client = new BackendClient(
          apply,
          (state, error) => set({ connection: state, connectionError: error ?? null }),
          getAccessToken,
        );
      } else {
        set({ connection: "local", execution: "simulated", backendUrl: null });
        client = new LocalSimulator(apply);
      }
      setActiveClient(client);
      client.start();
      client.setSpeed?.(useHub.getState().simSpeed);
    })();

    const unsub = useHub.subscribe((s, prev) => {
      if (s.simSpeed !== prev.simSpeed) client?.setSpeed?.(s.simSpeed);
    });

    return () => {
      cancelled = true;
      unsub();
      client?.stop();
      setActiveClient(null);
    };
  }, []);
}
