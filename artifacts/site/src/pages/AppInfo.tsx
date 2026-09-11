import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// Pre-loaded App Store screenshots (imported via Vite @assets alias)
import ss1 from "@assets/Screenshot_20260623-214218_1782265806000.png";
import ss2 from "@assets/Screenshot_20260623-214229_1782265806014.png";
import ss3 from "@assets/Screenshot_20260623-214432_1782265806028.png";
import ss4 from "@assets/Screenshot_20260623-214521_1782265806041.png";
import ss5 from "@assets/Screenshot_20260623-214609_1782265806052.png";
import ss6 from "@assets/Screenshot_20260623-214624_1782265806068.png";
import ss7 from "@assets/Screenshot_20260623-214657_1782265806083.png";
import ss8 from "@assets/Screenshot_20260623-214830_1782265806100.png";
import ss9 from "@assets/Screenshot_20260623-214921_1782265806114.png";
import {
  Check,
  Copy,
  Smartphone,
  FileText,
  Link2,
  Info,
  ImageIcon,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  X,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// App Store content — edit these values and the page auto-updates everywhere.
// ---------------------------------------------------------------------------

const APP_NAME = "mapper.one";

const APP_SUBTITLE = "Community Maps for the Wild";

const PROMOTIONAL_TEXT =
  "Map the places where you work. Import GPX, KML & GeoJSON routes, cache offline tiles, record tracks, drop waypoints — and browse community adventures.";

const DESCRIPTION = `mapper.one is a field mapping app built for people who work and explore outside. Carry your own data, record routes, and document important places with offline maps.

IMPORT YOUR MAPS
Bring in routes from any source — GPX from Garmin or Strava, KML/KMZ from Google Earth or Avenza, and GeoJSON from any GIS tool. Every feature, waypoint, and track renders immediately on a full-screen map.

OFFLINE-FIRST
Download map tiles for any region before you leave signal. Saved tiles live in durable device storage so they survive cache pressure — your maps are there when the trail goes dark.

RECORD YOUR ROUTE
Hit record and mapper.one traces your path with timestamps and elevation data. Drop waypoints mid-trip with photos and notes — field markers that stay attached to the track.

COMMUNITY LIBRARY
Browse thousands of trails and overlanding roads contributed by the Adventure Collective and the open-data community. Filter by region, search by name, or let the app find routes near you. Download any route to your library with a single tap.

SHARE WHAT YOU FIND
Publish your recorded tracks to the community so others can follow in your footsteps. Open-source, open-access, community-first.

Free forever. No ads. No subscriptions. No account required.

Built with deep gratitude to OpenStreetMap contributors, the Leaflet project, and every surveyor and trailblazer who mapped the wild places before us.`;

const KEYWORDS =
  "offline maps,GPX,hiking,trail maps,overlanding,KML,waypoints,backcountry,track recorder";

const SUPPORT_URL = "https://mapper.one/support";

const MARKETING_URL = "https://mapper.one";

const VERSION = "1.0";

const COPYRIGHT = "© 2026 The Adventure Collective";

// ---------------------------------------------------------------------------
// Screenshot requirements (iPhone 6.5" is required; others are optional)
// ---------------------------------------------------------------------------

const SCREENSHOT_SIZES = [
  {
    device: "iPhone 6.5\" (required)",
    sizes: ["1242 × 2688 px", "2688 × 1242 px", "1284 × 2778 px", "2778 × 1284 px"],
    note: "First 3 screenshots appear on the App Store install sheet.",
    required: true,
  },
  {
    device: "iPhone 5.5\"",
    sizes: ["1242 × 2208 px", "2208 × 1242 px"],
    note: "Required only if you also target older devices.",
    required: false,
  },
  {
    device: "iPad Pro 12.9\" (6th gen)",
    sizes: ["2048 × 2732 px", "2732 × 2048 px"],
    note: "Required only if the app supports iPad.",
    required: false,
  },
];

// ---------------------------------------------------------------------------
// Reference images (App Store Connect form walkthrough screenshots)
// ---------------------------------------------------------------------------

const REFERENCE_IMAGES = [
  {
    src: "/appstore-ref-1.png",
    caption: "Screenshots upload — iPhone 6.5\" required",
  },
  {
    src: "/appstore-ref-2.png",
    caption: "Promotional Text, Description, Keywords, Support URL, Marketing URL",
  },
  {
    src: "/appstore-ref-3.png",
    caption: "Support URL, Marketing URL, Version, Copyright, App Clip",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function charCount(s: string, limit: number) {
  const n = s.length;
  const over = n > limit;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
      {n.toLocaleString()} / {limit.toLocaleString()}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-green-600" />
          <span className="text-green-600">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

interface FieldProps {
  label: string;
  value: string;
  limit: number;
  multiline?: boolean;
  hint?: string;
}

function Field({ label, value, limit, multiline = false, hint }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-sm font-medium">{label}</span>
          {hint && (
            <span className="text-xs text-muted-foreground ml-2">{hint}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {charCount(value, limit)}
          <CopyButton value={value} />
        </div>
      </div>
      {multiline ? (
        <pre className="w-full text-sm bg-muted/40 border border-border rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed text-foreground overflow-x-auto">
          {value}
        </pre>
      ) : (
        <div className="w-full text-sm bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground">
          {value}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/30">
        <span className="text-primary">{icon}</span>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function ScreenshotRef() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        {expanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {expanded ? "Hide" : "Show"} App Store Connect reference screenshots
      </button>
      {expanded && (
        <div className="flex flex-wrap gap-4">
          {REFERENCE_IMAGES.map((img) => (
            <figure key={img.src} className="space-y-1.5 max-w-[180px]">
              <a href={img.src} target="_blank" rel="noopener noreferrer">
                <img
                  src={img.src}
                  alt={img.caption}
                  className="rounded-xl border border-border shadow-sm w-full hover:opacity-90 transition-opacity"
                />
              </a>
              <figcaption className="text-xs text-muted-foreground leading-snug">
                {img.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-loaded screenshots (App Store gallery)
// ---------------------------------------------------------------------------

const APP_SCREENSHOTS = [
  { src: ss1, name: "01_map_terrain" },
  { src: ss2, name: "02_library" },
  { src: ss3, name: "03_route_detail" },
  { src: ss4, name: "04_topo_tracking" },
  { src: ss5, name: "05_new_waypoint" },
  { src: ss6, name: "06_save_offline" },
  { src: ss7, name: "07_map_layers" },
  { src: ss8, name: "08_route_following" },
  { src: ss9, name: "09_plot_route" },
];

function resizeUrlToCanvas(url: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const ox = (w - sw) / 2;
      const oy = (h - sh) / 2;
      ctx.drawImage(img, ox, oy, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

function PreloadedScreenshots() {
  const [targetIdx, setTargetIdx] = useState(0);
  const [downloading, setDownloading] = useState<Record<number, boolean>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);
  const target = RESIZE_TARGETS[targetIdx];

  const downloadOne = useCallback(async (idx: number) => {
    const ss = APP_SCREENSHOTS[idx];
    setDownloading((d) => ({ ...d, [idx]: true }));
    try {
      const dataUrl = await resizeUrlToCanvas(ss.src, target.w, target.h);
      triggerDownload(dataUrl, `${ss.name}_${target.w}x${target.h}.png`);
    } finally {
      setDownloading((d) => ({ ...d, [idx]: false }));
    }
  }, [target]);

  const downloadAll = useCallback(async () => {
    setDownloadingAll(true);
    for (let i = 0; i < APP_SCREENSHOTS.length; i++) {
      await downloadOne(i);
      await new Promise<void>((r) => setTimeout(r, 400));
    }
    setDownloadingAll(false);
  }, [downloadOne]);

  const anyDownloading = useMemo(
    () => downloadingAll || Object.values(downloading).some(Boolean),
    [downloading, downloadingAll],
  );

  return (
    <div className="space-y-5">
      {/* Target selector */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <label className="text-sm font-medium">Target size</label>
          <select
            value={targetIdx}
            onChange={(e) => setTargetIdx(Number(e.target.value))}
            className="w-full text-sm bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground"
          >
            {RESIZE_TARGETS.map((t, i) => (
              <option key={t.label} value={i}>{t.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void downloadAll()}
          disabled={anyDownloading}
          className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors font-medium shrink-0"
        >
          {downloadingAll
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Download className="w-4 h-4" />}
          Download all ({APP_SCREENSHOTS.length})
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {APP_SCREENSHOTS.map((ss, idx) => (
          <div key={ss.name} className="relative group rounded-xl border border-border bg-muted/20 overflow-hidden">
            <div className="aspect-[9/19.5] bg-muted/30 overflow-hidden">
              <img src={ss.src} alt={ss.name} className="w-full h-full object-cover" />
            </div>
            {/* Hover overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
              <button
                onClick={() => void downloadOne(idx)}
                disabled={anyDownloading}
                className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white text-black font-medium shadow disabled:opacity-50"
              >
                {downloading[idx]
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Download className="w-3 h-3" />}
                Download
              </button>
            </div>
            {/* Number badge */}
            <div className="absolute top-1.5 left-1.5">
              <span className="text-xs px-1.5 py-0.5 rounded bg-black/60 text-white font-medium tabular-nums">
                {idx + 1}
              </span>
            </div>
            {/* Filename */}
            <div className="px-1.5 py-1 border-t border-border">
              <p className="text-[10px] text-muted-foreground truncate">{ss.name}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Resized client-side to exactly {target.w} × {target.h} px using Canvas — nothing is uploaded.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screenshot resizer
// ---------------------------------------------------------------------------

const RESIZE_TARGETS = [
  { label: "1284 × 2778 px — iPhone 6.5\" portrait", w: 1284, h: 2778 },
  { label: "1242 × 2688 px — iPhone 6.5\" portrait (alt)", w: 1242, h: 2688 },
  { label: "1290 × 2796 px — iPhone 6.7\" portrait", w: 1290, h: 2796 },
  { label: "2778 × 1284 px — iPhone 6.5\" landscape", w: 2778, h: 1284 },
  { label: "2688 × 1242 px — iPhone 6.5\" landscape (alt)", w: 2688, h: 1242 },
  { label: "2048 × 2732 px — iPad Pro 12.9\" portrait", w: 2048, h: 2732 },
] as const;

interface ResizedItem {
  id: string;
  originalName: string;
  previewUrl: string;
  dataUrl: string | null;
  processing: boolean;
}

function resizeToCanvas(file: File, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no canvas context")); return; }
      // Cover: scale to fill, center crop
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const ox = (w - sw) / 2;
      const oy = (h - sh) / 2;
      ctx.drawImage(img, ox, oy, sw, sh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("load failed")); };
    img.src = objectUrl;
  });
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function ScreenshotResizer() {
  const [targetIdx, setTargetIdx] = useState(0);
  const [items, setItems] = useState<ResizedItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const target = RESIZE_TARGETS[targetIdx];

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.previewUrl.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 10 - items.length);
    if (!imageFiles.length) return;

    const newItems: ResizedItem[] = imageFiles.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      originalName: f.name.replace(/\.[^.]+$/, ""),
      previewUrl: URL.createObjectURL(f),
      dataUrl: null,
      processing: true,
    }));

    setItems((prev) => [...prev, ...newItems].slice(0, 10));

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const item = newItems[i];
      try {
        const dataUrl = await resizeToCanvas(file, target.w, target.h);
        setItems((prev) =>
          prev.map((it) => it.id === item.id ? { ...it, dataUrl, processing: false } : it)
        );
      } catch {
        setItems((prev) =>
          prev.map((it) => it.id === item.id ? { ...it, processing: false } : it)
        );
      }
    }
  }, [items.length, target]);

  // Re-process all items when target changes
  const applyTargetToAll = useCallback(async () => {
    setItems((prev) => prev.map((it) => ({ ...it, processing: true, dataUrl: null })));
    // We need the preview URLs to re-draw; fetch blobs from object URLs
    setItems((prev) => {
      void (async () => {
        for (const item of prev) {
          try {
            const resp = await fetch(item.previewUrl);
            const blob = await resp.blob();
            const file = new File([blob], item.originalName, { type: blob.type });
            const dataUrl = await resizeToCanvas(file, target.w, target.h);
            setItems((cur) =>
              cur.map((it) => it.id === item.id ? { ...it, dataUrl, processing: false } : it)
            );
          } catch {
            setItems((cur) =>
              cur.map((it) => it.id === item.id ? { ...it, processing: false } : it)
            );
          }
        }
      })();
      return prev;
    });
  }, [target]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void processFiles(e.target.files);
    e.target.value = "";
  }, [processFiles]);

  const removeItem = (id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const downloadItem = (item: ResizedItem) => {
    if (!item.dataUrl) return;
    triggerDownload(item.dataUrl, `${item.originalName}_${target.w}x${target.h}.png`);
  };

  const downloadAll = async () => {
    setDownloadingAll(true);
    for (const item of items) {
      if (item.dataUrl) {
        triggerDownload(item.dataUrl, `${item.originalName}_${target.w}x${target.h}.png`);
        await new Promise<void>((r) => setTimeout(r, 300));
      }
    }
    setDownloadingAll(false);
  };

  const readyCount = items.filter((it) => it.dataUrl).length;

  return (
    <div className="space-y-5">
      {/* Target selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Target size</label>
        <select
          value={targetIdx}
          onChange={(e) => setTargetIdx(Number(e.target.value))}
          className="w-full text-sm bg-muted/40 border border-border rounded-lg px-3 py-2 text-foreground"
        >
          {RESIZE_TARGETS.map((t, i) => (
            <option key={t.label} value={i}>{t.label}</option>
          ))}
        </select>
        {items.length > 0 && (
          <button
            onClick={applyTargetToAll}
            className="text-xs text-primary hover:underline"
          >
            Re-resize all {items.length} image{items.length !== 1 ? "s" : ""} to this size
          </button>
        )}
      </div>

      {/* Drop zone */}
      {items.length < 10 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Drop screenshots here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">
            Up to {10 - items.length} more · PNG, JPG, WEBP accepted
          </p>
        </div>
      )}

      {/* Image grid */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{items.length} screenshot{items.length !== 1 ? "s" : ""}</span>
            {readyCount > 1 && (
              <button
                onClick={() => void downloadAll()}
                disabled={downloadingAll}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors font-medium"
              >
                {downloadingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                Download all ({readyCount})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((item, idx) => (
              <div key={item.id} className="relative group rounded-xl border border-border bg-muted/20 overflow-hidden">
                {/* Preview thumbnail */}
                <div className="aspect-[9/19.5] bg-muted/40 overflow-hidden">
                  <img
                    src={item.previewUrl}
                    alt={item.originalName}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 group-hover:bg-black/40 transition-colors">
                  {item.processing ? (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  ) : item.dataUrl ? (
                    <button
                      onClick={() => downloadItem(item)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white text-black font-medium shadow"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </button>
                  ) : (
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-white">Failed</span>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Status badge */}
                <div className="absolute top-1.5 left-1.5">
                  {item.processing ? (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-black/60 text-white">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Processing
                    </span>
                  ) : item.dataUrl ? (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-600/90 text-white">
                      <Check className="w-2.5 h-2.5" /> Ready
                    </span>
                  ) : null}
                </div>

                {/* Filename */}
                <div className="px-2 py-1.5 border-t border-border">
                  <p className="text-xs text-muted-foreground truncate">{idx + 1}. {item.originalName}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Images are resized client-side using Canvas — nothing is uploaded. Hover a thumbnail to download.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AppInfo() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-muted border border-border text-muted-foreground mb-3">
            <Info className="w-3.5 h-3.5" />
            Hidden page — /app-info
          </div>
          <h1 className="text-3xl font-serif font-semibold">
            App Store Submission
          </h1>
          <p className="text-muted-foreground text-sm">
            Ready-to-paste content for App Store Connect. Edit the constants at the
            top of <code className="text-xs bg-muted px-1.5 py-0.5 rounded">AppInfo.tsx</code> to update all values at once.
          </p>
        </div>

        {/* App Identity */}
        <Section icon={<Smartphone className="w-4 h-4" />} title="App Identity">
          <Field label="App Name" value={APP_NAME} limit={30} />
          <Field
            label="Subtitle"
            value={APP_SUBTITLE}
            limit={30}
            hint="Appears below the name in search results"
          />
        </Section>

        {/* Store Listing */}
        <Section icon={<FileText className="w-4 h-4" />} title="Store Listing">
          <Field
            label="Promotional Text"
            value={PROMOTIONAL_TEXT}
            limit={170}
            hint="Appears at top of product page; can be updated without a new release"
          />
          <Field
            label="Description"
            value={DESCRIPTION}
            limit={4000}
            multiline
            hint="Appears on the app product page"
          />
          <Field
            label="Keywords"
            value={KEYWORDS}
            limit={100}
            hint="Comma-separated; affects search ranking"
          />
        </Section>

        {/* URLs */}
        <Section icon={<Link2 className="w-4 h-4" />} title="URLs">
          <Field label="Support URL" value={SUPPORT_URL} limit={255} />
          <Field label="Marketing URL" value={MARKETING_URL} limit={255} />
        </Section>

        {/* Version & Legal */}
        <Section icon={<Info className="w-4 h-4" />} title="Version & Legal">
          <Field label="Version" value={VERSION} limit={20} />
          <Field label="Copyright" value={COPYRIGHT} limit={200} />
        </Section>

        {/* Screenshots */}
        <Section icon={<ImageIcon className="w-4 h-4" />} title="Screenshots">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Screenshots are required for iOS apps. Only the first 3 will be
              shown on the app installation sheet. Dimensions below are for
              portrait orientation — landscape variants accepted too.
            </p>

            <div className="space-y-3">
              {SCREENSHOT_SIZES.map((s) => (
                <div
                  key={s.device}
                  className={`rounded-xl border p-4 ${
                    s.required
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium">{s.device}</span>
                    {s.required && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                        Required
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-1.5">
                    {s.sizes.map((sz) => (
                      <code
                        key={sz}
                        className="text-xs bg-background border border-border rounded px-2 py-0.5 font-mono"
                      >
                        {sz}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.note}</p>
                </div>
              ))}
            </div>

            <ScreenshotRef />
          </div>
        </Section>

        {/* Pre-loaded App Screenshots */}
        <Section icon={<ImageIcon className="w-4 h-4" />} title="App Screenshots">
          <p className="text-sm text-muted-foreground leading-relaxed -mt-1">
            Pick a target size then hover any thumbnail to download it, or grab all 9 at once.
          </p>
          <PreloadedScreenshots />
        </Section>

        {/* Screenshot Resizer */}
        <Section icon={<Upload className="w-4 h-4" />} title="Screenshot Resizer">
          <p className="text-sm text-muted-foreground leading-relaxed -mt-1">
            Drop in up to 10 screenshots. They're resized to the exact App Store
            dimensions using your browser's Canvas — nothing is uploaded anywhere.
          </p>
          <ScreenshotResizer />
        </Section>

        {/* Checklist */}
        <Section icon={<Check className="w-4 h-4" />} title="Submission Checklist">
          <div className="space-y-2">
            {[
              "App binary uploaded via Xcode or Transporter",
              "App icon — 1024 × 1024 px PNG (no alpha)",
              "iPhone 6.5\" screenshots uploaded (up to 10)",
              "Promotional text filled in",
              "Description filled in",
              "Keywords filled in (≤ 100 chars)",
              "Support URL resolves (https://mapper.one/support)",
              "Marketing URL resolves (https://mapper.one)",
              "Version number matches binary (1.0)",
              "Copyright year correct",
              "Privacy policy URL added (App Privacy section)",
              "Age rating completed",
              "Pricing set to Free",
              "Territories / availability configured",
            ].map((item) => (
              <ChecklistItem key={item} label={item} />
            ))}
          </div>
        </Section>

        <p className="text-xs text-muted-foreground text-center pb-4">
          mapper.one · App Store submission prep · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

function ChecklistItem({ label }: { label: string }) {
  const [checked, setChecked] = useState(false);

  return (
    <button
      onClick={() => setChecked((p) => !p)}
      className={`flex items-start gap-3 w-full text-left rounded-lg px-3 py-2 transition-colors text-sm ${
        checked
          ? "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300"
          : "bg-muted/30 hover:bg-muted/60 text-foreground"
      }`}
    >
      <span
        className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
          checked
            ? "bg-green-500 border-green-500"
            : "border-border bg-background"
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 text-white" />}
      </span>
      <span className={checked ? "line-through opacity-60" : ""}>{label}</span>
    </button>
  );
}
