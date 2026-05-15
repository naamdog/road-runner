import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_NAME = "Road Runner";
const APP_DESC =
  "Schedule once. Run everywhere. The fastest way to publish short-form video to YouTube, Instagram, TikTok, LinkedIn, and Facebook on your own clock.";

export const viewport: Viewport = {
  themeColor: "#08090a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default: `${APP_NAME} — Schedule once. Run everywhere.`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESC,
  keywords: [
    "social media scheduler",
    "short-form video",
    "YouTube Shorts scheduler",
    "Instagram Reels scheduler",
    "TikTok scheduler",
    "LinkedIn video scheduler",
    "Facebook Reels scheduler",
    "Blotato alternative",
  ],
  authors: [{ name: "Road Runner" }],
  creator: "Road Runner",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — Schedule once. Run everywhere.`,
    description: APP_DESC,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Schedule once. Run everywhere.`,
    description: APP_DESC,
  },
  robots: { index: true, follow: true },
  applicationName: APP_NAME,
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delayDuration={200}>
          {children}
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
