import { Space_Grotesk, DM_Sans } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { metadata } from "@/components/root-metadata";
import AppSessionProvider from "@/components/session-provider";
export { metadata };

const spaceGrotesk = Space_Grotesk({ variable: "--font-heading", subsets: ["latin"], weight: ["500","600","700"] });
const dmSans = DM_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400","500","600","700"] });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (<html lang="en"><body className={`${spaceGrotesk.variable} ${dmSans.variable} antialiased`}><AppSessionProvider>{children}</AppSessionProvider><SpeedInsights /></body></html>);
}
