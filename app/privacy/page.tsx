export const metadata = {
  title: "Política de Privacidade — NovuSys",
  description: "Política de Privacidade da landing de validação (LGPD)",
  robots: { index: false }, // não precisa ranquear no Google
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="max-w-3xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Política de Privacidade</h1>
          <p className="text-sm text-slate-500 mt-1">
            Última atualização: {new Date().getFullYear()}
          </p>
        </header>

        <section className="prose prose-slate max-w-none">
          <h2>1. Quem somos</h2>
          <p>
            <strong>NovuSys</strong> — “Transformamos códigos em resultados”. Esta política
            descreve como tratamos dados na landing de validação de dores para clínicas médicas.
          </p>

          <h2>2. Quais dados coletamos</h2>
          <ul>
            <li>
              <strong>Respostas do questionário</strong> (ex.: relevância do no-show, glosas,
              receitas digitais) — <em>sem dados sensíveis de saúde do paciente</em>.
            </li>
            <li>
              <strong>Dados opcionais de identificação</strong> (se informados pelo médico):
              nome, CRM e contato (e-mail/WhatsApp).
            </li>
            <li>
              <strong>Consentimentos</strong>: uso anônimo das respostas e, se marcado, consentimento para contato.
            </li>
          </ul>

          <h2>3. Finalidades e bases legais (LGPD)</h2>
          <ul>
            <li>
              <strong>Validar hipóteses de produto</strong> e entender dores reais de clínicas —
              <em>base legal</em>: <strong>legítimo interesse</strong> (art. 7º, IX) e/ou{" "}
              <strong>consentimento</strong> (art. 7º, I), conforme o caso.
            </li>
            <li>
              <strong>Contato profissional</strong> para entrevistas/pilotos <em>(opcional)</em> —
              <em>base legal</em>: <strong>consentimento</strong>.
            </li>
          </ul>

          <h2>4. Compartilhamento</h2>
          <p>
            Não vendemos seus dados. Podemos usar fornecedores/operadores para viabilizar a
            operação, como: <strong>Vercel</strong> (hospedagem) e <strong>Supabase</strong>
            (banco de dados). Esses provedores processam dados sob nossas instruções contratuais.
          </p>

          <h2>5. Armazenamento e segurança</h2>
          <ul>
            <li>Dados armazenados em banco <strong>PostgreSQL (Supabase)</strong>.</li>
            <li>Criptografia em trânsito (TLS) e <em>Row Level Security</em> habilitada.</li>
            <li>
              Retenção: até <strong>12 meses</strong> após a coleta ou até a solicitação de
              eliminação, o que ocorrer primeiro.
            </li>
          </ul>

          <h2>6. Seus direitos (LGPD)</h2>
          <p>Você pode solicitar, a qualquer momento:</p>
          <ul>
            <li>Confirmação da existência de tratamento e acesso aos dados;</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
            <li>Portabilidade a outro fornecedor, quando aplicável;</li>
            <li>Informação sobre compartilhamentos e sobre a possibilidade de não consentir;</li>
            <li>Revogação do consentimento, quando for a base legal.</li>
          </ul>

          <h2>7. Contato do controlador</h2>
          <p>
            <strong>NovuSys</strong> — Contato/DPO:{" "}
            <a href="mailto:contato@novusys.com.br">contato@novusys.com.br</a>
            <br />
            (substitua pelo e-mail oficial, se desejar)
          </p>

          <h2>8. Crianças e adolescentes</h2>
          <p>
            A landing não se destina a menores. Não coletamos dados de crianças/adolescentes.
          </p>

          <h2>9. Alterações desta política</h2>
          <p>
            Podemos atualizar esta política para refletir melhorias ou requisitos legais. As
            mudanças passam a valer após a publicação nesta página.
          </p>

          <p className="mt-6">
            Se tiver dúvidas, entre em contato. Obrigado por contribuir com a validação!
          </p>
        </section>

        <footer className="mt-10 text-xs text-slate-500">
          NovuSys — Transformamos códigos em resultados • {new Date().getFullYear()}
        </footer>
      </div>
    </main>
  );
}
