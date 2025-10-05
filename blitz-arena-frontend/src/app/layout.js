'use client';

import { Inter } from 'next/font/google';
import './globals.css';
import { SocketProvider } from '@/contexts/SocketContext';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <SocketProvider>
            {children}
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}