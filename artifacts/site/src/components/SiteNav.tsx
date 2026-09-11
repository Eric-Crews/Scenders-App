import { useState } from "react";
import { Link } from "wouter";
import { Compass, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const PRIMARY_LINKS = [
  { label: "Activities", href: "/#activities" },
  { label: "Features", href: "/#features" },
  { label: "Trails", href: "/trails" },
  { label: "Use Cases", href: "/use-cases" },
  { label: "For organizations", href: "/commercial" },
];

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      data-site-navigation
      className="fixed left-0 right-0 top-0 z-[60] border-b border-border/60 bg-background/95 shadow-sm backdrop-blur-md"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2"
          data-testid="site-nav-logo"
        >
          <Compass className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="font-serif text-lg font-semibold tracking-wide">mapper.one</span>
        </Link>

        <div className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex">
          {PRIMARY_LINKS.map((link) =>
            link.href === "/use-cases" ? (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
                data-testid="site-nav-use-cases"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
                data-testid={`site-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {link.label}
              </Link>
            ),
          )}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href="/#download"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:px-5"
            data-testid="site-nav-get-app"
          >
            Get the App
          </a>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground lg:hidden"
            aria-expanded={open}
            aria-controls="site-mobile-navigation"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="site-mobile-navigation" className="border-t border-border/60 bg-background px-4 py-3 lg:hidden">
          <div className="mx-auto grid max-w-7xl gap-1">
            {PRIMARY_LINKS.map((link) =>
              link.href === "/use-cases" ? (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </nav>
  );
}