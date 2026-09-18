"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { products as localProducts } from "@/src/data/products";
import type { Cart, Product, ProductVariant, SelectionContext } from "@/src/domain/commerce";
import { localCommerceRepository, recordMipoEvent } from "@/src/services/local-commerce";
import { commerceApi } from "@/src/services/commerce-api";
import { evaluateCheckoutRisk, evaluateSelectionContext, type RiskResult } from "@/src/services/mipo";
import { productQuestions } from "@/src/services/product-profile";

type View = "catalog" | "product" | "cart" | "checkout" | "success";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

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
        <span>troca simples</span><i>◆</i><span>materiais escolhidos</span><i>◆</i><span>assistência de tamanho</span><i>◆</i><span>envio para todo brasil</span>
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
                <div><p>{product.category}</p><h3>{product.title}</h3><span className="rating" aria-label="Avaliação 4,8 de 5">★★★★★ <small>4,8</small></span></div>
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

function ProductDetail({ product, persistent, onBack, onAdded, onAlternative }: { product: Product; persistent: boolean; onBack: () => void; onAdded: (product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original", selectionContext?: SelectionContext) => void | Promise<void>; onAlternative: (id: string) => void }) {
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
  const activeIntervention = useRef<string|undefined>(undefined);
  const decisionRef = useRef<typeof decision>(undefined);
  const sizePickerRef = useRef<HTMLFieldSetElement>(null);

  async function choose(variant: ProductVariant, fit = fitPreference, userSize = usualSize) {
    setSelected(variant); setDecision(undefined); decisionRef.current=undefined; setEvaluating(true); setAiAssisted(false); setAiLoading(false);
    try { if (!isApparel && (!selectionContext || Object.keys(selectionContext.answers ?? {}).length < productQuestions(product).length)) { setResult(null); setInterventionId(undefined); activeIntervention.current=undefined; return; } if (persistent) { const response = await commerceApi.evaluate(product.id, variant.id, fit, isApparel ? undefined : selectionContext, userSize); setResult(response.result); setInterventionId(response.interventionId); activeIntervention.current=response.interventionId; setAiLoading(true); void commerceApi.explain(response.interventionId).then((explanation)=>{if(explanation.enabled&&explanation.answer&&activeIntervention.current===response.interventionId&&!decisionRef.current){setResult((current)=>current?{...current,message:explanation.answer!.message}:current);setAiAssisted(explanation.answer.provider!=="deterministic");}}).catch(()=>{}).finally(()=>{if(activeIntervention.current===response.interventionId)setAiLoading(false);}); } else { setResult(selectionContext ? evaluateSelectionContext(product, variant, selectionContext) : evaluateCheckoutRisk(product, variant, fit, undefined, userSize)); setInterventionId(undefined); activeIntervention.current=undefined; } }
    finally { setEvaluating(false); }
  }

  async function acceptRecommendation() {
    if (!selected || !result?.recommendedVariant) return;
    if (persistent && interventionId) await commerceApi.decide(interventionId, "accepted"); else recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant.id, risk: result.risk, decision: "accepted" });
    setSelected(result.recommendedVariant);
    setDecision("accepted");
    decisionRef.current="accepted";
  }

  async function keepOriginal() {
    if (!selected || !result) return;
    if (persistent && interventionId) await commerceApi.decide(interventionId, "kept_original"); else recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant?.id, risk: result.risk, decision: "kept_original" });
    setDecision("kept_original");
    decisionRef.current="kept_original";
  }

  async function continueWithSelection() {
    if (!selected || !result || decisionLoading) return;
    setDecisionLoading(true);
    try {
      if (persistent && interventionId) await commerceApi.decide(interventionId, "kept_original");
      else recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, risk: result.risk, decision: "kept_original" });
      setDecision("kept_original");
      decisionRef.current="kept_original";
      await onAdded(product, selected, "kept_original", selectionContext);
    } finally { setDecisionLoading(false); }
  }

  const isApparel = product.productKind === "apparel" || (!product.productKind && product.category !== "Maquiagem");
  const contextualQuestions = isApparel ? [] : productQuestions(product);
  const selectedLabel = selected ? variantLabel(product, selected, product.variants.findIndex((variant) => variant.id === selected.id)) : "selecione";
  const requiresDecision=Boolean(result&&result.risk!=="none"&&!decision&&(result.recommendedVariant||result.alternativeProductId));

  return (
    <main className="detail-page">
      <button className="back-link" onClick={onBack}>← Coleção / {product.category}</button>
      <div className="detail-layout">
        <ProductArt product={product} hero />
        <section className="detail-copy">
          <span className="detail-badge">Nova coleção</span><p className="eyebrow">{product.category} · Vértice edição 06</p>
          <h1>{product.title}</h1>
          <p className="detail-rating">★★★★★ <span>4,8 (128 avaliações)</span></p>
          <p className="price">{money.format(product.variants[0].price / 100)}</p>
          <p className="description">{product.description}</p>

          <fieldset className="size-picker" ref={sizePickerRef}>
            <legend><span>{isApparel ? "Tamanho" : product.variantAttribute === "shade" ? "Tom" : "Variação"}: <b>{selectedLabel}</b></span>{isApparel&&<button type="button">Guia de medidas</button>}</legend>
            <div>{product.variants.map((variant, index) => <button id={`size-${variant.id}`} type="button" className={selected?.id === variant.id ? "selected" : ""} onClick={() => choose(variant)} key={variant.id}>{variantLabel(product, variant, index)}</button>)}</div>
          </fieldset>

          {isApparel&&<><fieldset className="fit-picker"><legend>Qual tamanho você costuma usar?</legend><div>{(["P","M","G","GG"] as const).map((value) => <button type="button" key={value} aria-pressed={usualSize === value} className={usualSize === value ? "selected" : ""} onClick={() => { setUsualSize(value); if (selected) void choose(selected, fitPreference, value); }}>{value}</button>)}</div><small>Essa resposta ajuda a contextualizar sua escolha, sem determinar o tamanho por você.</small></fieldset><fieldset className="fit-picker"><legend>Como você prefere o caimento?</legend><div>{([["fitted","Mais ajustado"],["regular","Regular"],["loose","Mais solto"]] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={fitPreference === value} className={fitPreference === value ? "selected" : ""} onClick={() => { setFitPreference(value); if (selected) void choose(selected, value); }}>{label}</button>)}</div><small>Usamos essa preferência para comparar o histórico de tamanho.</small></fieldset></>}
          {!isApparel && contextualQuestions.map((question) => <fieldset className="fit-picker" key={question.id}><legend>{question.label}</legend><div>{question.options.map((option) => <button type="button" key={option} aria-pressed={selectionContext?.answers?.[question.id] === option} className={selectionContext?.answers?.[question.id] === option ? "selected" : ""} onClick={() => { const answers = { ...(selectionContext?.answers ?? {}), [question.id]: option }; const first = Object.values(answers)[0] ?? option; setSelectionContext({ label: "Preferências do produto", preference: first, answers }); setResult(null); setInterventionId(undefined); activeIntervention.current=undefined; }}>{option}</button>)}</div></fieldset>)}
          {!isApparel && selected && selectionContext && Object.keys(selectionContext.answers ?? {}).length === contextualQuestions.length && !result && <button type="button" className="agent-continue" disabled={evaluating} onClick={() => void choose(selected)}>{evaluating ? "Consultando o agente…" : "Pedir orientação ao agente"}<Icon name="spark" /></button>}

          {evaluating && <p className="mipo-loading" role="status">Analisando sua escolha…</p>}
          {selected && result && !evaluating && (
            <aside className={`mipo-card mipo-card--${result.risk}`} aria-live="polite">
              <div className="mipo-card__mark"><Icon name="spark" /></div>
              <div>
                <p className="mipo-label">Escolha assistida · MIPO {aiAssisted&&<span>· Explicação assistida por IA</span>}</p>
                <h2>{result.message}</h2>
                <p className="mipo-score">Score determinístico: <strong>{result.score}/100</strong> · evidência coberta: {Math.round(result.evidenceCoverage * 100)}%</p>
                <p>{result.evidence}</p>
                {aiLoading&&<p className="mipo-ai-status" role="status">Aprimorando a explicação…</p>}
                {(result.recommendedVariant || result.alternativeProductId) && !decision && <div className="mipo-actions">
                  {result.recommendedVariant && <button type="button" onClick={acceptRecommendation}>Usar tamanho {result.recommendedVariant.size}</button>}
                  {result.alternativeProductId && <button type="button" onClick={() => onAlternative(result.alternativeProductId!)}>Ver alternativa</button>}
                  <button type="button" className="quiet" onClick={keepOriginal}>Manter minha escolha</button>
                </div>}
                {decision && <p className="decision-note">✓ Decisão registrada: {decision === "accepted" ? "recomendação aceita" : "escolha original mantida"}.</p>}
              </div>
            </aside>
          )}

          <button className="primary-action" disabled={!selected || evaluating || decisionLoading || requiresDecision || (!isApparel && Object.keys(selectionContext?.answers ?? {}).length < contextualQuestions.length)} onClick={async () => { if (!selected) return; if (persistent && interventionId && !result?.recommendedVariant && !result?.alternativeProductId) await commerceApi.decide(interventionId, "not_required"); await onAdded(product, selected, decision, selectionContext); }}>
            <span>Adicionar à sacola</span><Icon name="arrow" />
          </button>
          <div className="detail-notes"><span>Frete grátis acima de R$ 500</span><span>Troca em até 30 dias</span></div>
        </section>
      </div>
    </main>
  );
}

