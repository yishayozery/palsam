import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // מאפשר העלאת תמונות (סמל גדוד / צילום מוצר) כ-data-URL בתוך Server Actions
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
