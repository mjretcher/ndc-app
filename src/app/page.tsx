import Link from "next/link";
import { Logo } from "@/components/Logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Napoleon Diving Club | Youth Competitive Diving in Bowling Green, Ohio",
  description:
    "Napoleon Diving Club coaches competitive divers out of Bowling Green State University, from a first dive through OHSAA state qualification, AAU/USA national qualification, and on to college diving. Led by Mike Retcher, BGSU's Head Diving Coach.",
  openGraph: {
    title: "Napoleon Diving Club",
    description:
      "From a first cannonball to a college roster — competitive youth diving out of Bowling Green, Ohio.",
    url: "https://napoleondivingclub.com",
    siteName: "Napoleon Diving Club",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SportsOrganization",
  name: "Napoleon Diving Club",
  alternateName: "NDC",
  description:
    "A competitive youth diving club training out of Bowling Green State University in Northwest Ohio, from beginner lessons through OHSAA state, AAU, and USA Diving national qualification, with a track record of sending athletes to Division 1, 2, and 3 college diving programs. Founded in Napoleon, Ohio, where Napoleon High School still hosts its High School Only program.",
  url: "https://napoleondivingclub.com",
  sport: "Diving",
  areaServed: {
    "@type": "Place",
    name: "Northwest Ohio",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Napoleon",
    addressRegion: "OH",
    addressCountry: "US",
  },
  founder: {
    "@type": "Person",
    name: "Mike Retcher",
    jobTitle: "Head Coach of Elite Programming, Napoleon Diving Club; Head Diving Coach, Bowling Green State University",
  },
  employee: [
    { "@type": "Person", name: "Mike Retcher", jobTitle: "Head Coach of Elite Programming" },
    { "@type": "Person", name: "Kristin Shepard", jobTitle: "Head Coach of High School Programming" },
    { "@type": "Person", name: "Luna Castellanos", jobTitle: "Head Coach, Developmental Programming" },
  ],
};

