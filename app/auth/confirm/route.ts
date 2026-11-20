import type { NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createRouteClient, safeNext } from "@/lib/supabase/route";

// One-time links the admin copies from the Players list. Unlike emailed links, these work
// on any device because they carry the token itself.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const token_hash = q.get("token_hash");
  const type = q.get("type") as EmailOtpType | null;
  const { supabase, redirect } = createRouteClient(request);
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) return redirect(safeNext(q.get("next")));
  }
  return redirect("/login?error=link");
}
