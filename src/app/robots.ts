import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/stripe";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api"] },
    sitemap: appUrl("/sitemap.xml"),
  };
}
