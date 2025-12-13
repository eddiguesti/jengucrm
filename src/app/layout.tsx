import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CommandPaletteProvider } from "@/components/command-palette-provider";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jengu CRM | Luxury Hospitality Prospecting",
  description: "Find and connect with luxury hospitality properties",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Jengu CRM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${sora.className} antialiased`}>
        <ThemeProvider>
          <CommandPaletteProvider>
            <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
              {/* Desktop sidebar - hidden on mobile */}
              <div className="hidden md:block">
                <Sidebar />
              </div>
              {/* Mobile navigation */}
              <MobileNav />
              <main className="flex-1 overflow-auto pb-safe">
                {children}
              </main>
            </div>
            <Toaster />
          </CommandPaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
