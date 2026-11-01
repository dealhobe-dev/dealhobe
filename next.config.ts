import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Share-image fonts and logos are read from disk at runtime; make sure they are packaged with the OG routes.
  outputFileTracingIncludes: {
    "/**/opengraph-image*": ["./lib/og/fonts/**/*", "./lib/og/assets/**/*"],
  },
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ];
    return [
      { source: "/:path*", headers: security },
      // Rendered banners keep their file names when re-rendered, so cache for a day and revalidate in the background.
      { source: "/banners/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }] },
      // Account, bag and admin pages and every API response are per-user: never let a shared cache keep them.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
  images: {
    // Keep the local optimization endpoint enabled. The loader sends Cloudinary
    // requests directly to its CDN, avoiding remote optimizer fetch timeouts.
    loaderFile: "./lib/image-loader.ts",
    qualities: [75, 100], // 100 = hero banners (see lib/image-loader.ts)
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos",        pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com",  pathname: "/**" },
      { protocol: "https", hostname: "source.unsplash.com",  pathname: "/**" },
      { protocol: "https", hostname: "res.cloudinary.com",   pathname: "/**" },
    ],
  },
};

export default nextConfig;
