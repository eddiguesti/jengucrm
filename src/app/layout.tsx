import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jengu CRM | Luxury Hospitality Prospecting",
  description: "Find and connect with luxury hospitality properties",
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
          <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
