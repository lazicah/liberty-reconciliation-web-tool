'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavBar() {
  const pathname = usePathname();

  const isActive = (path: string): boolean => pathname === path;

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="text-2xl font-bold">Liberty Reconciliation</div>
          <div className="flex gap-6">
            <Link
              href="/"
              className={`px-4 py-2 rounded transition ${
                isActive('/') ? 'bg-blue-800 font-bold' : 'hover:bg-blue-700'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/reconciliation"
              className={`px-4 py-2 rounded transition ${
                isActive('/reconciliation') ? 'bg-blue-800 font-bold' : 'hover:bg-blue-700'
              }`}
            >
              Reconciliation
            </Link>
            <Link
              href="/metrics"
              className={`px-4 py-2 rounded transition ${
                isActive('/metrics') ? 'bg-blue-800 font-bold' : 'hover:bg-blue-700'
              }`}
            >
              Metrics
            </Link>
            <Link
              href="/config"
              className={`px-4 py-2 rounded transition ${
                isActive('/config') ? 'bg-blue-800 font-bold' : 'hover:bg-blue-700'
              }`}
            >
              Configuration
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
