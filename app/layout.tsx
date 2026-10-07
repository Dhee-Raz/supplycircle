import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'StockTogether · Shared stock lists',description:'One shared purchasing list for every store. Keep your team and partners in sync.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
