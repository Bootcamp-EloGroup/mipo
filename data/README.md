# Dados não publicados

Os notebooks esperam os arquivos abaixo nesta pasta:

- `vendas.csv`
- `atendimento.csv`
- `estoque.csv`
- `clientes.csv`
- `marketing.csv`

As bases brutas não são versionadas neste repositório público porque possuem identificadores e registros em granularidade de cliente, pedido e atendimento.

O `marketing.csv` também não é versionado. A integração segura usa
`scripts/import-marketing-data.mjs` para persistir apenas agregados por canal,
categoria, atribuição e status da campanha. A base não possui uma chave
confiável campanha → pedido → cliente; por isso seus indicadores não são
usados para atribuir margem, LTV ou causalidade a pedidos.

Para reproduzir as análises, obtenha os arquivos pela fonte autorizada do case EloGroup e mantenha os nomes acima. Não publique uma cópia sem antes confirmar licença, finalidade e anonimização.

Dry-run dos importadores:

```bash
pnpm data:import -- --sales /caminho/vendas.csv --inventory /caminho/estoque.csv
pnpm data:import-management -- --customers /caminho/clientes.csv --service /caminho/atendimento.csv
pnpm data:import-marketing -- --marketing /caminho/marketing.csv
```
