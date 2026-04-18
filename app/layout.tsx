import "./globals.css";

import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PAA AI Customer Service System",
  description: "AI-assisted lead qualification and admin handoff system for PAA Air Service"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
