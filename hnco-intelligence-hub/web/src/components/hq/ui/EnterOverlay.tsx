"use client";

import { ArrowRight } from "lucide-react";
import { signIn } from "@/lib/auth";
import { company } from "@/lib/catalog";
import { useHub } from "@/lib/store";
import { Wordmark } from "./primitives";

/** First screen: the visitor stands outside the entrance; entering flies the camera inside. */
export function EnterOverlay() {
  const entered = useHub((s) => s.entered);
  const connection = useHub((s) => s.connection);
  const signInRequired = useHub((s) => s.signInRequired);
  const connectionError = useHub((s) => s.connectionError);
  const set = useHub((s) => s.set);
  if (entered) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-end justify-center bg-gradient-to-t from-navy via-navy/55 to-transparent pb-[12vh] md:items-center md:justify-start md:bg-gradient-to-r md:from-navy/95 md:via-navy/60 md:pb-0 md:pl-[7vw]">
      <div className="max-w-xl px-6">
        <Wordmark className="text-[15px]" />
        <div className="gold-rule my-5 w-24" />
        <h1 className="font-display text-[44px] font-medium leading-[1.02] text-platinum md:text-[64px]">
          Virtual
          <br />
          Headquarters
        </h1>
        <p className="mt-4 font-display text-xl italic text-gold-soft md:text-2xl">{company.tagline}</p>
        <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-platinum/75">
          Twelve AI employees run every department of HN.CO — coordinated by one central orchestrator and governed by the Managing
          Director. Step inside, watch them work, and put them to work.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {signInRequired ? (
            <button
              onClick={() => void signIn()}
              className="group inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-3 text-[14px] font-semibold text-navy shadow-[0_12px_40px_-12px_rgba(196,166,106,0.8)] transition hover:bg-gold-soft"
              autoFocus
            >
              Sign in with Microsoft
              <ArrowRight size={17} className="transition group-hover:translate-x-0.5" />
            </button>
          ) : (
            <button
              onClick={() => set({ entered: true })}
              className="group inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-3 text-[14px] font-semibold text-navy shadow-[0_12px_40px_-12px_rgba(196,166,106,0.8)] transition hover:bg-gold-soft"
              autoFocus
            >
              Enter the headquarters
              <ArrowRight size={17} className="transition group-hover:translate-x-0.5" />
            </button>
          )}
          <span className="text-[12px] text-mist">
            {signInRequired
              ? "Sign in with your HN.CO account to enter"
              : connectionError && connection === "local"
                ? `${connectionError} Showing the local simulation.`
                : connection === "connected"
              ? "Connected to the HN.CO backend"
              : connection === "connecting"
                ? "Looking for the HN.CO backend…"
                : "Running as a local simulation — no backend connected"}
          </span>
        </div>
      </div>
    </div>
  );
}
