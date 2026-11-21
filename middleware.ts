import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/auth", "/reset-password", "/opengraph-image", "/sw.js", "/api/sync-scores", "/manifest.webmanifest"];

// The one address everyone should use. Vercel also serves each deploy at its own long address
// (pickem-abc123-….vercel.app); sign-ins are tied to the address, so those would look signed out.
const SITE_HOST = process.env.SITE_HOST || "pickem-three.vercel.app";
const MAX_AGE = 400 * 24 * 60 * 60;

export async function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host !== SITE_HOST && /^pickem-[a-z0-9-]+\.vercel\.app$/.test(host) && process.env.VERCEL_ENV === "production") {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${SITE_HOST}`);
    return NextResponse.redirect(url, 308);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const path = request.nextUrl.pathname;
  // If Supabase falls back to the Site URL, an email link can land on "/?code=…". Send it to the callback.
  if (path === "/" && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }
  const { data: { user } } = await supabase.auth.getUser();
  // Safari forgets cookies written by page scripts after 7 days. Once a day, re-send the sign-in
  // cookies from the server so they last the full 400 days and people stay signed in.
  if (user && !request.cookies.get("kept")) {
    const set = new Set(response.cookies.getAll().map((c) => c.name));
    request.cookies.getAll().filter((c) => c.name.startsWith("sb-") && !set.has(c.name)).forEach((c) =>
      response.cookies.set(c.name, c.value, { path: "/", sameSite: "lax", maxAge: MAX_AGE, secure: request.nextUrl.protocol === "https:" }));
    response.cookies.set("kept", "1", { path: "/", sameSite: "lax", maxAge: 24 * 60 * 60, httpOnly: true });
  }
  if (!user && !PUBLIC.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)"],
};
