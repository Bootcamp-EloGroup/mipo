"use client";

import { useEffect, useRef, useState } from "react";
import {
  WISMO_STATUS_LABELS,
  isValidOrderCode,
  normalizeOrderCode,
  outcomeFor,
  type WismoOutcome,
  type WismoStatusResponse,
} from "@/src/domain/wismo-chat";
import "./wismo-badge.css";
import { MOCK_ORDER_EXAMPLES } from "@/src/services/wismo-mock";
import { WISMO_MOCK_ENABLED, wismoApi } from "@/src/services/wismo-api";

type ThreadItem =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; kind: "greeting" | "notice" | "result" | "escalation"; interactionId?: string; result?: WismoStatusResponse };

type RecordState = { state: "saved" } | { state: "error"; message: string };

const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatPromised(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : dateOnly.format(date);
}

function StatusCard({ result }: { result: WismoStatusResponse }) {
  const rows: Array<[string, string]> = [];
  if (result.orderStatusLabel) rows.push(["Situação", result.orderStatusLabel]);
  if (result.carrier) rows.push(["Transportadora", result.carrier]);
  if (result.lastTrackingEvent) rows.push(["Último evento", `${result.lastTrackingEvent}${result.lastTrackingAt ? ` · ${dateTime.format(new Date(result.lastTrackingAt))}` : ""}`]);
  if (result.promisedDate) rows.push(["Previsão de entrega", formatPromised(result.promisedDate)]);
  if (result.daysWithoutUpdate !== undefined && result.status !== "delivered") rows.push(["Sem atualização", `${result.daysWithoutUpdate} ${result.daysWithoutUpdate === 1 ? "dia" : "dias"}`]);
  return (
    <div className="wismo-card">
      <div className="wismo-card__head">
        <span className={`wismo-badge wismo-badge--${result.status}`}>{WISMO_STATUS_LABELS[result.status]}</span>
        <strong>{result.orderCode}</strong>
      </div>
      {rows.length > 0 && <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {result.dataOrigin === "mock" && <p className="wismo-card__origin">Dados de demonstração</p>}
    </div>
  );
}

function EscalationNotice({ result, interactionId, reason }: { result: WismoStatusResponse; interactionId: string; reason: string }) {
  const protocol = `ATD-${interactionId.slice(0, 6).toUpperCase()}`;
  return (
    <div className="wismo-escalation" role="status">
      <p className="wismo-escalation__title"><span className="wismo-badge wismo-badge--escalated">Escalado para atendimento humano</span></p>
      <p>Protocolo de demonstração <strong>{protocol}</strong>. O atendente recebe o caso com este contexto, sem você precisar repetir nada:</p>
      <ul>
        <li>Pedido {result.orderCode}</li>
        <li>Status: {WISMO_STATUS_LABELS[result.status]}</li>
        {result.lastTrackingEvent && <li>Último evento: {result.lastTrackingEvent}</li>}
        <li>Motivo: {reason}</li>
      </ul>
    </div>
  );
}

function Bubble({ item, escalated, record, onRequestHuman }: { item: ThreadItem; escalated: boolean; record?: RecordState; onRequestHuman: (interactionId: string, result: WismoStatusResponse) => void }) {
  if (item.role === "user") {
    return (
      <div className="mipo-chat-bubble mipo-chat-bubble--user">
        <div className="mipo-bubble-meta">Você</div>
        <div className="mipo-bubble-body"><p>{item.text}</p></div>
      </div>
    );
  }
  const { result, interactionId, kind } = item;
  const found = result?.found === true;
  const canAskHuman = kind === "result" && found && !result.needsEscalation && !escalated && interactionId !== undefined;
  return (
    <div className="mipo-chat-bubble mipo-chat-bubble--assistant">
      <div className="mipo-bubble-meta">Assistente de pedidos</div>
      <div className="mipo-bubble-body">
        <p>{item.text}</p>
        {kind === "result" && found && <StatusCard result={result} />}
        {kind === "result" && found && result.needsEscalation && interactionId && (
          <EscalationNotice result={result} interactionId={interactionId} reason={result.escalationReason ?? "Caso encaminhado pelo assistente"} />
        )}
        {kind === "escalation" && result && interactionId && (
          <EscalationNotice result={result} interactionId={interactionId} reason={result.escalationReason ?? "Cliente solicitou atendimento humano"} />
        )}
        {canAskHuman && (
          <button type="button" className="mipo-suggestion-action" onClick={() => onRequestHuman(interactionId, result)}>
            {result.status === "delivered" ? "Não recebi meu pedido" : "Falar com o atendimento"}
          </button>
        )}
        {kind === "result" && record?.state === "error" && <p className="wismo-record wismo-record--error">Atendimento não registrado no painel: {record.message}</p>}
        {kind === "result" && record?.state === "saved" && <p className="wismo-record">Atendimento registrado no painel.</p>}
      </div>
    </div>
  );
}

export function WismoChat() {
  const [items, setItems] = useState<ThreadItem[]>([
    { id: 0, role: "assistant", kind: "greeting", text: "Olá! Eu acompanho pedidos da Vértice. Informe o código do seu pedido e eu confiro o status da entrega." },
  ]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [escalated, setEscalated] = useState<Record<string, true>>({});
  const [records, setRecords] = useState<Record<string, RecordState>>({});
  const nextId = useRef(1);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    threadEnd.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" });
  }, [items, loading]);

  function push(item: Omit<Extract<ThreadItem, { role: "user" }>, "id"> | Omit<Extract<ThreadItem, { role: "assistant" }>, "id">) {
    setItems((current) => [...current, { ...item, id: nextId.current++ } as ThreadItem]);
  }

  async function record(interactionId: string, result: WismoStatusResponse, override?: { outcome: WismoOutcome; reason: string }) {
    try {
      await wismoApi.record({
        id: interactionId,
        orderCode: result.orderCode,
        status: result.status,
        outcome: override?.outcome ?? outcomeFor(result),
        escalationReason: override?.reason ?? result.escalationReason,
        dataOrigin: result.dataOrigin,
      });
      setRecords((current) => ({ ...current, [interactionId]: { state: "saved" } }));
    } catch (error) {
      setRecords((current) => ({ ...current, [interactionId]: { state: "error", message: error instanceof Error ? error.message : "Não foi possível registrar o atendimento." } }));
    }
  }

  async function lookup(raw: string) {
    if (loading) return;
    const orderCode = normalizeOrderCode(raw);
    if (!isValidOrderCode(orderCode)) {
      setFormError("Informe o código do pedido com 3 a 32 letras, números ou hífens.");
      return;
    }
    setFormError("");
    setLoading(true);
    setCode("");
    push({ role: "user", text: `Onde está o pedido ${orderCode}?` });
    try {
      const [result] = await Promise.all([wismoApi.status(orderCode), pause(700)]);
      const interactionId = newId();
      push({ role: "assistant", kind: "result", text: result.customerMessage, interactionId, result });
      void record(interactionId, result);
    } catch (error) {
      push({ role: "assistant", kind: "notice", text: error instanceof Error ? `Não consegui consultar o pedido agora. ${error.message}` : "Não consegui consultar o pedido agora. Tente novamente em instantes." });
    } finally {
      setLoading(false);
    }
  }

  function requestHuman(interactionId: string, result: WismoStatusResponse) {
    const reason = "Cliente solicitou atendimento humano";
    setEscalated((current) => ({ ...current, [interactionId]: true }));
    push({ role: "user", text: "Quero falar com o atendimento." });
    push({ role: "assistant", kind: "escalation", interactionId, result: { ...result, escalationReason: reason }, text: "Certo. Encaminhei o seu caso para uma pessoa do atendimento, já com o contexto do pedido." });
    void record(interactionId, result, { outcome: "escalated", reason });
  }

  return (
    <section className="wismo-chat" aria-labelledby="wismo-chat-title">
      <h2 id="wismo-chat-title" className="sr-only">Conversa com o assistente de pedidos</h2>
      <div className="wismo-thread" role="log" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <Bubble key={item.id} item={item} escalated={item.role === "assistant" && item.interactionId ? escalated[item.interactionId] === true : false} record={item.role === "assistant" && item.interactionId ? records[item.interactionId] : undefined} onRequestHuman={requestHuman} />
        ))}
        {loading && (
          <div className="mipo-chat-bubble mipo-chat-bubble--assistant">
            <div className="mipo-bubble-meta">Assistente de pedidos</div>
            <div className="mipo-bubble-body mipo-bubble-body--thinking">
              <div className="mipo-typing-dots" aria-hidden="true"><span /><span /><span /></div>
              <p className="mipo-thinking-text" role="status">Consultando o rastreamento do pedido…</p>
            </div>
          </div>
        )}
        <div ref={threadEnd} />
      </div>

      <form className="wismo-form" onSubmit={(event) => { event.preventDefault(); void lookup(code); }} noValidate>
        <label htmlFor="wismo-order">Código do pedido</label>
        <div className="wismo-form__row">
          <input
            id="wismo-order"
            name="order"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            placeholder="Ex.: ORD-1001…"
            aria-invalid={formError ? true : undefined}
            aria-describedby={formError ? "wismo-order-error" : undefined}
            disabled={loading}
          />
          <button type="submit" className="mipo-chat-send" disabled={loading || !code.trim()}>Consultar</button>
        </div>
        {formError && <p id="wismo-order-error" className="wismo-form__error" role="alert">{formError}</p>}
        {WISMO_MOCK_ENABLED && (
          <div className="wismo-examples">
            <span>Exemplos de demonstração:</span>
            <div className="mipo-chat-chips">
              {MOCK_ORDER_EXAMPLES.map((example) => (
                <button key={example.code} type="button" className="mipo-chip" disabled={loading} onClick={() => void lookup(example.code)}>
                  {example.code} · {example.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
