"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WISMO_RANGES, WISMO_RANGE_LABELS, type WismoRange, type WismoRatingsQuery, type WismoRatingsResponse } from "@/src/domain/wismo-chat";
import { wismoApi } from "@/src/services/wismo-api";
import "./wismo-badge.css";
import "./wismo-operations.css";

type Mode = WismoRange | "custom";

const oneDecimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const dayMonthYear = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** AAAA-MM-DD no fuso do navegador. */
function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="manager-metric manager-metric--secondary">
      <div>
        <span className="origin origin--demo">Demo</span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

export function WismoSatisfaction() {
  const [mode, setMode] = useState<Mode>("7d");
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [data, setData] = useState<WismoRatingsResponse>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => localDate(new Date()), []);
  const customInvalid = mode === "custom" && (!from || !to || from > to);

  useEffect(() => {
    if (customInvalid) return;
    const query: WismoRatingsQuery = mode === "custom"
      ? { from: new Date(`${from}T00:00:00`).toISOString(), to: new Date(`${to}T23:59:59.999`).toISOString() }
      : { range: mode };
    let active = true;
    setLoading(true);
    setError("");
    wismoApi
      .ratings(query)
      .then((response) => { if (active) setData(response); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar as notas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, from, to, customInvalid]);

  const rows = (data?.distribution ?? []).map((item) => ({ nota: String(item.rating), avaliações: item.count }));
  const windowLabel = mode === "custom"
    ? `de ${dayMonthYear.format(new Date(`${from}T12:00:00`))} a ${dayMonthYear.format(new Date(`${to}T12:00:00`))}`
    : mode === "all" ? "em todo o período" : `nos últimos ${WISMO_RANGE_LABELS[mode]}`;
  const summary = customInvalid
    ? "Escolha uma data inicial que não seja depois da final."
    : !data || data.ratedCount === 0
      ? `Nenhuma avaliação ${windowLabel}.`
      : `${data.ratedCount} ${data.ratedCount === 1 ? "avaliação" : "avaliações"} ${windowLabel}.`;
  const answered = data ? data.feedbackSolved + data.feedbackPending : 0;

  return (
    <div className="wismo-satisfaction">
      <article className="chart-card">
        <header>
          <div>
            <p className="manager-eyebrow">Satisfação · <span className="origin origin--demo">Demo</span></p>
            <h2>Notas do atendimento</h2>
          </div>
          <div className="wismo-range" role="group" aria-label="Janela de tempo">
            {WISMO_RANGES.map((option) => (
              <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>{WISMO_RANGE_LABELS[option]}</button>
            ))}
            <button type="button" aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>Período</button>
          </div>
        </header>
        {mode === "custom" && (
          <div className="wismo-dates">
            <label>De<input type="date" value={from} max={to || today} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>Até<input type="date" value={to} min={from || undefined} max={today} onChange={(event) => setTo(event.target.value)} /></label>
          </div>
        )}
        {error && <div className="manager-empty"><strong>Notas indisponíveis</strong><p>{error}</p></div>}
        {!error && data && !data.available && <div className="manager-empty"><strong>Registro de atendimentos não habilitado</strong><p>{data.reason}</p></div>}
        {!error && data?.available && (
          <>
            <p className="chart-summary" role="status">{loading ? "Atualizando…" : summary}</p>
            <div className="chart-frame" role="img" aria-label={`Notas do atendimento de 1 a 5. ${summary}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows}>
                  <CartesianGrid stroke="#dedbd0" vertical={false} />
                  <XAxis dataKey="nota" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="avaliações" fill="#4e5841" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="chart-data">
              <summary>Ver dados em tabela</summary>
              <div className="manager-table-scroll">
                <table>
                  <caption className="sr-only">Quantidade de avaliações por nota {windowLabel}</caption>
                  <thead><tr><th>Nota</th><th>Avaliações</th></tr></thead>
                  <tbody>{rows.map((row) => <tr key={row.nota}><td>{row.nota}</td><td>{row["avaliações"]}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </article>

      {!error && data?.available && (
        <div className="wismo-satisfaction__cards">
          <Card
            label="Sem pendência após o atendimento"
            value={answered > 0 ? percent.format(data.feedbackSolved / answered) : "—"}
            note={answered > 0 ? `${data.feedbackSolved} sem pendência · ${data.feedbackPending} com pendência` : "Nenhuma resposta nesta janela"}
          />
          <Card
            label="Avaliação média do atendimento"
            value={data.averageRating === null ? "—" : `${oneDecimal.format(data.averageRating)} / 5`}
            note={data.ratedCount === 0 ? "Nenhuma avaliação nesta janela" : `${data.ratedCount} ${data.ratedCount === 1 ? "avaliação" : "avaliações"} de 1 a 5`}
          />
        </div>
      )}
    </div>
  );
}
