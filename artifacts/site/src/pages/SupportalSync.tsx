import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Compass,
  Loader2,
  CheckCircle2,
  Clock,
  TreePine,
  Mountain,
  Map,
  Layers,
  RefreshCw,
  Play,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

function fmt(n: number) {
  return n.toLocaleString();
}

type SupportalProgress = { imported: number; failed: number; remaining: number; total: number };
type SupportalStatus = { inProgress: boolean; progress: SupportalProgress | null };

type StateProgress = { done: number; total: number; currentState: string | null; completedAt: string | null };
type StateStatus = { inProgress: boolean; progress: StateProgress | null };

type OverpassProgress = {
  total: number; done: number; currentState: string | null;
  errors: { state: string; kind: string; message: string }[];
  startedAt: string; completedAt: string | null;
};
type OverpassStatus = { running: boolean; progress: OverpassProgress | null };

type CompletionSummary = { total: number; completions: Record<string, number> };

type AllStatus = {
  supportal: SupportalStatus | null;
  nps: StateStatus | null;
  usfs: StateStatus | null;
  overpass: OverpassStatus | null;
  completions: CompletionSummary | null;
};

function anyRunning(s: AllStatus) {
  return s.supportal?.inProgress || s.nps?.inProgress || s.usfs?.inProgress || s.overpass?.running;
}

async function fetchAllStatus(): Promise<AllStatus> {
  const [sR, nR, uR, oR, cR] = await Promise.all([
    fetch("/api/community/supportal/sync-all/status"),
    fetch("/api/community/nps/sync-all/status"),
    fetch("/api/community/usfs/sync-all/status"),
    fetch("/api/community/overpass/sync-all/status"),
    fetch("/api/community/sync-completions"),
  ]);
  const [supportal, nps, usfs, overpass, completions] = await Promise.all([
    sR.json() as Promise<SupportalStatus>,
    nR.json() as Promise<StateStatus>,
    uR.json() as Promise<StateStatus>,
    oR.json() as Promise<OverpassStatus>,
    cR.json() as Promise<CompletionSummary>,
  ]);
  return { supportal, nps, usfs, overpass, completions };
}

