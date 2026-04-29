import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teams Demo App",
  description: "Teams tab app with automated messaging",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
