import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Compass,
  WifiOff,
  Camera,
  Layers,
  Route,
  Navigation,
  ChevronDown,
  ShieldCheck,
  Heart,
} from "lucide-react";
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

const IOS_URL = "https://apps.apple.com/us/app/mapper-one/id6778850829";
const ANDROID_URL = "https://play.google.com/store/apps/details?id=com.mapper.one";

const scrollToDownload = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  const el = document.getElementById("download");
  if (el) {
    el.scrollIntoView({ behavior: "smooth" });
  }
};

const StoreButtons = ({ placement }: { placement: "hero" | "footer" }) => (
  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto">
    <a
      href={IOS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 px-6 py-3.5 rounded-2xl font-semibold transition-transform hover:-translate-y-1 shadow-xl shadow-foreground/10 w-full sm:flex-1 justify-center"
      data-testid={`link-ios-store-${placement}`}
    >
      <SiApple className="w-6 h-6" />
      <div className="text-left flex flex-col">
        <span className="text-[10px] uppercase tracking-wider opacity-80 leading-none mb-0.5">Download on the</span>
        <span className="text-base leading-none">App Store</span>
      </div>
    </a>
    <a
      href={ANDROID_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-foreground text-background hover:bg-foreground/90 px-6 py-3.5 rounded-2xl font-semibold transition-transform hover:-translate-y-1 shadow-xl shadow-foreground/10 w-full sm:flex-1 justify-center"
      data-testid={`link-android-store-${placement}`}
    >
      <SiGoogleplay className="w-6 h-6" />
      <div className="text-left flex flex-col">
        <span className="text-[10px] uppercase tracking-wider opacity-80 leading-none mb-0.5">GET IT ON</span>
        <span className="text-base leading-none">Google Play</span>
      </div>
    </a>
  </div>
);

const PhoneFrame = ({ src, alt }: { src: string; alt: string }) => (
  <div className="relative mx-auto w-full max-w-[280px] sm:max-w-[320px] aspect-[9/19.5] rounded-[3rem] border-[8px] border-foreground/10 bg-background shadow-2xl overflow-hidden ring-1 ring-border">
    <img src={src} alt={alt} className="w-full h-full object-cover" loading="lazy" />
  </div>
);

const Nav = () => {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    return scrollY.on("change", (latest) => {
      setIsScrolled(latest > 100);
    });
  }, [scrollY]);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-background/90 backdrop-blur-md border-b border-border/50 py-3" : "bg-transparent py-5"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group" data-testid="link-home-from-app-nav">
          <Compass className={`w-6 h-6 transition-colors ${isScrolled ? "text-primary" : "text-white group-hover:text-white/80"}`} />
          <span className={`font-serif font-semibold text-xl tracking-wide transition-colors ${isScrolled ? "text-foreground" : "text-white"}`}>
            mapper.one
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="#download"
            onClick={scrollToDownload}
            className={`text-sm font-semibold px-5 py-2.5 rounded-full transition-colors ${isScrolled ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md" : "bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"}`}
            data-testid="nav-get-app"
          >
            Get the App
          </a>
        </div>
      </div>
    </nav>
  );
};

const Hero = () => {
  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden pt-20 pb-12 px-4">
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="Wild places background" 
          className="h-full w-full object-cover object-[65%_center]"
        />
        <div className="absolute inset-0 bg-black/60 md:bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/20 to-background" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto text-white mt-8 sm:mt-12">
        <motion.img
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          src={appIcon}
          alt="mapper.one app icon"
          className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] shadow-2xl mb-8 border border-white/20"
        />
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-4 text-balance font-serif text-4xl tracking-tight !text-white drop-shadow-lg sm:text-6xl md:text-7xl uppercase"
        >
          Free open-source trail maps
        </motion.h1>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8 font-sans text-xl font-light tracking-widest !text-white drop-shadow-md sm:text-2xl uppercase"
        >
          For the wild places
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-lg md:text-xl text-white/80 font-light max-w-2xl text-balance mb-12 drop-shadow-md leading-relaxed"
        >
          Import GPX, KML &amp; GeoJSON routes, cache offline tiles, record tracks, drop waypoints — and browse community adventures.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="w-full"
        >
          <StoreButtons placement="hero" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/50"
      >
        <ChevronDown className="w-8 h-8 animate-bounce" />
      </motion.div>
    </section>
  );
};

