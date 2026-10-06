# ManutençãoJá

Aplicação web para comunicar e acompanhar pedidos de manutenção dos espaços do Colégio do Ramalhão. A autenticação reutiliza as contas Supabase da Comunidade CSJ; os pedidos ficam associados a um espaço já existente (tabela `salaja_espacos`, criada pelo SalaJá) e seguem um fluxo de estados validado pelo Admin.

Irmã do [SalaJá](https://github.com/antoniorappleton/SalaJa) — mesmo design, mesma autenticação partilhada, mesmos padrões de RLS/SQL.

## Preparar o backend

1. No SQL Editor do projeto Supabase partilhado com Direção de Turma, Scriptorium e SalaJá, confirmar que [`SalaJa/db/salaja_setup.sql`](https://github.com/antoniorappleton/SalaJa/blob/main/db/salaja_setup.sql) já foi executado — a ManutençãoJá reaproveita a tabela `salaja_espacos` (não duplica a lista de espaços).
2. Executar [`db/manutencaoja_setup.sql`](./db/manutencaoja_setup.sql). O script cria `manutencaoja_pedidos` e `manutencaoja_pedidos_historico`, instala a função de mudança de estado e atribui `manutencaoja_admin = true` a `leonor.castelbranco@colegio-ramalhao.com` na tabela partilhada `professores`.
3. Confirmar que essa conta consegue iniciar sessão nas outras apps da Comunidade. Na ManutençãoJá, usar o mesmo email e palavra-passe.

Um pedido só pode ser criado pelo utilizador autenticado, associado a si próprio. As políticas RLS impedem a leitura de pedidos de outras pessoas e reservam a mudança de estado à função `manutencaoja_mudar_estado`, que exige `manutencaoja_admin = true` e valida a transição (ver tabela de transições em `TRANSICOES`, `app.js`).

## Executar localmente

Servir a pasta através de HTTP (ex.: extensão Live Server do VS Code) e abrir `login.html`. Não abrir os ficheiros diretamente com `file://`. O cliente de autenticação e sessão é carregado da aplicação Direção de Turma publicada; por isso é necessária ligação à Internet mesmo durante testes locais.

## Fluxo de teste (Fase 1)

1. Executar o SQL de preparação e iniciar sessão com uma conta escolar já existente.
2. Criar um pedido em **Novo pedido** e confirmar que surge como "Pendente" em **Os meus pedidos** e no painel **Gestão de pedidos**.
3. Como `leonor.castelbranco@colegio-ramalhao.com`, avançar o pedido: Pendente → Em execução → Concluída → Fechada (ou Rejeitar em qualquer ponto antes de fechado).
4. Confirmar que cada mudança de estado fica registada em `manutencaoja_pedidos_historico`.
5. Confirmar que uma conta sem `manutencaoja_admin` é reencaminhada ao tentar abrir `admin.html` diretamente.

## Roadmap

Ver [`TODO.md`](./TODO.md) para o plano completo em fases, a crescer gradualmente a partir desta Fase 1.
