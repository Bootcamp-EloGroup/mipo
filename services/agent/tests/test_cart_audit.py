from mipo_agent.cart_audit import audit_cart_coherence
from mipo_agent.models import CartAuditRequest, CartItem


def test_audit_empty_cart():
    res = audit_cart_coherence(CartAuditRequest(items=[]))
    assert res.status == "aligned"
    assert "vazia" in res.headline.lower()
    assert len(res.careTips) == 0


def test_audit_single_item_with_care_tips():
    req = CartAuditRequest(
        items=[
            CartItem(
                id="item1",
                productId="prod_vestido_aurora",
                variantId="v1",
                title="Vestido Aurora Linho Terracota",
                size="M",
            )
        ]
    )
    res = audit_cart_coherence(req)
    assert res.status == "aligned"
    assert "tamanho M" in res.advice
    assert any("linho" in tip.lower() for tip in res.careTips)


def test_audit_accepts_different_sizes_across_different_products():
    req = CartAuditRequest(
        items=[
            CartItem(
                id="item1",
                productId="prod_blusa_trama",
                variantId="v1",
                title="Blusa Trama",
                size="P",
            ),
            CartItem(
                id="item2",
                productId="prod_calca_eixo",
                variantId="v2",
                title="Calça Eixo",
                size="GG",
            ),
        ]
    )
    res = audit_cart_coherence(req)
    assert res.status == "aligned"
    assert "não representam" in res.advice.lower()
    assert "cada peça" in res.advice.lower()
    assert any("tricot" in tip.lower() for tip in res.careTips)
    assert any("alfaiataria" in tip.lower() for tip in res.careTips)


def test_audit_flags_unresolved_item_context_instead_of_cross_product_size():
    req = CartAuditRequest(
        items=[
            CartItem(
                id="item1",
                productId="prod_vestido_aurora",
                variantId="v1",
                title="Vestido Aurora",
                size="P",
                mipoDecision="pending",
            )
        ]
    )
    res = audit_cart_coherence(req)
    assert res.status == "attention"
    assert "pendente" in res.headline.lower()
