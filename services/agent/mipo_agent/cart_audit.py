from .models import CartAuditRequest, CartAuditResponse


def audit_cart_coherence(request: CartAuditRequest) -> CartAuditResponse:
    items = request.items
    if not items:
        return CartAuditResponse(
            status="aligned",
            headline="Sacola vazia",
            advice="Nenhum item adicionado para análise de coerência.",
            careTips=[],
            provider="deterministic",
        )

    care_tips: list[str] = []
    titles_concat = " ".join(item.title.lower() for item in items)

    if "aurora" in titles_concat or "linho" in titles_concat:
        care_tips.append("Linho puro: lavar preferencialmente à mão com sabão neutro e passar levemente úmido.")
    if "trama" in titles_concat or "órbita" in titles_concat or "tricot" in titles_concat:
        care_tips.append("Tricot artesanal: secar na horizontal sobre uma toalha; nunca pendurar no varal para não deformar a trama.")
    if "eixo" in titles_concat or "alfaiataria" in titles_concat or "lume" in titles_concat:
        care_tips.append("Alfaiataria e sarja pesada: passar a ferro morno com pano protetor para manter a textura impecável.")
    if "bruma" in titles_concat or "balm" in titles_concat or "luz" in titles_concat:
        care_tips.append("Beleza botânica: conservar ao abrigo do calor e da luz solar direta.")

    pending_items = [item for item in items if item.mipoDecision == "pending"]
    if pending_items:
        return CartAuditResponse(
            status="attention",
            headline="Orientação MIPO pendente",
            advice="Revise a recomendação pendente antes de finalizar. O tamanho de cada peça é avaliado pela própria modelagem, não pela numeração dos outros itens.",
            careTips=care_tips,
            provider="deterministic",
        )

    if len(items) == 1:
        single = items[0]
        size_label = f" no tamanho {single.size}" if single.size else ""
        return CartAuditResponse(
            status="aligned",
            headline="Seleção harmoniosa e consistente",
            advice=f"Você selecionou {single.title}{size_label}. A peça segue a modelagem autoral Vértice.",
            careTips=care_tips,
            provider="deterministic",
        )

    return CartAuditResponse(
        status="aligned",
        headline="Seleção revisada item a item",
        advice="Cada peça mantém sua própria escolha de tamanho e modelagem. Tamanhos diferentes entre produtos não representam, por si só, uma inconsistência.",
        careTips=care_tips,
        provider="deterministic",
    )
