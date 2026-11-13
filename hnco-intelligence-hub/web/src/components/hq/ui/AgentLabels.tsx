"use client";

import { agents, STATUS_META } from "@/lib/catalog";
import { useHub } from "@/lib/store";
import { labelElements } from "../scene/labels";
import { cx } from "./primitives";

/** DOM name tags; their positions are written by LabelProjector inside the canvas. */
export function AgentLabels() {
  const showLabels = useHub((s) => s.showLabels);
  const selected = useHub((s) => s.selected);
  const hovered = useHub((s) => s.hovered);
  const states = useHub((s) => s.agents);
  const mode = useHub((s) => s.cameraMode);
  const items = [
    ...agents.map((a) => ({ id: a.id as string, name: a.name.replace(/^HN /, "").replace(/ AI$/, ""), color: STATUS_META[states[a.id]?.status ?? "idle"].color })),
    { id: "concierge", name: "Concierge", color: "#c4a66a" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
      {items.map((it) => {
        const show = (showLabels && mode !== "first") || selected === it.id || hovered === it.id;
        return (
          <div
            key={it.id}
            ref={(el) => {
              if (el) labelElements.set(it.id, el);
              else labelElements.delete(it.id);
            }}
            className={cx("agent-tag absolute left-0 top-0 origin-bottom transition-opacity duration-200", selected === it.id && "is-selected")}
            style={{ display: show ? undefined : "none", opacity: 0 }}
          >
            <span className="agent-tag__dot" style={{ background: it.color, color: it.color }} />
            {it.name}
          </div>
        );
      })}
    </div>
  );
}
