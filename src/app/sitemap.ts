import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://napoleondivingclub.com";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/programs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/register`, changeFrequency: "monthly", priority: 0.9 },
  ];
}
