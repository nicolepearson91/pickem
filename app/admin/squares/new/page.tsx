import { requireAdmin } from "@/lib/auth";
import SquaresBoardBuilder from "@/components/SquaresBoardBuilder";
import { guessSeason } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function NewSquaresPage() {
  await requireAdmin();
  return <SquaresBoardBuilder season={guessSeason(new Date())} />;
}
