import { requireAdmin } from "@/lib/auth";
import ContestBuilder from "@/components/ContestBuilder";

export default async function NewContestPage() {
  await requireAdmin();
  const now = new Date();
  // Football seasons are named for the year they start, so Jan to Jul still belongs to last year.
  const season = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
  // Rough guess at this week; the admin can change it.
  const kickoff = new Date(season, 8, 4);
  const guess = Math.min(18, Math.max(1, Math.floor((now.getTime() - kickoff.getTime()) / (7 * 86400000)) + 1));
  return <ContestBuilder defaultSeason={season} defaultWeek={guess} />;
}
