import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Lunemir — A world that remembers you",
  description: "兼容角色卡、世界书与预设的沉浸式 AI 角色互动空间。",
  applicationName: "Lunemir",
  icons: {
    icon: "/lunemir-icon.png",
    apple: "/lunemir-icon.png",
  },
  openGraph: {
    title: "Lunemir",
    description: "A world that remembers you.",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lunemir",
    description: "A world that remembers you.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0a24",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
