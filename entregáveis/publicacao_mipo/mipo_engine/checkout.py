"""Regras reproduzíveis para intervenção de devolução antes da compra.

Este módulo não chama modelo de linguagem e não toma a decisão de compra.
Ele calcula evidências, filtra alternativas elegíveis e produz uma recomendação
estruturada que pode ser explicada por uma camada de IA.
"""

from dataclasses import dataclass
from typing import Literal


RiskLevel = Literal["low", "medium", "high"]
Action = Literal["no_intervention", "confirm_selection", "change_size", "suggest_similar"]


@dataclass(frozen=True)
class Alternative:
    """Produto/tamanho candidato a substituir a seleção atual."""

    sku: str
    label: str
    size: str | None
    return_rate: float
    stock: int
    same_product: bool = True


@dataclass(frozen=True)
class CheckoutInput:
    """Evidências disponíveis no momento da seleção no checkout."""

    sku: str
    product_name: str
    selected_size: str | None
    return_rate: float
    dominant_reason: str | None
    sample_size: int
    alternatives: tuple[Alternative, ...] = ()
    customer_usual_size: str | None = None
    customer_size_observations: int = 0
    quality_return_rate: float | None = None
    stock_selected: int | None = None
    product_category: str | None = None


@dataclass(frozen=True)
class Recommendation:
    """Saída auditável para a UI e para uma eventual camada de IA."""

    risk_score: int
    recommendation_score: int
    risk_level: RiskLevel
    action: Action
    selected_sku: str
    recommended_sku: str | None
    recommended_size: str | None
    reasons: tuple[str, ...]
    evidence_coverage: float


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(value, upper))


def _risk_level(score: int) -> RiskLevel:
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def evaluate_checkout(data: CheckoutInput) -> Recommendation:
    """Calcula risco e recomenda uma intervenção, sem efeitos colaterais.

    Pesos do score de recomendação:
    - taxa observada de devolução: 30%
    - motivo dominante relacionado a ajuste/defeito: 20%
    - quantidade de observações: 10%
    - devoluções por qualidade/defeito: 15%
    - divergência com o tamanho usual do cliente: 10%
    - alternativa disponível com menor taxa: 15%

    Taxas são esperadas em formato decimal (0.34 = 34%). Alternativas sem
    estoque não podem ser recomendadas, mesmo que tenham taxa melhor.
    """
    if not 0 <= data.return_rate <= 1:
        raise ValueError("return_rate deve estar entre 0 e 1")
    if data.sample_size < 0:
        raise ValueError("sample_size não pode ser negativo")
    if data.customer_size_observations < 0:
        raise ValueError("customer_size_observations não pode ser negativo")
    if data.stock_selected is not None and data.stock_selected < 0:
        raise ValueError("stock_selected não pode ser negativo")
    if data.quality_return_rate is not None and not 0 <= data.quality_return_rate <= 1:
        raise ValueError("quality_return_rate deve estar entre 0 e 1")

    eligible = tuple(
        item
        for item in data.alternatives
        if item.stock > 0 and 0 <= item.return_rate <= 1 and item.sku != data.sku
    )
    best = min(eligible, key=lambda item: (item.return_rate, -item.stock), default=None)

    return_component = _clamp(data.return_rate / 0.40)
    reason = (data.dominant_reason or "").strip().lower()
    reason_component = 1.0 if reason in {"tamanho pequeno", "tamanho grande", "defeito"} else 0.0
    sample_component = _clamp(data.sample_size / 30)
    quality_component = _clamp((data.quality_return_rate or 0) / 0.20)
    customer_size_component = float(
        bool(
            data.customer_usual_size
            and data.selected_size
            and data.customer_usual_size != data.selected_size
            and data.customer_size_observations >= 3
        )
    )
    alternative_component = (
        _clamp((data.return_rate - best.return_rate) / 0.25) if best else 0.0
    )

    risk_score = round(
        100
        * (
            0.30 * return_component
            + 0.20 * reason_component
            + 0.10 * sample_component
            + 0.15 * quality_component
            + 0.10 * customer_size_component
            + 0.15 * alternative_component
        )
    )
    evidence_coverage = round(
        sum(
            [
                data.sample_size >= 30,
                data.dominant_reason is not None,
                bool(eligible),
                data.quality_return_rate is not None,
                data.customer_usual_size is not None and data.customer_size_observations >= 3,
                data.stock_selected is not None,
            ]
        )
        / 6,
        2,
    )

    if best and risk_score >= 70:
        action: Action = "change_size" if best.same_product else "suggest_similar"
        recommended_sku = best.sku
        recommended_size = best.size
    elif risk_score >= 40:
        action = "confirm_selection"
        recommended_sku = None
        recommended_size = None
    else:
        action = "no_intervention"
        recommended_sku = None
        recommended_size = None

    reasons: list[str] = []
    if data.return_rate >= 0.30:
        reasons.append("taxa de devolução elevada no item selecionado")
    if reason in {"tamanho pequeno", "tamanho grande"}:
        reasons.append(f"motivo dominante: {data.dominant_reason}")
    if data.quality_return_rate is not None and data.quality_return_rate >= 0.20:
        reasons.append("há sinal elevado de devolução por qualidade ou defeito")
    if customer_size_component:
        reasons.append("o tamanho selecionado diverge do tamanho usual informado")
    if best and best.return_rate < data.return_rate:
        reasons.append("existe alternativa disponível com menor taxa observada")
    if not reasons and action == "no_intervention":
        reasons.append("não há evidência suficiente para intervir")

    return Recommendation(
        risk_score=risk_score,
        recommendation_score=risk_score,
        risk_level=_risk_level(risk_score),
        action=action,
        selected_sku=data.sku,
        recommended_sku=recommended_sku,
        recommended_size=recommended_size,
        reasons=tuple(reasons),
        evidence_coverage=evidence_coverage,
    )
