import './globals.css';
import { Inter } from 'next/font/google';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

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
        <div className="app">
          <Sidebar />
          <div className="main">
            <Topbar />
            <div className="scroll">
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
