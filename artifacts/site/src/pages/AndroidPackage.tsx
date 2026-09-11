import { Link } from "wouter";
import { useCallback, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Compass,
  Download,
  FileArchive,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const VERSION = "1.0.1";
const FILE_NAME = `mapper-one-android-${VERSION}.aab`;
const FILE_SIZE = "65 MB";
const FILE_SIZE_BYTES = 67_620_364;
const PACKAGE_NAME = "com.mapper.one";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.mapper.one";
const SHA256 =
  "029bbd9fc11adbdbacc36c221dbe74fa3ad90e404835805843a863ab62dc0c47";
const DOWNLOAD_URL = `${import.meta.env.BASE_URL}android-package/${FILE_NAME}`;
const DOWNLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const DOWNLOAD_ATTEMPTS = 3;

async function fetchDownloadChunk(start: number, end: number) {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(DOWNLOAD_URL, {
        headers: { Range: `bytes=${start}-${end}` },
        cache: "no-store",
      });

      if (response.status !== 206) {
        throw new Error(`The download server returned ${response.status}.`);
      }

      const expectedBytes = end - start + 1;
      const chunk = await response.blob();
      if (chunk.size !== expectedBytes) {
        throw new Error("The download server returned an incomplete file segment.");
      }

      return chunk;
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("The download segment could not be retrieved.");
      if (attempt < DOWNLOAD_ATTEMPTS) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError ?? new Error("The download segment could not be retrieved.");
}

export default function AndroidPackage() {
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const downloadBundle = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadedBytes(0);
    setDownloadError(null);

    try {
      const chunks: Blob[] = [];

      for (let start = 0; start < FILE_SIZE_BYTES; start += DOWNLOAD_CHUNK_SIZE) {
        const end = Math.min(start + DOWNLOAD_CHUNK_SIZE - 1, FILE_SIZE_BYTES - 1);
        const chunk = await fetchDownloadChunk(start, end);
        chunks.push(chunk);
        setDownloadedBytes(end + 1);
      }

      const bundle = new Blob(chunks, { type: "application/zip" });
      const objectUrl = URL.createObjectURL(bundle);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = FILE_NAME;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.error("Android bundle download failed", error);
      setDownloadError("The download could not be completed. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading]);

  const downloadProgress = Math.round((downloadedBytes / FILE_SIZE_BYTES) * 100);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            <span className="font-serif text-lg font-semibold tracking-wide">mapper.one</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to mapper.one
          </Link>
        </div>
      </nav>

      <section className="relative isolate overflow-hidden px-4 py-16 sm:px-6 sm:py-24">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.08]"
          style={{ backgroundImage: "url(/hero-topo.png)" }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/70 to-background" />

        <div className="mx-auto max-w-3xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <Download className="h-8 w-8" />
            </div>
            <p className="mb-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-primary">
              Android release
            </p>
            <h1 className="text-4xl font-semibold sm:text-5xl">Download mapper.one</h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Download the mapper.one beta from Google Play, or use the signed Android App Bundle for testing and distribution.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card/95 shadow-xl">
            <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <FileArchive className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold">{FILE_NAME}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Android App Bundle · {FILE_SIZE} · version {VERSION}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5 sm:p-7">
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid="android-google-play-link"
              >
                <Smartphone className="h-5 w-5" />
                Download the beta from Google Play
              </a>

              <div className="flex items-center gap-3 text-center text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                <span>or download the bundle</span>
              </div>

              <button
                type="button"
                onClick={() => void downloadBundle()}
                disabled={isDownloading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {isDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                {isDownloading ? `Preparing download · ${downloadProgress}%` : "Download Android App Bundle"}
              </button>

              {isDownloading ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`Download ${downloadProgress}% complete`}>
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
              ) : null}

              {downloadError ? (
                <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {downloadError}
                </p>
              ) : null}

              <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Package name</p>
                  <p className="mt-1 font-mono text-sm">{PACKAGE_NAME}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Release</p>
                  <p className="mt-1 text-sm">Production signed · {VERSION}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Verify the download
                </div>
                <p className="mb-2 text-xs leading-5 text-muted-foreground">
                  Compare the SHA-256 fingerprint below if you need to confirm the file was transferred intact.
                </p>
                <code className="block break-all font-mono text-[11px] leading-5 text-foreground/80">{SHA256}</code>
              </div>

              <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  This signed Android App Bundle is provided for testing and distribution. For normal installation,
                  use the beta listing on Google Play above.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Need the iPhone version?{" "}
            <Link href="/app-info" className="text-primary underline-offset-4 hover:underline">
              Open the app information page
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}