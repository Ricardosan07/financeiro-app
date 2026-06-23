-- Execute este SQL no Supabase SQL Editor

-- Contas bancárias
CREATE TABLE contas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('corrente', 'poupanca', 'investimento', 'digital')),
  saldo_atual NUMERIC(12,2) DEFAULT 0,
  data_referencia DATE DEFAULT CURRENT_DATE,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Categorias
CREATE TABLE categorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'investimento', 'transferencia')),
  grupo TEXT
);

-- Fixos recorrentes
CREATE TABLE fixos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  categoria_id UUID REFERENCES categorias(id),
  conta_id UUID REFERENCES contas(id),
  data_inicio DATE NOT NULL,
  data_fim DATE,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Parcelas
CREATE TABLE parcelas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL,
  num_parcelas INTEGER NOT NULL,
  valor_parcela NUMERIC(12,2) NOT NULL,
  mes_inicio INTEGER NOT NULL,
  ano_inicio INTEGER NOT NULL,
  mes_fim INTEGER NOT NULL,
  ano_fim INTEGER NOT NULL,
  cartao TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Lançamentos avulsos
CREATE TABLE lancamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  categoria_id UUID REFERENCES categorias(id),
  valor NUMERIC(12,2) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  forma_pagamento TEXT,
  conta_id UUID REFERENCES contas(id),
  cartao TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own contas" ON contas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own categorias" ON categorias FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own fixos" ON fixos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own parcelas" ON parcelas FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own lancamentos" ON lancamentos FOR ALL USING (auth.uid() = user_id);
