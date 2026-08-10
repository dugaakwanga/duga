import type { Metadata } from "next";
import { Baloo_2, Manrope } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { school, siteUrl } from "@/lib/content";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  variable: "--font-baloo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${school.name} — Akwanga, Nasarawa State`,
    template: `%s | ${school.name}`,
  },
  description:
    "De Ultimate Glory Academy is a co-educational primary and secondary school in Akwanga, Nasarawa State, Nigeria, committed to academic excellence and character development.",
  keywords: [
    "De Ultimate Glory Academy",
    "school in Akwanga",
    "primary school Nasarawa",
    "secondary school Nasarawa",
    "boarding school Akwanga",
    "Nigerian schools",
  ],
  openGraph: {
    title: `${school.name} — Akwanga, Nasarawa State`,
    description:
      "Imparting the winning wisdom. Admissions open for the new academic session.",
    locale: "en_NG",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${baloo.variable}`}>
      <body>
        <div className="mkt-grain" aria-hidden="true" />
        <div className="mkt-shell">
          <SiteHeader />
          <main className="mkt-main">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
