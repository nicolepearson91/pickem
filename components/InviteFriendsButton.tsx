"use client";

import { useState } from "react";

/** Opens the phone's share sheet (Messages, WhatsApp…) with the invite link, or copies it on a computer. */
export default function InviteFriendsButton({ link, className = "btn-ghost" }: { link: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = "Join our football pick em! Pick the winners each week and see live standings.";

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our Pick Em", text, url: link });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // they closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
    } catch {
      window.prompt("Copy this link and send it to your friends:", link);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button type="button" className={className} onClick={share}>
      {copied ? "Link copied ✓ Paste it in a text" : "📣 Invite friends"}
    </button>
  );
}
