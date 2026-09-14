/**
 * Can a diver attend a given practice, based on the practice's eligible
 * groups? An empty list means the practice is open to every group.
 *
 * This used to be written out by hand in three separate places (coach
 * attendance roster, family portal, practice-change notifications) and
 * drifted: the portal version dropped the empty-list rule, so every
 * weekday practice -- all created with no group restriction -- was hidden
 * from every family. Keep the rule here and only here.
 */
export function isDiverEligibleForPractice(
  eligibleGroupIds: unknown,
  diverPrimaryGroupId: string | null | undefined,
): boolean {
  const ids = Array.isArray(eligibleGroupIds) ? (eligibleGroupIds as string[]) : [];
  if (ids.length === 0) return true;
  return !!diverPrimaryGroupId && ids.includes(diverPrimaryGroupId);
}
