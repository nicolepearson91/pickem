import type { MetadataRoute } from "next";

// Lets people add the site to their phone's home screen and open it full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pick Em",
    short_name: "Pick Em",
    description: "Weekly NFL and college football pick ems with live standings.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
