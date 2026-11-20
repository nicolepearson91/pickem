"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/contests") : path.startsWith(href);
  return (
    <Link href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-slate-800 text-emerald-400" : "text-slate-400 hover:text-white"}`}>
      {children}
    </Link>
  );
}
