import type { Metadata } from 'next';
import { NavBar } from '@/components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Liberty Reconciliation',
  description: 'Unified platform for Agency Banking and Card Reconciliation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50">
        <NavBar />
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-gray-800 text-gray-300 text-center py-6 mt-12">
          <p>&copy; 2026 Liberty Assured Group. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
