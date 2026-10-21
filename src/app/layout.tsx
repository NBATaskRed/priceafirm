import type { Metadata, Viewport } from "next";
import { Manrope, Archivo } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "PriceAFirm",
    template: "%s · PriceAFirm",
  },
  description: "Independent, confidence-labeled valuations of businesses listed for sale, pooled into crowd intelligence.",
};

export const viewport: Viewport = {
  themeColor: "#141414",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${archivo.variable} h-full`}
      style={{ ["--font-ui" as string]: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif", ["--font-figures" as string]: "var(--font-archivo), var(--font-manrope), ui-sans-serif, sans-serif" }}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
