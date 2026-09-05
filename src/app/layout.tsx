import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { themeBootstrapScript } from "@/components/ThemeToggle";
import "./globals.css";

// The whole voice. The variable axis carries both the transcript sizes and the
// titling weight, so the page speaks in one face at two volumes.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

// Timestamps and counts are measurements, so they get real tabular figures.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ask the Lecture",
  description: "Ask questions about a lecture and jump to the exact moment in the recording.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${manrope.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored appearance before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
