import type { Metadata } from "next";
import { ThemeModeScript } from "flowbite-react";
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
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeModeScript defaultMode="light" />
      </head>
      <body>{children}</body>
    </html>
  );
}
