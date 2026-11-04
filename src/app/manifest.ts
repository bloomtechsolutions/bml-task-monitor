import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Upnext",
    short_name: "Upnext",
    description: "Know what's next. Get it done.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#16a34a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
