import { ImageResponse } from "next/og";

// The picture shown when the link is pasted into a text, WhatsApp, Facebook and so on.
export const alt = "Join our Pick Em";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "80px", color: "white", fontFamily: "sans-serif",
        background: "radial-gradient(120% 120% at 0% 0%, #163a80 0%, #0f1730 55%, #0b1020 100%)",
      }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 6, color: "#94a3b8" }}>NFL · COLLEGE FOOTBALL</div>
        <div style={{ display: "flex", alignItems: "center", fontSize: 150, fontWeight: 900, lineHeight: 1, marginTop: 20 }}>
          PICK EM
        </div>
        <div style={{ display: "flex", fontSize: 50, marginTop: 36, color: "#e2e8f0" }}>
          Pick the winners. Live scores. Bragging rights.
        </div>
        <div style={{
          display: "flex", marginTop: 50, alignSelf: "flex-start", padding: "18px 40px", borderRadius: 999,
          background: "#34f08c", color: "#0b1020", fontSize: 44, fontWeight: 800,
        }}>
          Tap to join the pool
        </div>
      </div>
    ),
    size,
  );
}
