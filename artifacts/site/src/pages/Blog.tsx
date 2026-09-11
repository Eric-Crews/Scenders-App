import { Link } from "wouter";
import { useListBlogPosts } from "@workspace/api-client-react";
import { Compass, MapPin, Mountain, Route as RouteIcon, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

function formatDistance(meters: number | null) {
  if (meters == null) return null;
  const km = meters / 1000;
  return km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Blog() {
  const { data: posts, isLoading } = useListBlogPosts();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary-foreground">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">mapper.one</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-4">
            <Link href="/trails" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors p-2 sm:p-0">
              <span>Trails</span>
            </Link>
            <Link href="/blog" aria-label="Field Notes" className="text-sm font-medium text-foreground transition-colors flex items-center gap-1 p-2 sm:p-0">
              <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">Field Notes</span>
            </Link>
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5">
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="relative pt-32 pb-16 md:pt-44 md:pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-[0.04] pointer-events-none"
             style={{ backgroundImage: "url(/hero-topo.png)", backgroundSize: "cover", backgroundPosition: "center" }} />
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-4xl mx-auto relative z-10 text-center">
          <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-8 border border-border/50 backdrop-blur-sm">
            <BookOpen className="w-4 h-4" />
            <span>Field Notes from the community</span>
          </motion.div>
          <motion.h1 variants={fadeIn} className="text-4xl md:text-6xl font-serif text-balance leading-[1.05] text-foreground mb-6">
            Stories from the wild places.
          </motion.h1>
          <motion.p variants={fadeIn} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-sans font-light">
            Trip reports generated from real tracks recorded in the field with mapper.one &mdash; the routes, the climbs, and the moments along the way.
          </motion.p>
        </motion.div>
      </section>

      {/* Posts */}
      <section className="pb-32 px-6">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={staggerContainer} className="max-w-7xl mx-auto">
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 rounded-2xl bg-secondary/50 animate-pulse border border-border/50" />
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <motion.div key={post.id} variants={fadeIn}>
                  <Link href={`/blog/${post.slug}`} className="group relative block bg-card rounded-2xl border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 hover:border-primary/40 overflow-hidden h-full">
                    <div className="aspect-[16/10] overflow-hidden bg-secondary/40">
                      {post.coverImageUrl ? (
                        <img src={post.coverImageUrl} alt={post.title} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mountain className="w-12 h-12 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex flex-col">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mb-3 flex-wrap">
                        <span>{formatDate(post.createdAt)}</span>
                        {post.locationName && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{post.locationName}</span>
                        )}
                      </div>
                      <h2 className="text-xl font-serif font-medium group-hover:text-primary transition-colors line-clamp-2 leading-tight mb-3">{post.title}</h2>
                      <p className="text-muted-foreground text-sm line-clamp-3 font-light leading-relaxed mb-5">{post.excerpt}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mt-auto pt-4 border-t border-border/50">
                        <div className="flex items-center gap-3">
                          {formatDistance(post.distanceMeters) && (
                            <span className="flex items-center gap-1"><RouteIcon className="w-3 h-3" />{formatDistance(post.distanceMeters)}</span>
                          )}
                          {post.elevationGainMeters != null && (
                            <span className="flex items-center gap-1"><Mountain className="w-3 h-3" />{Math.round(post.elevationGainMeters)} m</span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-primary font-medium group-hover:gap-2 transition-all">Read<ArrowRight className="w-3 h-3" /></span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div variants={fadeIn} className="text-center py-32 bg-card rounded-3xl border border-dashed border-border shadow-sm">
              <BookOpen className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
              <h3 className="text-2xl font-serif mb-3">No field notes yet</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto font-light text-lg">
                Record a track in the mapper.one app, publish it, then tap &ldquo;Create blog post&rdquo; to share your story here.
              </p>
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href="/#get-app">Get the App</Link>
              </Button>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 bg-background border-t border-border/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-primary" />
            <div className="flex flex-col">
              <span className="font-serif font-semibold text-lg leading-tight">mapper.one</span>
              <span className="text-xs text-muted-foreground font-light">Part of The Adventure Collective</span>
            </div>
          </Link>
          <p className="text-sm text-muted-foreground font-light text-center md:text-left max-w-md">
            © {new Date().getFullYear()} The Adventure Collective. Map the places where you work.
          </p>
          <a
            href="/use-cases"
            className="text-sm font-medium text-primary hover:underline underline-offset-4"
          >
            Use Cases
          </a>
        </div>
      </footer>
    </div>
  );
}
