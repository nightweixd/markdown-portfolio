import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BSC Radar — Your personal token screener",
  description: "Discover BSC tokens, filter market activity, save a watchlist and monitor your alert rules.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
