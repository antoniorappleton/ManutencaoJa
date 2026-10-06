-- Run once in the shared Comunidade CSJ Supabase SQL Editor, depois de
-- SalaJa/db/salaja_setup.sql (esta app reaproveita a tabela
-- public.salaja_espacos, em vez de duplicar a lista de espaços do colégio).
--
-- Fase 1 (alicerces): registo de pedidos de manutenção associados a um
-- espaço existente, fila de validação/acompanhamento do Admin e histórico
-- de mudanças de estado. Sem avaliação técnica, anexos ou custos ainda —
-- ver ManutencaoJa/TODO.md para as fases seguintes.
--
-- ManutençãoJá precisa do seu PRÓPRIO sinalizador de Admin, pela mesma
-- razão documentada em SalaJa/db/add_salaja_admin_flag.sql: `professores`
-- é partilhada entre Scriptorium, Direção de Turma, SalaJá e esta app, e
-- `role`/`salaja_admin` já têm significado próprio nas outras. Começamos já
-- com `manutencaoja_admin`, em vez de reutilizar outra coluna por engano.
BEGIN;

ALTER TABLE public.professores ADD COLUMN IF NOT EXISTS manutencaoja_admin boolean NOT NULL DEFAULT false;

-- Sequence à parte (em vez de SERIAL/IDENTITY), para o código legível
-- MAN-<ano>-<nº> poder ser gerado no DEFAULT da coluna `codigo` abaixo. Tem
-- de existir antes da tabela, já que o DEFAULT a referencia.
CREATE SEQUENCE IF NOT EXISTS public.manutencaoja_codigo_seq;

CREATE TABLE IF NOT EXISTS public.manutencaoja_pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL DEFAULT (
    'MAN-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.manutencaoja_codigo_seq')::text, 4, '0')
  ),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_utilizador text NOT NULL,
  espaco_id text NOT NULL REFERENCES public.salaja_espacos(id),
  categoria text NOT NULL CHECK (categoria IN (
    'eletricidade', 'canalizacao', 'climatizacao', 'construcao_civil',
    'carpintaria', 'pintura', 'serralharia', 'informatica',
    'equipamentos', 'limpeza_especializada', 'espacos_exteriores',
    'seguranca', 'outro'
  )),
  titulo text NOT NULL CHECK (char_length(trim(titulo)) BETWEEN 3 AND 150),
  descricao text NOT NULL CHECK (char_length(trim(descricao)) BETWEEN 3 AND 2000),
  prioridade text NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  estado text NOT NULL DEFAULT 'pendente'
    CHECK (estado IN ('pendente', 'em_execucao', 'concluida', 'fechada', 'rejeitada')),
  nota_admin text CHECK (nota_admin IS NULL OR char_length(nota_admin) <= 1000),
  revisto_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisto_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manutencaoja_pedidos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.manutencaoja_pedidos(id) ON DELETE CASCADE,
  estado_anterior text,
  estado_novo text NOT NULL,
  alterado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nota text,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manutencaoja_pedidos_user_idx
  ON public.manutencaoja_pedidos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS manutencaoja_pedidos_estado_idx
  ON public.manutencaoja_pedidos (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS manutencaoja_pedidos_espaco_idx
  ON public.manutencaoja_pedidos (espaco_id);
CREATE INDEX IF NOT EXISTS manutencaoja_historico_pedido_idx
  ON public.manutencaoja_pedidos_historico (pedido_id, alterado_em);

CREATE OR REPLACE FUNCTION public.manutencaoja_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professores p
    WHERE lower(p.email) = lower(auth.jwt() ->> 'email')
      AND p.manutencaoja_admin = true
  );
$$;

