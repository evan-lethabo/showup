import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/next';
// Only the stylesheets both pages share live here. Main's and Event's own CSS define
// several of the same selectors differently, so each is imported by its own layout:
// see app/(flow)/layout.tsx and app/example/layout.tsx.
import '@/styles/variables.css';
import '@/styles/reset.css';
import '@/styles/fonts.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400..600&display=swap" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
