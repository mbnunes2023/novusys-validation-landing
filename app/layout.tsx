import "./../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NovuSys • Validação de Dores",
  description: "Landing interativa para validação de dores em clínicas médicas (MVP)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>{children}</body>
    </html>
  );
}
