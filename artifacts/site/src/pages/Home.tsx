import React, { useRef, useState } from "react";
import { Link } from "wouter";
import {
  createTeamsEarlyAccessLead,
  useListCommunityDatasets,
} from "@workspace/api-client-react";
import {
  Map, MapPin, Download, Share2, Mountain, Smartphone,
  Heart, Compass, Users, TreePine, Footprints, Camera, Check,
  ChevronDown, ChevronLeft, ChevronRight, Navigation, Layers, MapPinned, Building2, Leaf, Shovel,
  Mail, Globe2, Lock, WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion } from "framer-motion";
import { SiApple, SiGoogleplay } from "react-icons/si";

import appIcon from "@assets/1024x1024bb_1787259211089.png";

const APP_STORE_URL = "https://apps.apple.com/us/app/mapper-one/id6778850829";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.mapper.one";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDistance(meters: number) {
  const feet = meters * 3.28084;
  if (feet < 5280) return `${Math.round(feet)} ft`;
  return `${(feet / 5280).toFixed(2)} mi`;
}

function datasetSummaryText(dataset: {
  description: string | null;
  distanceMeters: number | null;
  elevationGainMeters: number | null;
}) {
  if (dataset.description) return dataset.description;
  if (dataset.distanceMeters != null) {
    const parts = [`${formatDistance(dataset.distanceMeters)} route`];
    if (dataset.elevationGainMeters != null) {
      parts.push(`${Math.round(dataset.elevationGainMeters * 3.28084)} ft climb`);
    }
    return parts.join(" · ");
  }
  return "No description provided.";
}

// ─── animation presets ─────────────────────────────────────────────────────

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.13 } },
};

// ─── section data ──────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  {
    num: "01",
    label: "Record",
    heading: "Walk it.",
    body: "Walk, drive, or ride through the property while mapper.one records your route. Works entirely offline — no signal required.",
    icon: Footprints,
  },
  {
    num: "02",
    label: "Mark",
    heading: "Mark it.",
    body: "Drop GPS waypoints anywhere something matters — a hazard, an access point, a tree that needs attention.",
    icon: MapPin,
  },
  {
    num: "03",
    label: "Document",
    heading: "Explain it.",
    body: "Attach photographs, descriptions, and field notes directly to locations so the context travels with the pin.",
    icon: Camera,
  },
  {
    num: "04",
    label: "Share",
    heading: "Share it.",
    body: "Give someone else the map so they can find the route, location, and information without you being there.",
    icon: Share2,
  },
];

const INDUSTRIES = [
  {
    icon: TreePine,
    title: "Arborists",
    slug: "arborists",
    body: "Mark trees, photograph hazards, document removals, and record equipment-access routes for every job site.",
  },
  {
    icon: Shovel,
    title: "Trail Builders",
    slug: "trail-builders",
    body: "Record proposed trails, mark drainage problems, photograph maintenance needs, and share work locations with crews.",
  },
  {
    icon: Leaf,
    title: "Landscaping",
    slug: "landscaping",
    body: "Map properties, irrigation, beds, gates, mowing areas, hazards, and recurring maintenance instructions.",
  },
  {
    icon: Building2,
    title: "Landscape Architecture",
    slug: "landscape-architecture",
    body: "Document existing site conditions, photograph features, and create location-specific project notes during field visits.",
  },
  {
    icon: Mountain,
    title: "Forestry",
    slug: "forestry",
    body: "Record access roads, timber stands, boundaries, crossings, hazards, and field observations.",
  },
  {
    icon: MapPinned,
    title: "Land Management",
    slug: "land-management",
    body: "Create a permanent geographic record of infrastructure, projects, habitat improvements, and property conditions.",
  },
  {
    icon: Navigation,
    title: "Tour Operators",
    slug: "tour-operators",
    body: "Organize private trip routes, mark meeting points and hazards, and give every guide the same established route to follow.",
  },
  {
    icon: Building2,
    title: "Property Management",
    slug: "property-management",
    body: "Map properties, document maintenance needs, mark utilities and access points, and share location-specific instructions with crews and contractors.",
  },
];

