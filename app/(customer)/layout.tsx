'use client';

import { Schoolbell } from 'next/font/google';

const schoolbell = Schoolbell({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={schoolbell.className} style={{ fontFamily: 'Schoolbell, cursive' }}>
      {children}
    </div>
  );
}
