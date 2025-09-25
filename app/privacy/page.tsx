// app/privacy/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidade — NovuSys",
  description:
    "Como tratamos os dados coletados nesta landing de pesquisa (MVP).",
};

export default function PrivacyPage() {
  const brand = {
    gradient: "linear-gradient(135deg,#1976d2 0%,#6a11cb 50%,#2575fc 100%)",
  };

  return (
    <div className="min-h-screen">
      {/* HERO enxuto (sem logo/frase) */}
      <section
        className="w-full"
        style={{ background: brand.gradient, color: "white" }}
      >
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-end">
          <a
            href="/"
            className="px-4 py-2 rounded-full border bg-white/10 hover:bg-white/20 transition text-white"
          >
            ← Voltar
          </a>
        </div>
      </section>

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        <article className="bg-white rounded-2xl p-6 border shadow-sm">
          <h1 className="text-3xl font-extrabold mb-2">Política de Privacidade</h1>
          <p className="text-sm text-slate-500 mb-6">Última atualização: 2025</p>

          <ol className="space-y-4 text-slate-700 leading-relaxed">
            <li>
              <strong>1. Quem somos</strong><br />
              <span className="font-medium">NovuSys</span> — “Transformamos códigos em resultados”.
              Esta política descreve como tratamos dados na landing de validação de
              necessidades para clínicas e consultórios médicos (MVP).
            </li>

            <li>
              <strong>2. Quais dados coletamos</strong><br />
              Respostas do questionário (ex.: relevância do no-show, glosas, receitas digitais) —
              <em> sem dados sensíveis de saúde do paciente</em>.<br />
              Dados opcionais de identificação (se informados pelo médico): nome, CRM e contato
              (e-mail/WhatsApp).<br />
              Consentimentos: uso anônimo das respostas e, se marcado, consentimento para contato.
            </li>

            <li>
              <strong>3. Finalidades e bases legais (LGPD)</strong><br />
              Validar hipóteses de produto e entender dores reais de clínicas —
              <em> base legal: legítimo interesse</em> (art. 7º, IX) e/ou
              <em> consentimento</em> (art. 7º, I), conforme o caso.<br />
              Contato profissional para entrevistas/pilotos (opcional) —
              <em> base legal: consentimento</em>.
            </li>

            <li>
              <strong>4. Compartilhamento</strong><br />
              Não vendemos seus dados. Podemos usar fornecedores/operadores para viabilizar a
              operação, como: Vercel (hospedagem) e Supabase (banco de dados). Esses provedores
              processam dados sob nossas instruções contratuais.
            </li>

            <li>
              <strong>5. Armazenamento e segurança</strong><br />
              Dados armazenados em banco <em>PostgreSQL (Supabase)</em>.<br />
              Criptografia em trânsito (TLS) e Row Level Security habilitada.<br />
              Retenção: até <strong>12 meses</strong> após a coleta ou até a solicitação de eliminação,
              o que ocorrer primeiro.
            </li>

            <li>
              <strong>6. Seus direitos (LGPD)</strong><br />
              Acessar, confirmar tratamento, corrigir dados, anonimizar/bloquear, portar, obter
              informações sobre compartilhamentos, revogar consentimento (quando a base for
              consentimento) e reclamar a autoridade.
            </li>

            <li>
              <strong>7. Contato do controlador</strong><br />
              NovuSys — Contato/DPO: <a href="mailto:contato@novusys.com.br" className="underline">contato@novusys.com.br</a><br />
            </li>

            <li>
              <strong>8. Crianças e adolescentes</strong><br />
              A landing não se destina a menores. Não coletamos dados de crianças/adolescentes.
            </li>

            <li>
              <strong>9. Alterações desta política</strong><br />
              Podemos atualizar esta política para refletir melhorias ou requisitos legais.
              As mudanças passam a valer após a publicação nesta página.
            </li>
          </ol>

          <div className="mt-8">
            <a
              href="/"
              className="inline-flex items-center px-4 py-2 rounded-2xl border text-slate-800 hover:bg-slate-50"
            >
              Voltar ao formulário
            </a>
          </div>
        </article>

        <footer className="text-center text-xs text-slate-500 mt-8">
          © {new Date().getFullYear()} <span className="font-medium">NovuSys</span> — Todos os direitos reservados.
        </footer>
      </main>
    </div>
  );
}


    </main>
  );
}
