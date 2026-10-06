# ManutençãoJá — roadmap

## Fase 1 — Alicerces

- [x] Reutilizar autenticação partilhada da Comunidade CSJ.
- [x] Reaproveitar `salaja_espacos` em vez de duplicar a lista de espaços.
- [x] Registo de pedido (espaço, categoria, título, descrição, prioridade).
- [x] "Os meus pedidos" e painel do Admin ("Gestão de pedidos").
- [x] Fluxo de estados com função SQL dedicada e histórico de transições.
- [x] Flag `manutencaoja_admin` própria (não reutiliza `role` nem `salaja_admin`).
- [ ] Executar `db/manutencaoja_setup.sql` no SQL Editor do Supabase partilhado.
- [ ] Testar o fluxo completo com duas contas (ver README → Fluxo de teste).
- [ ] Criar o repositório GitHub e publicar via GitHub Pages.
- [ ] Acrescentar o tile da ManutençãoJá ao hub `ComunidadeCSJ`.

## Fase 2 — Avaliação, atribuição e agendamento

- [ ] Diagnóstico e solução proposta no momento da avaliação.
- [ ] Responsável pela intervenção (interno ou fornecedor externo).
- [ ] Data/hora prevista da intervenção.
- [ ] Impacto na disponibilidade do espaço (sem impacto / condicionado / indisponível).

## Fase 3 — Execução e anexos

- [ ] Múltiplas intervenções por pedido (trabalho realizado, materiais, dificuldades).
- [ ] Fotografias antes/depois.
- [ ] Documentos, orçamentos e faturas (bucket público, como `salaja-espacos`).

## Fase 4 — Financeiro

- [ ] Custo estimado vs. custo real.
- [ ] Fornecedor, nº de orçamento/fatura, estado do pagamento.

## Fase 5 — Histórico do espaço & preventiva

- [ ] Separador de histórico por espaço (intervenções, custo total, última intervenção).
- [ ] Tipos corretiva / preventiva / inspeção.
- [ ] Manutenções recorrentes (ex.: revisão anual).

## Fase 6 — Dashboard & relatórios

- [ ] KPIs (pedidos abertos, urgentes, atrasados, custos do mês).
- [ ] Gráficos por categoria, espaço e mês (usar a skill `dataviz`).

## Fase 7 — Pesquisa, filtros e notificações

- [ ] Filtros combinados (espaço, categoria, prioridade, estado, período).
- [ ] Pesquisa livre.
- [ ] Notificações in-app (novo pedido, urgente, atribuição, atraso, conclusão).

## Fase 8 — Perfis e permissões refinados

- [ ] Distinguir Utilizador / Técnico / Gestor / Admin, com RLS própria para cada papel.
