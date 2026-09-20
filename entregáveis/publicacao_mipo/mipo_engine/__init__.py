"""Núcleo determinístico do MIPO para risco e recomendação no checkout."""

from .checkout import (
    Alternative,
    CheckoutInput,
    Recommendation,
    evaluate_checkout,
)

__all__ = [
    "Alternative",
    "CheckoutInput",
    "Recommendation",
    "evaluate_checkout",
]
