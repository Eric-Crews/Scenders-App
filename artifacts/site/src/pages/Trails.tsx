import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Compass, Mountain, Route as RouteIcon, Search, Download, AlertCircle, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type PublishedGuide = {
  slug: string;
  title: string;
  sourceType: "community_dataset" | "public_track";
  sourceId: string;
};

export default function Trails() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["published-trail-guides"],
    queryFn: async (): Promise<PublishedGuide[]> => {
      const response = await fetch("/api/trail-guides");
      if (!response.ok) throw new Error("Unable to load published trail guides.");
      return response.json() as Promise<PublishedGuide[]>;
    },
  });

  useEffect(() => {
    document.title = "Trails & routes | mapper.one";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Browse community trails and routes from mapper.one and The Adventure Collective.",
    );
  }, []);

  const trails = useMemo(() => {
    const term = query.toLowerCase();
    return (data ?? []).filter((item) => !term || item.title.toLowerCase().includes(term));
  },
  [data, query],
  );

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setQuery(search.trim());
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            <span className="font-serif text-lg font-semibold tracking-wide">mapper.one</span>
          </Link>
          <div className="flex items-center gap-3">
            <a href="/_admin/trail-guides/login" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">Guide admin</a>
            <Button asChild size="sm" className="rounded-full px-4 sm:px-5">
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section className="border-b border-border/60 bg-secondary/25 px-6 pb-14 pt-32 md:pb-20 md:pt-44">
          <div className="mx-auto max-w-5xl">
            <p className="mb-4 font-mono text-xs font-bold tracking-[.16em] text-primary">COMMUNITY TRAIL LIBRARY</p>
            <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">Find your next line.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Read source-linked, enhanced guides from The Adventure Collective and the mapper.one community.
            </p>
            <form onSubmit={submitSearch} className="mt-8 flex max-w-xl gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search trails</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by trail, place, or author"
                  className="h-12 w-full rounded-full border border-border bg-background pl-10 pr-4 outline-none ring-primary/30 focus:ring-4"
                />
              </label>
              <Button type="submit" className="h-12 rounded-full px-5">Search</Button>
            </form>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-12 md:py-16">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-serif">Enhanced trail guides</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {query ? `Results for “${query}”` : "Open any guide for planning notes, route facts, and sources."}
              </p>
            </div>
            {!isLoading && <span className="font-mono text-xs text-muted-foreground">{trails.length} routes</span>}
          </div>

          {isLoading ? (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-border bg-secondary/40" />)}
            </div>
          ) : isError ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
              <h3 className="mt-3 text-xl font-serif">The trail library is temporarily unavailable</h3>
              <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
            </div>
          ) : trails.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
              <Mountain className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <h3 className="mt-4 text-xl font-serif">No routes found</h3>
              <p className="mt-2 text-sm text-muted-foreground">Try another search, or come back after a guide has been published.</p>
              <Button variant="outline" className="mt-5 rounded-full" onClick={() => { setSearch(""); setQuery(""); }}>Clear search</Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {trails.map((trail) => (
                <a key={trail.slug} href={`/trails/${encodeURIComponent(trail.slug)}`} className="group flex min-h-64 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-mono text-[11px] text-secondary-foreground">
                      <RouteIcon className="h-3 w-3" /> Enhanced guide
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </div>
                  <h3 className="mt-5 line-clamp-2 text-2xl font-serif leading-tight">{trail.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    Open this guide for route facts, source links, and planning notes.
                  </p>
                  <span className="mt-auto border-t border-border/60 pt-4 text-xs font-semibold text-primary">Read trail guide</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-border/60 bg-secondary/20 px-6 py-14">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-xs font-bold tracking-[.16em] text-primary">TAKE IT OUTSIDE</p>
              <h2 className="mt-2 text-3xl font-serif">Your maps belong in the field.</h2>
              <p className="mt-2 max-w-xl text-muted-foreground">Save routes, download offline maps, and record what you find along the way.</p>
            </div>
            <Button asChild size="lg" className="rounded-full"><Link href="/#get-app"><Download className="mr-2 h-4 w-4" />Get mapper.one</Link></Button>
          </div>
        </section>
      </main>
    </div>
  );
}