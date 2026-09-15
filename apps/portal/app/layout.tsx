import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { LoadingOverlay, RouteLoader } from "@/components/LoadingOverlay";
import "./globals.css";
import "./sleek.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "School Portal", template: "%s | De Ultimate Glory Academy Portal" },
  description: "School portal for students, parents, teachers, administrators and the proprietor.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#caa53a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable}`}>
      <body className="portal-body">
        <RouteLoader />
        <LoadingOverlay />
        {children}
      </body>
    </html>
  );
}
