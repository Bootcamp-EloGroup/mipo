# Integração dos dados do case EloGroup

## Fonte analisada

O case local contém cinco bases em `data/`: vendas, atendimento, estoque,
clientes e marketing. Os arquivos brutos permanecem fora deste repositório.

## O que foi integrado

| Base | Destino | Tratamento |
|---|---|---|
| `vendas.csv` | catálogo, pedidos, itens e devoluções | validação de linha, SKU e saldo financeiro |
| `estoque.csv` | snapshot de estoque | saldo disponível e status por SKU |
| `clientes.csv` | `customer_segment_snapshots` | agregação por RFM, fidelidade, estado e dispositivo |
| `atendimento.csv` | `service_daily_metrics` | agregação diária sem texto livre, IDs ou PII |
| `marketing.csv` | `marketing_campaign_metrics` | agregação por canal, categoria, atribuição e status |

## Resultado do dry-run da fonte atual

- vendas: 27.759 linhas lidas, 27.758 aceitas e uma rejeitada;
- estoque: 5.000 linhas lidas e aceitas;
- clientes: 15.000 linhas agregadas sem persistir identificadores;
- atendimento: 35.841 linhas lidas, 35.840 aceitas e uma rejeitada;
- marketing: 3.500 campanhas aceitas em agregados gerenciais.

Os números de atendimento devem ser tratados como 35.840 registros válidos,
porque existe uma linha parcial na origem. O WISMO corresponde a 10.765
registros aceitos.

## Limites de interpretação

Marketing possui métricas de campanha, mas não uma ligação completa entre
campanha, pedido e cliente. O MIPO exibe investimento, conversões e receita
gerada como métricas históricas da fonte. Não calcula margem por campanha,
redistribuição automática de verba ou efeito causal sobre pedidos.

Para importar os agregados no Supabase, execute primeiro as migrations e faça
um dry-run. O modo `--apply` exige credenciais de serviço configuradas em
`.env.local` e deve ser executado apenas após revisar o resumo.
