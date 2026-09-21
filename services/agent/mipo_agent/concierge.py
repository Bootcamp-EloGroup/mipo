import logging
import os
import re
from typing import Sequence

from langchain_openai import ChatOpenAI

from .models import ChatMessage, ChatRequest, ChatResponse, SuggestedAction

CATALOG_KNOWLEDGE = """Catálogo Vértice (Edição 06 - Atelier Cotidiano):
1. Vestido Aurora: Linho solar terracota (100% linho puro pré-encolhido), comprimento midi, corte evasê, decote quadrado estruturado. Sem elastano (zero stretch). Se cliente estiver entre tamanhos ou tiver busto volumoso, recomendamos tamanho acima (M em vez de P). Taxa de troca de 32% no tamanho P por aperto no busto.
2. Vestido Sereno: Algodão encorpado azul marinho profundo (100% algodão penteado), caimento reto minimalista, fendas laterais discretas, zíper invisível dorsal. Tecido firme e estruturado.
3. Blusa Trama: Tricot artesanal areia (fio 100% algodão ecológico), trama aberta respirável, corte relaxed com ombro deslocado. Caimento solto e fluido. Lavagem delicada à mão.
4. Calça Eixo: Alfaiataria fluida verde oliva (viscose com lã fria), cós alto com pregas duplas frontais, caimento amplo e reto tipo pantalona sutil. Veste o tamanho exato na cintura.
5. Jaqueta Lume: Sarja utilitária açafrão (100% algodão pesado), botões em chifre natural, bolsos frontais alfaiatados, caimento reto estruturado.
6. Casaco Órbita: Tricot pesado vinho borgonha (blend lã natural e algodão), modelagem cocoon envolvente e alongada. Modelagem intencionalmente generosa; tamanho P veste confortavelmente quem usa M.
7. Blush Bruma: Textura creme-pó pêssego translúcido, pigmentos minerais, acabamento luminoso natural.
8. Balm Luz: Hidratação labial profunda nude rosado, manteiga de karité orgânica e óleos botânicos.
"""

KNOWN_PRODUCT_IDS = {
    "prod_vestido_aurora",
    "prod_vestido_sereno",
    "prod_blusa_trama",
    "prod_calca_eixo",
    "prod_jaqueta_lume",
    "prod_casaco_orbita",
    "prod_blush_bruma",
    "prod_balm_luz",
}


def _build_context(request: ChatRequest) -> str:
    parts = [
        "[CONTEXTO & DIRETRIZES DO ATELIER VÉRTICE:",
        "Você é a 'MIPO Concierge', consultora oficial de estilo, caimento e curadoria do atelier autoral Vértice.",
        "Seu papel é orientar clientes com precisão, sofisticação e cordialidade sobre caimento, tecidos nobres, combinações e cuidados.",
        "Diretrizes:",
        "- Voz: Quiet luxury, elegante, atenta aos detalhes, em português impecável.",
        "- Seja assertiva e concisa (2 a 3 parágrafos curtos).",
        "- Considere as propriedades reais dos tecidos (linho não estica, tricot se molda, casaco cocoon é amplo).",
        "- Se indicar um tamanho específico (P, M, G ou GG), inclua no texto: [SUGESTÃO: TAMANHO_<P|M|G|GG>].",
        "- Se sugerir uma peça complementar ou destaque do catálogo, inclua: [SUGESTÃO: PRODUTO_<ID_DO_PRODUTO>].",
        "- Se a cliente pedir recomendação geral sem selecionar um produto específico, apresente os pilares do atelier (Vestido Aurora, Calça Eixo, Blusa Trama ou Casaco Órbita) e sugira uma peça de entrada usando [SUGESTÃO: PRODUTO_prod_vestido_aurora].",
        "",
        "Catálogo Vértice:",
        CATALOG_KNOWLEDGE,
    ]

    if request.productContext:
        p = request.productContext
        variants_desc = ", ".join(f"{v.size or v.id}" for v in p.variants)
        textile_desc = ""
        if p.textileProfile:
            textile_desc = (
                f"\nPerfil têxtil autorizado: material={p.textileProfile.material}; "
                f"composição={p.textileProfile.composition or 'não informada'}; "
                f"elasticidade={p.textileProfile.elasticity}; estrutura={p.textileProfile.structure}; "
                f"caimento={p.textileProfile.drape or 'não informado'}; "
                f"origem={p.textileProfile.origin}; evidências={'; '.join(p.textileProfile.evidence)}. "
                "Use somente estes fatos para falar de tecido, elasticidade, caimento ou cuidado."
            )
        parts.append(
            f"Peça Atual em Foco:\nProduto: '{p.title}' ({p.category}).\nDescrição: {p.description or 'Peça autoral'}.\nVariações: {variants_desc}.{textile_desc}"
        )

    if request.cartContext:
        cart_lines = [f"- {item.get('title', 'Item')} (tam: {item.get('size', 'padrão')}, qtd: {item.get('quantity', 1)})" for item in request.cartContext]
        parts.append("Sacola Atual:\n" + "\n".join(cart_lines))

    parts.append("]")
    return "\n".join(parts)


