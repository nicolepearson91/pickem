import type { NextRequest } from "next/server";
import { createRouteClient, safeNext } from "@/lib/supabase/route";

// Google sign-in, email sign-in links, password reset emails and confirmation links land here.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const code = q.get("code");
  const { supabase, redirect } = createRouteClient(request);
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect("/login?error=link");
  }
  return redirect(safeNext(q.get("next")));
}
