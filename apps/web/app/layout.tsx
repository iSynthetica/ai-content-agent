import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { Providers } from "./providers";
import "./globals.css";

// Self-host шрифту через next/font (DS §4/§5) — без зовнішнього CDN, узгоджено з Docker-деплоєм.
// Cyrillic-сабсет обов'язковий: інтерфейс українською.
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Forteq — AI Content Agent",
  description: "Адмінка AI Content Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning — next-themes додає class до <html> на клієнті.
    <html lang="uk" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          {/* Sonner — єдиний канал транзієнтних тостів (DS §6.1/§7) */}
          <Toaster richColors closeButton position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
