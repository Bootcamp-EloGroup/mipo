import type { Metadata } from "next";
import { WismoChat } from "@/src/components/wismo-chat";
import "./pedido.css";

export const metadata: Metadata = {
  title: "Onde está meu pedido? — Vértice",
  description: "Tire dúvidas sobre o pós-compra e consulte o status do seu pedido com o assistente WISMO da Vértice.",
};

export default function OrderPage() {
  return (
    <>
      <a className="skip-link" href="#pedido-conteudo">Pular para o conteúdo</a>
      <div className="demo-banner">Experiência demonstrativa · atendimento simulado, sem dados pessoais</div>
      <header className="order-header">
        <a href="/" className="order-brand">VÉRTICE<span>atelier cotidiano</span></a>
        <a href="/" className="order-back">← Voltar à loja</a>
      </header>
      <main id="pedido-conteudo" className="order-page">
        <section className="order-intro">
          <p className="eyebrow">Pós-compra · acompanhamento</p>
          <h1>Como podemos <em>ajudar?</em></h1>
          <p>Converse sobre entrega, prazo, rastreamento, endereço ou troca. Para consultar status, último evento e previsão de uma compra específica, basta enviar o código do pedido durante a conversa.</p>
        </section>
        <WismoChat />
        <p className="order-note">O assistente não altera pedidos nem inventa dados de rastreamento. Consultas específicas exigem o código; casos críticos seguem para uma pessoa.</p>
      </main>
    </>
  );
}