def _extract_suggested_actions(text: str, default_product_id: str | None = None) -> tuple[str, SuggestedAction | None]:
    cleaned = text
    suggested_action: SuggestedAction | None = None

    size_match = re.search(r"\[SUGESTÃO:\s*TAMANHO_([PMG]|GG)\]", cleaned, re.IGNORECASE)
    if size_match:
        size = size_match.group(1).upper()
        suggested_action = SuggestedAction(
            type="select_size",
            size=size,  # type: ignore[arg-type]
            productId=default_product_id,
            label=f"Selecionar tamanho {size}",
        )
        cleaned = re.sub(r"\[SUGESTÃO:\s*TAMANHO_([PMG]|GG)\]", "", cleaned, flags=re.IGNORECASE).strip()

    prod_match = re.search(r"\[SUGESTÃO:\s*PRODUTO_([a-zA-Z0-9_-]+)\]", cleaned, re.IGNORECASE)
    if prod_match:
        prod_id = prod_match.group(1).lower()
        suggested_action = SuggestedAction(
            type="view_product",
            productId=prod_id,
            label="Ver produto sugerido",
        )
        cleaned = re.sub(r"\[SUGESTÃO:\s*PRODUTO_([a-zA-Z0-9_-]+)\]", "", cleaned, flags=re.IGNORECASE).strip()

    return cleaned, suggested_action


def _authorize_suggested_action(
    action: SuggestedAction | None,
    request: ChatRequest,
) -> SuggestedAction | None:
    if action is None:
        return None
    if action.type == "select_size":
        if request.productContext is None or action.productId != request.productContext.id:
            return None
        allowed_sizes = {variant.size for variant in request.productContext.variants if variant.size}
        return action if action.size in allowed_sizes else None
    if action.type == "view_product":
        return action if action.productId in KNOWN_PRODUCT_IDS else None
    return None


def _atelier_fallback(request: ChatRequest) -> ChatResponse:
    last_user_msg = ""
    for msg in reversed(request.messages):
        if msg.role == "user":
            last_user_msg = msg.content.lower()
            break

    product_id = request.productContext.id if request.productContext else ""
    textile_terms = ("tecido", "composição", "composicao", "material", "elast", "estica", "caimento", "cuidado", "lavar")
    asks_textile = any(term in last_user_msg for term in textile_terms)

    if request.productContext and asks_textile:
        textile = request.productContext.textileProfile
        if textile is None:
            return ChatResponse(
                reply="A composição e a elasticidade desta peça não estão informadas no catálogo. Posso orientar pela modelagem e pelas variações disponíveis, mas não seria seguro atribuir um tecido ou nível de elasticidade sem evidência.",
                provider="deterministic",
                model="atelier_rules",
            )
        elasticity = {
            "none": "não possui elasticidade",
            "low": "tem baixa elasticidade",
            "medium": "tem elasticidade moderada",
            "high": "tem alta elasticidade",
            "unknown": "tem elasticidade não informada",
        }[textile.elasticity]
        structure = {
            "fluid": "fluida",
            "balanced": "equilibrada",
            "structured": "estruturada",
            "unknown": "não informada",
        }[textile.structure]
        composition = textile.composition or textile.material
        care = f" Cuidado indicado: {textile.care[0]}." if textile.care else ""
        drape = f" O caimento descrito é {textile.drape}." if textile.drape else f" A estrutura é {structure}."
        return ChatResponse(
            reply=f"A composição catalogada é {composition}; o material {elasticity}.{drape}{care}",
            provider="deterministic",
            model="atelier_rules",
        )

    if product_id == "prod_vestido_aurora" or "aurora" in last_user_msg or "linho" in last_user_msg:
        reply = (
            "O Vestido Aurora é confeccionado em 100% linho puro pré-encolhido sem elastano. "
            "Como a fibra natural é nobre e rígida no busto, se você costuma variar entre P e M "
            "ou prefere liberdade respirável, o tamanho M é a escolha ideal para o caimento fluido perfeito."
        )
        return ChatResponse(
            reply=reply,
            suggestedAction=SuggestedAction(
                type="select_size",
                size="M",
                productId="prod_vestido_aurora",
                label="Selecionar tamanho M",
            ),
            provider="deterministic",
            model="atelier_rules",
        )

    if product_id == "prod_calca_eixo" or "eixo" in last_user_msg or "calça" in last_user_msg:
        reply = (
            "A Calça Eixo possui corte de alfaiataria em viscose com lã fria e pregas frontais. "
            "O cós é ajustado na cintura alta e as pernas caem amplas. "
            "Para combinar, a Blusa Trama em tom areia compõe uma harmonia impecável."
        )
        return ChatResponse(
            reply=reply,
            suggestedAction=SuggestedAction(
                type="view_product",
                productId="prod_blusa_trama",
                label="Ver Blusa Trama",
            ),
            provider="deterministic",
            model="atelier_rules",
        )

    if any(term in last_user_msg for term in ("tamanho", "medida", "veste", "peso", "altura")):
        reply = (
            "Para garantir o caimento ideal em peças autorais da Vértice: as modelagens em linho "
            "e algodão estruturado são fiéis à numeração mas sem elastano. "
            "Se busca caimento mais ajustado, siga seu tamanho habitual; para mais fluidez, opte por um tamanho acima."
        )
        return ChatResponse(reply=reply, provider="deterministic", model="atelier_rules")

    if any(term in last_user_msg for term in ("recomen", "suger", "indica", "combinar", "combina", "look", "conjunto", "o que voce", "o que você")):
        if request.productContext:
            title = request.productContext.title
            companions = {
                "prod_vestido_aurora": ("Jaqueta Lume", "prod_jaqueta_lume", "A sobreposição em sarja açafrão equilibra a fluidez do linho terracota."),
                "prod_vestido_sereno": ("Casaco Órbita", "prod_casaco_orbita", "O tricot borgonha envolvente compõe um contraste elegante com o algodão marinho."),
                "prod_blusa_trama": ("Calça Eixo", "prod_calca_eixo", "A alfaiataria oliva com a trama artesanal em areia cria proporção impecável."),
                "prod_calca_eixo": ("Blusa Trama", "prod_blusa_trama", "O tricot solto em areia equilibra a estrutura das pregas frontais."),
                "prod_jaqueta_lume": ("Vestido Sereno", "prod_vestido_sereno", "A sarja utilitária ganha sofisticação sobre o algodão minimalista."),
                "prod_casaco_orbita": ("Vestido Aurora", "prod_vestido_aurora", "O cocoon borgonha sobre o linho terracota é a assinatura do atelier."),
            }
            product_id = request.productContext.id
            comp = companions.get(product_id)
            if comp:
                comp_name, comp_id, reason = comp
                return ChatResponse(
                    reply=f"Com o {title}, a combinação que mais recomendo é a {comp_name}. {reason}",
                    suggestedAction=SuggestedAction(type="view_product", productId=comp_id, label=f"Ver {comp_name}"),
                    provider="deterministic",
                    model="atelier_rules",
                )
        # Generic recommendation without product context
        reply = (
            "Minhas recomendações para esta estação: o Vestido Aurora em linho terracota é a estrela do atelier — "
            "combine com a Jaqueta Lume em açafrão para um look sofisticado. "
            "Para o dia a dia, a Blusa Trama em tricot areia com a Calça Eixo em oliva é uma composição versátil e elegante."
        )
        return ChatResponse(
            reply=reply,
            suggestedAction=SuggestedAction(type="view_product", productId="prod_vestido_aurora", label="Ver Vestido Aurora"),
            provider="deterministic",
            model="atelier_rules",
        )

    reply = (
        "No atelier Vértice, priorizamos matérias-primas puras como linho solar, tricot em algodão ecológico "
        "e lã fria. Como posso ajudar com seu caimento, medidas ou combinação de peças hoje?"
    )
    return ChatResponse(reply=reply, provider="deterministic", model="atelier_rules")


