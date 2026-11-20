import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { fetchScoreboard } from "@/lib/espn";

export const dynamic = "force-dynamic";

// Admin preview: lists the games ESPN has for a week so the admin can choose which to include.
export async function GET(request: NextRequest) {
  const { profile } = await getViewer();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const q = request.nextUrl.searchParams;
  const league = q.get("league") === "cfb" ? "cfb" : "nfl";
  try {
    const games = await fetchScoreboard({
      league,
      season: Number(q.get("season")),
      seasonType: Number(q.get("seasonType") || 2),
      week: Number(q.get("week")),
      group: q.get("group"),
    });
    return NextResponse.json({ games });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