function CartView({ cart, onQuantity, onRemove, onCheckout, onCatalog }: { cart: Cart; onQuantity: (id:string, quantity:number) => void; onRemove: (id:string) => void; onCheckout: () => void; onCatalog: () => void }) {
  const total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return <main className="cart-page">
    <div className="page-kicker"><p className="eyebrow">Sua seleção</p><h1>Sacola</h1><span>{cart.items.reduce((sum, item) => sum + item.quantity, 0)} itens</span></div>
    {cart.items.length === 0 ? <div className="empty-state"><h2>Sua sacola espera por boas escolhas.</h2><button className="primary-action" onClick={onCatalog}>Explorar coleção <Icon name="arrow" /></button></div> : <div className="cart-layout">
      <section className="cart-lines">{cart.items.map((item) => <article className="cart-line" key={item.id}>
        <div className="cart-swatch" style={{ background: item.color }} />
        <div className="cart-line__copy"><p className="eyebrow">Vértice · edição 06</p><h2>{item.title}</h2><p>{item.size ? `Tamanho ${item.size}` : "Variação selecionada"}</p>{item.mipoDecision && <small><Icon name="spark" /> {item.mipoDecision === "accepted" ? "Tamanho escolhido com assistência MIPO" : "Escolha pessoal mantida"}</small>}</div>
        <div className="quantity"><button aria-label="Diminuir quantidade" onClick={() => onQuantity(item.id, item.quantity - 1)}><Icon name="minus" /></button><span>{item.quantity}</span><button aria-label="Aumentar quantidade" onClick={() => onQuantity(item.id, item.quantity + 1)}><Icon name="plus" /></button></div>
        <strong>{money.format(item.unitPrice * item.quantity / 100)}</strong>
        <button className="remove" aria-label={`Remover ${item.title}`} onClick={() => onRemove(item.id)}><Icon name="close" /></button>
      </article>)}</section>
      <aside className="summary"><p className="eyebrow">Resumo</p><div><span>Subtotal</span><strong>{money.format(total / 100)}</strong></div><div><span>Entrega</span><span>Calculada no checkout</span></div><hr/><div className="summary__total"><span>Total parcial</span><strong>{money.format(total / 100)}</strong></div><button className="primary-action" onClick={onCheckout}>Continuar para checkout <Icon name="arrow" /></button><p className="demo-note">Demonstração UX/UI. Nenhuma compra ou cobrança será realizada.</p></aside>
    </div>}
  </main>;
}

