// Keep runtime configuration in JavaScript: loading a .ts config starts SWC's
// native worker pool even for a prebuilt Passenger production server.
/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  outputFileTracingIncludes: { "/*": ["./assets/fonts/NotoSans-Regular.ttf"] },
  experimental: { cpus: 1, serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/cliente",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/acceso",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // Specific private routes must follow the general rule: Next uses the
      // last matching header, including when a download returns an error.
      ...[
        "/api/commercial-documents/:path*",
        "/api/invoice-email/:path*",
        "/api/customers/:path*",
        "/api/work-documents/:path*",
        "/api/history-files/:path*",
        "/api/expenses/:path*",
        "/api/workforce/:path*",
      ].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};
export default config;
