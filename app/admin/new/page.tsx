import { requireAdmin } from "@/lib/auth";
import ContestBuilder from "@/components/ContestBuilder";
import { currentWeek } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function NewContestPage() {
  await requireAdmin();
  const [nfl, cfb] = await Promise.all([currentWeek("nfl"), currentWeek("cfb")]);
  return <ContestBuilder defaults={{ nfl, cfb }} />;
}
