const developmentScriptPolicy =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
const upgradeInsecureRequests = process.env.APP_ORIGIN?.startsWith("https://") ? " upgrade-insecure-requests" : "";
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `default-src 'self'; base-uri 'self'; connect-src 'self' ws: wss:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; ${developmentScriptPolicy}; style-src 'self' 'unsafe-inline';${upgradeInsecureRequests}`
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
