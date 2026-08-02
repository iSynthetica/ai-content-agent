import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";

import { getLanguage, getT } from "@/lib/i18n/server";

import { Providers } from "./providers";
import "./globals.css";

// Self-host шрифту через next/font (DS §4/§5) — без зовнішнього CDN, узгоджено з Docker-деплоєм.
// Cyrillic-сабсет обов'язковий: інтерфейс і українською теж (друга мова UI).
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: "Forteq — AI Content Agent",
    description: t("Адмінка AI Content Agent"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Мова UI читається з cookie тут (сервер), до першого рендера — так <html lang> і перший
  // клієнтський рендер (LanguageProvider initialLanguage) завжди узгоджені, без FOUC/мисматчу.
  const language = await getLanguage();

  return (
    // suppressHydrationWarning — next-themes додає class до <html> на клієнті.
    <html lang={language} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers initialLanguage={language}>
          {children}
          {/* Sonner — єдиний канал транзієнтних тостів (DS §6.1/§7) */}
          <Toaster richColors closeButton position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
