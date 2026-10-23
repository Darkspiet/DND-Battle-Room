import type { Metadata } from "next";
import "./globals.css";
import { getSiteName } from "../lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return { title: getSiteName(), description: "A realtime tabletop for DND combat rooms" };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
