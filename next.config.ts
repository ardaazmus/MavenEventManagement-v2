import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ONBOARD kanıt sunucusu: ikinci next dev aynı .next kilidine takılmasın diye
  // distDir env ile ezilebilir (varsayılan değişmez — üretim/CI etkilenmez).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
