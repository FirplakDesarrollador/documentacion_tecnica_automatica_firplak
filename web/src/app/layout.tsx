import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { montserrat } from './fonts';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Catálogo de Documentación Técnica',
  description: 'Sistema automático de generación de etiquetas',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${montserrat.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased text-foreground bg-background font-sans min-h-screen">
        <Sidebar>{children}</Sidebar>
      </body>
    </html>
  );
}
