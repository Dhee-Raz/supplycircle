import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SupplyCircle · Multi-store purchasing',description:'Coordinate stock requests, store purchases, and partners across every business location.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
