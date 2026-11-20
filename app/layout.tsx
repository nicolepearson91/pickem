import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getViewer } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Pick Em",
  description: "Weekly NFL and college football pick ems with live standings.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getViewer();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-emerald-900 bg-emerald-800 text-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-black tracking-tight">🏈 Pick Em</Link>
            {profile?.is_member || profile?.is_admin ? (
              <>
                <Link href="/" className="text-sm font-medium text-emerald-100 hover:text-white">This week</Link>
                <Link href="/standings" className="text-sm font-medium text-emerald-100 hover:text-white">Season standings</Link>
                {profile.is_admin && (
                  <Link href="/admin" className="text-sm font-medium text-emerald-100 hover:text-white">Admin</Link>
                )}
              </>
            ) : null}
            {profile && (
              <div className="ml-auto flex items-center gap-3 text-sm">
                <Link href="/account" className="text-emerald-100 hover:text-white">{profile.display_name}</Link>
                <SignOutButton />
              </div>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
