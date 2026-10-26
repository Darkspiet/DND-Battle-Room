import type { Metadata } from "next";
import "./globals.css";

export function generateMetadata(): Metadata { return {
  title: process.env.SITE_NAME || "DND Battle Room",
  description: "A self-hosted campaign world and realtime tabletop for Dungeons & Dragons."
}; }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
