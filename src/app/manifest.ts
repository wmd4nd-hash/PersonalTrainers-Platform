import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** Lets phones install the site to the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.shortName,
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#0f766e",
    categories: ["health", "fitness", "lifestyle"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Find a trainer", url: "/trainers" },
      { name: "Take the quiz", url: "/match" },
      { name: "My dashboard", url: "/dashboard" },
    ],
  };
}
