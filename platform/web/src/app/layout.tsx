import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'MedChain e-MC — National Digital Medical Certificate Platform',
  description:
    'Digitally signed, blockchain-anchored medical certificates for Malaysia. Verify any MC in seconds.',
};

// Apply the saved theme before first paint to avoid a flash
const themeScript = `
try {
  var t = localStorage.getItem('emc_theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
