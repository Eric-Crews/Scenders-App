import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, CheckCircle2, Compass, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AuthUser = { id: string; email: string | null; firstName: string | null };

export default function DeleteAccount() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Delete your account | mapper.one";
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      "Delete a mapper.one account and learn what account data is removed.",
    );
    fetch("/api/auth/user", { credentials: "include" })
      .then(async (response) => response.ok ? response.json() as Promise<{ user: AuthUser | null }> : { user: null })
      .then((data) => setUser(data.user))
      .catch(() => setUser(null));
  }, []);

  async function deleteAccount() {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "We could not delete your account.");
      setDeleted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not delete your account.");
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
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">Return home</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="font-mono text-xs font-bold tracking-[.16em] text-primary">ACCOUNT &amp; DATA DELETION</p>
        <h1 className="mt-3 max-w-2xl text-4xl leading-tight sm:text-6xl">Delete your mapper.one account</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          You can permanently delete your mapper.one account and its cloud-synced data. This action cannot be undone.
        </p>

        <section className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-serif">What is deleted</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            {[
              "Your account profile and active sign-in sessions.",
              "Cloud-synced routes, waypoints, datasets, and offline-region records.",
              "Private project links and data you own, including their associated route records.",
              "Your memberships in shared field projects. Reports in projects owned by other people stay with that project, with your account attribution removed.",
            ].map((item) => <li key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</li>)}
          </ul>
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-700" /> What may remain</div>
            <p className="mt-1">Maps and files saved only on your device are not controlled by your online account; remove them in the app or uninstall the app. Payment records may be retained by payment providers where legally required.</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 sm:p-8">
          {deleted ? (
            <div>
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <h2 className="mt-3 text-2xl font-serif">Your account has been deleted</h2>
              <p className="mt-2 text-muted-foreground">You have been signed out and your cloud-synced account data has been removed.</p>
              <Button className="mt-5 rounded-full" onClick={() => navigate("/")}>Return home</Button>
            </div>
          ) : user === undefined ? (
            <div className="flex items-center gap-3 text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin" />Checking your sign-in status…</div>
          ) : user ? (
            <div>
              <div className="flex items-center gap-3"><Trash2 className="h-6 w-6 text-destructive" /><h2 className="text-2xl font-serif">Confirm permanent deletion</h2></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Signed in as {user.email ?? user.firstName ?? "your account"}. Type <strong className="text-foreground">DELETE</strong> to enable the deletion button.</p>
              <label className="mt-5 block">
                <span className="sr-only">Type DELETE to confirm</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type DELETE" className="h-11 w-full rounded-lg border border-border bg-background px-3 outline-none ring-primary/30 focus:ring-4" />
              </label>
              {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
              <Button variant="destructive" disabled={confirmation !== "DELETE" || deleting} onClick={deleteAccount} className="mt-5 rounded-full">
                {deleting ? "Deleting account…" : "Permanently delete my account"}
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-serif">Sign in to delete your account</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">For your security, account deletion requires signing in first. If you cannot access the email or sign-in method for this account, email <a className="font-medium text-primary underline underline-offset-4" href="mailto:info@advcollective.com?subject=mapper.one%20account%20deletion%20request">info@advcollective.com</a> from the address associated with the account.</p>
              <Button asChild className="mt-5 rounded-full">
                <a href="/api/login?returnTo=/delete-account">Sign in to continue</a>
              </Button>
              <p className="mt-4 text-sm text-muted-foreground">
                Want to keep your account but remove selected cloud data?{" "}
                <Link className="font-medium text-primary underline underline-offset-4" href="/delete-data">Request data deletion</Link>.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}