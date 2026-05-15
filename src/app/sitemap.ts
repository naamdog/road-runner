import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl();
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/sign-up`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/login`, lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
