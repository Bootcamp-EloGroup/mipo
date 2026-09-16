# Roteiro de apresentação — MIPO

O catálogo público usa somente produtos da categoria `Moda`. Tamanho, cor e descrição são enriquecimentos qualitativos sintéticos porque esses atributos não existem nos CSVs; vendas, devoluções, preço e estoque permanecem derivados da base fornecida.

## Preparação

1. Use `DATA_SOURCE=supabase` e `MIPO_DEMO_MODE=true` em `.env.local`.
2. Para começar sem interações anteriores, execute `corepack pnpm data:reset-demo`.
3. Inicie com `corepack pnpm dev` e abra `/` e `/painel`.

## Fluxo

1. Abra **Camisa Social Slim Branco** e selecione **GG**. O snapshot tem 3 unidades e o MIPO sinaliza estoque baixo com dado real.
2. Abra **Top Delicado Preto** e selecione **P**. A taxa observada é 42,9%, mas há somente 7 vendas; o MIPO registra `insufficient_evidence` e não força uma recomendação.
3. Abra **Camisa Social Delicado Prata** e selecione **P**. Sem risco sustentado, adicione-a à sacola; a decisão fica como `not_required`.
4. Atualize `/painel` e apresente estados, evidências, regra e filtros.
5. Observe a indicação **Explicação assistida por IA** quando o agente concluir com uma saída válida.
6. Atualize o painel e mostre separadamente as execuções do EloAgents, fallback Groq, cache, rejeições e fallback determinístico.
7. Destaque que o cenário potencial permanece bloqueado sem recomendação elegível.

## Limites que devem ser verbalizados

- O painel mede interações do protótipo, não redução real de devoluções.
- Estoque é um snapshot, não uma série histórica.
- Tamanhos são enriquecimento sintético explícito sobre SKUs reais.
- Pendências viram “Sem resposta” após 30 minutos apenas na leitura; nenhum evento é reescrito.
- A IA escolhe somente uma estratégia de comunicação previamente autorizada. Risco, estoque, tamanho e elegibilidade continuam sendo calculados por tools determinísticas.
- EloAgents é primário; Groq e, por fim, a mensagem determinística preservam a jornada em caso de falha.

## Reset seguro

`corepack pnpm data:reset-demo` mostra as contagens e exige o Project Ref e a frase `RESETAR DEMO`. A função do banco alcança apenas sessões criadas com `is_demo=true`; dados históricos e sessões não-demo não podem ser removidos por ela.
