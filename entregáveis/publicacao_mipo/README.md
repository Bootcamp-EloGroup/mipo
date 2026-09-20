# Análises de dados — case Vértice / MIPO

Esta pasta reúne as análises que fundamentaram o **MIPO (Motor Inteligente de Priorização Operacional)**.

## Ordem de leitura

1. [`analises/01_exploracao_inicial.ipynb`](analises/01_exploracao_inicial.ipynb) — exploração inicial das frentes de vendas, margem, devoluções, atendimento, estoque e clientes.
2. [`analises/02_validacao_metodologica.ipynb`](analises/02_validacao_metodologica.ipynb) — revisão de qualidade, robustez, limitações e viabilidade de modelos.
3. [`analises/03_margem_e_issue_tree.ipynb`](analises/03_margem_e_issue_tree.ipynb) — investigação focada em margem, priorização e issue tree.

## Síntese dos resultados

- 24.454 pedidos aprovados válidos e 3.639 devoluções: taxa observada de 14,88%.
- Defeito e tamanho errado somam 1.830 ocorrências, ou 50,29% das devoluções.
- WISMO representa 10.765 tickets, ou 30,04% do atendimento válido.
- O experimento temporal de risco de devolução obteve ROC-AUC 0,497; portanto, ML é **NO-GO** para o MVP.
- Estoque é um retrato pontual. Valores associados a SKUs críticos representam exposição, não perda histórica comprovada.

## Limites de interpretação

- Valores financeiros são históricos ou estimados; não representam economia capturada pelo MIPO.
- Associação estatística não demonstra causalidade.
- A base de estoque não é uma série temporal.
- A IA generativa pode explicar evidências, mas regras e cálculos determinísticos sustentam decisões.

## Dados

As bases CSV não estão incluídas porque contêm identificadores e textos em nível de cliente/pedido. Consulte [`data/README.md`](data/README.md) para o contrato esperado.

Para executar uma demonstração sem os dados privados, use a base sintética
[`data/mock/checkout_cases.json`](data/mock/checkout_cases.json), descrita em
[`data/mock/README.md`](data/mock/README.md).

## Documentação complementar

- [`docs/evidencias.md`](docs/evidencias.md) — relatório rastreável de evidências.
- [`docs/roadmap.md`](docs/roadmap.md) — roadmap técnico em ordem de dependências.
- [`docs/mvp.md`](docs/mvp.md) — definição funcional e técnica do MVP.

## Implementação determinística

O primeiro núcleo executável está em [`mipo_engine/checkout.py`](mipo_engine/checkout.py).
`evaluate_checkout()` recebe a evidência disponível no checkout, calcula um score
reproduzível, filtra alternativas sem estoque e retorna uma ação estruturada:
`no_intervention`, `confirm_selection`, `change_size` ou `suggest_similar`.

Além do histórico do SKU/tamanho, o contrato aceita contexto não identificável
do cliente (`customer_usual_size` e volume de observações), sinal de qualidade,
estoque selecionado e categoria do produto. Esses campos só influenciam a
priorização quando possuem evidência mínima; não são usados para identificar o
cliente nem substituem validação de negócio.

A IA pode usar essa saída para redigir a explicação para o cliente ou gestor,
mas não calcula o score, não inventa estoque e não altera o carrinho sem o aceite
registrado. Os cenários principais estão em [`tests/test_checkout.py`](tests/test_checkout.py).