function StatusBadge({ running, done }: { running: boolean; done: boolean }) {
  if (running) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
      <Loader2 className="w-3 h-3 animate-spin" /> Syncing
    </span>
  );
  if (done) return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
      <CheckCircle2 className="w-3 h-3" /> Done
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
      <Clock className="w-3 h-3" /> Idle
    </span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function CompletionPill({ complete, total }: { complete: number; total: number }) {
  const allDone = complete >= total;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full tabular-nums ${
      allDone
        ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
        : "bg-muted text-muted-foreground border border-border"
    }`}>
      {allDone ? <CheckCircle2 className="w-3 h-3" /> : null}
      {fmt(complete)}/{fmt(total)} states complete
    </span>
  );
}

// ─── Supportal card (controllable) ──────────────────────────────────────────

function SupportalCard({ status, onRefresh }: { status: SupportalStatus | null; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);
  const p = status?.progress;
  const running = status?.inProgress ?? false;
  const done = !running && p != null;
  const pct = p && p.total > 0 ? Math.round(((p.imported + p.failed) / p.total) * 100) : 0;

  const handleStart = async () => {
    setActing(true);
    await fetch("/api/community/supportal/sync-all", { method: "POST" });
    await onRefresh();
    setActing(false);
  };

  const handleStop = async () => {
    setActing(true);
    await fetch("/api/community/supportal/sync-all/stop", { method: "POST" });
    await onRefresh();
    setActing(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground font-serif text-lg leading-tight">Supportal</p>
            <p className="text-xs text-muted-foreground mt-0.5">GPX tracks from Supportal API</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge running={running} done={done} />
          {running ? (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={acting} className="rounded-full h-7 px-3 text-xs gap-1">
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={acting} className="rounded-full h-7 px-3 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Start
            </Button>
          )}
        </div>
      </div>

      {p && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{fmt(p.imported)} imported{p.failed > 0 ? ` · ${fmt(p.failed)} failed` : ""}</span>
            {running ? <span>{fmt(p.remaining)} remaining · {pct}%</span> : <span>{fmt(p.total)} total</span>}
          </div>
          <ProgressBar pct={running ? pct : 100} />
        </div>
      )}

      {!p && !running && (
        <p className="text-sm text-muted-foreground font-light">Not started — use the Start button to begin importing.</p>
      )}
    </div>
  );
}

// ─── OSM / Overpass card (controllable) ─────────────────────────────────────

function OverpassCard({
  status, onRefresh, completions,
}: {
  status: OverpassStatus | null;
  onRefresh: () => void;
  completions: CompletionSummary | null;
}) {
  const [acting, setActing] = useState(false);
  const p = status?.progress;
  const running = status?.running ?? false;
  const done = !running && p?.completedAt != null;
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  const trailDone = completions?.completions["overpass-trail"] ?? 0;
  const roadDone = completions?.completions["overpass-road"] ?? 0;
  const total = completions?.total ?? 50;
  const hasCompletions = trailDone > 0 || roadDone > 0;

  const handleStart = async () => {
    setActing(true);
    await fetch("/api/community/overpass/sync-all", { method: "POST" });
    await onRefresh();
    setActing(false);
  };

  const handleStop = async () => {
    setActing(true);
    await fetch("/api/community/overpass/sync-all/stop", { method: "POST" });
    await onRefresh();
    setActing(false);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Map className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground font-serif text-lg leading-tight">OpenStreetMap</p>
            <p className="text-xs text-muted-foreground mt-0.5">Trails & roads via Overpass API</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge running={running} done={done} />
          {running ? (
            <Button size="sm" variant="outline" onClick={handleStop} disabled={acting} className="rounded-full h-7 px-3 text-xs gap-1">
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={acting} className="rounded-full h-7 px-3 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
              {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Start
            </Button>
          )}
        </div>
      </div>

      {p && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {fmt(p.done)} / {fmt(p.total)} states
              {running && p.currentState ? ` · ${p.currentState}` : ""}
              {p.errors.length > 0 ? ` · ${p.errors.length} err` : ""}
            </span>
            {running && <span>{pct}%</span>}
          </div>
          <ProgressBar pct={running ? pct : 100} />
        </div>
      )}

      {!p && !running && hasCompletions && (
        <div className="flex flex-wrap gap-2">
          <CompletionPill complete={trailDone} total={total} />
          <span className="text-xs text-muted-foreground self-center">trails</span>
          <CompletionPill complete={roadDone} total={total} />
          <span className="text-xs text-muted-foreground self-center">roads</span>
        </div>
      )}

      {!p && !running && !hasCompletions && (
        <p className="text-sm text-muted-foreground font-light">Not started — use the Start button to begin importing.</p>
      )}
    </div>
  );
}

// ─── NPS / USFS status-only card ────────────────────────────────────────────

function StateSourceCard({
  label, subtitle, icon: Icon, status, statesComplete, statesTotal,
}: {
  label: string;
  subtitle: string;
  icon: React.ElementType;
  status: StateStatus | null;
  statesComplete?: number;
  statesTotal?: number;
}) {
  const p = status?.progress;
  const running = status?.inProgress ?? false;
  const done = !running && p?.completedAt != null;
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-foreground font-serif text-lg leading-tight">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <StatusBadge running={running} done={done} />
      </div>

      {p && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {fmt(p.done)} / {fmt(p.total)} states
              {running && p.currentState ? ` · ${p.currentState}` : ""}
            </span>
            {running && <span>{pct}%</span>}
          </div>
          <ProgressBar pct={running ? pct : 100} />
        </div>
      )}

      {!p && !running && statesComplete != null && statesTotal != null && (
        <CompletionPill complete={statesComplete} total={statesTotal} />
      )}

      {!p && !running && (statesComplete == null || statesTotal == null) && (
        <p className="text-sm text-muted-foreground font-light">Runs automatically on server startup.</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DataSources() {
  const [status, setStatus] = useState<AllStatus>({ supportal: null, nps: null, usfs: null, overpass: null, completions: null });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      const s = await fetchAllStatus();
      setStatus(s);
      setLastRefreshed(new Date());
    } catch { }
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = anyRunning(status) ? 5_000 : 30_000;
    pollRef.current = setInterval(() => { void refresh(); }, interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = anyRunning(status);
  const c = status.completions;
  const total = c?.total ?? 50;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">mapper.one</span>
          </Link>
          <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5">
            <Link href="/#get-app">Get the App</Link>
          </Button>
        </div>
      </nav>

      <section className="relative pt-32 pb-10 md:pt-40 md:pb-12 px-6">
        <motion.div initial="hidden" animate="visible" variants={fadeIn} className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-5 border border-border/50">
                <Layers className="w-4 h-4" />
                <span>Community Library</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-serif text-balance leading-[1.05] mb-3">Data sources</h1>
              <p className="text-base md:text-lg text-muted-foreground font-light leading-relaxed max-w-xl">
                NPS and USFS sync automatically on startup. Start Supportal and OSM manually once those complete.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={manualRefresh} disabled={refreshing} className="shrink-0 rounded-full mt-1">
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {lastRefreshed && (
            <p className="text-xs text-muted-foreground mt-4">
              {running ? "Auto-refreshing every 5 s while sync is running." : `Last checked ${lastRefreshed.toLocaleTimeString()}.`}
            </p>
          )}
        </motion.div>
      </section>

      <section className="px-6 pb-24">
        <motion.div
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
          className="max-w-3xl mx-auto grid gap-4"
        >
          <motion.div variants={fadeIn}>
            <StateSourceCard
              label="National Park Service"
              subtitle="Trail data via NPS API — auto-starts on server startup"
              icon={Mountain}
              status={status.nps}
              statesComplete={c?.completions["nps"]}
              statesTotal={total}
            />
          </motion.div>
          <motion.div variants={fadeIn}>
            <StateSourceCard
              label="US Forest Service"
              subtitle="Trail data via USFS API — auto-starts on server startup"
              icon={TreePine}
              status={status.usfs}
              statesComplete={c?.completions["usfs"]}
              statesTotal={total}
            />
          </motion.div>
          <motion.div variants={fadeIn}>
            <SupportalCard status={status.supportal} onRefresh={refresh} />
          </motion.div>
          <motion.div variants={fadeIn}>
            <OverpassCard status={status.overpass} onRefresh={refresh} completions={c} />
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
