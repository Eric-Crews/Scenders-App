import { useCallback, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Upload,
  Compass,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import toGeoJSON from "@mapbox/togeojson";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ParsedDataset = {
  name: string;
  format: "geojson" | "kml" | "kmz" | "gpx";
  geojson: { type: "FeatureCollection"; features: unknown[] };
};

type UploadPhase = "idle" | "parsing" | "uploading" | "done";

type ProgressState = {
  phase: UploadPhase;
  parsed: number;
  parseTotal: number;
  uploaded: number;
  uploadTotal: number;
  failed: number;
  errors: string[];
};

const BATCH_SIZE = 20;
const CONCURRENCY = 3;
const ACCEPTED = ".geojson,.json,.kml,.kmz,.gpx";

// ---------------------------------------------------------------------------
// Parsing helpers (browser-native — no xmldom needed)
// ---------------------------------------------------------------------------

function detectFormat(name: string): ParsedDataset["format"] | null {
  const low = name.toLowerCase();
  if (low.endsWith(".geojson") || low.endsWith(".json")) return "geojson";
  if (low.endsWith(".kml")) return "kml";
  if (low.endsWith(".kmz")) return "kmz";
  if (low.endsWith(".gpx")) return "gpx";
  return null;
}

function prettifyName(base: string): string {
  return base
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function parseFile(file: File): Promise<ParsedDataset | null> {
  const fmt = detectFormat(file.name);
  if (!fmt) return null;
  const baseName = prettifyName(file.name.replace(/\.(geojson|json|kml|kmz|gpx)$/i, ""));

  if (fmt === "kmz") {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const kmlFile = Object.values(zip.files).find((f) =>
      f.name.toLowerCase().endsWith(".kml"),
    );
    if (!kmlFile) return null;
    const kmlText = await kmlFile.async("text");
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = (toGeoJSON as any).kml(doc);
    if (!fc?.features?.length) return null;
    return { name: baseName, format: "kmz", geojson: fc };
  }

  const text = await file.text();

  if (fmt === "geojson") {
    const fc = JSON.parse(text) as {
      type?: string;
      features?: unknown[];
    };
    if (fc.type !== "FeatureCollection" || !fc.features?.length) return null;
    return { name: baseName, format: "geojson", geojson: fc as ParsedDataset["geojson"] };
  }

  const doc = new DOMParser().parseFromString(text, "text/xml");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const converter = (toGeoJSON as any);
  const fc = fmt === "kml" ? converter.kml(doc) : converter.gpx(doc);
  if (!fc?.features?.length) return null;
  return { name: baseName, format: fmt, geojson: fc };
}

// ---------------------------------------------------------------------------
// Bulk upload helper (batched + concurrent)
// ---------------------------------------------------------------------------

type BatchResult = { success: boolean; error?: string | null };

async function bulkUpload(
  datasets: ParsedDataset[],
  author: string,
  onProgress: (uploaded: number, failed: number) => void,
): Promise<void> {
  const batches: ParsedDataset[][] = [];
  for (let i = 0; i < datasets.length; i += BATCH_SIZE) {
    batches.push(datasets.slice(i, i + BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const responses = await Promise.all(
      chunk.map((batch) =>
        fetch("/api/community/datasets/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datasets: batch.map((d) => ({
              name: d.name,
              format: d.format,
              author: author.trim() || null,
              geojson: d.geojson,
            })),
          }),
        })
          .then((r) => r.json() as Promise<{ results: BatchResult[] }>)
          .catch(() => ({
            results: batch.map(() => ({
              success: false,
              error: "Network error",
            })),
          })),
      ),
    );
    let uploaded = 0;
    let failed = 0;
    for (const r of responses) {
      for (const item of r.results) {
        if (item.success) uploaded++;
        else failed++;
      }
    }
    onProgress(uploaded, failed);
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function BulkUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [author, setAuthor] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    phase: "idle",
    parsed: 0,
    parseTotal: 0,
    uploaded: 0,
    uploadTotal: 0,
    failed: 0,
    errors: [],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => detectFormat(f.name));
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...arr.filter((f) => !existing.has(f.name + f.size))];
    });
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const reset = () => {
    setFiles([]);
    setProgress({ phase: "idle", parsed: 0, parseTotal: 0, uploaded: 0, uploadTotal: 0, failed: 0, errors: [] });
  };

  const handleUpload = async () => {
    if (!files.length) return;

    const parseTotal = files.length;
    setProgress({ phase: "parsing", parsed: 0, parseTotal, uploaded: 0, uploadTotal: 0, failed: 0, errors: [] });

    const datasets: ParsedDataset[] = [];
    const parseErrors: string[] = [];
    let parsed = 0;

    for (const file of files) {
      try {
        const ds = await parseFile(file);
        if (ds) {
          datasets.push(ds);
        } else {
          parseErrors.push(`${file.name}: no map features found`);
        }
      } catch (err) {
        parseErrors.push(`${file.name}: ${err instanceof Error ? err.message : "parse error"}`);
      }
      parsed++;
      setProgress((p) => ({ ...p, parsed }));
    }

    if (!datasets.length) {
      setProgress((p) => ({ ...p, phase: "done", errors: parseErrors }));
      return;
    }

    setProgress((p) => ({
      ...p,
      phase: "uploading",
      uploadTotal: datasets.length,
      errors: parseErrors,
    }));

    let totalUploaded = 0;
    let totalFailed = 0;

    await bulkUpload(datasets, author, (uploaded, failed) => {
      totalUploaded += uploaded;
      totalFailed += failed;
      setProgress((p) => ({
        ...p,
        uploaded: totalUploaded,
        failed: p.failed + totalFailed - (totalFailed > 0 ? totalFailed - failed : 0),
      }));
    });

    setProgress((p) => ({
      ...p,
      phase: "done",
      uploaded: totalUploaded,
      failed: p.failed + totalFailed,
    }));
  };

  const { phase } = progress;
  const busy = phase === "parsing" || phase === "uploading";

  const uploadPct = progress.uploadTotal > 0
    ? Math.round((progress.uploaded + progress.failed) / progress.uploadTotal * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">mapper.one</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-4">
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5">
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-10 md:pt-40 md:pb-12 px-6">
        <motion.div initial="hidden" animate="visible" variants={fadeIn} className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-6 border border-border/50">
            <Upload className="w-4 h-4" />
            <span>Community library</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-balance leading-[1.05] mb-4">
            Bulk upload routes
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            Drop your KML, KMZ, GPX, or GeoJSON files — they'll be parsed in the browser and published
            to the community map library in batches.
          </p>
        </motion.div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Done state */}
          {phase === "done" && (
            <motion.div initial="hidden" animate="visible" variants={fadeIn}
              className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center gap-3">
                {progress.uploaded > 0
                  ? <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                  : <XCircle className="w-6 h-6 text-destructive shrink-0" />}
                <div>
                  <p className="font-semibold text-foreground">
                    {progress.uploaded > 0
                      ? `${progress.uploaded.toLocaleString()} route${progress.uploaded !== 1 ? "s" : ""} published`
                      : "Nothing published"}
                  </p>
                  {progress.failed > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {progress.failed.toLocaleString()} failed
                    </p>
                  )}
                </div>
              </div>
              {progress.errors.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {progress.errors.length} skipped file{progress.errors.length !== 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-2 space-y-1 pl-4 text-muted-foreground font-mono text-xs max-h-48 overflow-y-auto">
                    {progress.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </details>
              )}
              <Button variant="outline" onClick={reset} className="rounded-full">
                Upload more files
              </Button>
            </motion.div>
          )}

          {/* Upload form */}
          {phase !== "done" && (
            <motion.div initial="hidden" animate="visible" variants={fadeIn} className="space-y-5">

              {/* Drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !busy && fileInputRef.current?.click()}
                className={[
                  "relative rounded-2xl border-2 border-dashed transition-colors cursor-pointer",
                  "flex flex-col items-center justify-center gap-3 p-10 text-center",
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-primary/50 bg-muted/30",
                  busy ? "pointer-events-none opacity-60" : "",
                ].join(" ")}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles(e.target.files)}
                />
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Drop files here or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Accepts .geojson&nbsp;·&nbsp;.json&nbsp;·&nbsp;.kml&nbsp;·&nbsp;.kmz&nbsp;·&nbsp;.gpx
                  </p>
                </div>
                {files.length > 0 && (
                  <p className="text-sm font-medium text-primary">
                    {files.length.toLocaleString()} file{files.length !== 1 ? "s" : ""} selected
                  </p>
                )}
              </div>

              {/* File list (first 8 shown) */}
              {files.length > 0 && (
                <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                  {files.slice(0, 8).map((f, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm bg-card">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-foreground">{f.name}</span>
                      </div>
                      {!busy && (
                        <button
                          onClick={() => removeFile(i)}
                          className="ml-3 text-muted-foreground hover:text-foreground shrink-0 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {files.length > 8 && (
                    <div className="px-4 py-2.5 text-sm text-muted-foreground bg-muted/30">
                      + {(files.length - 8).toLocaleString()} more
                    </div>
                  )}
                </div>
              )}

              {/* Author field */}
              <div className="space-y-1.5">
                <Label htmlFor="author" className="text-sm text-muted-foreground">
                  Your name <span className="font-normal opacity-60">(optional)</span>
                </Label>
                <Input
                  id="author"
                  placeholder="Trail Blazer"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  disabled={busy}
                  className="rounded-xl"
                />
              </div>

              {/* Progress */}
              {(phase === "parsing" || phase === "uploading") && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    {phase === "parsing"
                      ? `Parsing files… ${progress.parsed.toLocaleString()} / ${progress.parseTotal.toLocaleString()}`
                      : `Uploading… ${(progress.uploaded + progress.failed).toLocaleString()} / ${progress.uploadTotal.toLocaleString()}`}
                  </div>
                  {phase === "uploading" && (
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  )}
                  {phase === "uploading" && progress.failed > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {progress.failed.toLocaleString()} failed so far
                    </p>
                  )}
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={handleUpload}
                disabled={!files.length || busy}
                className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 text-base font-medium"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {phase === "parsing" ? "Parsing…" : "Uploading…"}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Publish {files.length > 0 ? `${files.length.toLocaleString()} ` : ""}to community library
                  </>
                )}
              </Button>
            </motion.div>
          )}

          {/* Info footer */}
          <p className="text-xs text-center text-muted-foreground">
            Files are parsed locally in your browser. Only the map data (no photos) is sent to the server.
            Routes land immediately in the{" "}
            <Link href="/" className="underline underline-offset-2 hover:text-foreground">
              community library
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
