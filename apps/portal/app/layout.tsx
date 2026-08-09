import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  weight: "variable",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "School Portal", template: "%s | De Ultimate Glory Academy Portal" },
  description: "School portal for students, parents, teachers, administrators and the proprietor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable}`}>
      <body className="portal-body">{children}</body>
    </html>
  );
}
