import type { Metadata } from 'next';
import { Inter, Quicksand, Nunito, Patrick_Hand } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const quicksand = Quicksand({
  subsets: ['latin'],
  variable: '--font-quicksand',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
});

const patrickHand = Patrick_Hand({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-patrick-hand',
  display: 'block',
  preload: true,
});

// Sour Gummy is imported in globals.css

export const metadata: Metadata = {
  title: "Don't Miss This Saturday - POS",
  description: 'Point of Sale Platform for Don\'t Miss This Saturday restaurant',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${quicksand.variable} ${nunito.variable} ${patrickHand.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
