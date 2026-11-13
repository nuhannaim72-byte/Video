import type { AgentId, HubEvent } from "./types";

export type SubmitInput = {
  title?: string;
  description: string;
  /** Send straight to one agent; otherwise HN Executive AI routes it. */
  target?: AgentId | null;
  requestedBy: string;
  via?: string;
};

/** Implemented by the in-browser simulator and by the backend connection. */
export interface HubClient {
  start(): void;
  stop(): void;
  submitTask(input: SubmitInput): Promise<void>;
  sendChat(agentId: AgentId, text: string): Promise<void>;
  decide(approvalId: string, decision: "approve" | "reject" | "revise", note?: string): Promise<void>;
  resolveError(agentId: AgentId): Promise<void>;
  setSpeed?(n: number): void;
}

/** Same-origin proxy (app/api/hub/[...path]) so the browser never sees backend URLs or keys. */
const BASE = "/api/hub";

export type BackendHealth = {
  status: "ok";
  execution: "live" | "simulated";
  auth: "dev" | "entra";
  model?: string | null;
};

export async function probeBackend(timeoutMs = 2500): Promise<BackendHealth | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as BackendHealth;
    return body.status === "ok" ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type TokenProvider = () => Promise<string | null>;

export class BackendClient implements HubClient {
  private abort: AbortController | null = null;
  private stopped = false;
  private retry = 0;

  constructor(
    private emit: (e: HubEvent) => void,
    private onConnection: (state: "connecting" | "connected" | "error", error?: string) => void,
    private getToken: TokenProvider = async () => null,
  ) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.abort?.abort();
  }

  private async headers(json = false): Promise<HeadersInit> {
    const h: Record<string, string> = {};
    const token = await this.getToken();
    if (token) h.Authorization = `Bearer ${token}`;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  /** SSE over fetch (EventSource can't send the Authorization header). */
  private async connect() {
    while (!this.stopped) {
      this.onConnection("connecting");
      this.abort = new AbortController();
      try {
        const res = await fetch(`${BASE}/events`, {
          headers: { ...(await this.headers()), Accept: "text/event-stream" },
          signal: this.abort.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`Event stream failed (${res.status})`);
        this.retry = 0;
        this.onConnection("connected");
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            try {
              this.emit(JSON.parse(data) as HubEvent);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
        throw new Error("Event stream closed");
      } catch (err) {
        if (this.stopped) return;
        this.onConnection("error", err instanceof Error ? err.message : String(err));
        this.retry = Math.min(this.retry + 1, 5);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** this.retry));
      }
    }
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${res.status} ${detail}`.trim());
    }
    return res.json().catch(() => null);
  }

  async submitTask(input: SubmitInput) {
    await this.post("/tasks", {
      title: input.title ?? null,
      description: input.description,
      target: input.target ?? null,
      via: input.via ?? null,
    });
  }

  async sendChat(agentId: AgentId, text: string) {
    await this.post(`/agents/${agentId}/chat`, { message: text });
  }

  async decide(approvalId: string, decision: "approve" | "reject" | "revise", note?: string) {
    await this.post(`/approvals/${approvalId}/decision`, { decision, note: note ?? null });
  }

  async resolveError(agentId: AgentId) {
    await this.post(`/agents/${agentId}/resolve`, {});
  }
}

// The active client, shared by the scene and the UI.
let active: HubClient | null = null;
export const setActiveClient = (c: HubClient | null) => {
  active = c;
};
export const hub = (): HubClient => {
  if (!active) throw new Error("Hub client not started");
  return active;
};
