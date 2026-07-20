/**
 * Placeholder wordmark. The supplied NDC logo is a photograph of apparel and
 * is treated as direction only; swap this component for a produced mark later.
 */
export function Logo({ light = false, size = "md" }: { light?: boolean; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={`display inline-flex items-baseline gap-2 ${s}`} aria-label="Napoleon Diving Club">
      <span aria-hidden className="translate-y-[1px]">
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none">
          {/* diver silhouette arc into water */}
          <path d="M3 18c4 0 5-2 9-2s5 2 9 2" stroke={light ? "#fff" : "#16385e"} strokeWidth="2" strokeLinecap="round" />
          <path d="M6 13c2.5-5 7-8.5 12-9l-1.5 4.5L12 12" stroke={light ? "#d96f22" : "#d96f22"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={light ? "text-white" : "text-ink"}>NDC</span>
    </span>
  );
}
