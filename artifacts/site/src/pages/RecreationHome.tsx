import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "wouter";
import { motion, useScroll } from "framer-motion";
import {
  Camera,
  ChevronRight,
  Compass,
  Fish,
  Footprints,
  History,
  MapPin,
  Mountain,
  Navigation,
  Route,
  Share2,
  Snowflake,
  Waves,
  Trees,
  WifiOff,
  Layers,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiApple, SiGoogleplay } from "react-icons/si";

import heroBg from "@assets/mapper-one-hero-nature.jpg";
import appIcon from "@assets/1024x1024bb_1787259211089.png";
import screenMain from "@assets/0x0ss_1787259211089.png";
import screenTopo from "@assets/0x0ss_(1)_1787259211089.png";
import screenLibrary from "@assets/0x0ss_(2)_1787259211089.png";
import screenOffline from "@assets/0x0ss_(3)_1787259211089.png";
import screenWaypoint from "@assets/0x0ss_(5)_1787259211088.png";
import screenRouteDetail from "@assets/0x0ss_(7)_1787259211087.png";
import screenPlot from "@assets/0x0ss_(8)_1787259211087.png";

const APP_STORE_URL = "https://apps.apple.com/us/app/mapper-one/id6778850829";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.mapper.one";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const scrollToDownload = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const el = document.getElementById("download");
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

const ACTIVITIES = [
  {
    icon: Mountain,
    title: "Rock climbing",
    slug: "rock-climbing",
    intro: "Create routes to climbing areas and leave a useful record for the next visit.",
    steps: [
      "Map the approach to a crag, boulder field, or wall",
      "Drop photo waypoints at the start of each climb",
      "Keep route notes and access details with the map",
    ],
  },
  {
    icon: Footprints,
    title: "Hiking",
    slug: "hiking",
    intro: "Keep the whole day outside in one place, from the trailhead to the last overlook.",
    steps: [
      "Track a hike or plot a route before you go",
      "Use offline maps when the signal disappears",
      "Add photos and notes to the places worth remembering",
    ],
  },
  {
    icon: Snowflake,
    title: "Skiing & winter sports",
    slug: "skiing-winter-sports",
    intro: "Record descents, winter approaches, and backcountry routes while the terrain is fresh.",
    steps: [
      "Track a descent or map a winter route",
      "Mark junctions, viewpoints, and decision points",
      "Share the route with the people heading out next",
    ],
  },
  {
    icon: Fish,
    title: "Fishing",
    slug: "fishing",
    intro: "Build a private fishing log that remembers exactly where the day happened.",
    steps: [
      "Save access points, pools, and productive water",
      "Log a catch with a waypoint, photo, and note",
      "Return to the same locations without relying on memory",
    ],
  },
  {
    icon: Waves,
    title: "Whitewater boating",
    slug: "whitewater-boating",
    intro: "Make a river map that carries your notes from scouting day to launch day.",
    steps: [
      "Map put-ins, take-outs, and the route between them",
      "Mark rapids and add photos from the bank",
      "Write notes on lines, hazards, and how to run them",
    ],
  },
  {
    icon: History,
    title: "Historical tours",
    slug: "historical-tours",
    intro: "Turn a walk through a place into a map of the stories that make it matter.",
    steps: [
      "Plot a route through historic sites and landmarks",
      "Attach photos, dates, and context to each stop",
      "Share a self-guided tour with friends or visitors",
    ],
  },
  {
    icon: Route,
    title: "Mountain biking",
    slug: "mountain-biking",
    intro: "Remember the ride as more than a line on a map, including the trail details you noticed.",
    steps: [
      "Track rides and plan connections between trails",
      "Mark hazards, crossings, and route decisions",
      "Add conditions and photos for the next ride",
    ],
  },
  {
    icon: Trees,
    title: "Hunting & wildlife",
    slug: "hunting-wildlife",
    intro: "Keep quiet access routes and wildlife observations organized without losing the context.",
    steps: [
      "Map access routes, blinds, and observation areas",
      "Record sightings and habitat notes at the location",
      "Keep a personal field record you can revisit season after season",
    ],
  },
];

