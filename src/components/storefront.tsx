"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { products as localProducts } from "@/src/data/products";
import type { Cart, Product, ProductVariant, SelectionContext, Size } from "@/src/domain/commerce";
import { localCommerceRepository, recordMipoEvent } from "@/src/services/local-commerce";
import { commerceApi } from "@/src/services/commerce-api";
import { evaluateCheckoutRisk, evaluateSelectionContext, type RiskResult } from "@/src/services/mipo";
import { productQuestions } from "@/src/services/product-profile";
import type { PilotGroup, PilotOrderResult } from "@/src/domain/pilot-checkout";

type View = "catalog" | "product" | "cart" | "checkout" | "success";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const textileElasticityLabel = { none: "sem elasticidade", low: "baixa", medium: "média", high: "alta", unknown: "não informada" } as const;

function Icon({ name }: { name: "bag" | "arrow" | "spark" | "close" | "minus" | "plus" | "menu" }) {
  const paths = {
    bag: <><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    spark: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    minus: <path d="M5 12h14"/>,
    plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
    menu: <><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">{paths[name]}</svg>;
}

function resolveProductImage(product: Product): string {
  const productImages: Record<string, string> = {
    aurora: "/images/products/vestido-aurora.jpg",
    sereno: "/images/products/vestido-sereno.jpg",
    trama: "/images/products/blusa-trama.jpg",
    eixo: "/images/products/calca-eixo.jpg",
    lume: "/images/products/jaqueta-lume.jpg",
    orbita: "/images/products/casaco-orbita.jpg",
    bruma: "/images/products/blush-bruma.jpg",
    luz: "/images/products/balm-luz.jpg",
    brinco: "/images/products/brinco-artesanal.jpg",
    caderno: "/images/products/caderno-artesanal.jpg",
  };
  const ecommerceImages: Record<string, string> = {
    apparel: "/images/products/ecommerce-apparel.png",
    beauty: "/images/products/ecommerce-beauty.png",
    accessory: "/images/products/ecommerce-accessories.png",
    lifestyle: "/images/products/ecommerce-lifestyle.png",
  };

  if (product.imageKey && productImages[product.imageKey]) {
    return productImages[product.imageKey];
  }

  const text = `${product.title} ${product.subtitle ?? ""} ${product.subcategory ?? ""} ${product.category ?? ""}`.toLowerCase();
  if (text.includes("vestido")) {
    return text.includes("sereno") || text.includes("azul") ? productImages.sereno : productImages.aurora;
  }
  if (text.includes("blusa") || text.includes("camisa") || text.includes("tricô") || text.includes("trico") || text.includes("top")) {
    return productImages.trama;
  }
  if (text.includes("calça") || text.includes("calca") || text.includes("saia")) {
    return productImages.eixo;
  }
  if (text.includes("jaqueta")) {
    return productImages.lume;
  }
  if (text.includes("casaco") || text.includes("moletom")) {
    return productImages.orbita;
  }
  if (text.includes("blush")) {
    return productImages.bruma;
  }
  if (text.includes("balm") || text.includes("batom") || text.includes("lábio") || text.includes("labio")) {
    return productImages.luz;
  }
  if (text.includes("brinco")) {
    return productImages.brinco;
  }
  if (text.includes("caderno") || text.includes("almofada")) {
    return productImages.caderno;
  }

  const productKind = product.productKind ?? (product.category === "Maquiagem" || product.category === "Beleza" ? "beauty" : product.category === "Acessórios" ? "accessory" : product.category === "Lifestyle" ? "lifestyle" : "apparel");
  return ecommerceImages[productKind] ?? ecommerceImages.apparel;
}

function ProductArt({ product, hero = false }: { product: Product; hero?: boolean }) {
  const image = resolveProductImage(product);
  return (
    <div className={`product-art ${hero ? "product-art--hero" : ""} ${product.productKind === "beauty" ? "product-art--beauty" : ""}`} style={{ "--tone": product.color } as React.CSSProperties}>
      <Image src={image} alt={`${product.title} — ${product.subtitle}`} fill sizes={hero ? "(max-width: 800px) 100vw, 55vw" : "(max-width: 480px) 100vw, (max-width: 900px) 50vw, 33vw"} className="product-photo" priority={hero} />
      <span className="product-art__color" aria-hidden="true" />
    </div>
  );
}

function variantLabel(product: Product, variant: ProductVariant, index: number): string {
  if (variant.size || product.productKind === "apparel" || (!product.productKind && product.category !== "Maquiagem")) return variant.size ?? `Tamanho ${index + 1}`;
  const technicalTitle = !variant.title || variant.title === variant.sku || /^sku[-_]/i.test(variant.title);
  if (variant.title && !technicalTitle) return variant.title;
  if (product.productKind === "beauty" || product.variantAttribute === "shade") return `Tom ${index + 1}`;
  if (product.variantAttribute === "color") return `Cor ${index + 1}`;
  if (product.variantAttribute === "volume") return `Volume ${index + 1}`;
  return `Opção ${index + 1}`;
}

function Header({ cartCount, onNavigate }: { cartCount: number; onNavigate: (view: View) => void }) {
  return (
    <><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><header className="site-header">
      <button className="header-icon menu-button" onClick={() => onNavigate("catalog")} aria-label="Ir para a coleção"><Icon name="menu" /></button>
      <button className="wordmark" onClick={() => onNavigate("catalog")} aria-label="Ir para o início">VÉRTICE<span>atelier cotidiano</span></button>
      <nav aria-label="Navegação principal">
        <button onClick={() => onNavigate("catalog")}>Novidades</button>
        <button onClick={() => onNavigate("catalog")}>Coleção</button>
        <button onClick={() => onNavigate("catalog")}>Manifesto</button>
      </nav>
      <div className="header-actions"><button className="bag-button" onClick={() => onNavigate("cart")} aria-label={`Abrir sacola com ${cartCount} itens`}>
        <Icon name="bag" /><span>Sacola</span><b>{cartCount}</b>
      </button></div>
    </header></>
  );
}

function Catalog({ products, onProduct }: { products: Product[]; onProduct: (product: Product) => void }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const categories = [...new Set(products.map((product) => product.category))].sort();
  const visibleProducts = selectedCategories.length === 0 ? products : products.filter((product) => selectedCategories.includes(product.category));
  const pageCount = Math.max(1, Math.ceil(visibleProducts.length / pageSize));
  const pageProducts = visibleProducts.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);
  function toggleCategory(category: string) { setPage(1); setSelectedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]); }
  function clearFilters() { setSelectedCategories([]); setPage(1); }
  return (
    <main id="conteudo">
      <section className="hero">
        <Image src="/images/vertice-hero.webp" alt="Modelos vestindo peças neutras da coleção Vértice" fill sizes="100vw" priority className="hero__image" />
        <div className="hero__overlay" />
        <div className="hero__copy reveal"><p className="eyebrow">Coleção 26 · Essenciais em movimento</p><h1>Menos peças.<br/><em>Mais você.</em></h1><p className="hero__lead">Roupa cotidiana, materiais honestos e uma escolha de tamanho mais segura.</p><button className="hero-cta" onClick={() => document.getElementById("colecao")?.scrollIntoView({ behavior: "smooth" })}>Comprar a coleção <Icon name="arrow" /></button></div>
      </section>

      <section className="promise-strip" aria-label="Diferenciais">
        <span>curadoria visual</span><i>◆</i><span>informação rastreável</span><i>◆</i><span>assistência de tamanho</span><i>◆</i><span>experiência demonstrativa</span>
      </section>

      <section className="collection" id="colecao">
        <div className="section-heading"><div><p className="eyebrow">Seleção Vértice</p><h2>Novidades da coleção</h2></div><div className="catalog-filter"><button type="button" className="filter-trigger" aria-expanded={filtersOpen} aria-controls="category-filter" onClick={() => setFiltersOpen((open) => !open)}><span>Filtrar produtos</span><b>{selectedCategories.length ? `${selectedCategories.length} selecionada${selectedCategories.length > 1 ? "s" : ""}` : "Todos"}</b><span aria-hidden="true">⌄</span></button>{filtersOpen&&<div id="category-filter" className="filter-menu" role="group" aria-label="Categorias de produtos"><label><input type="checkbox" checked={selectedCategories.length === 0} onChange={clearFilters} /> Todos os produtos</label>{categories.map((item) => <label key={item}><input type="checkbox" checked={selectedCategories.includes(item)} onChange={() => toggleCategory(item)} /> {item}</label>)}<button type="button" className="filter-clear" onClick={clearFilters}>Limpar filtros</button></div>}</div></div>
        <div className="product-grid">
          {pageProducts.map((product, index) => (
            <article className={`product-card reveal reveal--${index % 3}`} key={product.id}>
              <button className="product-card__visual" onClick={() => onProduct(product)} aria-label={`Ver ${product.title}`}>
                {product.badge && <span className="badge">{product.badge}</span>}
                <ProductArt product={product} />
                <span className="quick-view">Ver detalhes <Icon name="arrow" /></span>
              </button>
              <div className="product-card__info">
                <div><p>{product.category}</p><h3>{product.title}</h3></div>
                <strong>{money.format(product.variants[0].price / 100)}</strong>
              </div>
            </article>
          ))}
        </div>
        <nav className="catalog-pagination" aria-label="Paginação do catálogo">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>Anterior</button>
          <div>{Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => <button type="button" key={item} className={page === item ? "active" : ""} aria-current={page === item ? "page" : undefined} onClick={() => setPage(item)}>{item}</button>)}</div>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Próxima</button>
        </nav>
      </section>
    </main>
  );
}

