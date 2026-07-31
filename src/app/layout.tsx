import type { Metadata } from 'next';
import { Space_Grotesk, Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Portal Fiscal e Contábil | Fort Fruit',
  description: 'Portal de ferramentas para gestão fiscal e contábil — Fort Fruit Hortifrutigranjeiros',
  icons: { icon: '/logo-fortfruit.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen text-gray-800 font-sans">{children}</body>
    </html>
  );
}
