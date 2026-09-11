import { Link, useParams } from "wouter";
import ReactMarkdown from "react-markdown";
import { useGetBlogPost } from "@workspace/api-client-react";
import { Compass, MapPin, Mountain, Route as RouteIcon, ArrowLeft, BookOpen, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

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

export default function BlogArticle() {
  const params = useParams();
  const slug = params.slug ?? "";
  const { data: post, isLoading, isError } = useGetBlogPost(slug);

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
            <Link href="/blog" aria-label="Field Notes" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 p-2 sm:p-0">
              <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">Field Notes</span>
            </Link>
            <Button asChild size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5">
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      {isLoading ? (
        <div className="max-w-3xl mx-auto px-6 pt-36 pb-32">
          <div className="h-10 w-3/4 rounded-lg bg-secondary/50 animate-pulse mb-6" />
          <div className="h-72 rounded-2xl bg-secondary/50 animate-pulse mb-8" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 rounded bg-secondary/50 animate-pulse" style={{ width: `${90 - i * 5}%` }} />
            ))}
          </div>
        </div>
      ) : isError || !post ? (
        <div className="max-w-3xl mx-auto px-6 pt-44 pb-32 text-center">
          <Mountain className="w-16 h-16 text-muted-foreground/30 mx-auto mb-6" />
          <h1 className="text-3xl font-serif mb-3">Trail not found</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto font-light text-lg">
            This field note may have been moved or never made it off the mountain.
          </p>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/blog">Back to Field Notes</Link>
          </Button>
        </div>
      ) : (
        <article>
          {/* Hero */}
          <header className="relative pt-32 pb-12 md:pt-40 md:pb-16 px-6 overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-[0.04] pointer-events-none"
                 style={{ backgroundImage: "url(/hero-topo.png)", backgroundSize: "cover", backgroundPosition: "center" }} />
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="max-w-3xl mx-auto relative z-10">
              <Link href="/blog" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" /> All Field Notes
              </Link>
              <h1 className="text-4xl md:text-5xl font-serif text-balance leading-[1.1] mb-6">{post.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground font-mono flex-wrap">
                <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(post.createdAt)}</span>
                {post.author && <span className="flex items-center gap-1.5"><User className="w-4 h-4" />{post.author}</span>}
                {post.locationName && <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{post.locationName}</span>}
              </div>
            </motion.div>
          </header>

          {/* Stats */}
          {(formatDistance(post.distanceMeters) || post.elevationGainMeters != null) && (
            <div className="max-w-3xl mx-auto px-6 mb-10">
              <div className="flex flex-wrap gap-3">
                {formatDistance(post.distanceMeters) && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 text-sm font-medium">
                    <RouteIcon className="w-4 h-4 text-primary" /> {formatDistance(post.distanceMeters)}
                  </div>
                )}
                {post.elevationGainMeters != null && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 text-sm font-medium">
                    <Mountain className="w-4 h-4 text-primary" /> {Math.round(post.elevationGainMeters)} m gain
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cover */}
          {post.coverImageUrl && (
            <figure className="max-w-4xl mx-auto px-6 mb-12">
              <div className="rounded-2xl overflow-hidden border border-border shadow-2xl aspect-[16/9]">
                <img src={post.coverImageUrl} alt={post.imageCaptions?.[0] || post.title} className="object-cover w-full h-full" />
              </div>
              {post.imageCaptions?.[0] && (
                <figcaption className="mt-3 text-center text-sm text-muted-foreground font-light italic">
                  {post.imageCaptions[0]}
                </figcaption>
              )}
            </figure>
          )}

          {/* Body */}
          <div className="max-w-3xl mx-auto px-6 pb-16">
            <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-serif prose-headings:font-medium prose-p:font-light prose-p:leading-relaxed prose-a:text-primary">
              <ReactMarkdown>{post.content}</ReactMarkdown>
            </div>
          </div>

          {/* Gallery */}
          {post.imageUrls.length > 1 && (
            <div className="max-w-4xl mx-auto px-6 pb-16">
              <h2 className="text-2xl font-serif mb-6">From the trail</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {post.imageUrls.map((url, i) => {
                  const caption = post.imageCaptions?.[i];
                  return (
                    <figure key={i} className="flex flex-col gap-2">
                      <div className="rounded-xl overflow-hidden border border-border aspect-square bg-secondary/40">
                        <img src={url} alt={caption || `Trail photo ${i + 1}`} className="object-cover w-full h-full hover:scale-105 transition-transform duration-700" loading="lazy" />
                      </div>
                      {caption && (
                        <figcaption className="text-sm text-muted-foreground font-light italic leading-snug">
                          {caption}
                        </figcaption>
                      )}
                    </figure>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="max-w-3xl mx-auto px-6 pb-32">
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <h3 className="text-2xl font-serif mb-3">Map your own wild places</h3>
              <p className="text-muted-foreground font-light mb-6 max-w-lg mx-auto">
                mapper.one records your tracks offline and turns them into field notes like this one.
              </p>
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href="/#get-app">Get the App</Link>
              </Button>
            </div>
          </div>
        </article>
      )}

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