export default function HomePage() {
  return (
    <div className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ---- Nav ---- */}
      <nav className="mx-auto max-w-6xl flex items-center justify-between px-5 py-6 md:px-10">
        <div className="flex items-center gap-2.5 font-bold">
          <Logo size="sm" />
          <span className="hidden sm:inline">Napoleon Diving Club</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-navy">
          <a href="#programs" className="hover:text-ink">Programs</a>
          <a href="#coaches" className="hover:text-ink">Coaches</a>
          <a href="#schedule" className="hover:text-ink">Schedule</a>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/portal/sign-in" className="btn btn-secondary !min-h-10 !py-2 text-sm">Family sign in</Link>
          <Link href="/register" className="btn btn-primary !min-h-10 !py-2 text-sm">Register</Link>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="mx-auto max-w-6xl px-5 md:px-10">
        <div className="grid md:grid-cols-[1.05fr_0.95fr] rounded-3xl overflow-hidden">
          <div className="py-8 md:py-14 pr-0 md:pr-10 flex flex-col justify-center">
            <p className="font-serif text-teal text-lg mb-1.5">Bowling Green, Ohio &middot; competitive youth diving</p>
            <h1 className="font-serif font-semibold text-4xl md:text-5xl leading-[1.05] max-w-[11ch] mb-5">
              From a first cannonball to a college roster.
            </h1>
            <p className="text-lg text-mute leading-relaxed max-w-[46ch] mb-8">
              A real path for every diver &mdash; from a first practice to OHSAA state finals, national
              qualification, and diving in college &mdash; coached by a staff that includes an active NCAA
              Division I head coach.
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <Link href="/register" className="btn btn-primary !min-h-12 !px-7 text-base">Book a free trial practice</Link>
              <a href="#schedule" className="font-bold text-navy border-b-2 border-accent pb-0.5">See this month&rsquo;s schedule</a>
            </div>
          </div>
          <div className="relative bg-ink min-h-[280px] md:min-h-[480px] rounded-2xl md:rounded-3xl overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(160deg, rgba(15,36,64,0.95), rgba(15,92,102,0.6))",
              }}
            />
            <span
              aria-hidden
              className="font-serif font-semibold absolute -right-10 -bottom-16 md:-bottom-24 text-white/[0.08] leading-none select-none"
              style={{ fontSize: "min(60vw, 480px)" }}
            >
              N
            </span>
          </div>
        </div>
      </section>

      {/* ---- Stats ---- */}
      <section className="mx-auto max-w-6xl px-5 md:px-10 py-14">
        <div className="flex flex-wrap items-baseline gap-x-12 gap-y-4 border-t border-line pt-10">
          <div className="flex items-baseline gap-3">
            <span className="font-serif font-semibold text-navy text-6xl leading-none">50+</span>
            <span className="text-mute max-w-[16ch]">OHSAA state qualifiers</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-serif font-semibold text-navy text-5xl leading-none">30+</span>
            <span className="text-mute max-w-[16ch]">AAU &amp; USA national qualifiers</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-serif font-semibold text-navy text-4xl leading-none">18</span>
            <span className="text-mute max-w-[16ch]">years under Coach Retcher</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-serif font-semibold text-navy text-4xl leading-none">D1&ndash;D3</span>
            <span className="text-mute max-w-[18ch]">college programs our divers compete in</span>
          </div>
        </div>
      </section>

      {/* ---- Mission ---- */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
          <p className="font-serif text-2xl md:text-3xl leading-snug max-w-[24ch] mb-8">
            To be the reason Northwest Ohio produces college divers.
          </p>
          <p className="text-white/80 text-lg leading-relaxed max-w-[65ch]">
            Napoleon Diving Club coaches competitive divers, full stop. Every athlete trains under the same
            technical standard our head coach runs at the NCAA Division I level &mdash; with a real path from a
            first dive, through OHSAA state and AAU/USA national qualification, to a college roster. We&rsquo;ve
            already sent divers to Division 1, 2, and 3 programs. Everything we do is built to keep sending more.
          </p>
          <p className="text-white/60 text-base leading-relaxed max-w-[65ch] mt-5">
            We got our start in Napoleon, Ohio, and Napoleon High School still anchors our High School Only
            program. Today our divers train primarily out of Bowling Green State University, where our head coach
            also runs the college program.
          </p>
        </div>
      </section>

      {/* ---- Coaches ---- */}
      <section id="coaches" className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
        <div className="max-w-[56ch] mb-11">
          <h2 className="font-serif font-semibold text-3xl mb-3">Coached by people who&rsquo;ve actually stood on the board.</h2>
          <p className="text-mute text-lg leading-relaxed">
            A combined 35+ years of diving experience, including an active Division I head coach and a five-time
            national champion.
          </p>
        </div>

        <div className="divide-y divide-line border-t border-b border-line">
          <div className="flex gap-6 items-start py-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/mike.png" alt="Mike Retcher" width={84} height={84} className="rounded-2xl object-cover shrink-0" />
            <div>
              <p className="font-serif font-semibold text-xl mb-1">Mike Retcher</p>
              <p className="text-teal font-bold text-sm mb-2.5">Head Coach of Elite Programming &middot; BGSU Head Diving Coach</p>
              <p className="text-mute max-w-[62ch] leading-relaxed">
                18 years coaching the sport, with leadership roles across USA Diving. Together with Coach Shepard,
                NDC divers have earned 50+ OHSAA state finals appearances and 30+ AAU/USA national qualifications.
              </p>
            </div>
          </div>
          <div className="flex gap-6 items-start py-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/kristin.png" alt="Kristin Shepard" width={84} height={84} className="rounded-2xl object-cover shrink-0" />
            <div>
              <p className="font-serif font-semibold text-xl mb-1">Kristin Shepard</p>
              <p className="text-teal font-bold text-sm mb-2.5">Head Coach of High School Programming</p>
              <p className="text-mute max-w-[62ch] leading-relaxed">
                Leads NDC&rsquo;s High School Only program, built for divers competing for their school team who
                want dedicated, focused development alongside it.
              </p>
            </div>
          </div>
          <div className="flex gap-6 items-start py-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/team/luna.png" alt="Luna Castellanos" width={84} height={84} className="rounded-2xl object-cover shrink-0" />
            <div>
              <p className="font-serif font-semibold text-xl mb-1">Luna Castellanos</p>
              <p className="text-teal font-bold text-sm mb-2.5">Head Coach, Developmental Programming</p>
              <p className="text-mute max-w-[62ch] leading-relaxed">
                A five-time NCAA Division II individual national champion at Clarion University and the 2025
                CSCAA Diver of the Year, Luna brings elite technical coaching directly to our newest divers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Programs ---- */}
      <section id="programs" className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
        <div className="max-w-[56ch] mb-11">
          <h2 className="font-serif font-semibold text-3xl mb-3">Two ways to pay, zero pressure to pick the &ldquo;right&rdquo; one.</h2>
          <p className="text-mute text-lg leading-relaxed">
            Practices flex around your family&rsquo;s schedule, not the other way around &mdash; switch between
            these as seasons change, with a few days&rsquo; notice before the next billing cycle.
          </p>
        </div>
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-6">
          <div className="rounded-2xl bg-ink text-white p-8">
            <h3 className="font-serif font-semibold text-2xl mb-2.5">Monthly Flat Rate</h3>
            <p className="text-white/75 max-w-[52ch] mb-6 leading-relaxed">
              Best for divers building toward a real competitive season. Most economical option, and fits any
              level from Lesson through Elite.
            </p>
            <dl className="text-sm">
              {[
                ["Lesson Program", "$70/mo"],
                ["Beginner \u00b7 Orange Team", "$110/mo"],
                ["Intermediate \u00b7 Brown Team", "$145/mo"],
                ["Elite \u00b7 Navy Team", "$200/mo"],
                ["High School Only", "$550/season"],
              ].map(([label, price], i, arr) => (
                <div key={label} className={`flex justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-white/15" : ""}`}>
                  <dt>{label}</dt>
                  <dd className="font-serif font-semibold">{price}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-line p-8">
            <h3 className="font-serif font-semibold text-2xl mb-2.5">Per Practice</h3>
            <p className="text-mute max-w-[52ch] mb-6 leading-relaxed">
              For divers juggling another sport. We track attendance electronically and bill only for what you use.
            </p>
            <dl className="text-sm">
              {[
                ["Lesson & Beginner", "$15"],
                ["Weekend rate", "$18"],
                ["Intermediate & Elite", "$20"],
                ["Weekend rate", "$25"],
              ].map(([label, price], i, arr) => (
                <div key={label + price} className={`flex justify-between py-2.5 ${i < arr.length - 1 ? "border-b border-line" : ""}`}>
                  <dt>{label}</dt>
                  <dd className="font-serif font-semibold">{price}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ---- Schedule ---- */}
      <section id="schedule" className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
        <div className="max-w-[56ch] mb-8">
          <h2 className="font-serif font-semibold text-3xl mb-3">What a normal week looks like.</h2>
          <p className="text-mute text-lg">All practices this month are held at Bowling Green State University.</p>
        </div>
        <div className="flex gap-3.5 overflow-x-auto pb-2">
          {[
            { day: "Monday", time: "6:00\u20137:30 PM", tag: null },
            { day: "Tuesday", time: "6:15\u20138:00 PM", tag: null },
            { day: "Wednesday", time: "6:15\u20137:45 PM", tag: "Cancels if under 4" },
            { day: "Thursday", time: "5:45\u20137:15 PM", tag: null },
          ].map((d) => (
            <div key={d.day} className={`flex-none w-48 rounded-2xl border p-5 ${d.tag ? "bg-accent-soft border-accent" : "bg-card border-line"}`}>
              <p className="font-serif font-semibold text-lg mb-2">{d.day}</p>
              <p className="font-bold text-navy mb-1">{d.time}</p>
              <p className="text-sm text-mute">{d.tag ? "Sign-up required" : "Weekday practice"}</p>
              {d.tag && <span className="inline-block mt-2 text-xs font-bold text-accent bg-white px-2.5 py-1 rounded-full">{d.tag}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* ---- Closing CTA ---- */}
      <section className="bg-ink text-white relative overflow-hidden">
        <span
          aria-hidden
          className="font-serif font-semibold absolute -right-6 -bottom-20 text-white/[0.06] leading-none select-none"
          style={{ fontSize: "min(50vw, 380px)" }}
        >
          N
        </span>
        <div className="mx-auto max-w-6xl px-5 md:px-10 py-20 relative z-10">
          <div className="max-w-[38ch]">
            <h2 className="font-serif font-semibold text-3xl md:text-4xl mb-4 leading-tight">Ready to see if diving clicks?</h2>
            <p className="text-white/80 text-lg mb-8 leading-relaxed">
              Every new athlete gets 1&ndash;3 trial practices before we ask for any commitment. No pressure &mdash;
              just a chance to get in the water.
            </p>
            <Link href="/register" className="btn btn-primary !min-h-12 !px-7 text-base">Book a free trial practice</Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 md:px-10 py-9 flex flex-wrap justify-between gap-3 text-sm text-mute">
        <div>Napoleon Diving Club &middot; napoleondivingclub@gmail.com</div>
        <div className="flex gap-5">
          <span>Bowling Green State University &middot; Napoleon High School</span>
          <Link href="/sign-in" className="underline">Coach sign in</Link>
        </div>
      </footer>
    </div>
  );
}