const WORKFLOWS = [
  {
    role: "Tree company",
    slug: "arborist-crew-mapping",
    steps: ["Estimator maps trees and records access routes", "Crew receives job map with every location pre-marked", "Nothing gets missed on site"],
  },
  {
    role: "Trail organization",
    slug: "volunteer-trail-crew-mapping",
    steps: ["Volunteer identifies erosion and photographs the location", "Maintenance crew navigates directly to it", "No text chains, no confusion about where"],
  },
  {
    role: "Landscaping company",
    slug: "offline-field-mapping-guide",
    steps: ["Manager maps new property and documents special instructions", "Weekly crew has permanent, growing site information", "Institutional knowledge stays with the company"],
  },
  {
    role: "Forester",
    slug: "forestry-field-mapping",
    steps: ["Record road access and mark every crossing", "Photograph conditions and add field observations", "Share the field map directly with the landowner or contractor"],
  },
  {
    role: "Tour operator",
    slug: "tour-operator-route-mapping",
    steps: ["Build a private route with turns, stops, and points of interest", "Guide follows the established route without relying on memory", "Share the trip map with the next guide or support crew"],
  },
];

const RECREATION_USES = [
  "Hiking routes", "Mountain-bike rides", "Hunting locations",
  "Fishing access", "Backcountry routes", "Campsites",
  "Overland routes", "Personal property maps",
];

const TEAMS_FEATURES = [
  "Shared projects", "Company workspaces", "Crew access",
  "Custom waypoint categories", "Photos and notes",
  "Project folders", "Offline maps", "GPX/KML export",
  "PDF field reports", "Web dashboard",
];

// ─── nav ────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Trails", href: "/trails" },
  { label: "Use Cases", href: "/use-cases" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
];

// ─── component ─────────────────────────────────────────────────────────────

