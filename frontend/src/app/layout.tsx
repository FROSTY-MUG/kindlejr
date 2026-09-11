import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kindle Jr 5.0 | IEEE GEU SB Assessment Platform",
  description: "Official real-time assessment platform for Kindle Jr 5.0 organized by IEEE GEU Student Branch for first-year B.Tech and BCA students at Graphic Era (Deemed to be University).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
