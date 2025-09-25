# NovuSys – Landing de Validação (Next.js + Supabase + Vercel)

Landing **interativa** para validar dores de clínicas médicas. Sem login. 
As respostas são gravadas no **Supabase** e um gráfico simples mostra o agregado.

## Stack
- Next.js (App Router)
- Tailwind CSS
- Supabase (DB + Policies)
- Recharts

## Variáveis de ambiente
Crie `.env.local` (na raiz):
```
NEXT_PUBLIC_SUPABASE_URL=coloque_sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=coloque_sua_anon_key
```

## Banco de dados (rode o SQL no Supabase)
```sql
create extension if not exists pgcrypto;

create table if not exists public.validation_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  doctor_role text,
  clinic_size text,
  q_noshow_relevance text,
  q_noshow_has_system text,
  q_noshow_financial_impact text,
  q_glosa_is_problem text,
  q_glosa_interest text,
  q_glosa_who_suffers text,
  q_rx_rework text,
  q_rx_elderly_difficulty text,
  q_rx_tool_value text,
  consent boolean default false,
  comments text
);

alter table public.validation_responses enable row level security;

create policy "allow_insert_anonymous" on public.validation_responses
  for insert to anon using (true) with check (true);

create policy "allow_select_anonymous" on public.validation_responses
  for select to anon using (true);
```

## Deploy rápido (sem usar local)
1. Crie um repositório **vazio** no GitHub (sem README).
2. No GitHub, clique em **Add file > Upload files** e envie **todos** os arquivos desta pasta.
3. Na **Vercel**, importe o repositório e defina as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. No **Supabase**, crie o projeto e rode o SQL acima.
5. Abra a URL da Vercel e compartilhe o link com o médico.

## Marca
Coloque seu logo em `public/logo.png`. O layout já mostra **NovuSys** e usa a cor `#1976d2`.
