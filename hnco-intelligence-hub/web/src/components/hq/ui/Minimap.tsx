"use client";

import { useEffect, useRef } from "react";
import { agents, STATUS_META } from "@/lib/catalog";
import { FLOOR, floorplan, zoneAt, type Zone } from "@/lib/floorplan";
import { cameraPresence, presence } from "@/lib/presence";
import { useHub } from "@/lib/store";

const W = 248;
const SCALE = W / (FLOOR.maxX - FLOOR.minX + 4);
const H = Math.round((FLOOR.maxZ - FLOOR.minZ + 4) * SCALE);
const px = (x: number) => (x - FLOOR.minX + 2) * SCALE;
const pz = (z: number) => (z - FLOOR.minZ + 2) * SCALE;

const FILL: Record<Zone["floor"], string> = {
  stone: "#2a3448",
  marble: "#33405a",
  oak: "#4a3d2c",
  walnut: "#3f2c22",
  carpet: "#1f2a3f",
  carpetNavy: "#172238",
};
const SHORT: Partial<Record<string, string>> = {
  strategy: "STR",
  bizdev: "BD",
  marketing: "MKT",
  project: "PMO",
  bi: "BI",
  dataeng: "DATA",
  technology: "TECH",
  finance: "FIN",
  cafe: "CAFÉ",
  hr: "HR",
  legal: "LEGAL",
  clientsuccess: "CS",
  reception: "RECEPTION",
  executive: "EXEC",
  boardroom: "BOARD",
};

/** Live floor plan: zones, every employee as a status-coloured dot, and the camera. Click to fly. */
export function Minimap({ className = "" }: { className?: string }) {
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const cam = useRef<SVGGElement>(null);
  const states = useHub((s) => s.agents);
  const selected = useHub((s) => s.selected);
  const flyToZone = useHub((s) => s.flyToZone);
  const select = useHub((s) => s.select);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      agents.forEach((a, i) => {
        const p = presence.get(a.id);
        const el = dots.current[i];
        if (p && el) {
          el.setAttribute("cx", px(p.x).toFixed(1));
          el.setAttribute("cy", pz(p.z).toFixed(1));
        }
      });
      if (cam.current) {
        const deg = (-cameraPresence.yaw * 180) / Math.PI + 180;
        cam.current.setAttribute("transform", `translate(${px(cameraPresence.x).toFixed(1)} ${pz(cameraPresence.z).toFixed(1)}) rotate(${deg.toFixed(1)})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W / SCALE + FLOOR.minX - 2;
    const z = ((e.clientY - r.top) / r.height) * H / SCALE + FLOOR.minZ - 2;
    const zone = zoneAt(x, z);
    if (zone) flyToZone(zone.id);
  };

  return (
    <div className={`panel pointer-events-auto rounded-xl p-2 ${className}`}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">Floor plan · Level 1</span>
        <span className="text-[10px] text-mist/70">click to navigate</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onClick={onClick} className="cursor-pointer" role="img" aria-label="Office floor plan with employee positions">
        <rect x={px(FLOOR.minX)} y={pz(FLOOR.minZ)} width={(FLOOR.maxX - FLOOR.minX) * SCALE} height={(FLOOR.maxZ - FLOOR.minZ) * SCALE} fill="#0b1220" stroke="#3a465c" />
        {floorplan.zones.map((z) => (
          <g key={z.id}>
            <rect
              x={px(z.rect.x0) + 0.5}
              y={pz(z.rect.z0) + 0.5}
              width={(z.rect.x1 - z.rect.x0) * SCALE - 1}
              height={(z.rect.z1 - z.rect.z0) * SCALE - 1}
              fill={FILL[z.floor]}
              stroke={selected === z.id ? "#c4a66a" : "transparent"}
            />
            {SHORT[z.id] && (
              <text
                x={px((z.rect.x0 + z.rect.x1) / 2)}
                y={pz(z.rect.z0 < 0 && z.id !== "reception" && z.id !== "executive" ? z.rect.z0 + 2.4 : z.rect.z1 - 1.4)}
                fill="#7d8aa1"
                fontSize="6.5"
                textAnchor="middle"
                style={{ letterSpacing: "0.08em" }}
              >
                {SHORT[z.id]}
              </text>
            )}
          </g>
        ))}
        {floorplan.walls
          .filter((w) => w.kind !== "window")
          .map((w, i) => (
            <line key={i} x1={px(w.a[0])} y1={pz(w.a[1])} x2={px(w.b[0])} y2={pz(w.b[1])} stroke="#4b5871" strokeWidth={0.8} />
          ))}
        <g ref={cam}>
          <path d="M0 0 L-9 -16 A18 18 0 0 1 9 -16 Z" fill="rgba(196,166,106,0.22)" />
          <circle r={2.4} fill="#f0f2f4" />
        </g>
        {agents.map((a, i) => (
          <circle
            key={a.id}
            ref={(el) => void (dots.current[i] = el)}
            r={selected === a.id ? 4 : 2.8}
            fill={STATUS_META[states[a.id]?.status ?? "idle"].color}
            stroke={selected === a.id ? "#f0f2f4" : "#0b1220"}
            strokeWidth={1}
            onClick={(e) => {
              e.stopPropagation();
              select(a.id);
            }}
          >
            <title>{a.name}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
