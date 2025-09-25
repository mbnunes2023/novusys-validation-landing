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
        {/* BRAND BAR fixa e centralizada */}
        <header className="brand-bar">
          <div className="brand-bar__inner">
            <img src="/logo.png" alt="NovuSys" className="brand-bar__logo" />
            <div className="brand-bar__text">
              <span className="brand-bar__name">NovuSys</span>
              <span className="brand-bar__tagline">Transformamos códigos em resultados</span>
            </div>
          </div>
        </header>

        {/* Conteúdo das páginas */}
        <div className="page-wrap">{children}</div>
      </body>
    </html>
  );
}
