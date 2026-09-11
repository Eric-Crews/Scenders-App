import { useMemo, useState } from "react";
import SupportHub from "./SupportHub";
import { Link, useSearch } from "wouter";
import { useCreateDonationCheckout } from "@workspace/api-client-react";
import {
  Compass,
  Heart,
  Loader2,
  CheckCircle2,
  XCircle,
  Mountain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const PRESETS = [5, 10, 25, 50];
const MIN_USD = 1;
const MAX_USD = 100_000;

function LegacyDonationPage() {
  const search = useSearch();
  const status = useMemo(
    () => new URLSearchParams(search).get("status"),
    [search],
  );

  const [amount, setAmount] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);

  const donate = useCreateDonationCheckout({
    mutation: {
      onSuccess: ({ url }) => {
        window.location.href = url;
      },
      onError: (err) =>
        setFormError(
          err instanceof Error
            ? err.message
            : "Couldn't start checkout. Please try again.",
        ),
    },
  });

  const submit = () => {
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < MIN_USD) {
      setFormError(`Please enter an amount of at least $${MIN_USD}.`);
      return;
    }
    if (dollars > MAX_USD) {
      setFormError(`Please enter an amount no greater than $${MAX_USD.toLocaleString()}.`);
      return;
    }
    setFormError(null);
    donate.mutate({ data: { amountCents: Math.round(dollars * 100) } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20 selection:text-primary-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">
              mapper.one
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-4">
            <Button
              asChild
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 sm:px-5"
            >
              <Link href="/#get-app">Get the App</Link>
            </Button>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-10 md:pt-40 md:pb-12 px-6">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="max-w-2xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-6 border border-border/50">
            <Heart className="w-4 h-4" />
            <span>Support development</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-balance leading-[1.05] mb-4">
            Keep the maps free
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed font-light">
            mapper.one is free, open, and built on the shoulders of the
            open-data community. If it&rsquo;s earned a place in your pack, chip
            in whatever it&rsquo;s worth to you &mdash; one time, no account, no
            subscription.
          </p>
        </motion.div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-md mx-auto">
          {status === "success" && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-serif text-lg leading-snug">Thank you!</p>
                <p className="text-sm text-muted-foreground font-light">
                  Your donation keeps mapper.one free for the wild places. We
                  couldn&rsquo;t do this without you.
                </p>
              </div>
            </div>
          )}
          {status === "cancelled" && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <XCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-serif text-lg leading-snug">
                  No worries at all
                </p>
                <p className="text-sm text-muted-foreground font-light">
                  Your checkout was cancelled and you weren&rsquo;t charged. The
                  trail&rsquo;s still open whenever you&rsquo;re ready.
                </p>
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 sm:p-8">
            <label className="text-sm font-medium text-muted-foreground">
              Choose an amount
            </label>
            <div className="grid grid-cols-4 gap-2 mt-3 mb-5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setAmount(String(p));
                    setFormError(null);
                  }}
                  className={`rounded-xl border py-2.5 text-sm font-semibold transition-colors ${
                    Number(amount) === p
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border text-foreground hover:border-primary/50"
                  }`}
                >
                  ${p}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={MIN_USD}
                max={MAX_USD}
                step="1"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFormError(null);
                }}
                placeholder="Custom amount"
                className="w-full rounded-xl border border-border bg-background pl-8 pr-4 py-3 text-lg font-medium outline-none focus:border-primary/60"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive mt-3">{formError}</p>
            )}

            <Button
              onClick={submit}
              disabled={donate.isPending}
              className="w-full mt-5 rounded-full py-6 text-base"
            >
              {donate.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Redirecting…
                </>
              ) : (
                <>
                  <Heart className="w-4 h-4 mr-2" /> Donate
                </>
              )}
            </Button>

            <p className="text-xs text-muted-foreground font-light text-center mt-4 leading-relaxed">
              Secure one-time payment via Stripe. mapper.one never sees your card
              details.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-light mt-8">
            <Mountain className="w-4 h-4" />
            <span>Standing on the shoulders of giants.</span>
          </div>
          <footer className="mt-10 pt-6 border-t border-border/50 text-center">
            <a
              href="/use-cases"
              className="text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              Explore practical use cases
            </a>
          </footer>
        </div>
      </section>
    </div>
  );
}

export default SupportHub;
