import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Compass, Database, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type AuthUser = { id: string; email: string | null; firstName: string | null };
type Scope = "route_data" | "private_projects" | "all_cloud_data";

const scopeDetails: Array<{ value: Scope; title: string; description: string }> = [
  {
    value: "route_data",
    title: "My routes and map data",
    description: "Saved routes, imported datasets, waypoints, and offline-region records. Public community listings use a separate removal request.",
  },
  {
    value: "private_projects",
    title: "My private project links",
    description: "Private project-link records you created. Shared field projects are not removed.",
  },
  {
    value: "all_cloud_data",
    title: "All of my personal cloud data",
    description: "Both categories above, plus your memberships in shared field projects.",
  },
];

export default function DeleteData() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [scope, setScope] = useState<Scope>("all_cloud_data");
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deletedScope, setDeletedScope] = useState<Scope | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Delete your data | mapper.one";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Request deletion of selected mapper.one cloud data without deleting your account.",
    );
    fetch("/api/auth/user", { credentials: "include" })
      .then(async (response) => response.ok ? response.json() as Promise<{ user: AuthUser | null }> : { user: null })
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  async function deleteData() {
    if (confirmation !== "DELETE DATA") return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/data", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "We could not delete that data.");
      setDeletedScope(scope);
      setConfirmation("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not delete that data.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-serif text-lg font-semibold">
            <Compass className="h-5 w-5 text-primary" /> mapper.one
          </Link>
          <Link href="/delete-account" className="text-sm font-medium text-muted-foreground hover:text-foreground">Delete account instead</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="font-mono text-xs font-bold tracking-[.16em] text-primary">PERSONAL DATA CONTROL</p>
        <h1 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-6xl">Delete selected data</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Remove personal data stored in mapper.one without deleting your account. This does not remove files or maps stored only on your device.
        </p>

        <section className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3"><Database className="h-6 w-6 text-primary" /><h2 className="text-2xl font-serif">Choose what to remove</h2></div>
          <div className="mt-5 space-y-3">
            {scopeDetails.map((item) => (
              <label key={item.value} className={`block cursor-pointer rounded-xl border p-4 transition ${scope === item.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                <span className="flex gap-3">
                  <input type="radio" name="scope" value={item.value} checked={scope === item.value} onChange={() => setScope(item.value)} className="mt-1 accent-primary" />
                  <span><strong className="block text-foreground">{item.title}</strong><span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.description}</span></span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-700" /> Shared data stays available to the team</div>
            <p className="mt-1">Shared field projects and their reports are not deleted when you remove personal data, so other project members can keep working. Published community listings are separate public records; email <a className="font-medium text-primary underline underline-offset-4" href="mailto:info@advcollective.com?subject=mapper.one%20community%20listing%20removal%20request">info@advcollective.com</a> to request their removal. Payment records and legally required records may be retained.</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8">
          {deletedScope ? (
            <div>
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <h2 className="mt-3 text-2xl font-serif">Your selected data was deleted</h2>
              <p className="mt-2 text-muted-foreground">Your mapper.one account is still active. You can continue using the app or remove another category.</p>
              <Button className="mt-5 rounded-full" onClick={() => navigate("/")}>Return home</Button>
            </div>
          ) : user === undefined ? (
            <div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />Checking your sign-in status…</div>
          ) : user ? (
            <div>
              <h2 className="text-2xl font-serif">Confirm data deletion</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Signed in as {user.email ?? user.firstName ?? "your account"}. Type <strong className="text-foreground">DELETE DATA</strong> to enable the deletion button.</p>
              <label className="mt-5 block">
                <span className="sr-only">Type DELETE DATA to confirm</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type DELETE DATA" className="h-11 w-full rounded-lg border border-border bg-background px-3 outline-none ring-primary/30 focus:ring-4" />
              </label>
              {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
              <Button variant="destructive" disabled={confirmation !== "DELETE DATA" || deleting} onClick={deleteData} className="mt-5 rounded-full">
                {deleting ? "Deleting data…" : "Delete selected data"}
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-serif">Sign in to delete data</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">For your security, data deletion requires signing in first. If you cannot access your account, email <a className="font-medium text-primary underline underline-offset-4" href="mailto:info@advcollective.com?subject=mapper.one%20data%20deletion%20request">info@advcollective.com</a> from the address associated with it.</p>
              <Button asChild className="mt-5 rounded-full">
                <a href="/api/login?returnTo=/delete-data">Sign in to continue</a>
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}