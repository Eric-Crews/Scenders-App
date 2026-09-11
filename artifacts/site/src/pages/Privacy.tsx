import { Link } from "wouter";
import { Compass, Shield } from "lucide-react";

const LAST_UPDATED = "June 24, 2026";
const CONTACT_EMAIL = "info@advcollective.com";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-primary" />
            <span className="font-serif font-semibold text-lg tracking-wide">mapper.one</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 pt-32 pb-24">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground text-sm font-medium mb-6 border border-border/50">
          <Shield className="w-4 h-4" />
          <span>Privacy Policy</span>
        </div>

        <h1 className="text-4xl font-serif mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-base leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Overview</h2>
            <p className="text-muted-foreground">
              mapper.one is a field mapping app built by The Adventure Collective.
              We collect as little data as possible. The app works without an account, and most data
              never leaves your device.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Data stored on your device</h2>
            <p className="text-muted-foreground">The following is stored locally and is never transmitted to our servers:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li><strong className="text-foreground">Map datasets</strong> — GPX, KML, KMZ, and GeoJSON files you import.</li>
              <li><strong className="text-foreground">Offline map tiles</strong> — Cached map tiles downloaded for offline use.</li>
              <li><strong className="text-foreground">Waypoints and photos</strong> — Waypoints you drop and photos attached to them are stored in your device's local storage.</li>
              <li><strong className="text-foreground">Recorded tracks</strong> — GPS tracks recorded during your trips stay on device unless you explicitly choose to publish them.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Location data</h2>
            <p className="text-muted-foreground">
              The app requests access to your device's GPS to display your position on the map,
              to record tracks, and to find community routes near you. Location data is used
              only within the app and is not transmitted to our servers in the background.
              If you record a track and choose to publish it to the community library, the
              route geometry (GPS coordinates) will be stored on our servers and made publicly
              visible to other users.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Community library</h2>
            <p className="text-muted-foreground">
              If you choose to publish a route or waypoint to the community map, the following
              information is stored on our servers and made public:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Route geometry (GPS coordinates)</li>
              <li>Route name and any description you provide</li>
              <li>Distance and elevation statistics</li>
            </ul>
            <p className="text-muted-foreground">
              Waypoint photos are stored on device only and are never uploaded. Publishing
              is always opt-in — nothing is shared without your explicit action.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Third-party services</h2>
            <p className="text-muted-foreground">
              When the app is online, it fetches map tiles from third-party tile providers,
              including OpenTopoMap, OpenStreetMap, CyclOSM, and satellite imagery providers.
              These requests include your IP address as part of standard HTTP traffic. Please
              review each provider's own privacy policy for details.
            </p>
            <p className="text-muted-foreground">
              This website uses no analytics, tracking pixels, or advertising scripts.
              If you make a donation via our Support page, payment is processed by
              Stripe. Stripe's privacy policy applies to that transaction —
              we receive only a confirmation that a payment was made; no card details
              are stored on our servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Data we do not collect</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>We do not require account creation or email addresses.</li>
              <li>We do not run analytics or track in-app behavior.</li>
              <li>We do not sell or share any data with third parties for advertising.</li>
              <li>We do not collect device identifiers.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Data retention</h2>
            <p className="text-muted-foreground">
              Community routes you publish remain on our servers until you delete them
              from within the app. If you contact us to request deletion of your data,
              we will remove it promptly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Children</h2>
            <p className="text-muted-foreground">
              mapper.one is not directed at children under 13. We do not knowingly
              collect personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Changes to this policy</h2>
            <p className="text-muted-foreground">
              We may update this policy as the app evolves. Material changes will be
              noted by updating the date at the top of this page.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-serif font-semibold">Contact</h2>
            <p className="text-muted-foreground">
              Questions or requests about your data:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