def handle_concierge_chat(request: ChatRequest) -> ChatResponse:
    context_instruction = _build_context(request)
    default_product_id = request.productContext.id if request.productContext else None

    # Try providers
    providers = [
        ("eloagents", "ELOAGENTS_API_KEY", os.getenv("ELOAGENTS_MODEL", "gpt-54-mini"), os.getenv("ELOAGENTS_BASE_URL", "https://chat.eloagents.click/api")),
        ("groq", "GROQ_API_KEY", os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), "https://api.groq.com/openai/v1"),
    ]

    for provider, key_env, model, base in providers:
        api_key = os.getenv(key_env)
        if not api_key:
            continue

        try:
            llm = ChatOpenAI(
                api_key=api_key,
                base_url=base,
                model=model,
                temperature=0.3,
                timeout=float(os.getenv("AI_PROVIDER_TIMEOUT_MS", "12000")) / 1000,
                max_retries=0,
            )

            # Build messages for LLM — use LangChain message objects.
            # We provide SystemMessage for standard LLMs, and also prepend
            # the context to the first HumanMessage to ensure strict persona adherence
            # on proxies or models that strip/ignore the system role.
            from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

            llm_messages: list = [SystemMessage(content=context_instruction)]
            user_seen = False
            for m in request.messages[-6:]:
                if m.role == "user":
                    if not user_seen:
                        user_seen = True
                        content = f"{context_instruction}\n\n[MENSAGEM DA CLIENTE]:\n{m.content}"
                    else:
                        content = m.content
                    llm_messages.append(HumanMessage(content=content))
                else:
                    llm_messages.append(AIMessage(content=m.content))

            response = llm.invoke(llm_messages)
            raw_reply = response.content if isinstance(response.content, str) else str(response.content)
            cleaned_reply, suggested_action = _extract_suggested_actions(raw_reply, default_product_id)
            suggested_action = _authorize_suggested_action(suggested_action, request)

            return ChatResponse(
                reply=cleaned_reply,
                suggestedAction=suggested_action,
                provider=provider,  # type: ignore[arg-type]
                model=model,
            )
        except Exception as exc:
            logging.getLogger("mipo_agent.concierge").warning(
                "LLM provider '%s' failed: %s", provider, exc
            )
            continue

    return _atelier_fallback(request)
