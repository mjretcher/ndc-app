export type PracticeCategory = "weekday" | "saturday" | "sunday" | "clinic" | "non_billable";

/**
 * Tailwind classes for a practice's category chip/pill, given its billing
 * category and status. Saturday intentionally shares Sunday's color — they're
 * billed identically ("weekend rate"), so the calendar should read that way
 * at a glance rather than introducing a third, unrelated color.
 */
export function categoryColorClass(category: string, status: string): string {
  if (status === "canceled") return "bg-line text-mute line-through";
  if (category === "saturday" || category === "sunday") return "bg-brown text-white";
  if (category === "clinic") return "bg-accent text-white";
  if (category === "non_billable") return "bg-pool text-navy";
  return "bg-navy text-white"; // weekday
}

/** Small legend dot color, independent of cancellation state. */
export function categoryDotClass(category: string): string {
  if (category === "saturday" || category === "sunday") return "bg-brown";
  if (category === "clinic") return "bg-accent";
  if (category === "non_billable") return "bg-pool border border-line";
  return "bg-navy";
}

export const CATEGORY_LEGEND: { label: string; dot: string }[] = [
  { label: "Weekday", dot: "bg-navy" },
  { label: "Weekend (Sat/Sun)", dot: "bg-brown" },
  { label: "Clinic", dot: "bg-accent" },
  { label: "Non-billable", dot: "bg-pool border border-line" },
];
