import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "PALMY — מערכת גדודית לתעסוקה",
  description: "",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PALMY — מערכת גדודית לתעסוקה",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        {children}
        <Script id="sw-register" strategy="lazyOnload">
          {`if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`}
        </Script>
      </body>
    </html>
  );
}
