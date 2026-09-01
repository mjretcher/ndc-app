import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav, PublicFooter } from "@/components/PublicSite";

export const metadata: Metadata = {
  title: "Programs & Pricing | Napoleon Diving Club",
  description:
    "Napoleon Diving Club's two pricing options: Monthly Flat Rate for divers building a competitive season, and Per-Practice for divers juggling another sport.",
};

const MONTHLY = [
  ["Lesson Program", "$70/mo", "Introduces basic fundamentals. Meets twice weekly; bonus practice available Sundays."],
  ["Beginner \u00b7 Orange Team", "$110/mo", "Develops all five categories of dives; introduction to 3-meter."],
  ["Intermediate \u00b7 Brown Team", "$145/mo", "At least 3 of 5 dive categories; proficient in basics."],
  ["Elite \u00b7 Navy Team", "$200/mo", "Full competition list. Participation in all practices and meets expected."],
  ["High School Only", "$550/season", "Split evenly and billed across November, December, January, and February."],
];

const PER_PRACTICE = [
  ["Lesson & Beginner", "$15.00", "Weekend rate: $18.00"],
  ["Intermediate & Elite", "$20.00", "Weekend rate: $25.00"],
];

export default function ProgramsPage() {
  return (
    <div className="bg-paper text-ink min-h-dvh">
      <PublicNav />

      <section className="mx-auto max-w-6xl px-5 md:px-10 py-8 md:py-12">
        <p className="font-serif text-teal text-lg mb-1.5">Programs & Pricing</p>
        <h1 className="font-serif font-semibold text-4xl md:text-5xl leading-[1.05] max-w-[16ch] mb-5">
          Two ways to pay, zero pressure to pick the &ldquo;right&rdquo; one.
        </h1>
        <p className="text-lg text-mute leading-relaxed max-w-[60ch]">
          Practices flex around your family&rsquo;s schedule, not the other way around &mdash; switch between
          these as seasons change, with a few days&rsquo; notice before the next billing cycle. Every new
          athlete also gets 1&ndash;3 trial practices before we ask for any commitment at all.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 md:px-10 pb-16">
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 items-start">
          <div className="rounded-2xl bg-ink text-white p-8">
            <h2 className="font-serif font-semibold text-2xl mb-2.5">Monthly Flat Rate</h2>
            <p className="text-white/75 max-w-[52ch] mb-6 leading-relaxed">
              Best for divers building toward a real competitive season. Most economical option, and fits any
              level from Lesson through Elite.
            </p>
            <dl>
              {MONTHLY.map(([label, price, desc], i, arr) => (
                <div key={label} className={`py-3.5 ${i < arr.length - 1 ? "border-b border-white/15" : ""}`}>
                  <div className="flex justify-between items-baseline">
                    <dt className="font-semibold">{label}</dt>
                    <dd className="font-serif font-semibold text-lg">{price}</dd>
                  </div>
                  <p className="text-white/60 text-sm mt-1 max-w-[48ch]">{desc}</p>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl border border-line p-8">
            <h2 className="font-serif font-semibold text-2xl mb-2.5">Per Practice</h2>
            <p className="text-mute max-w-[52ch] mb-6 leading-relaxed">
              For divers juggling another sport. We track attendance electronically and bill only for what you
              use &mdash; typically 16&ndash;20 practices are available per month.
            </p>
            <dl>
              {PER_PRACTICE.map(([label, price, note], i, arr) => (
                <div key={label} className={`py-3.5 ${i < arr.length - 1 ? "border-b border-line" : ""}`}>
                  <div className="flex justify-between items-baseline">
                    <dt className="font-semibold">{label}</dt>
                    <dd className="font-serif font-semibold text-lg">{price}</dd>
                  </div>
                  <p className="text-mute text-sm mt-1">{note}</p>
                </div>
              ))}
            </dl>
            <p className="text-sm text-mute mt-6 leading-relaxed">
              If you expect to attend more than about 75% of available practices, the Monthly Flat Rate is
              usually the better value &mdash; you&rsquo;re always welcome to switch.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-accent-soft border border-accent p-6 max-w-[70ch]">
          <p className="font-semibold text-ink mb-1.5">A note on cost</p>
          <p className="text-mute leading-relaxed">
            We don&rsquo;t want any family&rsquo;s current financial situation to be a barrier to participation.
            If that&rsquo;s a concern for your family, reach out privately and we&rsquo;ll work out a plan.
          </p>
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-5 md:px-10 py-16 text-center">
          <h2 className="font-serif font-semibold text-2xl md:text-3xl mb-5">Ready to see if diving clicks?</h2>
          <Link href="/register" className="btn btn-primary !min-h-12 !px-7 text-base">Book a free trial practice</Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
