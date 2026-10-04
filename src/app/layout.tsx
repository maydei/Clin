import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clin — PDF Studio",
  description: "Clin · PDF Studio. Organiza, anota y edita PDF en tu navegador.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