type BodyMetric = "bust" | "waist" | "hip";

const SIZING_GUIDE: Record<BodyMetric, { label: string; ranges: Record<"P" | "M" | "G" | "GG", { min: number; max: number; ideal: number }> }> = {
  bust: {
    label: "Busto",
    ranges: {
      P: { min: 82, max: 88, ideal: 85 },
      M: { min: 89, max: 95, ideal: 92 },
      G: { min: 96, max: 102, ideal: 99 },
      GG: { min: 103, max: 110, ideal: 106 },
    },
  },
  waist: {
    label: "Cintura",
    ranges: {
      P: { min: 64, max: 70, ideal: 67 },
      M: { min: 71, max: 77, ideal: 74 },
      G: { min: 78, max: 84, ideal: 81 },
      GG: { min: 85, max: 92, ideal: 88 },
    },
  },
  hip: {
    label: "Quadril",
    ranges: {
      P: { min: 92, max: 98, ideal: 95 },
      M: { min: 99, max: 105, ideal: 102 },
      G: { min: 106, max: 112, ideal: 109 },
      GG: { min: 113, max: 120, ideal: 116 },
    },
  },
};

function VisualSizer({
  product,
  selectedVariant,
  onSelectVariant,
}: {
  product: Product;
  selectedVariant: ProductVariant | null;
  onSelectVariant: (variant: ProductVariant) => void;
}) {
  const isBottom = product.category === "Calças" || product.title.toLowerCase().includes("calça") || product.title.toLowerCase().includes("saia");
  const defaultMetric: BodyMetric = isBottom ? "hip" : "bust";
  const [metric, setMetric] = useState<BodyMetric>(defaultMetric);
  const guide = SIZING_GUIDE[metric];

  const [measurement, setMeasurement] = useState<number>(guide.ranges.M.ideal);

  function handleMetricChange(nextMetric: BodyMetric) {
    setMetric(nextMetric);
    setMeasurement(SIZING_GUIDE[nextMetric].ranges.M.ideal);
  }

  const idealSizeMatch = (["P", "M", "G", "GG"] as const).find((s) => {
    const r = guide.ranges[s];
    return measurement >= r.min && measurement <= r.max;
  }) ?? (measurement < guide.ranges.P.min ? "P" : "GG");

  const currentSize = selectedVariant?.size as "P" | "M" | "G" | "GG" | undefined;
  const currentRange = currentSize ? guide.ranges[currentSize] : undefined;

  let fitStatus: "fitted" | "balanced" | "loose" = "balanced";
  let fitDescription = "";

  if (currentRange) {
    if (measurement > currentRange.max) {
      fitStatus = "fitted";
      fitDescription = `Mais Ajustado — Sua medida de ${measurement}cm está acima da referência para ${currentSize} (${currentRange.min}–${currentRange.max}cm). O caimento será rente ao corpo.`;
    } else if (measurement < currentRange.min) {
      fitStatus = "loose";
      fitDescription = `Fluido & Amplo — Sua medida de ${measurement}cm proporciona folga confortável no tamanho ${currentSize} (${currentRange.min}–${currentRange.max}cm), para um visual relaxado.`;
    } else {
      fitStatus = "balanced";
      fitDescription = `Equilibrado & Ideal — No tamanho ${currentSize}, a peça vestirá precisamente a silhueta da modelagem Vértice para seus ${measurement}cm de ${guide.label.toLowerCase()}.`;
    }
  } else {
    fitDescription = `Para ${measurement}cm de ${guide.label.toLowerCase()}, a modelagem sugerida de alfaiataria é ${idealSizeMatch}.`;
  }

  const presetValues = metric === "waist" ? [66, 72, 78, 86] : metric === "hip" ? [94, 100, 106, 114] : [84, 90, 96, 104];

  return (
    <div className="visual-sizer reveal">
      <div className="visual-sizer__header">
        <div className="visual-sizer__title">
          <Icon name="spark" />
          <span>Provador Visual de Medidas Relativas</span>
        </div>
        <div className="visual-sizer__metrics" role="tablist" aria-label="Medida corporal">
          {(["bust", "waist", "hip"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`visual-sizer__metric-tab ${metric === m ? "is-active" : ""}`}
              onClick={() => handleMetricChange(m)}
            >
              {SIZING_GUIDE[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="visual-sizer__body">
        <div className="visual-sizer__input-row">
          <label htmlFor="body-measurement-slider">
            Sua medida de {guide.label.toLowerCase()}: <strong>{measurement} cm</strong>
          </label>
          <div className="visual-sizer__presets">
            {presetValues.map((val) => (
              <button
                key={val}
                type="button"
                className={`visual-sizer__preset-chip ${measurement === val ? "is-selected" : ""}`}
                onClick={() => setMeasurement(val)}
              >
                {val} cm
              </button>
            ))}
          </div>
        </div>

        <input
          id="body-measurement-slider"
          type="range"
          min={metric === "waist" ? 60 : metric === "hip" ? 86 : 76}
          max={metric === "waist" ? 100 : metric === "hip" ? 126 : 116}
          value={measurement}
          onChange={(e) => setMeasurement(Number(e.target.value))}
          className="visual-sizer__slider"
          aria-label={`Ajustar medida de ${guide.label.toLowerCase()} em centímetros`}
        />

        {/* Visual Fit Gauge */}
        <div className="visual-sizer__gauge">
          <div className="visual-sizer__gauge-track">
            <div
              className={`visual-sizer__gauge-segment ${fitStatus === "fitted" ? "is-active" : ""}`}
            >
              <span>Ajustado</span>
            </div>
            <div
              className={`visual-sizer__gauge-segment ${fitStatus === "balanced" ? "is-active" : ""}`}
            >
              <span>Equilibrado</span>
            </div>
            <div
              className={`visual-sizer__gauge-segment ${fitStatus === "loose" ? "is-active" : ""}`}
            >
              <span>Fluido / Amplo</span>
            </div>
          </div>
        </div>

        <p className="visual-sizer__feedback">{fitDescription}</p>

        {/* Quick Size Matrix Buttons */}
        <div className="visual-sizer__size-matrix">
          <span className="visual-sizer__matrix-label">Projeção por tamanho:</span>
          <div className="visual-sizer__matrix-buttons">
            {(["P", "M", "G", "GG"] as const).map((sizeKey) => {
              const variant = product.variants.find((v) => v.size === sizeKey);
              if (!variant) return null;
              const r = guide.ranges[sizeKey];
              const isSelected = selectedVariant?.id === variant.id;
              const isRecommended = idealSizeMatch === sizeKey;
              const relation = measurement > r.max ? "Ajustado" : measurement < r.min ? "Fluido" : "Ideal";

              return (
                <button
                  key={sizeKey}
                  type="button"
                  className={`visual-sizer__matrix-chip ${isSelected ? "is-selected" : ""} ${isRecommended ? "is-recommended" : ""}`}
                  onClick={() => onSelectVariant(variant)}
                  title={`Selecionar tamanho ${sizeKey} (${relation})`}
                >
                  <b>{sizeKey}</b>
                  <small>{relation}</small>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductDetail({
  product,
  persistent,
  onBack,
  onAdded,
  onAlternative,
  onOpenConcierge,
  suggestedSize,
  pilotGroup,
}: {
  product: Product;
  persistent: boolean;
  onBack: () => void;
  onAdded: (product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original" | "not_required", selectionContext?: SelectionContext) => void | Promise<void>;
  onAlternative: (id: string) => void;
  onOpenConcierge: (product: Product) => void;
  suggestedSize?: Size | null;
  pilotGroup: PilotGroup;
}) {
  const [selected, setSelected] = useState<ProductVariant | null>(null);
  const [decision, setDecision] = useState<"accepted" | "kept_original" | undefined>();
  const [result, setResult] = useState<RiskResult | null>(null);
  const [interventionId, setInterventionId] = useState<string>();
  const [fitPreference, setFitPreference] = useState<"fitted" | "regular" | "loose">("regular");
  const [usualSize, setUsualSize] = useState<ProductVariant["size"]>(null);
  const [selectionContext, setSelectionContext] = useState<SelectionContext>();
  const [evaluating, setEvaluating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const activeIntervention = useRef<string|undefined>(undefined);
  const decisionRef = useRef<typeof decision>(undefined);
  const sizePickerRef = useRef<HTMLFieldSetElement>(null);

  const isApparel = product.productKind === "apparel" || (!product.productKind && product.category !== "Maquiagem");

  async function choose(variant: ProductVariant, fit = fitPreference, userSize = usualSize) {
    if (variant.inventory_quantity === 0) return;
    setSelected(variant);
    setDecision(undefined);
    decisionRef.current = undefined;
    setAiAssisted(false);
    setResult(null); // Do not show premature or mocked result while analyzing!
    setEvaluationError("");

    if (pilotGroup === "control") {
      setInterventionId(undefined);
      activeIntervention.current = undefined;
      setAiLoading(false);
      return;
    }

    if (!isApparel && (!selectionContext || Object.keys(selectionContext.answers ?? {}).length < productQuestions(product).length)) {
      setInterventionId(undefined);
      activeIntervention.current = undefined;
      setAiLoading(false);
      return;
    }

    let currentInterventionId = `local-${crypto.randomUUID()}`;
    let initialResult: RiskResult;

    try {
      if (persistent) {
        const response = await commerceApi.evaluate(product.id, variant.id, fit, isApparel ? undefined : selectionContext, userSize);
        initialResult = response.result;
        currentInterventionId = response.interventionId;
      } else {
        initialResult = selectionContext
          ? evaluateSelectionContext(product, variant, selectionContext)
          : evaluateCheckoutRisk(product, variant, fit, undefined, userSize);
      }
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "Não foi possível avaliar esta escolha.");
      setAiLoading(false);
      return;
    }

    setInterventionId(currentInterventionId);
    activeIntervention.current = currentInterventionId;
    setResult(initialResult);
    setAiLoading(true);

    try {
      const explanation = await commerceApi.explain({
        interventionId: currentInterventionId,
        productId: product.id,
        variantId: variant.id,
        fitPreference: fit,
        selectionContext: isApparel ? undefined : selectionContext,
        usualSize: userSize,
      });

      if (activeIntervention.current === currentInterventionId && !decisionRef.current) {
        if (explanation.enabled && explanation.answer) {
          setResult({
            ...initialResult,
            message: explanation.answer.message,
          });
          setAiAssisted(explanation.answer.provider !== "deterministic");
        } else {
          setResult(initialResult);
        }
      }
    } catch {
      if (activeIntervention.current === currentInterventionId && !decisionRef.current) {
        setResult(initialResult);
      }
    } finally {
      if (activeIntervention.current === currentInterventionId) {
        setAiLoading(false);
      }
    }
  }

  // React to size suggestion from Concierge
  useEffect(() => {
    if (suggestedSize && isApparel) {
      const match = product.variants.find((v) => v.size === suggestedSize);
      if (match && match.id !== selected?.id) {
        void choose(match);
      }
    }
  }, [suggestedSize]);

  async function acceptRecommendation() {
    if (!selected || !result?.recommendedVariant || decisionLoading) return;
    setDecisionLoading(true);
    try {
      if (persistent && interventionId) await commerceApi.decide(interventionId, "accepted");
      else recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant.id, risk: result.risk, decision: "accepted" });
      setSelected(result.recommendedVariant);
      setDecision("accepted");
      decisionRef.current="accepted";
    } finally {
      setDecisionLoading(false);
    }
  }

  async function keepOriginal() {
    if (!selected || !result) return;
    if (persistent && interventionId) await commerceApi.decide(interventionId, "kept_original");
    else recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant?.id, risk: result.risk, decision: "kept_original" });
    setDecision("kept_original");
    decisionRef.current="kept_original";
  }

  const [addingToCart, setAddingToCart] = useState(false);

  async function handleAddToCart() {
    if (!selected || addingToCart || decisionLoading || requiresDecision || (!isApparel && Object.keys(selectionContext?.answers ?? {}).length < contextualQuestions.length)) return;
    setAddingToCart(true);
    try {
      if (persistent && interventionId && !result?.recommendedVariant && !result?.alternativeProductId) {
        await commerceApi.decide(interventionId, "not_required");
      }
      await onAdded(product, selected, decision ?? (interventionId && result ? "not_required" : undefined), selectionContext);
    } finally {
      setAddingToCart(false);
    }
  }

  const contextualQuestions = isApparel || pilotGroup === "control" ? [] : productQuestions(product);
  const selectedLabel = selected ? variantLabel(product, selected, product.variants.findIndex((variant) => variant.id === selected.id)) : "selecione";
  const requiresDecision = Boolean(result && result.risk !== "none" && !decision && (result.recommendedVariant || result.alternativeProductId));
  const orderedVariants = isApparel
    ? [...product.variants].sort((left, right) => ["P", "M", "G", "GG"].indexOf(left.size ?? "") - ["P", "M", "G", "GG"].indexOf(right.size ?? ""))
    : product.variants;

  return (
    <main className="detail-page">
      <button className="back-link" onClick={onBack}>← Coleção / {product.category}</button>
      <div className="detail-layout">
        <ProductArt product={product} hero />
        <section className="detail-copy">
          <span className="detail-badge">Nova coleção</span><p className="eyebrow">{product.category} · Vértice edição 06</p>
          <h1>{product.title}</h1>
          <p className="price">{money.format(product.variants[0].price / 100)}</p>
          <p className="description">{product.description}</p>
          {product.textileProfile && <div className="textile-profile"><p className="eyebrow">Ficha têxtil</p><p><strong>{product.textileProfile.composition ?? product.textileProfile.material}</strong> · Elasticidade {textileElasticityLabel[product.textileProfile.elasticity]}</p>{product.textileProfile.drape && <p>{product.textileProfile.drape}</p>}<small>Origem: {product.textileProfile.origin === "provided" ? "catálogo" : product.textileProfile.origin === "derived" ? "derivada do catálogo" : "descrição editorial demonstrativa"}</small></div>}

          <fieldset className="size-picker" ref={sizePickerRef}>
            <legend>
              <span>{isApparel ? "Escolha seu tamanho" : product.variantAttribute === "shade" ? "Escolha o tom" : "Escolha a variação"}</span>
              <b>{selectedLabel}</b>
            </legend>
            <div>{orderedVariants.map((variant, index) => <button id={`size-${variant.id}`} type="button" disabled={variant.inventory_quantity === 0} aria-pressed={selected?.id === variant.id} className={selected?.id === variant.id ? "selected" : ""} onClick={() => choose(variant)} key={variant.id}>{variantLabel(product, variant, index)}{variant.inventory_quantity === 0 ? " · Esgotado" : ""}</button>)}</div>
          </fieldset>

          {pilotGroup === "treatment" && isApparel && <details className="fit-assistant">
            <summary>
              <span><Icon name="spark"/><b>Quer ajuda para decidir?</b></span>
              <small>Conte seu tamanho habitual e o caimento desejado</small>
            </summary>
            <div className="fit-assistant__body">
              <fieldset className="fit-picker">
                <legend>Seu tamanho habitual</legend>
                <div>{(["P","M","G","GG"] as const).map((value) => <button type="button" key={value} aria-pressed={usualSize === value} className={usualSize === value ? "selected" : ""} onClick={() => { setUsualSize(value); if (selected) void choose(selected, fitPreference, value); }}>{value}</button>)}</div>
              </fieldset>
              <fieldset className="fit-picker">
                <legend>Como você gosta de vestir?</legend>
                <div>{([["fitted","Mais ajustado"],["regular","Equilibrado"],["loose","Mais solto"]] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={fitPreference === value} className={fitPreference === value ? "selected" : ""} onClick={() => { setFitPreference(value); if (selected) void choose(selected, value); }}>{label}</button>)}</div>
              </fieldset>
              <p>Essas preferências refinam a orientação, mas você mantém a decisão final.</p>
              <button type="button" className="mipo-inline-concierge-btn" onClick={() => onOpenConcierge(product)}><Icon name="spark"/><span>Conversar com a MIPO Atelier</span></button>
            </div>
          </details>}

          {!isApparel && contextualQuestions.map((question) => <fieldset className="fit-picker" key={question.id}><legend>{question.label}</legend><div>{question.options.map((option) => <button type="button" key={option} aria-pressed={selectionContext?.answers?.[question.id] === option} className={selectionContext?.answers?.[question.id] === option ? "selected" : ""} onClick={() => { const answers = { ...(selectionContext?.answers ?? {}), [question.id]: option }; const first = Object.values(answers)[0] ?? option; setSelectionContext({ label: "Preferências do produto", preference: first, answers }); setResult(null); setInterventionId(undefined); activeIntervention.current=undefined; }}>{option}</button>)}</div></fieldset>)}
          {!isApparel && selected && selectionContext && Object.keys(selectionContext.answers ?? {}).length === contextualQuestions.length && !result && !aiLoading && <button type="button" className="agent-continue" onClick={() => void choose(selected)}>Pedir orientação ao agente<Icon name="spark" /></button>}
          {evaluationError && <div className="mipo-inline-error" role="alert"><p>{evaluationError}</p>{selected && <button type="button" onClick={() => void choose(selected)}>Tentar novamente</button>}</div>}

          {/* Feedback State 1: Active AI Analyzing Thinking State */}
          {selected && aiLoading && !result && (
            <aside className="mipo-card mipo-card--analyzing" aria-live="polite">
              <div className="mipo-card__mark mipo-card__mark--pulse">
                <Icon name="spark" />
              </div>
              <div>
                <div className="mipo-thinking-badge">
                  <Icon name="spark" />
                  <span>MIPO Atelier consultando caimento e tecidos…</span>
                </div>
                <span className="mipo-shimmer-line mipo-shimmer-line--title" />
                <span className="mipo-shimmer-line mipo-shimmer-line--body" />
                <p className="mipo-thinking-text">
                  Analisando proporções para o tamanho {selected.size ?? selected.title}, elasticidade da fibra e histórico de trocas…
                </p>
              </div>
            </aside>
          )}

          {/* Feedback State 2: Final Evaluated AI Response (no preliminary flashing) */}
          {selected && result && (
            <aside className={`mipo-card mipo-card--${result.risk} reveal`} aria-live="polite">
              <div className="mipo-card__mark"><Icon name="spark" /></div>
              <div>
                <p className="mipo-label">Escolha assistida · MIPO {aiLoading ? <span>· Refinando explicação…</span> : aiAssisted && <span>· Explicação contextual por IA</span>}</p>
                <h2>{result.message}</h2>
                <details className="mipo-evidence">
                  <summary>Por que estamos sugerindo isso?</summary>
                  <p>{result.evidence}</p>
                  <small>Regra determinística · score {result.score}/100 · cobertura de evidência {Math.round(result.evidenceCoverage * 100)}%</small>
                </details>
                {(result.recommendedVariant || result.alternativeProductId) && !decision && <div className="mipo-actions">
                  {result.recommendedVariant && <button type="button" disabled={decisionLoading} onClick={acceptRecommendation}>{decisionLoading ? "Aplicando tamanho…" : `Usar tamanho ${result.recommendedVariant.size}`}</button>}
                  {result.alternativeProductId && <button type="button" onClick={() => onAlternative(result.alternativeProductId!)}>Ver alternativa</button>}
                  <button type="button" className="quiet" onClick={keepOriginal}>Manter minha escolha</button>
                </div>}
                {decision && <p className="decision-note">✓ Decisão registrada: {decision === "accepted" ? "recomendação aceita" : "escolha original mantida"}.</p>}
              </div>
            </aside>
          )}

          <button className="primary-action" disabled={!selected || addingToCart || decisionLoading || requiresDecision || (!isApparel && Object.keys(selectionContext?.answers ?? {}).length < contextualQuestions.length)} onClick={handleAddToCart}>
            {addingToCart ? (
              <>
                <span>Adicionando à sacola…</span>
                <span className="button-spinner" aria-hidden="true" />
              </>
            ) : (
              <>
                <span>Adicionar à sacola</span>
                <Icon name="arrow" />
              </>
            )}
          </button>
          <div className="detail-notes"><span>Ambiente demonstrativo</span><span>Nenhuma cobrança será realizada</span></div>
        </section>
      </div>
    </main>
  );
}

function CartAuditCard({ cart, onOpenConcierge }: { cart: Cart; onOpenConcierge: () => void }) {
  const [audit, setAudit] = useState<{ status: "aligned" | "attention"; headline: string; advice: string; careTips: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cart.items.length === 0) {
      setAudit(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    commerceApi.auditCart(cart.items)
      .then((res) => {
        if (active) {
          setAudit(res);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [cart.items]);

  if (cart.items.length === 0) return null;

  if (loading && !audit) {
    return (
      <aside className="cart-audit-card cart-audit-card--loading" aria-live="polite">
        <div className="cart-audit-card__mark mipo-card__mark--pulse">
          <Icon name="spark" />
        </div>
        <div>
          <div className="mipo-thinking-badge">
            <Icon name="spark" />
            <span>MIPO Atelier · Auditoria em tempo real</span>
          </div>
          <span className="mipo-shimmer-line mipo-shimmer-line--title" />
          <p className="mipo-thinking-text">
            Auditando coerência entre tamanhos e mapeando regras de conservação têxtil…
          </p>
        </div>
      </aside>
    );
  }

  if (!audit) return null;

  return (
    <aside className={`cart-audit-card ${audit.status === "attention" ? "cart-audit-card--attention" : ""} reveal`} aria-live="polite">
      <div className="cart-audit-card__mark">
        <Icon name="spark" />
      </div>
      <div>
        <p className="mipo-label">Auditoria MIPO Atelier · Coerência & Cuidados</p>
        <h3>{audit.headline}</h3>
        <p>{audit.advice}</p>
        {audit.careTips.length > 0 && (
          <ul>
            {audit.careTips.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        )}
        <button type="button" className="cart-audit-card__action" onClick={onOpenConcierge}>
          <Icon name="spark" />
          <span>Conversar com a MIPO Atelier</span>
        </button>
      </div>
    </aside>
  );
}

function CartView({
  cart,
  products = [],
  onQuantity,
  onRemove,
  onCheckout,
  onCatalog,
  onOpenConcierge,
  mipoEnabled,
}: {
  cart: Cart;
  products?: Product[];
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
  onCatalog: () => void;
  onOpenConcierge: (product?: Product) => void;
  mipoEnabled: boolean;
}) {
  const total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return (
    <main className="cart-page">
      <div className="page-kicker">
        <p className="eyebrow">Sua seleção</p>
        <h1>Sacola</h1>
        <span>{cart.items.reduce((sum, item) => sum + item.quantity, 0)} itens</span>
      </div>
      {cart.items.length === 0 ? (
        <div className="empty-state">
          <h2>Sua sacola espera por boas escolhas.</h2>
          <button className="primary-action" onClick={onCatalog}>Explorar coleção <Icon name="arrow" /></button>
        </div>
      ) : (
        <div className="cart-layout">
          <section className="cart-lines">
            {cart.items.map((item) => {
              const matchedProduct = products.find((p) => p.id === item.productId || p.title === item.title);

              return (
                <article className="cart-line" key={item.id}>
                  <div className="cart-swatch" style={{ background: item.color }} />
                  <div className="cart-line__copy">
                    <p className="eyebrow">Vértice · edição 06</p>
                    <h2>{item.title}</h2>
                    <p>{item.size ? `Tamanho ${item.size}` : "Variação selecionada"}</p>
                    {item.mipoDecision && (
                      <small>
                        <Icon name="spark" /> {item.mipoDecision === "accepted" ? "Tamanho escolhido com assistência MIPO" : item.mipoDecision === "not_required" ? "Escolha revisada · sem ajuste necessário" : item.mipoDecision === "pending" ? "Revisão de caimento pendente" : "Escolha pessoal mantida"}
                      </small>
                    )}

                    {mipoEnabled && item.size && matchedProduct && (
                      <div className="cart-item-coherence cart-item-coherence--harmonized">
                        <span className="cart-item-coherence__badge"><Icon name="spark"/> Tamanho {item.size} avaliado para esta peça</span>
                        <button type="button" className="cart-item-coherence__action" onClick={() => onOpenConcierge(matchedProduct)}>Revisar caimento</button>
                      </div>
                    )}
                  </div>
                  <div className="quantity">
                    <button aria-label="Diminuir quantidade" onClick={() => onQuantity(item.id, item.quantity - 1)}><Icon name="minus" /></button>
                    <span>{item.quantity}</span>
                    <button aria-label="Aumentar quantidade" onClick={() => onQuantity(item.id, item.quantity + 1)}><Icon name="plus" /></button>
                  </div>
                  <strong>{money.format((item.unitPrice * item.quantity) / 100)}</strong>
                  <button className="remove" aria-label={`Remover ${item.title}`} onClick={() => onRemove(item.id)}><Icon name="close" /></button>
                </article>
              );
            })}

            {mipoEnabled && <CartAuditCard cart={cart} onOpenConcierge={() => onOpenConcierge()} />}
          </section>

          <aside className="summary">
            <p className="eyebrow">Resumo</p>
            <div><span>Subtotal</span><strong>{money.format(total / 100)}</strong></div>
            <div><span>Entrega</span><span>Calculada no checkout</span></div>
            <hr />
            <div className="summary__total"><span>Total parcial</span><strong>{money.format(total / 100)}</strong></div>
            <button className="primary-action" onClick={onCheckout}>Continuar para checkout <Icon name="arrow" /></button>
            <p className="demo-note">Demonstração UX/UI. Nenhuma compra ou cobrança será realizada.</p>
          </aside>
        </div>
      )}
    </main>
  );
}

function Checkout({ cart, onFinish, onBack, submitting, error }: { cart: Cart; onFinish: () => void; onBack: () => void; submitting: boolean; error: string }) {
  const total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return (
    <main className="checkout-page">
      <button className="back-link" onClick={onBack}>← Voltar à sacola</button>
      <div className="checkout-heading"><p className="eyebrow">Protótipo de experiência</p><h1>Finalizar escolha</h1><p>Use apenas informações fictícias. Nada será enviado ou processado.</p></div>
      <div className="checkout-layout">
        <form onSubmit={(event) => { event.preventDefault(); onFinish(); }}>
          <section className="form-section"><span className="step-number">01</span><div><h2>Contato</h2><label>E-mail demonstrativo<input required type="email" name="email" autoComplete="email" spellCheck={false} placeholder="Ex.: demo@vertice.local…" /></label></div></section>
          <section className="form-section"><span className="step-number">02</span><div><h2>Entrega simulada</h2><div className="form-grid"><label>Nome fictício<input required name="name" autoComplete="name" placeholder="Ex.: Cliente Demo…" /></label><label>CEP fictício<input required name="postal-code" autoComplete="postal-code" inputMode="numeric" placeholder="Ex.: 00000-000…" /></label><label className="wide">Endereço fictício<input required name="address" autoComplete="street-address" placeholder="Ex.: Rua da Demonstração, 100…" /></label><label>Cidade<input required name="city" autoComplete="address-level2" placeholder="Ex.: São Paulo…" /></label><label>UF<select name="state" autoComplete="address-level1" defaultValue="SP"><option>SP</option><option>RJ</option><option>MG</option></select></label></div></div></section>
          <section className="form-section"><span className="step-number">03</span><div><h2>Pagamento visual</h2><label className="mock-payment"><input type="radio" defaultChecked name="payment"/> Cartão fictício <span>•••• 4242</span></label></div></section>
          {error && <p className="checkout-error" role="alert">{error}</p>}
          <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Registrando escolha…" : "Concluir demonstração"} {!submitting && <Icon name="arrow" />}</button>
        </form>
        <aside className="summary"><p className="eyebrow">Sua escolha</p>{cart.items.map(item => <div className="checkout-item" key={item.id}><span>{item.quantity}× {item.title}{item.size ? ` · ${item.size}` : ""}{item.selectionContext && <small className="checkout-context">{item.selectionContext.label}: {item.selectionContext.preference}</small>}</span><strong>{money.format(item.unitPrice * item.quantity / 100)}</strong></div>)}<hr/><div className="summary__total"><span>Total demonstrativo</span><strong>{money.format(total / 100)}</strong></div></aside>
      </div>
    </main>
  );
}

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  suggestedAction?: {
    type: "select_size" | "view_product";
    productId?: string;
    size?: Size;
    label?: string;
  };
};

function MipoAtelierDrawer({
  isOpen,
  onClose,
  currentProduct,
  cart,
  onSelectSize,
  onSelectProduct,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentProduct: Product | null;
  cart: Cart;
  onSelectSize?: (size: Size) => void;
  onSelectProduct?: (product: Product) => void;
}) {
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "Olá! Sou a MIPO Concierge do atelier Vértice. Posso orientar sobre caimento, composição, elasticidade, combinações e cuidados quando essas informações estiverem disponíveis na ficha da peça. Em que posso ajudar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [appliedSize, setAppliedSize] = useState<Size | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? input).trim();
    if (!text || loading) return;

    const userMessage: ChatItem = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await commerceApi.chat(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        currentProduct,
        cart.items
      );

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: response.reply,
          suggestedAction: response.suggestedAction,
        },
      ]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "Tive um contratempo de conexão com o atelier. Para não inventar informações sobre tecido ou elasticidade, tente novamente quando a ficha da peça estiver disponível.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const chips = currentProduct
    ? [
        `Qual tamanho do ${currentProduct.title} é melhor para mim?`,
        "O tecido tem elastano ou encolhe?",
        `Com o que posso combinar o ${currentProduct.title}?`,
        "Quais os cuidados recomendados de lavagem?",
      ]
    : [
        "Como escolher meu tamanho ideal?",
        "Quais peças combinam entre si?",
        "Dúvidas sobre linho e tecidos naturais",
      ];

  return (
    <>
      <div className="mipo-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="mipo-drawer" role="dialog" aria-label="MIPO Atelier Concierge">
        <header className="mipo-drawer__header">
          <div className="mipo-drawer__title-group">
            <p>MIPO Concierge</p>
            <h2>Atelier Vértice</h2>
          </div>
          <button className="mipo-drawer__close" onClick={onClose} aria-label="Fechar consultoria">
            <Icon name="close" />
          </button>
        </header>

        {currentProduct && (
          <div className="mipo-drawer__context-strip">
            <Icon name="spark" />
            <span>Peça em análise: <strong>{currentProduct.title}</strong> ({currentProduct.category})</span>
          </div>
        )}

        <div className="mipo-chat-thread">
          {messages.map((msg, index) => (
            <div key={index} className={`mipo-chat-bubble mipo-chat-bubble--${msg.role}`}>
              <div className="mipo-bubble-meta">
                {msg.role === "assistant" ? <><Icon name="spark" /> MIPO Concierge</> : "Você"}
              </div>
              <div className="mipo-bubble-body">
                {msg.content}
                {msg.suggestedAction?.type === "select_size" && msg.suggestedAction.size && onSelectSize && (
                  <div>
                    {appliedSize === msg.suggestedAction.size ? (
                      <p className="mipo-suggestion-applied">✓ Tamanho {msg.suggestedAction.size} selecionado no atelier</p>
                    ) : (
                      <button
                        type="button"
                        className="mipo-suggestion-action"
                        onClick={() => {
                          if (msg.suggestedAction?.size) {
                            onSelectSize(msg.suggestedAction.size);
                            setAppliedSize(msg.suggestedAction.size);
                          }
                        }}
                      >
                        <Icon name="spark" />
                        <span>Selecionar tamanho {msg.suggestedAction.size}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="mipo-chat-bubble mipo-chat-bubble--assistant reveal">
              <div className="mipo-bubble-meta">
                <Icon name="spark" /> MIPO Concierge
              </div>
              <div className="mipo-bubble-body mipo-bubble-body--thinking">
                <div className="mipo-typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <p className="mipo-thinking-text">
                  Consultando modelagens, tecidos e caimentos no atelier…
                </p>
              </div>
            </div>
          )}

          <div ref={threadEndRef} />
        </div>

        <div className="mipo-drawer__footer">
          <div className="mipo-chat-chips">
            {chips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="mipo-chip"
                disabled={loading}
                onClick={() => void handleSend(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="mipo-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <input
              type="text"
              className="mipo-chat-input"
              placeholder="Pergunte sobre medidas, caimento, combinações..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="mipo-chat-send" disabled={!input.trim() || loading}>
              Enviar
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

export function Storefront() {
  const persistent = process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase";
  const maxStorefrontProducts = 48;
  const [view, setView] = useState<View>("catalog");
  const [products, setProducts] = useState<Product[]>(localProducts);
  const [activeProduct, setActiveProduct] = useState<Product>(localProducts[0]);
  const [cart, setCart] = useState<Cart>({ id: "cart_demo", region: { id: "reg_br", name: "Brasil", currency_code: "brl" }, items: [] });
  const [toast, setToast] = useState("");
  const [serviceError, setServiceError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(persistent);
  const [pilotGroup, setPilotGroup] = useState<PilotGroup>("treatment");
  const [completedOrder, setCompletedOrder] = useState<PilotOrderResult | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const checkoutKey = useRef<string | undefined>(undefined);

  // MIPO Concierge State
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [conciergeProductContext, setConciergeProductContext] = useState<Product | null>(null);
  const [conciergeSuggestedSize, setConciergeSuggestedSize] = useState<Size | null>(null);

  useEffect(() => {
    if (!persistent) {
      setCart(localCommerceRepository.getCart());
      setCatalogLoading(false);
      return;
    }
    Promise.all([commerceApi.products(), commerceApi.cart(), commerceApi.pilotAssignment()])
      .then(([catalog, savedCart, assignment]) => {
        const validCatalog = catalog.filter((product) => product.title && product.variants.length > 0);
        if (!validCatalog.length || validCatalog.length > maxStorefrontProducts) {
          throw new Error(`Catálogo remoto fora do limite seguro (${validCatalog.length} produtos recebidos).`);
        }
        setProducts(validCatalog);
        setCart(savedCart);
        setPilotGroup(assignment.group);
        if (validCatalog[0]) setActiveProduct(validCatalog[0]);
      })
      .catch((error) => setServiceError(error.message))
      .finally(() => setCatalogLoading(false));
  }, [persistent]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view, activeProduct]);

  const cartCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function openProduct(product: Product) {
    setActiveProduct(product);
    setConciergeProductContext(product);
    setConciergeSuggestedSize(null);
    setView("product");
  }

  function handleOpenConcierge(product?: Product) {
    setConciergeProductContext(product ?? (view === "product" ? activeProduct : null));
    setIsConciergeOpen(true);
  }

  async function add(product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original" | "not_required", selectionContext?: SelectionContext) {
    const next = persistent
      ? await commerceApi.addItem(variant.id, 1, decision, selectionContext)
      : localCommerceRepository.addLineItem({
          productId: product.id,
          variantId: variant.id,
          title: product.title,
          size: variant.size,
          quantity: 1,
          unitPrice: variant.price,
          color: product.color,
          mipoDecision: decision,
          selectionContext,
        });
    const isApparel = product.productKind === "apparel" || (!product.productKind && product.category !== "Maquiagem");
    if (!decision && isApparel) {
      recordMipoEvent({
        productId: product.id,
        selectedVariantId: variant.id,
        risk: evaluateCheckoutRisk(product, variant).risk,
        decision: "not_required",
      });
    }
    setCart(next);
    setToast(`${product.title} foi para sua sacola.`);
    setTimeout(() => setToast(""), 2800);
    setView("cart");
  }

  async function changeQuantity(id: string, quantity: number) {
    setCart(persistent ? await commerceApi.updateItem(id, Math.max(1, quantity)) : localCommerceRepository.updateLineItem(id, quantity));
  }

  async function removeItem(id: string) {
    setCart(persistent ? await commerceApi.removeItem(id) : localCommerceRepository.removeLineItem(id));
  }

  async function finishDemo() {
    if (checkoutSubmitting) return;
    setCheckoutSubmitting(true);
    setCheckoutError("");
    try {
      if (persistent) {
        checkoutKey.current ??= crypto.randomUUID();
        const order = await commerceApi.checkout(checkoutKey.current);
        setCompletedOrder(order);
        setCart(await commerceApi.cart());
      } else {
        setCompletedOrder({ id: crypto.randomUUID(), displayId: `DEMO-${Date.now().toString(36).toUpperCase()}`, group: pilotGroup, itemCount: cartCount, totalCents: cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), completedAt: new Date().toISOString() });
        setCart(localCommerceRepository.clearCart());
      }
      checkoutKey.current = undefined;
      setView("success");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Não foi possível registrar a escolha.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  return (
    <div className="storefront">
      <div className="demo-banner">Experiência demonstrativa · nenhum dado ou pagamento é processado</div>
      <Header cartCount={cartCount} onNavigate={setView} />
      {serviceError && (
        <main className="service-error">
          <h1>Dados temporariamente indisponíveis</h1>
          <p>{serviceError}</p>
          <p>Verifique a configuração do Supabase. O modo local não é ativado silenciosamente.</p>
        </main>
      )}
      {!serviceError && catalogLoading && (
        <main className="service-loading" aria-live="polite">
          <p className="eyebrow">Seleção Vértice</p>
          <h1>Preparando a coleção…</h1>
          <p>Estamos carregando os produtos curados.</p>
        </main>
      )}
      {!serviceError && !catalogLoading && view === "catalog" && (
        <Catalog products={products} onProduct={openProduct} />
      )}
      {!serviceError && !catalogLoading && view === "product" && (
        <ProductDetail
          product={activeProduct}
          persistent={persistent}
          onBack={() => setView("catalog")}
          onAdded={add}
          onAlternative={(id) => {
            const found = products.find((p) => p.id === id);
            if (found) openProduct(found);
          }}
          onOpenConcierge={handleOpenConcierge}
          suggestedSize={conciergeSuggestedSize}
          pilotGroup={pilotGroup}
        />
      )}
      {!serviceError && !catalogLoading && view === "cart" && (
        <CartView
          cart={cart}
          products={products}
          onQuantity={(id, quantity) => void changeQuantity(id, quantity)}
          onRemove={(id) => void removeItem(id)}
          onCheckout={() => setView("checkout")}
          onCatalog={() => setView("catalog")}
          onOpenConcierge={(prod) => handleOpenConcierge(prod)}
          mipoEnabled={pilotGroup === "treatment"}
        />
      )}
      {!serviceError && !catalogLoading && view === "checkout" && (
        <Checkout cart={cart} onBack={() => setView("cart")} onFinish={() => void finishDemo()} submitting={checkoutSubmitting} error={checkoutError} />
      )}
      {view === "success" && (
        <main className="success-page">
          <p className="eyebrow">Demonstração concluída</p>
          <span className="success-mark">✓</span>
          <h1>Escolha registrada.<br /><em>Nenhuma compra foi realizada.</em></h1>
          <p>{completedOrder ? `Registro ${completedOrder.displayId} criado com ${completedOrder.itemCount} ${completedOrder.itemCount === 1 ? "item" : "itens"}.` : "A escolha demonstrativa foi concluída."} Nenhuma cobrança ou pedido comercial foi realizado.</p>
          <button className="primary-action" onClick={() => setView("catalog")}>Voltar à coleção <Icon name="arrow" /></button>
        </main>
      )}

      {/* Floating MIPO Atelier Trigger Button */}
      {pilotGroup === "treatment" && <button
        className="mipo-floating-trigger"
        onClick={() => handleOpenConcierge()}
        aria-label="Abrir consultoria MIPO Atelier"
      >
        <span className="mipo-floating-trigger__spark"><Icon name="spark" /></span>
        <span className="mipo-floating-trigger__label">MIPO Atelier <em>· Consultoria</em></span>
      </button>}

      {/* MIPO Atelier Slide-out Drawer */}
      {pilotGroup === "treatment" && <MipoAtelierDrawer
        isOpen={isConciergeOpen}
        onClose={() => setIsConciergeOpen(false)}
        currentProduct={conciergeProductContext}
        cart={cart}
        onSelectSize={(size) => {
          setConciergeSuggestedSize(size);
          setToast(`Tamanho ${size} selecionado para ${conciergeProductContext?.title ?? "o produto"}.`);
          setTimeout(() => setToast(""), 3000);
        }}
        onSelectProduct={(prod) => openProduct(prod)}
      />}

      {toast && <div className="toast" role="status">{toast}</div>}
      <footer>
        <div className="wordmark">VÉRTICE<span>atelier cotidiano</span></div>
        <p>Uma demonstração de escolha assistida pelo MIPO. <a href="/painel">Painel MIPO →</a></p>
        <p>© 2026 · Case EloGroup</p>
      </footer>
    </div>
  );
}
