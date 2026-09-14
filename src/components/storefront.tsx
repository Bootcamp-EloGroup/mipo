"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { products } from "@/src/data/products";
import type { Cart, MipoEvent, Product, ProductVariant } from "@/src/domain/commerce";
import { localCommerceRepository, recordMipoEvent } from "@/src/services/local-commerce";
import { evaluateCheckoutRisk } from "@/src/services/mipo";

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

function ProductArt({ product, hero = false }: { product: Product; hero?: boolean }) {
  const isWarm = ["prod_aurora", "prod_trama", "prod_eixo"].includes(product.id);
  const image = isWarm ? "/images/vertice-sand.webp" : "/images/vertice-charcoal.webp";
  return (
    <div className={`product-art ${hero ? "product-art--hero" : ""}`} style={{ "--tone": product.color } as React.CSSProperties}>
      <Image src={image} alt={`Modelo vestindo ${product.title}`} fill sizes={hero ? "(max-width: 800px) 100vw, 55vw" : "(max-width: 480px) 100vw, (max-width: 900px) 50vw, 33vw"} className="product-photo" priority={hero} />
      <span className="product-art__color" aria-hidden="true" />
    </div>
  );
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

function Catalog({ onProduct }: { onProduct: (product: Product) => void }) {
  const [category, setCategory] = useState("Todos");
  const visibleProducts = category === "Todos" ? products : products.filter((product) => product.category === category || (category === "Blusas" && product.category === "Terceira peça"));
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
        <div className="section-heading"><div><p className="eyebrow">Seleção Vértice</p><h2>Novidades da coleção</h2></div><div className="category-pills" aria-label="Filtrar por categoria">{["Todos", "Vestidos", "Blusas", "Calças"].map((item) => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
        <div className="product-grid">
          {visibleProducts.map((product, index) => (
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
      </section>
    </main>
  );
}

function ProductDetail({ product, onBack, onAdded, onAlternative }: { product: Product; onBack: () => void; onAdded: (product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original") => void; onAlternative: (id: string) => void }) {
  const [selected, setSelected] = useState<ProductVariant | null>(null);
  const [decision, setDecision] = useState<"accepted" | "kept_original" | undefined>();
  const result = selected ? evaluateCheckoutRisk(product, selected) : null;

  function choose(variant: ProductVariant) {
    setSelected(variant);
    setDecision(undefined);
  }

  function acceptRecommendation() {
    if (!selected || !result?.recommendedVariant) return;
    recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant.id, risk: result.risk, decision: "accepted" });
    setSelected(result.recommendedVariant);
    setDecision("accepted");
  }

  function keepOriginal() {
    if (!selected || !result) return;
    recordMipoEvent({ productId: product.id, selectedVariantId: selected.id, recommendedVariantId: result.recommendedVariant?.id, risk: result.risk, decision: "kept_original" });
    setDecision("kept_original");
  }

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

          <fieldset className="size-picker">
            <legend><span>Tamanho: <b>{selected?.size ?? "selecione"}</b></span><button type="button">Guia de medidas</button></legend>
            <div>{product.variants.map((variant) => <button type="button" className={selected?.id === variant.id ? "selected" : ""} onClick={() => choose(variant)} key={variant.id}>{variant.size}</button>)}</div>
          </fieldset>

          {selected && result && (
            <aside className={`mipo-card mipo-card--${result.risk}`} aria-live="polite">
              <div className="mipo-card__mark"><Icon name="spark" /></div>
              <div>
                <p className="mipo-label">Escolha assistida · MIPO</p>
                <h2>{result.message}</h2>
                <p>{result.evidence}</p>
                {result.risk !== "none" && !decision && <div className="mipo-actions">
                  {result.recommendedVariant && <button onClick={acceptRecommendation}>Usar tamanho {result.recommendedVariant.size}</button>}
                  {result.alternativeProductId && <button onClick={() => onAlternative(result.alternativeProductId!)}>Ver alternativa</button>}
                  <button className="quiet" onClick={keepOriginal}>Manter minha escolha</button>
                </div>}
                {decision && <p className="decision-note">✓ Decisão registrada: {decision === "accepted" ? "recomendação aceita" : "escolha original mantida"}.</p>}
              </div>
            </aside>
          )}

          <button className="primary-action" disabled={!selected || (!!result && result.risk !== "none" && !decision && !!(result.recommendedVariant || result.alternativeProductId))} onClick={() => selected && onAdded(product, selected, decision)}>
            <span>Adicionar à sacola</span><Icon name="arrow" />
          </button>
          <div className="detail-notes"><span>Frete grátis acima de R$ 500</span><span>Troca em até 30 dias</span></div>
        </section>
      </div>
    </main>
  );
}

function CartView({ cart, onChange, onCheckout, onCatalog }: { cart: Cart; onChange: (cart: Cart) => void; onCheckout: () => void; onCatalog: () => void }) {
  const total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return <main className="cart-page">
    <div className="page-kicker"><p className="eyebrow">Sua seleção</p><h1>Sacola</h1><span>{cart.items.reduce((sum, item) => sum + item.quantity, 0)} itens</span></div>
    {cart.items.length === 0 ? <div className="empty-state"><h2>Sua sacola espera por boas escolhas.</h2><button className="primary-action" onClick={onCatalog}>Explorar coleção <Icon name="arrow" /></button></div> : <div className="cart-layout">
      <section className="cart-lines">{cart.items.map((item) => <article className="cart-line" key={item.id}>
        <div className="cart-swatch" style={{ background: item.color }} />
        <div className="cart-line__copy"><p className="eyebrow">Vértice · edição 06</p><h2>{item.title}</h2><p>Tamanho {item.size}</p>{item.mipoDecision && <small><Icon name="spark" /> {item.mipoDecision === "accepted" ? "Tamanho escolhido com assistência MIPO" : "Escolha pessoal mantida"}</small>}</div>
        <div className="quantity"><button aria-label="Diminuir quantidade" onClick={() => onChange(localCommerceRepository.updateLineItem(item.id, item.quantity - 1))}><Icon name="minus" /></button><span>{item.quantity}</span><button aria-label="Aumentar quantidade" onClick={() => onChange(localCommerceRepository.updateLineItem(item.id, item.quantity + 1))}><Icon name="plus" /></button></div>
        <strong>{money.format(item.unitPrice * item.quantity / 100)}</strong>
        <button className="remove" aria-label={`Remover ${item.title}`} onClick={() => onChange(localCommerceRepository.removeLineItem(item.id))}><Icon name="close" /></button>
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
      <aside className="summary"><p className="eyebrow">Sua escolha</p>{cart.items.map(item => <div className="checkout-item" key={item.id}><span>{item.quantity}× {item.title} · {item.size}</span><strong>{money.format(item.unitPrice * item.quantity / 100)}</strong></div>)}<hr/><div className="summary__total"><span>Total demonstrativo</span><strong>{money.format(total / 100)}</strong></div></aside>
    </div>
  </main>;
}

export function Storefront() {
  const [view, setView] = useState<View>("catalog");
  const [activeProduct, setActiveProduct] = useState<Product>(products[0]);
  const [cart, setCart] = useState<Cart>({ id: "cart_demo", region: { id: "reg_br", name: "Brasil", currency_code: "brl" }, items: [] });
  const [toast, setToast] = useState("");

  useEffect(() => setCart(localCommerceRepository.getCart()), []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [view, activeProduct]);
  const cartCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function openProduct(product: Product) { setActiveProduct(product); setView("product"); }
  function add(product: Product, variant: ProductVariant, decision?: "accepted" | "kept_original") {
    const next = localCommerceRepository.addLineItem({ productId: product.id, variantId: variant.id, title: product.title, size: variant.size, quantity: 1, unitPrice: variant.price, color: product.color, mipoDecision: decision });
    if (!decision) recordMipoEvent({ productId: product.id, selectedVariantId: variant.id, risk: evaluateCheckoutRisk(product, variant).risk, decision: "not_required" });
    setCart(next); setToast(`${product.title} foi para sua sacola.`); setTimeout(() => setToast(""), 2800); setView("cart");
  }

  return <div className="storefront">
    <div className="demo-banner">Experiência demonstrativa · nenhum dado ou pagamento é processado</div>
    <Header cartCount={cartCount} onNavigate={setView} />
    {view === "catalog" && <Catalog onProduct={openProduct} />}
    {view === "product" && <ProductDetail product={activeProduct} onBack={() => setView("catalog")} onAdded={add} onAlternative={(id) => { const found = products.find(p => p.id === id); if (found) openProduct(found); }} />}
    {view === "cart" && <CartView cart={cart} onChange={setCart} onCheckout={() => setView("checkout")} onCatalog={() => setView("catalog")} />}
    {view === "checkout" && <Checkout cart={cart} onBack={() => setView("cart")} onFinish={() => { setCart(localCommerceRepository.clearCart()); setView("success"); }} />}
    {view === "success" && <main className="success-page"><p className="eyebrow">Demonstração concluída</p><span className="success-mark">✓</span><h1>Escolha registrada.<br/><em>Nenhuma compra foi realizada.</em></h1><p>O fluxo visual terminou aqui. Em uma integração real, o pedido seria criado pelo backend Medusa.</p><button className="primary-action" onClick={() => setView("catalog")}>Voltar à coleção <Icon name="arrow" /></button></main>}
    {toast && <div className="toast" role="status">{toast}</div>}
    <footer><div className="wordmark">VÉRTICE<span>atelier cotidiano</span></div><p>Uma demonstração de escolha assistida pelo MIPO.</p><p>© 2026 · Case EloGroup</p></footer>
  </div>;
}
