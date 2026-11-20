import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * For auth route handlers that finish with a redirect: the session cookies are written
 * straight onto the redirect response, so the next page sees the person as signed in.
 */
export function createRouteClient(request: NextRequest) {
  const pending: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => { pending.push(...list); },
    },
  });
  // Use the address the browser actually used, so cookies and the redirect share a host.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const origin = host ? `${proto}://${host}` : request.nextUrl.origin;
  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin));
    pending.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
    return res;
  };
  return { supabase, redirect };
}

export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
