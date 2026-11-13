import { ArrowRight, BarChart3, Building2, Cog, Database, FileCheck2, KeyRound, LineChart, Lock, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { agents, company, departmentById } from "@/lib/catalog";

const SERVICES = [
  {
    icon: BarChart3,
    title: "Business Intelligence",
    text: "KPI frameworks, Power BI dashboards and semantic models that executives actually use.",
  },
  {
    icon: Database,
    title: "Data Analytics & Engineering",
    text: "Modern data platforms — pipelines, lakehouse architecture and data quality you can trust.",
  },
  {
    icon: Cog,
    title: "Digital Transformation",
    text: "Workflow automation and integration that removes manual effort and scales with you.",
  },
  {
    icon: LineChart,
    title: "Strategy & Advisory",
    text: "Evidence-led strategy, market analysis and operating-model design for growth.",
  },
];

const FLOW = [
  { title: "You", text: "The Managing Director or a visitor makes a request in the virtual office." },
  { title: "3D Virtual Office", text: "The interface: departments, employees and live status — never holds a secret key." },
  { title: "HN.CO Backend", text: "FastAPI behind Microsoft Entra ID, role-based access and an audit log." },
  { title: "Central AI Orchestrator", text: "HN Executive AI decides which departments should handle the work." },
  { title: "Departmental AI Agents", text: "Twelve specialists draft, analyse and collaborate on the deliverable." },
  { title: "Approved Integrations", text: "Any action that leaves the company waits for explicit human approval." },
  { title: "Data & Knowledge Base", text: "PostgreSQL with pgvector and Azure Blob Storage for authorised data and artefacts." },
];

const GOVERNANCE = [
  { icon: ShieldCheck, title: "Human approval", text: "Deliverables are reviewed by the Managing Director; external actions need a second, explicit approval." },
  { icon: KeyRound, title: "Entra ID & roles", text: "Sign-in with Microsoft Entra ID. Roles decide who may assign work, approve or audit." },
  { icon: ScrollText, title: "Full audit trail", text: "Every request, routing decision, approval and action is recorded." },
  { icon: Lock, title: "Keys stay server-side", text: "AI and storage credentials live only in the backend — never in the browser." },
  { icon: FileCheck2, title: "Simulation is labelled", text: "Simulated activity is always marked as such, so it is never mistaken for real agent execution." },
  { icon: Sparkles, title: "Authorised data only", text: "Agents read from approved company datasets and the knowledge base — nothing else." },
];

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display tracking-[0.08em] text-platinum ${className}`}>
      HN<span className="text-gold">.</span>CO
    </span>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-navy text-platinum">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-navy/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5 md:px-8">
          <Link href="/" className="flex items-baseline gap-3">
            <Wordmark className="text-[24px]" />
            <span className="hidden text-[10.5px] font-medium uppercase tracking-[0.28em] text-mist sm:inline">Intelligence Hub</span>
          </Link>
          <nav className="hidden flex-1 items-center gap-7 text-[13.5px] text-platinum/75 md:flex">
            <a href="#services" className="hover:text-platinum">
              Services
            </a>
            <a href="#workforce" className="hover:text-platinum">
              AI workforce
            </a>
            <a href="#architecture" className="hover:text-platinum">
              How it works
            </a>
            <a href="#governance" className="hover:text-platinum">
              Governance
            </a>
          </nav>
          <Link
            href="/hq"
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-[13px] font-semibold text-navy transition hover:bg-gold-soft md:ml-0"
          >
            Enter Virtual HQ <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <Image src="/images/hq-hero.jpg" alt="The HN.CO virtual headquarters: glass boardroom, executive office and departments" fill priority className="object-cover opacity-55" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/85 to-navy/20" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy to-transparent" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 pb-28 pt-24 md:px-8 md:pb-36 md:pt-32">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.3em] text-gold">{company.platform}</p>
            <h1 className="mt-5 max-w-3xl font-display text-[46px] font-medium leading-[1.02] md:text-[76px]">
              Intelligence Behind
              <br />
              Every Transformation.
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-platinum/80">
              HN.CO is a boutique consultancy for business intelligence, data analytics and digital transformation. Step into our virtual
              headquarters, where twelve AI employees run every department — coordinated by one intelligent management system and governed by
              people.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/hq"
                className="inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-3 text-[14px] font-semibold text-navy shadow-[0_14px_40px_-14px_rgba(196,166,106,0.85)] transition hover:bg-gold-soft"
              >
                Enter the virtual headquarters <ArrowRight size={17} />
              </Link>
              <a href="#architecture" className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3 text-[14px] text-platinum hover:border-gold/60">
                How it works
              </a>
            </div>
            <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-6">
              {[
                ["12", "AI employees"],
                ["12", "Departments"],
                ["1", "Central orchestrator"],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className="font-display text-[44px] leading-none text-gold">{n}</dt>
                  <dd className="mt-2 text-[10.5px] uppercase tracking-[0.12em] text-mist md:text-[12.5px] md:tracking-[0.16em]">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 md:px-8">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.3em] text-gold">What we do</p>
          <h2 className="mt-3 max-w-2xl font-display text-[38px] leading-tight md:text-[48px]">From raw data to confident decisions.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-white/[0.08] bg-navy-800/60 p-6 transition hover:border-gold/40">
                <Icon size={22} className="text-gold" />
                <h3 className="mt-5 font-display text-[23px]">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-platinum/70">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Workforce */}
        <section id="workforce" className="scroll-mt-20 border-y border-white/[0.06] bg-navy-900/60">
          <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.3em] text-gold">The AI workforce</p>
                <h2 className="mt-3 max-w-2xl font-display text-[38px] leading-tight md:text-[48px]">Every department has its own AI employee.</h2>
              </div>
              <Link href="/hq" className="inline-flex items-center gap-2 text-[14px] font-medium text-gold hover:underline">
                Meet them in the office <ArrowRight size={15} />
              </Link>
            </div>
            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agents.map((a, i) => (
                <article key={a.id} className="group rounded-xl border border-white/[0.07] bg-navy/70 p-5 transition hover:border-gold/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mist">{String(i + 1).padStart(2, "0")}</span>
                    <span className="h-2 w-2 rounded-full bg-status-working shadow-[0_0_10px_#3fb27f]" />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold">{a.name}</h3>
                  <p className="mt-0.5 text-[13px] text-gold-soft">{a.role}</p>
                  <p className="mt-3 text-[13px] leading-relaxed text-platinum/65">{a.summary}</p>
                  <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-mist">{departmentById[a.department].name}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 md:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.3em] text-gold">How it works</p>
              <h2 className="mt-3 font-display text-[38px] leading-tight md:text-[48px]">The office is the interface. The intelligence runs behind it.</h2>
              <p className="mt-5 text-[15px] leading-relaxed text-platinum/75">
                The 3D headquarters is a window onto the company, not the AI engine itself. Requests travel through a secured backend to a
                central orchestrator, which coordinates the departmental agents and streams their progress back to the office in real time.
              </p>
              <div className="relative mt-8 overflow-hidden rounded-xl border border-white/[0.08]">
                <Image src="/images/hq-overview.jpg" alt="Floor plan view of the HN.CO headquarters" width={1600} height={900} className="h-auto w-full" />
              </div>
            </div>
            <ol className="relative space-y-3 border-l border-gold/30 pl-7">
              {FLOW.map((s, i) => (
                <li key={s.title} className="relative rounded-xl border border-white/[0.07] bg-navy-800/50 p-4">
                  <span className="absolute -left-[42px] top-4 grid h-7 w-7 place-items-center rounded-full border border-gold/50 bg-navy text-[11px] font-semibold text-gold">
                    {i + 1}
                  </span>
                  <h3 className="text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-platinum/70">{s.text}</p>
                </li>
              ))}
              <li className="pl-1 text-[13px] text-mist">→ Results and live status stream back to the virtual office over Server-Sent Events.</li>
            </ol>
          </div>
        </section>

        {/* Governance */}
        <section id="governance" className="scroll-mt-20 border-t border-white/[0.06] bg-navy-900/60">
          <div className="mx-auto max-w-7xl px-5 py-24 md:px-8">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.3em] text-gold">Governance</p>
            <h2 className="mt-3 max-w-3xl font-display text-[38px] leading-tight md:text-[48px]">AI does the work. People stay in charge.</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GOVERNANCE.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-white/[0.07] bg-navy/70 p-5">
                  <Icon size={20} className="text-gold" />
                  <h3 className="mt-4 text-[15.5px] font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-platinum/70">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 py-24 text-center md:px-8">
          <Building2 size={28} className="mx-auto text-gold" />
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-[40px] leading-tight md:text-[52px]">Walk the floor of a company run by intelligence.</h2>
          <Link
            href="/hq"
            className="mt-9 inline-flex items-center gap-2 rounded-lg bg-gold px-7 py-3.5 text-[14.5px] font-semibold text-navy transition hover:bg-gold-soft"
          >
            Enter the virtual headquarters <ArrowRight size={17} />
          </Link>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[12.5px] text-mist md:px-8">
          <div className="flex items-baseline gap-3">
            <Wordmark className="text-[18px]" />
            <span>{company.tagline}</span>
          </div>
          <span>AI employee activity in the demo is simulated unless the backend reports live execution.</span>
        </div>
      </footer>
    </div>
  );
}
