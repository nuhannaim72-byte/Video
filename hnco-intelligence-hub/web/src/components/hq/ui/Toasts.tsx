"use client";

import { AlertTriangle, Bell, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useHub } from "@/lib/store";
import { cx } from "./primitives";

type Toast = { id: number; tone: "info" | "error" | "approval"; text: string; action?: { label: string; run: () => void } };

let push: (t: Omit<Toast, "id">) => void = () => {};
export const notify = (t: Omit<Toast, "id">) => push(t);

/** Transient notifications: approval requests, errors needing attention, confirmations. */
export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    push = (t) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === "info" ? 4500 : 9000);
    };
    // Surface approval requests and errors as they arrive.
    useHub.getState().activity.forEach((a) => seen.current.add(a.id));
    return useHub.subscribe((s, prev) => {
      if (s.activity === prev.activity) return;
      for (const a of s.activity.slice(0, 5)) {
        if (seen.current.has(a.id)) continue;
        seen.current.add(a.id);
        if (a.kind === "approval" && a.message.startsWith("Approval requested")) {
          push({
            tone: "approval",
            text: a.message.replace("Approval requested: ", "Awaiting your approval: "),
            action: { label: "Review", run: () => useHub.getState().set({ dashboardOpen: true }) },
          });
        } else if (a.kind === "error") {
          const agentId = a.agentId;
          push({
            tone: "error",
            text: a.message,
            action:
              agentId !== "system" && agentId !== "user" && agentId !== "concierge"
                ? { label: "Open", run: () => useHub.getState().select(agentId) }
                : undefined,
          });
        }
      }
    });
  }, []);

  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-40 flex w-[340px] max-w-[calc(100vw-24px)] flex-col gap-2 md:bottom-6">
      {items.map((t) => {
        const Icon = t.tone === "error" ? AlertTriangle : t.tone === "approval" ? Bell : Info;
        return (
          <div
            key={t.id}
            role="status"
            className={cx(
              "panel pointer-events-auto flex items-start gap-2.5 rounded-xl p-3 text-[12.5px]",
              t.tone === "error" && "border-status-error/40",
              t.tone === "approval" && "border-gold/40",
            )}
          >
            <Icon size={16} className={cx("mt-0.5 shrink-0", t.tone === "error" ? "text-[#ff8a8d]" : t.tone === "approval" ? "text-gold" : "text-mist")} />
            <div className="flex-1 leading-snug text-platinum/90">
              {t.text}
              {t.action && (
                <button
                  onClick={() => {
                    t.action!.run();
                    setItems((xs) => xs.filter((x) => x.id !== t.id));
                  }}
                  className="ml-2 font-semibold text-gold hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="text-platinum/50 hover:text-platinum" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
