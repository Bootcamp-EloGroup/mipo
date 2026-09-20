import type { Metadata } from "next";
import { WismoChat } from "@/src/components/wismo-chat";
import "./pedido.css";

export const metadata: Metadata = {
  title: "Onde está meu pedido? — Vértice",
  description: "Consulte o status do seu pedido com o assistente WISMO da Vértice (demonstração).",
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
          <h1>Onde está <em>meu pedido?</em></h1>
          <p>Digite o código do pedido e o assistente confere o status, o último evento e a previsão de entrega. Se algo fugir do esperado, o caso segue para o atendimento com todo o contexto.</p>
        </section>
        <WismoChat />
        <p className="order-note">O assistente informa somente o que consta no rastreamento e nunca altera o pedido. Casos sem atualização ou inconclusivos são escalados para uma pessoa.</p>
      </main>
    </>
  );
}