-- Único ponto de mudança de estado: valida a transição, exige Admin,
-- e deixa sempre rasto em manutencaoja_pedidos_historico. O cliente nunca
-- faz UPDATE direto a manutencaoja_pedidos (ver política mais abaixo).
CREATE OR REPLACE FUNCTION public.manutencaoja_mudar_estado(
  p_pedido_id uuid,
  p_novo_estado text,
  p_nota text DEFAULT NULL
)
RETURNS public.manutencaoja_pedidos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pedido public.manutencaoja_pedidos;
  v_estado_anterior text;
  v_transicoes_validas text[];
BEGIN
  IF NOT public.manutencaoja_is_admin() THEN
    RAISE EXCEPTION 'Apenas um Admin pode mudar o estado de um pedido.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pedido
  FROM public.manutencaoja_pedidos
  WHERE id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido de manutenção não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  v_transicoes_validas := CASE v_pedido.estado
    WHEN 'pendente' THEN ARRAY['em_execucao', 'rejeitada']
    WHEN 'em_execucao' THEN ARRAY['concluida', 'rejeitada']
    WHEN 'concluida' THEN ARRAY['fechada', 'em_execucao']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (p_novo_estado = ANY(v_transicoes_validas)) THEN
    RAISE EXCEPTION 'Transição de estado inválida: % -> %.', v_pedido.estado, p_novo_estado
      USING ERRCODE = '22023';
  END IF;

  v_estado_anterior := v_pedido.estado;

  UPDATE public.manutencaoja_pedidos
  SET estado = p_novo_estado,
      nota_admin = COALESCE(nullif(trim(p_nota), ''), nota_admin),
      revisto_por = auth.uid(),
      revisto_em = now(),
      updated_at = now()
  WHERE id = p_pedido_id
  RETURNING * INTO v_pedido;

  INSERT INTO public.manutencaoja_pedidos_historico (pedido_id, estado_anterior, estado_novo, alterado_por, nota)
  VALUES (p_pedido_id, v_estado_anterior, p_novo_estado, auth.uid(), nullif(trim(p_nota), ''));

  RETURN v_pedido;
END;
$$;

ALTER TABLE public.manutencaoja_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manutencaoja_pedidos_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manutencaoja_pedidos_read_own_or_admin ON public.manutencaoja_pedidos;
CREATE POLICY manutencaoja_pedidos_read_own_or_admin
  ON public.manutencaoja_pedidos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.manutencaoja_is_admin());

DROP POLICY IF EXISTS manutencaoja_pedidos_request ON public.manutencaoja_pedidos;
CREATE POLICY manutencaoja_pedidos_request
  ON public.manutencaoja_pedidos FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND lower(email_utilizador) = lower(auth.jwt() ->> 'email')
    AND estado = 'pendente'
    AND revisto_por IS NULL
    AND revisto_em IS NULL
  );

DROP POLICY IF EXISTS manutencaoja_historico_read_own_or_admin ON public.manutencaoja_pedidos_historico;
CREATE POLICY manutencaoja_historico_read_own_or_admin
  ON public.manutencaoja_pedidos_historico FOR SELECT TO authenticated
  USING (
    public.manutencaoja_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.manutencaoja_pedidos p
      WHERE p.id = pedido_id AND p.user_id = auth.uid()
    )
  );

REVOKE ALL ON FUNCTION public.manutencaoja_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manutencaoja_is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.manutencaoja_mudar_estado(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manutencaoja_mudar_estado(uuid, text, text) TO authenticated;
GRANT SELECT, INSERT ON public.manutencaoja_pedidos TO authenticated;
GRANT SELECT ON public.manutencaoja_pedidos_historico TO authenticated;
GRANT USAGE ON SEQUENCE public.manutencaoja_codigo_seq TO authenticated;

-- Admin inicial: a mesma Leonor já Admin no SalaJá.
INSERT INTO public.professores (nome, email, manutencaoja_admin)
VALUES ('Leonor Castelbranco', 'leonor.castelbranco@colegio-ramalhao.com', true)
ON CONFLICT (email) DO UPDATE SET manutencaoja_admin = true;

COMMIT;
