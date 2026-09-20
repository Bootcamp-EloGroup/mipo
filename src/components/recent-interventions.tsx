"use client";

import { Fragment, useMemo, useState } from "react";
import type { DashboardRow } from "@/src/domain/manager-dashboard";
import "./panel-extras.css";

type Mode = "all" | "7d" | "30d" | "custom";

type Props = {
  rows: DashboardRow[];
  riskLabel: Record<DashboardRow["risk"], string>;
  decisionLabel: Record<DashboardRow["decision"], string>;
  formatMoment: (iso: string) => string;
};

const DAY = 86_400_000;
const MODES: Array<{ id: Mode; label: string }> = [
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "all", label: "Tudo" },
  { id: "custom", label: "Período" },
];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Intervenções recentes: cartão horizontal com "+", filtro de período e agrupamento por produto. */
export function RecentInterventions({ rows, riskLabel, decisionLabel, formatMoment }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openProducts, setOpenProducts] = useState<Record<string, boolean>>({});
  const today = localDate(new Date());

  // As janelas de 7 e 30 dias contam a partir do registro mais recente, pois a base pode ser histórica.
  const latest = useMemo(() => rows.reduce((max, row) => Math.max(max, Date.parse(row.occurredAt)), 0), [rows]);
  const invalid = mode === "custom" && from !== "" && to !== "" && from > to;

  const filtered = useMemo(() => {
    if (mode === "all") return rows;
    if (mode === "custom") {
      const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      return invalid ? [] : rows.filter((row) => Date.parse(row.occurredAt) >= start && Date.parse(row.occurredAt) <= end);
    }
    const start = latest - (mode === "7d" ? 7 : 30) * DAY;
    return rows.filter((row) => Date.parse(row.occurredAt) >= start);
  }, [rows, mode, from, to, invalid, latest]);

  const groups = useMemo(() => {
    const byProduct = new Map<string, DashboardRow[]>();
    for (const row of filtered) byProduct.set(row.product, [...(byProduct.get(row.product) ?? []), row]);
    return [...byProduct.entries()]
      .map(([product, items]) => ({ product, items, accepted: items.filter((item) => item.decision === "accepted").length, last: items.reduce((max, item) => (item.occurredAt > max ? item.occurredAt : max), "") }))
      .sort((a, b) => b.items.length - a.items.length || a.product.localeCompare(b.product, "pt-BR"));
  }, [filtered]);

  const windowLabel = mode === "all" ? "em todo o período carregado" : mode === "custom" ? "no período escolhido" : `nos ${mode === "7d" ? "7" : "30"} dias até o registro mais recente`;

  return (
    <section className="panel-recent" aria-labelledby="recent-interventions-title">
      <button type="button" className="panel-recent__toggle" aria-expanded={expanded} aria-controls="recent-interventions-body" onClick={() => setExpanded((open) => !open)}>
        <span>
          <span className="manager-eyebrow">Rastreabilidade</span>
          <strong id="recent-interventions-title">Intervenções recentes</strong>
          <small>{rows.length} registros{rows.length > 0 ? " · agrupados por produto" : ""}</small>
        </span>
        <span className="panel-recent__plus" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div id="recent-interventions-body" className="panel-recent__body">
          {rows.length === 0 ? (
            <div className="manager-empty"><p>Use a loja ou execute o seed demonstrativo para gerar eventos.</p></div>
          ) : (
            <>
              <div className="panel-range" role="group" aria-label="Janela de tempo das intervenções">
                {MODES.map((option) => (
                  <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => setMode(option.id)}>{option.label}</button>
                ))}
              </div>
              {mode === "custom" && (
                <div className="panel-dates">
                  <label>De<input type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} /></label>
                  <label>Até<input type="date" value={to} min={from || undefined} max={today} onChange={(event) => setTo(event.target.value)} /></label>
                </div>
              )}
              <p className="panel-recent__summary" role="status">
                {invalid ? "A data inicial não pode ser depois da final." : `${filtered.length} ${filtered.length === 1 ? "intervenção" : "intervenções"} em ${groups.length} ${groups.length === 1 ? "produto" : "produtos"} ${windowLabel}.`}
              </p>
              {groups.length > 0 && (
                <div className="manager-table-scroll">
                  <table>
                    <caption className="sr-only">Intervenções MIPO recentes agrupadas por produto</caption>
                    <thead><tr><th>Produto</th><th>Intervenções</th><th>Aceitas</th><th>Último momento</th></tr></thead>
                    <tbody>
                      {groups.map((group) => {
                        const isOpen = openProducts[group.product] === true;
                        return (
                          <Fragment key={group.product}>
                            <tr className="panel-group-row">
                              <td>
                                <button type="button" className="panel-plus" aria-expanded={isOpen} aria-label={`${isOpen ? "Ocultar" : "Abrir"} intervenções de ${group.product}`} onClick={() => setOpenProducts((current) => ({ ...current, [group.product]: !isOpen }))}>{isOpen ? "−" : "+"}</button>
                                {group.product}
                              </td>
                              <td>{group.items.length}</td>
                              <td>{group.accepted}</td>
                              <td>{formatMoment(group.last)}</td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td className="panel-nested" colSpan={4}>
                                  <div className="manager-table-scroll">
                                    <table>
                                      <thead><tr><th>Momento</th><th>Tamanho</th><th>Risco</th><th>Evidência</th><th>Decisão</th><th>Origem</th><th>IA</th></tr></thead>
                                      <tbody>
                                        {group.items.map((row) => (
                                          <tr key={row.id}>
                                            <td>{formatMoment(row.occurredAt)}</td>
                                            <td>{row.selectedSize}{row.recommendedSize ? ` → ${row.recommendedSize}` : ""}</td>
                                            <td>{riskLabel[row.risk]}</td>
                                            <td>{row.evidence}</td>
                                            <td>{decisionLabel[row.decision]}</td>
                                            <td>{row.origin === "demo" ? "Demo" : "Histórico"}</td>
                                            <td>{row.agentStatus ?? "Sem execução"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
