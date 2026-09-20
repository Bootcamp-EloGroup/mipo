from mipo_agent.concierge import _authorize_suggested_action, _extract_suggested_actions, handle_concierge_chat
from mipo_agent.models import ChatMessage, ChatRequest, Product, SuggestedAction, Variant


def test_action_extraction_size():
    raw = "Para o seu perfil, recomendo o tamanho M. [SUGESTÃO: TAMANHO_M] Ficará perfeito."
    cleaned, action = _extract_suggested_actions(raw, "prod_vestido_aurora")

    assert "[SUGESTÃO" not in cleaned
    assert action is not None
    assert action.type == "select_size"
    assert action.size == "M"
    assert action.productId == "prod_vestido_aurora"
    assert action.label == "Selecionar tamanho M"


def test_action_extraction_product():
    raw = "A Calça Eixo harmoniza muito bem com a Blusa Trama. [SUGESTÃO: PRODUTO_prod_blusa_trama]"
    cleaned, action = _extract_suggested_actions(raw)

    assert "[SUGESTÃO" not in cleaned
    assert action is not None
    assert action.type == "view_product"
    assert action.productId == "prod_blusa_trama"


def test_concierge_fallback_aurora():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Qual tamanho do Vestido Aurora é melhor se tenho busto volumoso?")],
        productContext=Product(
            id="prod_vestido_aurora",
            title="Vestido Aurora",
            category="Vestidos",
            variants=[
                Variant(id="v1", size="P", returnRate=0.32, defectRate=0.01),
                Variant(id="v2", size="M", returnRate=0.12, defectRate=0.01),
            ],
        ),
    )
    res = handle_concierge_chat(req)

    assert res.provider == "deterministic"
    assert "Vestido Aurora" in res.reply or "linho" in res.reply
    assert res.suggestedAction is not None
    assert res.suggestedAction.size == "M"


def test_concierge_fallback_general_fit():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Como são as medidas e caimento das peças de alfaiataria?")],
    )
    res = handle_concierge_chat(req)

    assert res.provider == "deterministic"
    assert len(res.reply) > 20
    assert "caimento" in res.reply.lower() or "modelagens" in res.reply.lower()


def test_rejects_size_action_outside_server_product_context():
    request = ChatRequest(
        messages=[ChatMessage(role="user", content="Qual tamanho?")],
        productContext=Product(
            id="prod_vestido_aurora",
            title="Vestido Aurora",
            category="Vestidos",
            variants=[Variant(id="v1", size="P", returnRate=0.1, defectRate=0.01)],
        ),
    )
    action = SuggestedAction(
        type="select_size",
        productId="prod_vestido_aurora",
        size="GG",
        label="Selecionar tamanho GG",
    )

    assert _authorize_suggested_action(action, request) is None


def test_rejects_unknown_product_action():
    request = ChatRequest(messages=[ChatMessage(role="user", content="Sugira uma peça")])
    action = SuggestedAction(type="view_product", productId="prod_injetado", label="Abrir")

    assert _authorize_suggested_action(action, request) is None


def test_concierge_uses_structured_textile_evidence():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Como é o tecido e a elasticidade?")],
        productContext=Product(
            id="produto_catalogado",
            title="Vestido de Linho",
            category="Moda",
            variants=[Variant(id="v1", size="M", returnRate=0.1, defectRate=0.01)],
            textileProfile={
                "material": "Linho",
                "composition": "100% linho",
                "elasticity": "none",
                "structure": "structured",
                "drape": "estruturado e respirável",
                "care": ["lavar em ciclo delicado"],
                "origin": "provided",
                "evidence": ["composição informada no catálogo"],
            },
        ),
    )
    res = handle_concierge_chat(req)
    assert "100% linho" in res.reply.lower()
    assert "não possui elasticidade" in res.reply.lower()


def test_concierge_does_not_invent_textile_facts_without_profile():
    req = ChatRequest(
        messages=[ChatMessage(role="user", content="Qual é o tecido e ele estica?")],
        productContext=Product(
            id="produto_sem_composicao",
            title="Peça sem composição",
            category="Moda",
            variants=[Variant(id="v1", size="M", returnRate=0.1, defectRate=0.01)],
        ),
    )
    res = handle_concierge_chat(req)
    assert "não estão informadas" in res.reply.lower()
    assert "linho" not in res.reply.lower()
    assert "algodão" not in res.reply.lower()
