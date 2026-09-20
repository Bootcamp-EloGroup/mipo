# Dados sintéticos do MIPO

`checkout_cases.json` contém dez casos artificiais para demonstrar o checkout
inteligente. A base cobre recomendação de tamanho, sugestão de produto similar,
defeito, falta de estoque, baixa evidência e casos sem intervenção.

Os valores não foram calculados a partir de clientes reais e não devem ser
apresentados como resultado observado ou economia capturada. Para usar um caso
no motor, transforme o objeto em `CheckoutInput` e cada item de `alternatives`
em `Alternative`.
