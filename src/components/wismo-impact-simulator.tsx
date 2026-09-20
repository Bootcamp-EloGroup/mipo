"use client";

import { useMemo, useState } from "react";
import { simulateWismoImpact } from "@/src/domain/wismo-impact";
import "./wismo-operations.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const count = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

const parseInteger = (value: string): number | null => (/^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : null);
const parseDecimal = (value: string): number | null => (/^\d{1,7}([.,]\d{1,2})?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : null);

type Props = {
  /** Tickets WISMO históricos no recorte atual do painel. */
  basisVolume: number;
  /** Custo médio histórico por ticket, em centavos; null quando não há base. */
  basisAverageCostCents: number | null;
  /** Taxa de resolução observada no protótipo (referência, não premissa). */
  demoResolutionRate: number | null;
  demoTotal: number;
};

export function WismoImpactSimulator({ basisVolume, basisAverageCostCents, demoResolutionRate, demoTotal }: Props) {
  const [volumeInput, setVolumeInput] = useState<string | null>(null);
  const [costInput, setCostInput] = useState<string | null>(null);
  const [rate, setRate] = useState(40);

  const defaultVolume = String(basisVolume);
  const defaultCost = basisAverageCostCents === null ? "0" : (basisAverageCostCents / 100).toFixed(2).replace(".", ",");
  const volume = parseInteger(volumeInput ?? defaultVolume);
  const cost = parseDecimal(costInput ?? defaultCost);
  const edited = volumeInput !== null || costInput !== null;

  const result = useMemo(
    () => (volume === null || cost === null ? null : simulateWismoImpact({ ticketVolume: volume, botResolutionRate: rate / 100, averageCostPerTicketCents: Math.round(cost * 100) })),
    [volume, cost, rate],
  );

  return (
    <section className="scenario-card wismo-scenario" aria-labelledby="wismo-sim-title">
      <div className="scenario-card__header">
        <div>
          <p className="manager-eyebrow">Cenário estimado · não causal</p>
          <h2 id="wismo-sim-title">Tickets WISMO potencialmente evitados</h2>
          <p>Ajuste as premissas para ver quanto o atendimento poderia deixar de tratar se o assistente resolvesse parte dos tickets de rastreamento. É um cenário, não uma economia capturada.</p>
        </div>
      </div>

      <div className="wismo-scenario__body">
        <div className="wismo-scenario__inputs">
          <label>
            Volume de tickets WISMO no período
            <input inputMode="numeric" value={volumeInput ?? defaultVolume} onChange={(event) => setVolumeInput(event.target.value)} aria-invalid={volume === null ? true : undefined} />
          </label>
          <label>
            Resolvidos pelo assistente <strong>{rate}%</strong>
            <input type="range" min="0" max="100" step="5" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
          </label>
          <label>
            Custo médio por ticket (R$)
            <input inputMode="decimal" value={costInput ?? defaultCost} onChange={(event) => setCostInput(event.target.value)} aria-invalid={cost === null ? true : undefined} />
          </label>
          {result === null && <p className="wismo-scenario__error" role="alert">Informe o volume com números inteiros e o custo com até duas casas decimais.</p>}
          <p className="wismo-scenario__basis">
            {basisVolume > 0
              ? `Ponto de partida: base histórica do período filtrado (${count.format(basisVolume)} tickets WISMO${basisAverageCostCents === null ? "" : `; custo médio de ${money.format(basisAverageCostCents / 100)} por ticket`}).`
              : "Sem base histórica no recorte atual; informe as premissas manualmente."}
            {edited && <> <button type="button" onClick={() => { setVolumeInput(null); setCostInput(null); }}>Restaurar base histórica</button></>}
          </p>
        </div>

        <dl aria-live="polite">
          <div><dt>Resolvidos pelo assistente</dt><dd>{result ? count.format(result.ticketsResolvedByBot) : "—"}</dd></div>
          <div><dt>Seguem para atendimento humano</dt><dd>{result ? count.format(result.ticketsRemaining) : "—"}</dd></div>
          <div><dt>Custo atual estimado</dt><dd>{result ? money.format(result.baselineCostCents / 100) : "—"}</dd></div>
          <div><dt>Custo potencialmente evitado</dt><dd>{result ? money.format(result.potentialCostAvoidedCents / 100) : "—"}</dd></div>
        </dl>
      </div>

      <ul className="wismo-scenario__notes">
        {(result?.assumptions ?? []).map((assumption) => <li key={assumption}>{assumption}</li>)}
        {demoResolutionRate !== null && (
          <li>Referência do protótipo (demo): {percent.format(demoResolutionRate)} dos {count.format(demoTotal)} atendimentos simulados foram resolvidos pelo assistente. Não representa produção nem serve como premissa comprovada.</li>
        )}
      </ul>
    </section>
  );
}
