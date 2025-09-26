import "./../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NovuSys • Validação",
  description: "Landing premium para validação de hipóteses em clínicas/consultórios",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        {/* Topo branco 200px com logo 360 (sua versão atual) */}
        <header className="brand-bar">
          <div className="brand-bar__inner">
            {/* Botão Admin (canto esquerdo, discreto) */}
            <a href="/admin" className="admin-link" aria-label="Área administrativa">
              Admin
            </a>

            {/* Se já estiver usando a imagem centralizada, mantenha-a */}
            <img src="/logo.png" alt="NovuSys" className="brand-bar__logo" />
          </div>
        </header>

        <div className="page-wrap">{children}</div>
      </body>
    </html>
  );
}
