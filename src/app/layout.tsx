import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Napoleon Diving Club", template: "%s · NDC" },
  description: "Napoleon Diving Club operations",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#0f2440",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