const FEATURES = [
  {
    title: "Import your maps",
    description: "Bring in routes from any source — GPX from Garmin or Strava, KML/KMZ from Google Earth or Avenza, and GeoJSON from any GIS tool. Every feature, waypoint, and track renders immediately on a full-screen map.",
    icon: Route,
    image: screenPlot,
  },
  {
    title: "Offline-first",
    description: "Download map tiles for any region before you leave signal. Saved tiles live in durable device storage so they survive cache pressure — your maps are there when the trail goes dark.",
    icon: WifiOff,
    image: screenOffline,
  },
  {
    title: "Record your route",
    description: "Hit record and mapper.one traces your path with timestamps and elevation data. Drop waypoints mid-trip with photos and notes — field markers that stay attached to the track.",
    icon: Camera,
    image: screenWaypoint,
  },
  {
    title: "Community library",
    description: "Browse thousands of trails and overlanding roads contributed by the Adventure Collective and the open-data community. Filter by region, search by name, or let the app find routes near you. Download any route to your library with a single tap.",
    icon: Layers,
    image: screenLibrary,
  },
  {
    title: "Share what you find",
    description: "Publish your recorded tracks to the community so others can follow in your footsteps. Open-source, open-access, community-first.",
    icon: Navigation,
    image: screenRouteDetail,
  }
];

const PhoneFrame = ({ src, alt }: { src: string; alt: string }) => (
  <div className="relative mx-auto aspect-[9/19.5] w-full max-w-[280px] overflow-hidden rounded-[3rem] border-[8px] border-foreground/10 bg-background shadow-2xl ring-1 ring-border sm:max-w-[320px]">
    <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
  </div>
);

function ActivityCard({ activity, index }: { activity: typeof ACTIVITIES[number]; index: number }) {
  const Icon = activity.icon;

  return (
    <a
      href={`/use-cases/${activity.slug}`}
      className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
      data-testid={`card-recreation-${activity.slug}`}
    >
      <motion.article
        variants={fadeIn}
        className="flex h-full flex-col rounded-2xl border border-background/10 bg-background/5 p-6 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-[#7a9d7b]/40 group-hover:bg-background/10 group-hover:shadow-lg"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#7a9d7b]/25 bg-[#7a9d7b]/10 text-[#7a9d7b]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="font-mono text-xs tracking-widest text-background/50">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <h3 className="mb-2 font-serif text-xl text-background">{activity.title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-background/70">
          {activity.intro}
        </p>
        <ol className="mt-auto space-y-3 border-t border-background/10 pt-5">
          {activity.steps.map((step, stepIndex) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7a9d7b]/15 font-mono text-[10px] font-bold text-[#7a9d7b]">
                {stepIndex + 1}
              </span>
              <span className="leading-relaxed text-background/70">{step}</span>
            </li>
          ))}
        </ol>
        <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-[#7a9d7b]">
          Read the use case <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </motion.article>
    </a>
  );
}

const Nav = () => {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    return scrollY.on("change", (latest) => {
      setIsScrolled(latest > 50);
    });
  }, [scrollY]);

  return (
    <nav className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${isScrolled ? "border-b border-border/50 bg-background/95 py-3 shadow-sm backdrop-blur-md" : "bg-transparent py-5"}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2" data-testid="link-recreation-logo">
          <Compass className={`h-5 w-5 transition-colors ${isScrolled ? "text-primary" : "text-white group-hover:text-white/80"}`} aria-hidden="true" />
          <span className={`font-serif text-lg font-semibold tracking-wide transition-colors ${isScrolled ? "text-foreground" : "text-white"}`}>mapper.one</span>
        </Link>
        <div className={`hidden items-center gap-6 text-sm transition-colors md:flex ${isScrolled ? "text-muted-foreground" : "text-white/80"}`}>
          <a href="#activities" className={`transition-colors ${isScrolled ? "hover:text-foreground" : "hover:text-white"}`} data-testid="link-recreation-activities">
            Activities
          </a>
          <a href="#features" className={`transition-colors ${isScrolled ? "hover:text-foreground" : "hover:text-white"}`} data-testid="link-recreation-features">
            Features
          </a>
          <Link href="/trails" className={`transition-colors ${isScrolled ? "hover:text-foreground" : "hover:text-white"}`} data-testid="link-recreation-trails">
            Trails
          </Link>
          <Link href="/commercial" className={`transition-colors ${isScrolled ? "hover:text-foreground" : "hover:text-white"}`} data-testid="link-commercial-home">
            For organizations
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <div className={isScrolled ? "" : "hidden"}>
             <ThemeToggle />
          </div>
          <a
            href="#download"
            onClick={scrollToDownload}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${isScrolled ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90" : "bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"}`}
            data-testid="button-recreation-nav-app"
          >
            Get the App
          </a>
        </div>
      </div>
    </nav>
  );
};

