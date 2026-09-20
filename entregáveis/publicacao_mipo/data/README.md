# Dados não publicados

Os notebooks esperam os arquivos abaixo nesta pasta:

- `vendas.csv`
- `atendimento.csv`
- `estoque.csv`
- `clientes.csv`
- `marketing.csv`

As bases brutas não são versionadas neste repositório público porque possuem identificadores e registros em granularidade de cliente, pedido e atendimento.

Para reproduzir as análises, obtenha os arquivos pela fonte autorizada do case EloGroup e mantenha os nomes acima. Não publique uma cópia sem antes confirmar licença, finalidade e anonimização.

## Contrato mínimo para o checkout inteligente

O motor determinístico pode ser alimentado por uma visão consolidada por SKU e
tamanho, sem expor identificadores do cliente. Além dos campos do produto e das
devoluções, a visão pode fornecer:

- `return_rate` e `sample_size` do SKU/tamanho;
- `dominant_reason` e `quality_return_rate`;
- `customer_usual_size` e `customer_size_observations`, agregados e minimizados;
- `stock_selected` e alternativas com `sku`, `size`, `return_rate` e `stock`;
- `product_category`.

O motor exige taxa entre 0 e 1, estoque não negativo e pelo menos três
observações para considerar o tamanho usual do cliente. Alternativas sem estoque
são descartadas antes da recomendação. A ausência de evidência reduz a
cobertura e não deve forçar uma troca.
