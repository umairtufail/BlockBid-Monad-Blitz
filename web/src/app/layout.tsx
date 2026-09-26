import type { Metadata } from "next";
import { Archivo_Black, DM_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Archivo_Black({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "BlockBid — Live Ad Slot Auction",
  description:
    "Highest bidder owns the onchain billboard this round. Real-time attention auctions on Monad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