const Hero = () => (
  <section className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 pb-12 pt-20">
    <div className="absolute inset-0 z-0">
      <img src={heroBg} alt="Wild places background" className="h-full w-full object-cover object-[65%_center]" />
      <div className="absolute inset-0 bg-black/60 md:bg-black/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />
    </div>

    <div className="relative z-10 mt-8 flex w-full max-w-4xl flex-col items-center text-center text-white sm:mt-12">
      <motion.img
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        src={appIcon}
        alt="mapper.one app icon"
        className="mb-8 h-24 w-24 rounded-[2rem] border border-white/20 shadow-2xl sm:h-32 sm:w-32"
      />
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="mb-6 max-w-3xl text-balance font-serif text-4xl leading-[1.05] tracking-tight !text-white drop-shadow-lg sm:text-6xl md:text-7xl"
      >
        Keep the places you love close.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="mb-12 max-w-2xl text-balance text-lg font-light leading-relaxed text-white/90 drop-shadow-md md:text-2xl"
      >
        Track the route, mark what mattered, and bring the whole day home with you. mapper.one is a free outdoor map for the places you climb, hike, ski, fish, paddle, and explore.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} className="w-full">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center gap-4 sm:flex-row">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="flex w-full flex-1 items-center justify-center gap-3 rounded-2xl bg-white px-6 py-3.5 font-semibold text-black shadow-xl transition-transform hover:-translate-y-1 hover:bg-white/90">
            <SiApple className="h-6 w-6" />
            <div className="flex flex-col text-left">
              <span className="mb-0.5 text-[10px] uppercase leading-none tracking-wider opacity-80">Download on the</span>
              <span className="text-base leading-none">App Store</span>
            </div>
          </a>
          <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" className="flex w-full flex-1 items-center justify-center gap-3 rounded-2xl bg-white px-6 py-3.5 font-semibold text-black shadow-xl transition-transform hover:-translate-y-1 hover:bg-white/90">
            <SiGoogleplay className="h-6 w-6" />
            <div className="flex flex-col text-left">
              <span className="mb-0.5 text-[10px] uppercase leading-none tracking-wider opacity-80">GET IT ON</span>
              <span className="text-base leading-none">Google Play</span>
            </div>
          </a>
        </div>
      </motion.div>
    </div>

    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 1 }} className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-white/50">
      <ChevronDown className="h-8 w-8 animate-bounce" />
    </motion.div>
  </section>
);

const ValueProps = () => (
  <section className="border-b border-border/60 bg-background px-6 py-10 text-foreground">
    <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-3">
      {[
        ["01", "Go farther", "Offline maps keep the route with you when the signal drops."],
        ["02", "Notice more", "Waypoints give every photo and note a place to belong."],
        ["03", "Return easily", "Save a day outside so the next visit starts with context."],
      ].map(([number, title, body]) => (
        <div key={number} className="flex gap-4 border-border/20 last:border-0 sm:border-r sm:pr-6">
          <span className="font-mono text-xs text-primary">{number}</span>
          <div>
            <h2 className="mb-1 font-serif text-lg">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>
      ))}
    </div>
  </section>
);

