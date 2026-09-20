from mipo_engine.checkout import Alternative, CheckoutInput, evaluate_checkout


def test_recommends_available_better_size_when_risk_is_high():
    result = evaluate_checkout(
        CheckoutInput(
            sku="CALCA-P-M",
            product_name="Calça Wide Leg Preta",
            selected_size="M",
            return_rate=0.34,
            dominant_reason="tamanho pequeno",
            sample_size=100,
            alternatives=(
                Alternative("CALCA-P-G", "Calça Wide Leg Preta", "G", 0.16, 12),
            ),
            customer_usual_size="G",
            customer_size_observations=8,
            quality_return_rate=0.03,
            stock_selected=4,
            product_category="calças",
        )
    )

    assert result.risk_score >= 70
    assert result.action == "change_size"
    assert result.recommended_sku == "CALCA-P-G"
    assert result.evidence_coverage == 1.0


def test_does_not_recommend_out_of_stock_alternative():
    result = evaluate_checkout(
        CheckoutInput(
            sku="SKU-M",
            product_name="Produto",
            selected_size="M",
            return_rate=0.36,
            dominant_reason="tamanho pequeno",
            sample_size=80,
            alternatives=(Alternative("SKU-G", "Produto", "G", 0.10, 0),),
        )
    )

    assert result.recommended_sku is None
    assert result.action in {"confirm_selection", "no_intervention"}


def test_low_evidence_does_not_force_intervention():
    result = evaluate_checkout(
        CheckoutInput(
            sku="SKU-1",
            product_name="Produto",
            selected_size="M",
            return_rate=0.02,
            dominant_reason=None,
            sample_size=0,
        )
    )

    assert result.action == "no_intervention"
    assert result.risk_level == "low"
    assert result.evidence_coverage == 0.0


def test_rejects_invalid_rate():
    try:
        evaluate_checkout(
            CheckoutInput("SKU-1", "Produto", "M", 1.1, None, 1)
        )
    except ValueError as error:
        assert "return_rate" in str(error)
    else:
        raise AssertionError("era esperada uma validação de taxa")


def test_customer_context_can_raise_recommendation_score():
    base = CheckoutInput("SKU-1", "Produto", "M", 0.20, None, 40)
    enriched = CheckoutInput(
        "SKU-1",
        "Produto",
        "M",
        0.20,
        None,
        40,
        customer_usual_size="G",
        customer_size_observations=10,
        quality_return_rate=0.22,
        stock_selected=3,
    )

    assert evaluate_checkout(enriched).risk_score > evaluate_checkout(base).risk_score
