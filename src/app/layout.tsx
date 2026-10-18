import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar de Vagas Mainframe",
  description: "Vagas sênior e de liderança em mainframe, candidaturas e CV",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