const ActivitiesSection = () => (
  <section id="activities" className="scroll-mt-16 bg-foreground px-6 py-28 text-background">
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={staggerContainer} className="mx-auto max-w-7xl">
      <motion.div variants={fadeIn} className="mb-16 max-w-3xl">
        <span className="mb-4 block font-mono text-xs font-bold uppercase tracking-widest text-[#7a9d7b]">Made for outside</span>
        <h2 className="mb-6 text-balance font-serif text-4xl leading-tight !text-background md:text-6xl">
          One map. A hundred ways to spend a day.
        </h2>
        <p className="max-w-2xl text-lg font-light leading-relaxed text-background/80">
          The best outdoor days are different every time. mapper.one gives each one the same useful foundation: a route, a location, and the story you want to remember.
        </p>
      </motion.div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIVITIES.map((activity, index) => (
          <ActivityCard key={activity.slug} activity={activity} index={index} />
        ))}
      </div>
    </motion.div>
  </section>
);

const PricingPromise = () => (
  <section className="relative border-b border-border/40 bg-background px-6 py-24 text-center">
    <div className="mx-auto max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}>
        <ShieldCheck className="mx-auto mb-6 h-12 w-12 text-primary" />
        <h2 className="mb-6 text-balance font-serif text-3xl text-foreground sm:text-5xl">
          Free forever.
        </h2>
        <p className="text-balance text-lg font-light leading-relaxed text-muted-foreground sm:text-xl">
          No ads. No subscriptions. No account required. mapper.one is a free, open-source field mapping app built for hikers, overlanders, and backcountry explorers. Standing on the shoulders of OpenStreetMap and the global open-data community.
        </p>
      </motion.div>
    </div>
  </section>
);

const FeatureRow = ({ feature, reversed }: { feature: typeof FEATURES[0]; reversed: boolean }) => {
  const Icon = feature.icon;
  return (
    <div className={`flex flex-col items-center gap-12 sm:gap-16 ${reversed ? "md:flex-row-reverse" : "md:flex-row"}`}>
      <motion.div initial={{ opacity: 0, x: reversed ? 40 : -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: "easeOut" }} className="flex-1 space-y-6 text-center md:text-left">
        <div className={`mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary md:mx-0 ${reversed ? "md:ml-auto" : ""}`}>
          <Icon className="h-7 w-7" />
        </div>
        <h3 className="text-balance font-serif text-3xl text-foreground sm:text-4xl">
          {feature.title}
        </h3>
        <p className="text-balance text-lg font-light leading-relaxed text-muted-foreground">
          {feature.description}
        </p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }} className="w-full flex-1">
        <PhoneFrame src={feature.image} alt={feature.title} />
      </motion.div>
    </div>
  );
};

const FeaturesSection = () => (
  <section id="features" className="scroll-mt-16 overflow-hidden bg-background px-4 py-24 sm:px-6 sm:py-32">
    <div className="mx-auto max-w-6xl space-y-32 sm:space-y-40">
      {FEATURES.map((feature, idx) => (
        <FeatureRow key={idx} feature={feature} reversed={idx % 2 !== 0} />
      ))}
    </div>
  </section>
);

const Gallery = () => (
  <section className="border-y border-border/50 bg-secondary/30 px-6 py-24">
    <div className="mx-auto mb-16 max-w-7xl text-center">
       <h2 className="mb-4 font-serif text-3xl text-foreground sm:text-5xl">A map for every trail day.</h2>
      <p className="mx-auto max-w-2xl text-lg font-light text-muted-foreground">
          Plan, navigate, and document the places that take you beyond the pavement.
      </p>
    </div>
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4">
      {[
        { src: screenMain, label: "Relief Details" },
        { src: screenTopo, label: "Topographic Maps" },
        { src: screenRouteDetail, label: "Route Statistics" },
        { src: screenLibrary, label: "Community Library" },
      ].map((item, idx) => (
        <motion.div key={idx} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: idx * 0.1 }} className="flex flex-col items-center gap-4">
          <div className="aspect-[9/19.5] w-full overflow-hidden rounded-3xl border-[6px] border-background bg-background shadow-lg ring-1 ring-border/50">
            <img src={item.src} alt={item.label} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <span className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:text-xs">{item.label}</span>
        </motion.div>
      ))}
    </div>
  </section>
);

