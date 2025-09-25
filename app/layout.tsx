import "./../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NovuSys • Validação de Dores",
  description: "Landing premium para validação de dores em clínicas médicas (MVP)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        {/* BRAND BAR: apenas o logo central, grande */}
        <header className="brand-bar">
          <div className="brand-bar__inner">
            <img src="/logo.png" alt="NovuSys" className="brand-bar__logo" />
          </div>
        </header>

        <div className="page-wrap">{children}</div>
      </body>
    </html>
  );
}
