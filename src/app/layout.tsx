import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

/* Self-hosted variable fonts (SIL OFL): Hanken Grotesk for UI, Archivo (width axis) for figures. */
const hanken = localFont({
  src: "./fonts/hanken-grotesk-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-hanken",
  display: "swap",
});

const archivo = localFont({
  src: "./fonts/archivo-latin-wdth.woff2",
  weight: "100 900",
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PriceAFirm",
    template: "%s · PriceAFirm",
  },
  description: "Independent, confidence-labeled valuations of businesses listed for sale, pooled into what buyers think.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#17181a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Light is the default; a member's choice is kept in a cookie so the first paint is already right.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={`${hanken.variable} ${archivo.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
