import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav, PublicFooter } from "@/components/PublicSite";
import { getCurrentWeekSchedule } from "@/lib/server/public-schedule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Napoleon Diving Club | Youth Competitive Diving in Bowling Green, Ohio",
  description:
    "Napoleon Diving Club coaches competitive divers out of Bowling Green State University, from a first dive through OHSAA state qualification, AAU/USA national qualification, and on to college diving. Led by Mike Retcher, BGSU's Head Diving Coach.",
  openGraph: {
    title: "Napoleon Diving Club",
    description:
      "You don't have to be a diver to become one — competitive youth diving out of Bowling Green, Ohio, for every age and experience level.",
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

export default async function HomePage() {
  const { days: schedule, primaryFacilityName } = await getCurrentWeekSchedule();

  return (
    <div className="bg-paper text-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <PublicNav />

      {/* ---- Hero ---- */}
      <section className="mx-auto max-w-6xl px-5 md:px-10">
        <div className="grid md:grid-cols-[1.05fr_0.95fr] rounded-3xl overflow-hidden">
          <div className="py-8 md:py-14 pr-0 md:pr-10 flex flex-col justify-center">
            <p className="font-serif text-teal text-lg mb-1.5">Bowling Green, Ohio &middot; competitive youth diving</p>
            <h1 className="font-serif font-semibold text-4xl md:text-5xl leading-[1.05] max-w-[15ch] mb-5">
              You don&rsquo;t have to be a diver to become one.
            </h1>
            <p className="text-lg text-mute leading-relaxed max-w-[46ch] mb-8">
              Whether your child wants a fun first season, a spot on the high school team, or a path to college
              competition, every age and experience level starts here.
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

      {/* ---- Programs teaser ---- */}
      <section id="programs" className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
        <div className="rounded-2xl bg-ink text-white p-8 md:p-12 flex flex-col md:flex-row md:items-center gap-6 md:gap-10 justify-between">
          <div className="max-w-[46ch]">
            <h2 className="font-serif font-semibold text-2xl md:text-3xl mb-2.5">Two ways to pay, zero pressure to pick the &ldquo;right&rdquo; one.</h2>
            <p className="text-white/75 leading-relaxed">
              A Monthly Flat Rate for divers building a competitive season, or Per Practice for divers juggling
              another sport &mdash; see current rates and what each includes.
            </p>
          </div>
          <Link href="/programs" className="btn btn-primary !min-h-12 !px-7 text-base shrink-0">See pricing & programs</Link>
        </div>
      </section>

      {/* ---- Schedule ---- */}
      <section id="schedule" className="mx-auto max-w-6xl px-5 md:px-10 py-16 md:py-20">
        <div className="max-w-[56ch] mb-8">
          <h2 className="font-serif font-semibold text-3xl mb-3">What a normal week looks like.</h2>
          <p className="text-mute text-lg">
            {primaryFacilityName ? `All practices this month are held at ${primaryFacilityName}.` : "Reach out for current practice locations."}
          </p>
        </div>
        {schedule.length > 0 ? (
          <div className="flex gap-3.5 overflow-x-auto pb-2">
            {schedule.map((d) => (
              <div key={d.day} className={`flex-none w-48 rounded-2xl border p-5 ${d.requiresSignup ? "bg-accent-soft border-accent" : "bg-card border-line"}`}>
                <p className="font-serif font-semibold text-lg mb-2">{d.day}</p>
                <p className="font-bold text-navy mb-1">{d.time}</p>
                <p className="text-sm text-mute">{d.requiresSignup ? "Sign-up required" : "Weekday practice"}</p>
                {d.requiresSignup && d.minSignupCount && (
                  <span className="inline-block mt-2 text-xs font-bold text-accent bg-white px-2.5 py-1 rounded-full">
                    Cancels if under {d.minSignupCount}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-mute">Schedule coming soon &mdash; reach out and we&rsquo;ll walk you through practice times.</p>
        )}
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

      <PublicFooter />
    </div>
  );
}
