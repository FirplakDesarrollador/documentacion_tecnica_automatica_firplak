import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { lato, montserrat, openSans, roboto } from './fonts';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { getAccessContext } from '@/utils/auth/access';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SamiGen - Catálogo de Documentación Técnica',
  description: 'Sistema automático de generación de etiquetas',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getAccessContext()

  return (
    <html
      lang="es"
      className={`${montserrat.variable} ${lato.variable} ${openSans.variable} ${roboto.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased text-foreground bg-background font-sans min-h-screen">
        <Sidebar access={access}>{children}</Sidebar>
      </body>
    </html>
  );
}
