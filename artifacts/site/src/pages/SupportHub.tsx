import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  AlertCircle, ArrowUpRight, Bug, CheckCircle2, Compass, Handshake,
  Heart, HelpCircle, Loader2, Mail, Map, MessageCircle, Phone, ShieldCheck,
} from "lucide-react";
import { useCreateDonationCheckout, useCreateSupportRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

type Category = "bug" | "question" | "sharing_offline" | "partnership";
type Severity = "low" | "medium" | "high" | "critical";
const empty = { category: "bug" as Category, severity: "medium" as Severity, summary: "", description: "", reproductionSteps: "", expectedBehavior: "", actualBehavior: "", context: "", environment: "", contactEmail: "", mediaUrl: "", website: "" };

function Optional({ value }: { value: string }) { return value.trim() ? value.trim() : null; }

export default function SupportHub() {
  const search = useSearch();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const donate = useCreateDonationCheckout({ mutation: { onSuccess: ({ url }) => { window.location.href = url; } } });
  const request = useCreateSupportRequest({ mutation: {
    onSuccess: (result) => { setReference(result.reference); setError(null); setForm(empty); },
    onError: (err) => setError(err instanceof Error ? err.message : "We couldn't send your request. Please try again or email us."),
  } });
  const donationStatus = useMemo(() => new URLSearchParams(search).get("status"), [search]);
  useEffect(() => { document.title = "Support mapper.one | The Adventure Collective"; const meta = document.querySelector('meta[name="description"]'); meta?.setAttribute("content", "Get mapper.one support, report private bugs, find offline and sharing help, or contact The Adventure Collective."); }, []);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (form.summary.trim().length < 3 || form.description.trim().length < 10) { setError("Add a short summary and enough detail for us to understand the issue."); return; }
    setError(null);
    request.mutate({
      data: {
        category: form.category, severity: form.severity, summary: form.summary.trim(), description: form.description.trim(),
        reproductionSteps: Optional({ value: form.reproductionSteps }), expectedBehavior: Optional({ value: form.expectedBehavior }),
        actualBehavior: Optional({ value: form.actualBehavior }), context: Optional({ value: form.context }),
        environment: Optional({ value: form.environment }), contactEmail: Optional({ value: form.contactEmail }),
        mediaUrl: Optional({ value: form.mediaUrl }), website: form.website,
      },
    });
  };
  return <div className="min-h-screen bg-background text-foreground">
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="flex items-center gap-2 font-serif text-lg font-semibold"><Compass className="h-5 w-5 text-primary"/>mapper.one</Link><Button asChild size="sm" className="rounded-full"><Link href="/#get-app">Get the App</Link></Button></div></nav>
    <main>
      <section className="border-b border-border/60 bg-secondary/25 px-5 py-16 sm:py-20"><div className="mx-auto max-w-4xl"><p className="mb-4 font-mono text-xs font-bold tracking-[.16em] text-primary">THE ADVENTURE COLLECTIVE</p><h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">Helpful support for every route you carry.</h1><p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">mapper.one is developed by The Adventure Collective. Start with the right path below, then send a private request when you need a real human.</p></div></section>
      <section className="px-5 py-10"><div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-4">
        <Path icon={Bug} title="Report a bug" copy="Something didn’t work as expected? Send a private, structured report below." href="#report"/>
        <Path icon={HelpCircle} title="Ask a question" copy="Get help choosing a workflow or finding a feature." href="#report"/>
        <Path icon={Map} title="Sharing & offline maps" copy="Tell us what you’re trying to share, download, or use away from signal." href="#report"/>
        <Path icon={Handshake} title="Partnerships" copy="Talk about trail, field, education, or organization partnerships." href="#contact"/>
      </div></section>
      <section id="contact" className="px-5 pb-10"><div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        <Contact icon={Mail} label="Email us" detail="info@advguides.com" href="mailto:info@advguides.com"/>
        <Contact icon={Phone} label="Call The Adventure Collective" detail="+1 (828) 333-7155" href="tel:+18283337155"/>
        <Contact icon={ArrowUpRight} label="Meet the organization" detail="Learn about The Adventure Collective" href="https://advguides.com/about"/>
      </div></section>
      <section id="report" className="border-y border-border/60 bg-card px-5 py-14"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.75fr_1.25fr]">
        <div><p className="font-mono text-xs font-bold tracking-[.16em] text-primary">PRIVATE SUPPORT REQUEST</p><h2 className="mt-3 text-3xl sm:text-4xl">Tell us what happened.</h2><p className="mt-4 leading-relaxed text-muted-foreground">Support requests are private. They are never posted to the community board. We review them to improve mapper.one and follow up when you leave an email address.</p><div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed"><ShieldCheck className="mb-2 h-5 w-5 text-primary"/><strong>Protect your privacy.</strong> Do not include passwords, API keys, payment details, private links, or sensitive personal data.</div><div className="mt-5 text-sm text-muted-foreground">Want to share an idea publicly instead? <Link href="/feedback" className="font-semibold text-primary underline underline-offset-4">Visit the community feedback board</Link>.</div></div>
        {reference ? <div className="rounded-2xl border border-primary/30 bg-primary/10 p-7"><CheckCircle2 className="h-8 w-8 text-primary"/><h3 className="mt-4 text-2xl">Request received</h3><p className="mt-2 text-muted-foreground">Your private reference is <strong className="text-foreground">{reference}</strong>. Save it for your records.</p><Button className="mt-6 rounded-full" onClick={() => setReference(null)}>Send another request</Button></div> :
        <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Support path"><select value={form.category} onChange={(e)=>set("category",e.target.value)}><option value="bug">Report a bug</option><option value="question">Product question</option><option value="sharing_offline">Sharing or offline maps</option><option value="partnership">Partnership</option></select></Field><Field label="Severity"><select value={form.severity} onChange={(e)=>set("severity",e.target.value)}><option value="low">Low — minor interruption</option><option value="medium">Medium — workaround exists</option><option value="high">High — core workflow blocked</option><option value="critical">Critical — safety or data-loss risk</option></select></Field></div>
          <Field label="Short summary" hint="Example: Offline region won’t finish downloading"><input required minLength={3} maxLength={180} value={form.summary} onChange={(e)=>set("summary",e.target.value)} /></Field>
          <Field label="What happened?" hint="Include the route, project, or screen involved when useful."><textarea required minLength={10} maxLength={8000} rows={5} value={form.description} onChange={(e)=>set("description",e.target.value)} /></Field>
          <Field label="Steps to reproduce" optional><textarea rows={4} value={form.reproductionSteps} onChange={(e)=>set("reproductionSteps",e.target.value)} placeholder="1. Open…&#10;2. Tap…&#10;3. See…"/></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Expected behavior" optional><textarea rows={3} value={form.expectedBehavior} onChange={(e)=>set("expectedBehavior",e.target.value)} placeholder="What should have happened?"/></Field><Field label="Actual behavior" optional><textarea rows={3} value={form.actualBehavior} onChange={(e)=>set("actualBehavior",e.target.value)} placeholder="What happened instead?"/></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Route or project context" optional><input maxLength={1000} value={form.context} onChange={(e)=>set("context",e.target.value)} placeholder="Example: Blue Ridge trail map"/></Field><Field label="Device, browser, or app version" optional><input maxLength={500} value={form.environment} onChange={(e)=>set("environment",e.target.value)} placeholder="Example: iPhone 15, iOS 18, app 1.4"/></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Email for a reply" optional><input type="email" maxLength={254} value={form.contactEmail} onChange={(e)=>set("contactEmail",e.target.value)} placeholder="you@example.com"/></Field><Field label="Screenshot or recording link" optional><input type="url" maxLength={2000} value={form.mediaUrl} onChange={(e)=>set("mediaUrl",e.target.value)} placeholder="https://…"/></Field></div>
          <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e)=>set("website",e.target.value)} />
          {error && <p role="alert" className="flex gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</p>}
          <Button type="submit" disabled={request.isPending} className="mt-1 w-full rounded-full py-6">{request.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Sending private request…</> : "Send private request"}</Button>
        </form>}
      </div></section>
      <section className="px-5 py-14"><div className="mx-auto grid max-w-6xl gap-8 rounded-2xl border border-border bg-secondary/20 p-6 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-mono text-xs font-bold tracking-[.16em] text-primary">SUPPORT DEVELOPMENT</p><h2 className="mt-2 text-3xl">Keep mapper.one free for the field.</h2><p className="mt-2 max-w-2xl text-muted-foreground">One-time donations remain an optional way to support open mapping work. Stripe securely processes payment details.</p>{donationStatus==="success"&&<p className="mt-3 text-sm font-semibold text-primary">Thank you — your donation was received.</p>}</div><div className="flex items-center gap-2"><span className="text-muted-foreground">$</span><input aria-label="Donation amount" type="number" min="1" max="100000" value={amount} onChange={(e)=>setAmount(e.target.value)} className="w-24 rounded-lg border border-border bg-background px-3 py-2"/><Button disabled={donate.isPending} onClick={()=>donate.mutate({data:{amountCents:Math.round(Number(amount)*100)}})} className="rounded-full"><Heart className="mr-2 h-4 w-4"/>Donate</Button></div></div></section>
    </main>
  </div>;
}
function Path({icon:Icon,title,copy,href}:{icon:typeof Bug;title:string;copy:string;href:string}){return <a href={href} className="rounded-xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:border-primary/50"><Icon className="h-5 w-5 text-primary"/><h2 className="mt-3 text-lg">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy}</p></a>}
function Contact({icon:Icon,label,detail,href}:{icon:typeof Mail;label:string;detail:string;href:string}){return <a href={href} target={href.startsWith("http")?"_blank":undefined} rel="noreferrer" className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary/50"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><div><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></a>}
function Field({label,hint,optional,children}:{label:string;hint?:string;optional?:boolean;children:React.ReactNode}){return <label className="grid gap-1.5 text-sm font-semibold">{label}{optional&&<span className="font-normal text-muted-foreground">Optional</span>}{hint&&<span className="font-normal text-muted-foreground">{hint}</span>}<span className="[&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-border [&>input]:bg-card [&>input]:px-3 [&>input]:py-2.5 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-border [&>select]:bg-card [&>select]:px-3 [&>select]:py-2.5 [&>textarea]:w-full [&>textarea]:resize-y [&>textarea]:rounded-lg [&>textarea]:border [&>textarea]:border-border [&>textarea]:bg-card [&>textarea]:px-3 [&>textarea]:py-2.5">{children}</span></label>}