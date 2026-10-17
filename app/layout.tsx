import type { Metadata, Viewport } from "next";
import { Noto_Sans_Myanmar } from "next/font/google";
import localFont from "next/font/local";
import GalaxyBackdrop from "@/components/GalaxyBackdrop";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

// Ramabhadra 1.0.5 (Silicon Andhra, OFL — see fonts/Ramabhadra-OFL.txt), Latin
// subset, bundled as the exact HINTED file fonts.google.com serves. Fetching it
// via next/font/google returned a build with the hinting tables stripped, which
// renders noticeably differently on Windows. Single, already-heavy weight (400).
const ramabhadra = localFont({
  src: "./fonts/Ramabhadra-latin.woff2",
  variable: "--font-ramabhadra",
  weight: "400",
  style: "normal",
});

// Fallback for Burmese labels and notes. Not preloaded: its unicode-range means
// the browser only downloads it once Myanmar script actually appears.
const myanmar = Noto_Sans_Myanmar({
  variable: "--font-myanmar",
  weight: ["400", "500", "600", "700"],
  subsets: ["myanmar"],
  preload: false,
});

export const metadata: Metadata = {
  title: "mithril",
  description: "A calm, offline-first expense tracker.",
  applicationName: "mithril",
  appleWebApp: {
    capable: true,
    title: "mithril",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f3ecff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ramabhadra.variable} ${myanmar.variable} antialiased`}>
      <body className="font-sans">
        <GalaxyBackdrop />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
