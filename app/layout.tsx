import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DND Battle Room",
  description: "A realtime tabletop for DND combat rooms"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
