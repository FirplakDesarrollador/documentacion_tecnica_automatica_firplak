import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Geist, Geist_Mono } from 'next/font/google';
import { lato, montserrat, openSans, roboto } from './fonts';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { decodeGenerateLastUrl, GENERATE_LAST_URL_COOKIE } from '@/lib/navigation/generateLastUrl';
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
  const cookieStore = await cookies()
  const initialGenerateHref =
    decodeGenerateLastUrl(cookieStore.get(GENERATE_LAST_URL_COOKIE)?.value) ?? '/generate'

  return (
    <html
      lang="es"
      className={`${montserrat.variable} ${lato.variable} ${openSans.variable} ${roboto.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased text-foreground bg-background font-sans min-h-screen">
        <Sidebar access={access} initialGenerateHref={initialGenerateHref}>{children}</Sidebar>
      </body>
    </html>
  );
}