function Checkout({ cart, onFinish, onBack }: { cart: Cart; onFinish: () => void; onBack: () => void }) {
  const total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return <main className="checkout-page">
    <button className="back-link" onClick={onBack}>← Voltar à sacola</button>
    <div className="checkout-heading"><p className="eyebrow">Protótipo de experiência</p><h1>Finalizar escolha</h1><p>Use apenas informações fictícias. Nada será enviado ou processado.</p></div>
    <div className="checkout-layout">
      <form onSubmit={(event) => { event.preventDefault(); onFinish(); }}>
        <section className="form-section"><span className="step-number">01</span><div><h2>Contato</h2><label>E-mail demonstrativo<input required type="email" name="email" autoComplete="email" spellCheck={false} placeholder="Ex.: demo@vertice.local…" /></label></div></section>
        <section className="form-section"><span className="step-number">02</span><div><h2>Entrega simulada</h2><div className="form-grid"><label>Nome fictício<input required name="name" autoComplete="name" placeholder="Ex.: Cliente Demo…" /></label><label>CEP fictício<input required name="postal-code" autoComplete="postal-code" inputMode="numeric" placeholder="Ex.: 00000-000…" /></label><label className="wide">Endereço fictício<input required name="address" autoComplete="street-address" placeholder="Ex.: Rua da Demonstração, 100…" /></label><label>Cidade<input required name="city" autoComplete="address-level2" placeholder="Ex.: São Paulo…" /></label><label>UF<select name="state" autoComplete="address-level1" defaultValue="SP"><option>SP</option><option>RJ</option><option>MG</option></select></label></div></div></section>
        <section className="form-section"><span className="step-number">03</span><div><h2>Pagamento visual</h2><label className="mock-payment"><input type="radio" defaultChecked name="payment"/> Cartão fictício <span>•••• 4242</span></label></div></section>
        <button className="primary-action" type="submit">Concluir demonstração <Icon name="arrow" /></button>
      </form>
      <aside className="summary"><p className="eyebrow">Sua escolha</p>{cart.items.map(item => <div className="checkout-item" key={item.id}><span>{item.quantity}× {item.title}{item.size ? ` · ${item.size}` : ""}{item.selectionContext && <small className="checkout-context">{item.selectionContext.label}: {item.selectionContext.preference}</small>}</span><strong>{money.format(item.unitPrice * item.quantity / 100)}</strong></div>)}<hr/><div className="summary__total"><span>Total demonstrativo</span><strong>{money.format(total / 100)}</strong></div></aside>
    </div>
  </main>;
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

  useEffect(() => { if (!persistent) { setCart(localCommerceRepository.getCart()); setCatalogLoading(false); return; } Promise.all([commerceApi.products(), commerceApi.cart()]).then(([catalog, savedCart]) => { const validCatalog = catalog.filter((product) => product.title && product.variants.length > 0); if (!validCatalog.length || validCatalog.length > maxStorefrontProducts) throw new Error(`Catálogo remoto fora do limite seguro (${validCatalog.length} produtos recebidos).`); setProducts(validCatalog); setCart(savedCart); if (validCatalog[0]) setActiveProduct(validCatalog[0]); }).catch((error) => setServiceError(error.message)).finally(() => setCatalogLoading(false)); }, [persistent]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [view, activeProduct]);
  const cartCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function openProduct(product: Product) { setActiveProduct(product); setView("product"); }
  async function add(product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original", selectionContext?: SelectionContext) {
    const next = persistent ? await commerceApi.addItem(variant.id, 1, decision, selectionContext) : localCommerceRepository.addLineItem({ productId: product.id, variantId: variant.id, title: product.title, size: variant.size, quantity: 1, unitPrice: variant.price, color: product.color, mipoDecision: decision, selectionContext });
    const isApparel = product.productKind === "apparel" || (!product.productKind && product.category !== "Maquiagem");
    if (!decision && isApparel) recordMipoEvent({ productId: product.id, selectedVariantId: variant.id, risk: evaluateCheckoutRisk(product, variant).risk, decision: "not_required" });
    setCart(next); setToast(`${product.title} foi para sua sacola.`); setTimeout(() => setToast(""), 2800); setView("cart");
  }
  async function changeQuantity(id:string, quantity:number) { setCart(persistent ? await commerceApi.updateItem(id, Math.max(1, quantity)) : localCommerceRepository.updateLineItem(id, quantity)); }
  async function removeItem(id:string) { setCart(persistent ? await commerceApi.removeItem(id) : localCommerceRepository.removeLineItem(id)); }
  async function finishDemo() { setCart(persistent ? await commerceApi.clearCart() : localCommerceRepository.clearCart()); setView("success"); }

  return <div className="storefront">
    <div className="demo-banner">Experiência demonstrativa · nenhum dado ou pagamento é processado</div>
    <Header cartCount={cartCount} onNavigate={setView} />
    {serviceError && <main className="service-error"><h1>Dados temporariamente indisponíveis</h1><p>{serviceError}</p><p>Verifique a configuração do Supabase. O modo local não é ativado silenciosamente.</p></main>}
    {!serviceError && catalogLoading && <main className="service-loading" aria-live="polite"><p className="eyebrow">Seleção Vértice</p><h1>Preparando a coleção…</h1><p>Estamos carregando os produtos curados.</p></main>}
    {!serviceError && !catalogLoading && view === "catalog" && <Catalog products={products} onProduct={openProduct} />}
    {!serviceError && !catalogLoading && view === "product" && <ProductDetail product={activeProduct} persistent={persistent} onBack={() => setView("catalog")} onAdded={add} onAlternative={(id) => { const found = products.find(p => p.id === id); if (found) openProduct(found); }} />}
    {!serviceError && !catalogLoading && view === "cart" && <CartView cart={cart} onQuantity={(id,quantity) => void changeQuantity(id,quantity)} onRemove={(id) => void removeItem(id)} onCheckout={() => setView("checkout")} onCatalog={() => setView("catalog")} />}
    {!serviceError && !catalogLoading && view === "checkout" && <Checkout cart={cart} onBack={() => setView("cart")} onFinish={() => void finishDemo()} />}
    {view === "success" && <main className="success-page"><p className="eyebrow">Demonstração concluída</p><span className="success-mark">✓</span><h1>Escolha registrada.<br/><em>Nenhuma compra foi realizada.</em></h1><p>O fluxo visual terminou aqui. Em uma integração real, o pedido seria criado pelo backend Medusa.</p><button className="primary-action" onClick={() => setView("catalog")}>Voltar à coleção <Icon name="arrow" /></button></main>}
    {toast && <div className="toast" role="status">{toast}</div>}
    <footer><div className="wordmark">VÉRTICE<span>atelier cotidiano</span></div><p>Uma demonstração de escolha assistida pelo MIPO. <a href="/painel">Painel MIPO →</a></p><p>© 2026 · Case EloGroup</p></footer>
  </div>;
}