const PricingPromise = () => (
  <section className="py-24 px-6 bg-background text-center border-b border-border/40 relative">
    <div className="max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
      >
        <ShieldCheck className="w-12 h-12 text-primary mx-auto mb-6" />
        <h2 className="text-3xl sm:text-5xl font-serif text-foreground mb-6 text-balance">
          Free forever.
        </h2>
        <p className="text-lg sm:text-xl text-muted-foreground font-light leading-relaxed text-balance">
          No ads. No subscriptions. No account required. mapper.one is a free, open-source field mapping app built for hikers, overlanders, and backcountry explorers. Standing on the shoulders of OpenStreetMap and the global open-data community.
        </p>
      </motion.div>
    </div>
  </section>
);

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

const FeatureRow = ({ feature, reversed }: { feature: typeof FEATURES[0], reversed: boolean }) => {
  const Icon = feature.icon;
  return (
    <div className={`flex flex-col gap-12 sm:gap-16 items-center ${reversed ? "md:flex-row-reverse" : "md:flex-row"}`}>
      <motion.div 
        initial={{ opacity: 0, x: reversed ? 40 : -40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="flex-1 space-y-6 text-center md:text-left"
      >
        <div className={`w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-6 ${reversed ? "md:ml-auto" : ""} mx-auto md:mx-0`}>
          <Icon className="w-7 h-7" />
        </div>
        <h3 className="text-3xl sm:text-4xl font-serif text-foreground text-balance">
          {feature.title}
        </h3>
        <p className="text-lg text-muted-foreground font-light leading-relaxed text-balance">
          {feature.description}
        </p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
        className="flex-1 w-full"
      >
        <PhoneFrame src={feature.image} alt={feature.title} />
      </motion.div>
    </div>
  );
};

const Features = () => (
  <section className="py-24 sm:py-32 px-4 sm:px-6 overflow-hidden bg-background">
    <div className="max-w-6xl mx-auto space-y-32 sm:space-y-40">
      {FEATURES.map((feature, idx) => (
        <FeatureRow key={idx} feature={feature} reversed={idx % 2 !== 0} />
      ))}
    </div>
  </section>
);

const Gallery = () => (
  <section className="py-24 px-6 bg-secondary/30 border-y border-border/50">
    <div className="max-w-7xl mx-auto text-center mb-16">
       <h2 className="text-3xl sm:text-5xl font-serif text-foreground mb-4">A map for every trail day.</h2>
      <p className="text-lg text-muted-foreground font-light max-w-2xl mx-auto">
          Plan, navigate, and document the places that take you beyond the pavement.
      </p>
    </div>
    
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8 max-w-6xl mx-auto">
      {[
        { src: screenMain, label: "Relief Details" },
        { src: screenTopo, label: "Topographic Maps" },
        { src: screenRouteDetail, label: "Route Statistics" },
        { src: screenLibrary, label: "Community Library" },
      ].map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-full aspect-[9/19.5] rounded-3xl border-[6px] border-background shadow-lg overflow-hidden ring-1 ring-border/50 bg-background">
            <img src={item.src} alt={item.label} className="w-full h-full object-cover" loading="lazy" />
          </div>
          <span className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">{item.label}</span>
        </motion.div>
      ))}
    </div>
  </section>
);

const DownloadSection = () => (
  <section id="download" className="py-32 px-6 bg-foreground text-background text-center relative overflow-hidden">
    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "url(/hero-topo.png)", backgroundSize: "cover" }} />
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="max-w-3xl mx-auto relative z-10"
    >
      <img src={appIcon} alt="mapper.one" className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl mx-auto mb-8 shadow-2xl border border-background/10" />
      <h2 className="text-4xl sm:text-6xl font-serif mb-6 text-balance !text-background">Ready for the wild?</h2>
       <p className="text-xl text-background/80 font-light mb-12 max-w-xl mx-auto text-balance">
         Take your routes, maps, and field notes wherever the trail leads.
      </p>
      
       <StoreButtons placement="footer" />
    </motion.div>
  </section>
);

const Footer = () => (
  <footer className="bg-background border-t border-border/50 py-12 px-6">
    <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
       <Link href="/" className="flex items-center gap-2" data-testid="link-home-from-app-footer">
        <Compass className="w-6 h-6 text-primary" />
        <span className="font-serif font-semibold text-xl">mapper.one</span>
      </Link>
       <p className="max-w-xl text-center text-sm leading-6 text-muted-foreground font-light" data-testid="footer-attribution">
         Built with deep gratitude to OpenStreetMap contributors, the Leaflet project, and every surveyor and trailblazer who mapped the wild places before us.
      </p>
       <Heart className="h-5 w-5 shrink-0 text-primary" aria-label="Built for the outdoors" />
    </div>
  </footer>
);

export default function AppLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <Nav />
      <Hero />
      <PricingPromise />
      <Features />
      <Gallery />
      <DownloadSection />
      <Footer />
    </div>
  );
}
