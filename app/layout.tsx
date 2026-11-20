import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { getViewer } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";
import NavLink from "@/components/NavLink";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-oswald" });

export const metadata: Metadata = {
  title: "Pick Em",
  description: "Weekly NFL and college football pick ems with live standings.",
};

export const viewport: Viewport = { themeColor: "#0b1020" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getViewer();
  const member = profile?.is_member || profile?.is_admin;
  return (
    <html lang="en" className={`dark ${inter.variable} ${oswald.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="font-display text-2xl font-bold uppercase tracking-wide text-white">
              🏈 Pick Em
            </Link>
            {member && (
              <div className="hidden items-center gap-1 sm:flex">
                <NavLink href="/">This week</NavLink>
                <NavLink href="/standings">Season</NavLink>
                {profile.is_admin && <NavLink href="/admin">Admin</NavLink>}
              </div>
            )}
            {profile && (
              <div className="ml-auto flex items-center gap-3 text-sm">
                <Link href="/account" className="font-semibold text-slate-300 hover:text-white">{profile.display_name}</Link>
                <SignOutButton />
              </div>
            )}
          </nav>
          {member && (
            <div className="flex gap-1 border-t border-slate-800/60 px-3 py-1.5 sm:hidden">
              <NavLink href="/">This week</NavLink>
              <NavLink href="/standings">Season</NavLink>
              {profile.is_admin && <NavLink href="/admin">Admin</NavLink>}
            </div>
          )}
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