export default function Home() {
  const { data: datasets, isLoading } = useListCommunityDatasets();
  const workflowCarouselRef = useRef<HTMLDivElement>(null);
  const [teamsEmail, setTeamsEmail] = useState("");
  const [teamsSubmitted, setTeamsSubmitted] = useState(false);
  const [teamsConsented, setTeamsConsented] = useState(false);
  const [teamsSubmitting, setTeamsSubmitting] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const handleTeamsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamsEmail.trim() || !teamsConsented || teamsSubmitting) return;
    setTeamsSubmitting(true);
    setTeamsError(null);
    try {
      await createTeamsEarlyAccessLead({
        email: teamsEmail.trim(),
        consented: true,
      });
      setTeamsSubmitted(true);
    } catch (error) {
      setTeamsError(
        error instanceof Error
          ? error.message
          : "We couldn't save your email. Please try again.",
      );
    } finally {
      setTeamsSubmitting(false);
    }
  };

  const scrollUseCases = (direction: "back" | "forward") => {
    workflowCarouselRef.current?.scrollBy({
      left: direction === "forward" ? 360 : -360,
      behavior: "smooth",
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary-foreground">

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/commercial" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">mapper.one</span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#industries" className="hover:text-foreground transition-colors">Industries</a>
            <a href="#teams" className="hover:text-foreground transition-colors">Teams</a>
            <Link href="/" className="hover:text-foreground transition-colors">Recreation</Link>
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          <Button
            asChild
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-5"
          >
            <a href="#get-app" data-testid="nav-get-app">Get the App</a>
          </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 md:pt-52 md:pb-40 px-6 overflow-hidden min-h-[92vh] flex flex-col justify-center">
        {/* topo texture */}
        <div
          className="absolute inset-0 z-0 opacity-[0.05] pointer-events-none"
          style={{ backgroundImage: "url(/hero-topo.png)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        {/* warm gradient wash */}
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-background/60" />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="max-w-4xl mx-auto relative z-10 text-center"
        >
          <motion.div
            variants={fadeIn}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-8 border border-border/50 backdrop-blur-sm"
          >
            <Compass className="w-4 h-4" />
            <span>Field mapping for people who work outside.</span>
          </motion.div>

          <motion.h1
            variants={fadeIn}
            className="text-5xl md:text-7xl lg:text-[5.5rem] font-serif text-balance leading-[1.05] text-foreground mb-8"
          >
            Map the places where&nbsp;you work.
          </motion.h1>

          <motion.p
            variants={fadeIn}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed font-sans font-light"
          >
            Record routes. Mark important locations. Add photos and field notes.
            Share everything with the people who need to find it later.
          </motion.p>

          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button
              asChild
              size="lg"
              className="h-14 px-8 text-base font-semibold rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
              data-testid="hero-start-mapping"
            >
              <a href="#get-app">
                <Smartphone className="w-5 h-5 mr-2" /> Start Mapping
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-8 text-base font-semibold border-border hover:bg-secondary/50 rounded-full transition-all hover:-translate-y-0.5"
            >
              <a href="#workflow">
                <ChevronDown className="w-5 h-5 mr-2" /> See How It Works
              </a>
            </Button>
          </motion.div>

          <motion.p variants={fadeIn} className="text-sm text-muted-foreground font-light">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-4 decoration-primary/50">
              Available on the App Store
            </a>
            <span className="mx-2 text-border">·</span>
            Android coming soon
          </motion.p>
        </motion.div>

        {/* Full-width field map concept */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-7xl mx-auto mt-20"
        >
          <div className="rounded-[2rem] border border-border/70 bg-card/90 p-2.5 sm:p-4 shadow-2xl overflow-hidden">
            <div className="flex flex-col gap-3 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-3 sm:pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Map className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="font-serif text-lg leading-tight">Cedar Ridge property</p>
                  <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
                    Field map concept
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                  <WifiOff className="w-3.5 h-3.5" /> Offline ready
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary/60 px-3 py-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" /> Crew handoff
                </span>
              </div>
            </div>

            <div
              className="relative min-h-[470px] overflow-hidden rounded-[1.5rem] border border-border/60 bg-[#d9dfd2] sm:min-h-[580px]"
              style={{
                backgroundImage: "url(/trailhead-map.png)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#dbe5d5]/55 via-transparent to-[#1d352d]/20" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] bg-[size:52px_52px] opacity-40" />

              <svg
                viewBox="0 0 1000 580"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                <path
                  d="M 150 475 C 205 420, 180 365, 285 325 S 390 255, 475 275 S 555 345, 650 280 S 760 150, 895 112"
                  fill="none"
                  stroke="rgba(29,71,51,.24)"
                  strokeWidth="18"
                  strokeLinecap="round"
                />
                <path
                  d="M 150 475 C 205 420, 180 365, 285 325 S 390 255, 475 275 S 555 345, 650 280 S 760 150, 895 112"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray="1 18"
                />
              </svg>

              <div className="absolute left-3 top-3 w-[calc(100%-1.5rem)] max-w-[280px] rounded-2xl border border-white/60 bg-card/95 p-4 shadow-xl backdrop-blur-md sm:left-5 sm:top-5 sm:p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-primary">Today&apos;s field plan</p>
                    <h3 className="mt-1 font-serif text-xl">South boundary walk</h3>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">Active</span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-y border-border/70 py-3">
                  {[
                    { value: "2.4", label: "miles" },
                    { value: "12", label: "waypoints" },
                    { value: "18", label: "photos" },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="font-serif text-xl">{stat.value}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Last synced before leaving the trailhead
                </div>
              </div>

              {[
                { top: "27%", left: "63%", label: "Equipment access", icon: Navigation },
                { top: "47%", left: "39%", label: "Trail drainage", icon: Camera },
                { top: "68%", left: "24%", label: "Tree removal", icon: MapPin },
                { top: "15%", left: "83%", label: "Property entrance", icon: MapPinned },
              ].map((pin) => {
                const PinIcon = pin.icon;
                return (
                  <div
                    key={pin.label}
                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                    style={{ top: pin.top, left: pin.left }}
                  >
                    <div className="mb-1 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/60 bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground shadow-lg">
                      <PinIcon className="h-3 w-3" />
                      {pin.label}
                    </div>
                    <MapPin className="h-5 w-5 fill-primary text-white drop-shadow-md" />
                  </div>

                );
              })}

              <div className="absolute bottom-4 right-4 hidden w-64 rounded-2xl border border-white/60 bg-card/95 p-4 shadow-xl backdrop-blur-md sm:block">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Ready to hand off</p>
                    <p className="text-[11px] text-muted-foreground">Everyone sees the same place</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {["M", "S", "F"].map((initial) => (
                    <span key={initial} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-semibold text-secondary-foreground">
                      {initial}
                    </span>
                  ))}
                  <span className="ml-auto text-xs font-medium text-primary">Share map →</span>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-white/60 bg-card/95 p-3 shadow-xl backdrop-blur-md sm:hidden">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Share2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Ready to hand off</p>
                    <p className="truncate text-[11px] text-muted-foreground">Routes, waypoints, photos, and notes in one map</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs font-medium text-primary">Share →</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Core Workflow ──────────────────────────────────────────────── */}
      <section id="workflow" className="py-28 px-6 bg-secondary/20 border-y border-border/50 scroll-mt-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <motion.div variants={fadeIn} className="text-center mb-20">
            <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-3 block">How it works</span>
            <h2 className="text-3xl md:text-5xl font-serif text-balance leading-tight">
              Walk it. Mark it. Share it.
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {WORKFLOW_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.num}
                  variants={fadeIn}
                  className="group relative p-8 rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-primary/40 transition-all duration-300"
                  data-testid={`workflow-step-${step.num}`}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <span className="font-mono text-xs font-bold text-primary/60">{step.num}</span>
                    <span className="uppercase tracking-widest text-xs font-mono text-muted-foreground">{step.label}</span>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 group-hover:scale-105 transition-transform">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-xl font-serif mb-2">{step.heading}</h3>
                  <p className="text-muted-foreground leading-relaxed font-light text-sm">{step.body}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ── Knowledge Attached to Place ─────────────────────────────── */}
      <section className="py-28 px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div variants={fadeIn}>
              <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Field Knowledge</span>
              <h2 className="text-3xl md:text-5xl font-serif mb-6 leading-tight text-balance">
                Don't just drop a pin. Explain what's there.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-6 font-light">
                Every waypoint carries the context someone needs when they reach it — not just coordinates, but the full picture: what it is, what to do, what to watch out for.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed font-light">
                That's the difference between a pin on a map and a piece of institutional knowledge attached to a place.
              </p>
            </motion.div>

            {/* Waypoint card mockup */}
            <motion.div variants={fadeIn} className="relative">
              <div className="rounded-2xl border border-border bg-card shadow-xl p-6 max-w-sm mx-auto">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-serif font-semibold text-base">White Oak — Remove</h4>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">35.4821, -82.5497</p>
                  </div>
                </div>

                {/* photo placeholder */}
                <div
                  className="rounded-lg overflow-hidden mb-4 h-32 bg-secondary/40 border border-border/50 flex items-center justify-center"
                  style={{ backgroundImage: "url(/trailhead-map.png)", backgroundSize: "cover", backgroundPosition: "top" }}
                >
                  <div className="w-full h-full bg-foreground/10" />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-widest font-mono text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    Dead upper canopy. Remove entire tree. Access from service road. Avoid septic field east of driveway.
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                  <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-mono">1 photo attached</span>
                  <div className="ml-auto">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono">Hazard</span>
                  </div>
                </div>
              </div>
              {/* soft shadow blob */}
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-primary/5 blur-2xl" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Industries ─────────────────────────────────────────────────── */}
      <section id="industries" className="py-28 px-6 bg-foreground text-background scroll-mt-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <motion.div variants={fadeIn} className="text-center mb-16">
            <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Industries</span>
            <h2 className="text-3xl md:text-5xl font-serif mb-6 text-background text-balance leading-tight">
              Built for work that happens outside.
            </h2>
            <p className="text-lg text-muted leading-relaxed max-w-2xl mx-auto font-light">
              mapper.one was designed for people whose workplace is a place — not a desk.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-5">
            {INDUSTRIES.map((industry) => {
              const Icon = industry.icon;
              const cardContent = (
                <>
                  <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mb-5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-serif mb-2 text-background">{industry.title}</h3>
                  <p className="text-muted font-light leading-relaxed text-sm">{industry.body}</p>
                </>
              );
              const cardClassName = "group p-7 rounded-2xl bg-background/5 border border-white/10 hover:bg-background/10 hover:border-white/20 transition-all duration-300 cursor-pointer";
              return (
                <motion.a
                  key={industry.slug}
                  href={`/industries/${industry.slug}`}
                  variants={fadeIn}
                  className={cardClassName}
                  data-testid={`industry-card-${industry.slug}`}
                >
                  {cardContent}
                </motion.a>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* ── Sharing ─────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 border-b border-border/50">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Sharing card mockup */}
            <motion.div variants={fadeIn} className="relative order-2 md:order-1">
              <div className="rounded-2xl border border-border bg-card shadow-xl p-6 max-w-sm mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Map className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-serif font-semibold">Johnson Property</h4>
                    <p className="text-xs text-muted-foreground font-light">Updated today</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "Waypoints", count: "12" },
                    { label: "Routes", count: "2" },
                    { label: "Photos", count: "18" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-3 rounded-xl bg-secondary/40 border border-border/50">
                      <div className="text-2xl font-serif font-bold text-primary">{stat.count}</div>
                      <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wide mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mb-5">
                  <p className="text-xs uppercase tracking-widest font-mono text-muted-foreground mb-3">Shared with</p>
                  <div className="flex flex-col gap-2">
                    {["Mike", "Sarah", "Field Crew"].map((name) => (
                      <div key={name} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/40">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold">
                          {name[0]}
                        </div>
                        <span className="text-sm font-medium">{name}</span>
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary/60" />
                      </div>
                    ))}
                  </div>
                </div>

                <Button size="sm" className="w-full rounded-full" data-testid="share-map-btn">
                  <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share Map
                </Button>
              </div>
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-primary/5 blur-2xl" />
            </motion.div>

            <motion.div variants={fadeIn} className="order-1 md:order-2">
              <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Sharing</span>
              <h2 className="text-3xl md:text-5xl font-serif mb-6 leading-tight text-balance">
                Be there without being there.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-6 font-light">
                A manager, estimator, or experienced crew member can map a site once and give someone else everything they need to return later.
              </p>
              <div className="grid gap-3">
                <div className="rounded-xl border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe2 className="w-4 h-4 text-primary" />
                    <span className="font-semibold">Public routes · Free</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Publish a route to the community library and share it with anyone.
                  </p>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Lock className="w-4 h-4 text-primary" />
                    <span className="font-semibold">Private projects · $19 for 180 days</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Send a secure, view-only link to unlimited recipients. No account required — and you can revoke access whenever the project changes.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Real-World Workflows ────────────────────────────────────────── */}
      <section id="use-cases" className="py-28 px-6 bg-secondary/20 scroll-mt-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <motion.div variants={fadeIn} className="text-center mb-16">
            <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Use cases</span>
            <h2 className="text-3xl md:text-5xl font-serif text-balance leading-tight">
              See how teams use it.
            </h2>
          </motion.div>

          <div className="relative">
            <div
              ref={workflowCarouselRef}
              className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-5 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Field mapping use cases"
            >
              {WORKFLOWS.map((wf) => (
                <a
                  key={wf.role}
                  href={`/use-cases/${wf.slug}`}
                  className="group flex-none w-[min(84vw,340px)] sm:w-[320px] lg:w-[calc((100%-3.75rem)/4)] snap-start focus:outline-none"
                  data-testid={`workflow-${wf.role.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <motion.article
                    variants={fadeIn}
                    className="h-full p-7 rounded-2xl bg-card border border-border shadow-sm transition-all group-hover:-translate-y-1 group-hover:border-primary/40 group-focus-visible:ring-2 group-focus-visible:ring-primary"
                  >
                    <h3 className="font-serif text-lg mb-5">{wf.role}</h3>
                    <ol className="space-y-3">
                      {wf.steps.map((step, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold font-mono flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-muted-foreground leading-relaxed font-light">{step}</span>
                        </li>
                      ))}
                    </ol>
                    <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      View use case <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </motion.article>
                </a>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <a href="/use-cases" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
                Explore all use cases
              </a>
              <div className="hidden sm:flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => scrollUseCases("back")}
                  aria-label="Previous use cases"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => scrollUseCases("forward")}
                  aria-label="Next use cases"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Teams ───────────────────────────────────────────────────────── */}
      <section id="teams" className="py-28 px-6 bg-primary/5 border-y border-border/50 scroll-mt-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto"
        >
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div variants={fadeIn}>
              <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Coming Soon</span>
              <h2 className="text-3xl md:text-5xl font-serif mb-6 leading-tight text-balance">
                mapper.one for Teams
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-6 font-light">
                Give your entire crew a shared understanding of the places you manage. Turn individual field knowledge into shared company knowledge.
              </p>
              <div className="grid grid-cols-2 gap-2.5 mb-8">
                {TEAMS_FEATURES.map((feat) => (
                  <div key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    {feat}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/70 font-light italic">
                Teams features are upcoming — current app ships today with individual field mapping.
              </p>
            </motion.div>

            <motion.div variants={fadeIn} className="rounded-2xl border border-border bg-card p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-primary" />
                <h3 className="font-serif text-xl">Join the early access list</h3>
              </div>
              <p className="text-sm text-muted-foreground font-light mb-6 leading-relaxed">
                We're recruiting a small group of field teams to help us design the commercial product. Enter your email and we'll reach out.
              </p>
              {teamsSubmitted ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                    <Check className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">You're on the list.</p>
                    <p className="text-xs text-muted-foreground font-light">We've saved your interest. We'll be in touch when Teams is ready.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleTeamsSubmit} className="flex flex-col gap-3" data-testid="teams-signup-form">
                  <input
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={teamsEmail}
                    onChange={(e) => setTeamsEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-full border border-border bg-background text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid="teams-email-input"
                  />
                  <label className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
                    <input
                      type="checkbox"
                      required
                      checked={teamsConsented}
                      onChange={(event) => setTeamsConsented(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                      data-testid="teams-consent-input"
                    />
                    <span>I agree that mapper.one may contact me about Teams early access.</span>
                  </label>
                  {teamsError ? (
                    <p className="px-1 text-xs text-destructive" role="alert">
                      {teamsError}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={teamsSubmitting}
                    className="w-full rounded-full"
                    data-testid="teams-signup-submit"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {teamsSubmitting ? "Joining…" : "Join Teams Early Access"}
                  </Button>
                </form>
              )}
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Community Maps ──────────────────────────────────────────────── */}
      <section id="community" className="py-24 px-6 border-b border-border/50">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <motion.div variants={fadeIn} className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-5 h-5 text-primary" />
                <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary">Open Data</span>
              </div>
              <h2 className="text-3xl md:text-5xl font-serif mb-4">Community Maps</h2>
              <p className="text-lg text-muted-foreground max-w-2xl font-light">
                Routes, boundaries, and datasets shared by the mapper.one community.
                {datasets && datasets.length > 0 && ` ${datasets.length} contributions and counting.`}
              </p>
            </div>
            <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-full px-6">
              <a href="#get-app">Share a Dataset</a>
            </Button>
          </motion.div>

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 rounded-2xl bg-secondary/50 animate-pulse border border-border/50" />
              ))}
            </div>
          ) : datasets && datasets.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {datasets.map((dataset) => (
                <motion.a
                  key={dataset.id}
                  href={`/maps/${dataset.id}`}
                  variants={fadeIn}
                  className="group relative bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 hover:border-primary/40 flex flex-col h-full"
                  data-testid={`dataset-card-${dataset.id}`}
                >
                  <div className="mb-4">
                    <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary text-xs font-mono font-medium rounded-full mb-4 uppercase tracking-wider">
                      {dataset.format}
                    </span>
                    <h3 className="text-xl font-serif font-medium group-hover:text-primary transition-colors line-clamp-2 leading-tight">
                      {dataset.name}
                    </h3>
                    {dataset.author && (
                      <p className="text-sm text-muted-foreground mt-2 font-mono">By {dataset.author}</p>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm flex-grow line-clamp-3 mb-6 font-light leading-relaxed">
                    {datasetSummaryText(dataset)}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mt-auto pt-4 border-t border-border/50">
                    <span>{dataset.featureCount} feats</span>
                    <span>{formatBytes(dataset.sizeBytes)}</span>
                    <span className="flex items-center bg-secondary/50 px-2 py-1 rounded-full">
                      <Download className="w-3 h-3 mr-1" />
                      {dataset.downloadCount}
                    </span>
                  </div>
                </motion.a>
              ))}
            </div>
          ) : (
            <motion.div variants={fadeIn} className="text-center py-32 bg-card rounded-3xl border border-dashed border-border shadow-sm">
              <Map className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
              <h3 className="text-2xl font-serif mb-3">The map is blank</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto font-light text-lg">
                Be the first to share a dataset with the community.
              </p>
              <Button asChild size="lg" className="rounded-full px-8">
                <a href="#get-app">Open App to Share</a>
              </Button>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* ── Recreation ─────────────────────────────────────────────────── */}
      <section id="recreation" className="py-28 px-6 bg-card border-b border-border/50 scroll-mt-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-7xl mx-auto"
        >
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div variants={fadeIn}>
              <span className="uppercase tracking-widest text-xs font-mono font-bold text-primary mb-4 block">Recreation</span>
              <h2 className="text-3xl md:text-5xl font-serif mb-6 leading-tight text-balance">
                And when work ends, keep exploring.
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed mb-8 font-light">
                Built for the field. Useful wherever you go.
                The same tool that maps your job site is ready for the weekend.
              </p>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                {RECREATION_USES.map((use) => (
                  <div key={use} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                    {use}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              variants={fadeIn}
              className="rounded-2xl overflow-hidden border-2 border-border/40 shadow-2xl relative aspect-[4/3] rotate-1 hover:rotate-0 transition-transform duration-700 ease-out"
            >
              <img
                src="/trailhead-map.png"
                alt="Topographic map on a wooden table at a trailhead"
                className="object-cover w-full h-full"
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-2xl" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ── Get the App ─────────────────────────────────────────────────── */}
      <section id="get-app" className="py-32 px-6 bg-foreground text-background text-center relative overflow-hidden scroll-mt-20">
        <div
          className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: "url(/hero-topo.png)", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-6xl mx-auto relative z-10"
        >
          <motion.div variants={fadeIn} className="max-w-4xl mx-auto text-center">
            <img
              src={appIcon}
              alt="mapper.one app icon"
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl mx-auto mb-8 shadow-2xl border border-background/10"
            />
            <div className="uppercase tracking-[0.28em] text-xs font-mono font-bold text-background/70 mb-5">
              Take it outside
            </div>
            <h2 className="text-4xl md:text-6xl font-serif mb-6 text-balance leading-[1.05] text-background">
              Ready for the wild?
            </h2>
            <p className="text-xl text-background/80 font-light max-w-xl mx-auto leading-relaxed text-balance">
              Take your routes, maps, and field notes wherever the trail leads.
            </p>
          </motion.div>

          <motion.div variants={fadeIn} className="mt-12">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-background text-foreground hover:bg-background/90 px-6 py-3.5 rounded-2xl font-semibold transition-transform hover:-translate-y-1 shadow-xl shadow-background/10 w-full sm:flex-1 justify-center"
                data-testid="app-store-link"
              >
                <SiApple className="w-6 h-6" />
                <span className="text-left flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider opacity-70 leading-none mb-0.5">Download on the</span>
                  <span className="text-base leading-none">App Store</span>
                </span>
              </a>
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-background text-foreground hover:bg-background/90 px-6 py-3.5 rounded-2xl font-semibold transition-transform hover:-translate-y-1 shadow-xl shadow-background/10 w-full sm:flex-1 justify-center"
                data-testid="google-play-link"
              >
                <SiGoogleplay className="w-6 h-6" />
                <span className="text-left flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider opacity-70 leading-none mb-0.5">Get it on</span>
                  <span className="text-base leading-none">Google Play</span>
                </span>
              </a>
            </div>
          </motion.div>

          <motion.div variants={fadeIn} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="/commercial"
              className="inline-flex h-12 items-center justify-center rounded-full border border-background/20 px-6 text-sm font-semibold text-background transition-colors hover:bg-background/10"
              data-testid="link-organizations-from-get-app"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Explore mapper.one for organizations
              <ChevronRight className="w-4 h-4 ml-2" />
            </a>
            <span className="hidden sm:block h-5 w-px bg-background/20" aria-hidden="true" />
            <span className="text-sm text-background/60">Free, open-source, and offline-ready.</span>
          </motion.div>

          <motion.div variants={fadeIn} className="mt-14 pt-8 border-t border-background/15 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-background/10 border border-background/15">
              <Heart className="w-4 h-4 text-background/80" />
            </div>
            <p className="text-sm text-background/65 font-light">
              mapper.one is free to use. Help keep the servers running.
            </p>
            <Button asChild variant="ghost" className="rounded-full px-5 text-background hover:bg-background/10 hover:text-background">
              <Link href="/support">Support the project</Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-foreground text-background">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2 variants={fadeIn} className="text-4xl md:text-6xl font-serif text-balance leading-tight mb-6 text-background">
            Your work has a map.
          </motion.h2>
          <motion.p variants={fadeIn} className="text-xl text-muted font-light leading-relaxed mb-12">
            Start building it with mapper.one.
          </motion.p>
          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="h-14 px-10 text-base font-semibold rounded-full" data-testid="final-cta-get-app">
              <a href="#get-app">
                <Smartphone className="w-5 h-5 mr-2" /> Get mapper.one
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-10 text-base font-semibold rounded-full border-white/20 text-background hover:bg-white/10"
            >
              <a href="#teams" data-testid="final-cta-teams">
                <Users className="w-5 h-5 mr-2" /> Explore Teams
              </a>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="py-14 px-6 bg-background border-t border-border/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 mb-10">
            <div className="flex items-center gap-2">
              <Compass className="w-6 h-6 text-primary" />
              <div>
                <div className="font-serif font-semibold text-lg leading-tight">mapper.one</div>
                <div className="text-xs text-muted-foreground font-light">Map the places where you work.</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-12 gap-y-3 text-sm text-muted-foreground">
              <a href="#industries" className="hover:text-foreground transition-colors">Industries</a>
              <a href="#teams" className="hover:text-foreground transition-colors">Teams</a>
              <Link href="/" className="hover:text-foreground transition-colors">Recreation</Link>
               <Link href="/trails" className="hover:text-foreground transition-colors">Trails</Link>
              <a href="/use-cases" className="hover:text-foreground transition-colors">Use Cases</a>
               <Link href="/sitemap" className="hover:text-foreground transition-colors">Sitemap</Link>
              <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <a href="mailto:info@advcollective.com" className="hover:text-foreground transition-colors col-span-2 sm:col-span-1">Contact</a>
            </div>
          </div>

          <div className="pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground/70">
            <span>© {new Date().getFullYear()} The Adventure Collective. Map the places where you work.</span>
            <span>Part of <a href="https://advcollective.com" className="hover:text-foreground transition-colors">The Adventure Collective</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