const DownloadSection = () => (
  <section id="download" className="relative overflow-hidden bg-foreground px-6 py-32 text-center text-background">
    <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="relative z-10 mx-auto max-w-3xl">
      <img src={appIcon} alt="mapper.one" className="mx-auto mb-8 h-24 w-24 rounded-3xl border border-background/10 shadow-2xl sm:h-32 sm:w-32" />
      <h2 className="mb-6 text-balance font-serif text-4xl !text-background sm:text-6xl">Ready for the wild?</h2>
       <p className="mx-auto mb-12 max-w-xl text-balance text-xl font-light text-background/80">
         Take your routes, maps, and field notes wherever the trail leads.
      </p>
      <div className="mx-auto mb-8 flex w-full max-w-lg flex-col items-center justify-center gap-4 sm:flex-row">
        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="flex w-full flex-1 items-center justify-center gap-3 rounded-2xl bg-background px-6 py-3.5 font-semibold text-foreground shadow-xl transition-transform hover:-translate-y-1 hover:bg-background/90">
          <SiApple className="h-6 w-6" />
          <div className="flex flex-col text-left">
            <span className="mb-0.5 text-[10px] uppercase leading-none tracking-wider opacity-80">Download on the</span>
            <span className="text-base leading-none">App Store</span>
          </div>
        </a>
        <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" className="flex w-full flex-1 items-center justify-center gap-3 rounded-2xl bg-background px-6 py-3.5 font-semibold text-foreground shadow-xl transition-transform hover:-translate-y-1 hover:bg-background/90">
          <SiGoogleplay className="h-6 w-6" />
          <div className="flex flex-col text-left">
            <span className="mb-0.5 text-[10px] uppercase leading-none tracking-wider opacity-80">GET IT ON</span>
            <span className="text-base leading-none">Google Play</span>
          </div>
        </a>
      </div>

      <Button asChild variant="outline" size="lg" className="h-14 rounded-full border-background/20 px-9 text-base font-semibold text-background hover:bg-background/10" data-testid="button-recreation-commercial">
        <Link href="/commercial">Explore mapper.one for organizations <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
      </Button>
    </motion.div>
  </section>
);

const Footer = () => (
  <footer className="border-t border-border/50 bg-background px-6 py-14">
    <div className="mx-auto max-w-7xl">
      <div className="mb-10 flex flex-col items-start justify-between gap-10 md:flex-row">
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <div className="font-serif text-lg font-semibold leading-tight text-foreground">mapper.one</div>
            <div className="text-xs font-light text-muted-foreground">Your map for time outside.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm text-muted-foreground sm:grid-cols-3">
          <a href="#activities" className="transition-colors hover:text-foreground" data-testid="footer-link-recreation-activities">Activities</a>
          <a href="#features" className="transition-colors hover:text-foreground" data-testid="footer-link-recreation-features">Features</a>
          <Link href="/commercial" className="transition-colors hover:text-foreground" data-testid="footer-link-commercial">For organizations</Link>
          <Link href="/trails" className="transition-colors hover:text-foreground" data-testid="footer-link-recreation-trails">Trails</Link>
          <Link href="/support" className="transition-colors hover:text-foreground" data-testid="footer-link-recreation-support">Support</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground" data-testid="footer-link-recreation-privacy">Privacy</Link>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-6 text-xs text-muted-foreground/70 md:flex-row">
        <span>© {new Date().getFullYear()} The Adventure Collective. Your map for time outside.</span>
        <span className="flex items-center gap-2"><Share2 className="h-3 w-3" aria-hidden="true" /> Make a map worth sharing.</span>
      </div>
    </div>
  </footer>
);

export default function RecreationHome() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20 selection:text-primary-foreground">
      <Nav />
      <main>
        <Hero />
        <ValueProps />
        <ActivitiesSection />
        <PricingPromise />
        <FeaturesSection />
        <Gallery />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
