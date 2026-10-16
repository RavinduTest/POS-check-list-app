import type { Metadata } from "next";
import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = { title: "SERP POS Installation Tracker – Back Office" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
