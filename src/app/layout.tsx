import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";


export const metadata: Metadata = {
  title: { default: "Upnext", template: "%s · Upnext" },
  description: "Know what's next. Get it done.",
  applicationName: "Upnext",
};

export const viewport: Viewport = { themeColor: "#f5f6f8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
