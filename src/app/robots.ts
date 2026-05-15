import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/utils";

export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sign-up", "/login"],
        disallow: ["/api", "/dashboard", "/compose", "/scheduled", "/connections", "/settings"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
