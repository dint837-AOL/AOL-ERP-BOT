/**
 * Root Layout Component
 * 
 * Provides the global HTML structure, font (Inter), and layout wrapper.
 * Includes the Sidebar navigation and sets up the main content area.
 * Designed for responsive viewports (Web & Mobile).
 */
import './globals.css';
import { Inter } from 'next/font/google';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/AuthGuard';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'AlliedOne ERP System',
  description: 'Internal ERP for AlliedOne',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
