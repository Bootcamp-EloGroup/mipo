"use client";

import { useCallback, useEffect, useState } from "react";
import type { ManagerDashboardData } from "@/src/domain/manager-dashboard";
import { WISMO_OUTCOME_LABELS, WISMO_STATUS_LABELS, type WismoDashboardData } from "@/src/domain/wismo-chat";
import { wismoApi } from "@/src/services/wismo-api";
import { WismoImpactSimulator } from "@/src/components/wismo-impact-simulator";
import "./wismo-badge.css";
import "./wismo-operations.css";

type Service = Pick<ManagerDashboardData["service"], "tickets" | "wismo" | "costCents">;

const count = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
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

export function WismoOperations({ service }: { service: Service }) {
  const [stats, setStats] = useState<WismoDashboardData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats(await wismoApi.stats());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os atendimentos WISMO.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const basisCost = service.tickets > 0 ? Math.round(service.costCents / service.tickets) : null;

  return (
    <section className="wismo-ops" aria-labelledby="wismo-ops-title">
      <header className="wismo-ops__header">
        <div>
          <p className="manager-eyebrow">Pós-compra · protótipo observável</p>
          <h2 id="wismo-ops-title">Assistente WISMO</h2>
        </div>
        <div>
          <p>Atendimentos registrados pelo chat simulado em <a href="/pedido">/pedido</a>. Medem interações do protótipo; não representam volume real nem redução comprovada de tickets.</p>
          <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar atendimentos"}</button>
        </div>
      </header>

      {error && <div className="manager-empty"><strong>Atendimentos WISMO indisponíveis</strong><p>{error}</p></div>}
      {!error && stats && !stats.available && <div className="manager-empty"><strong>Registro de atendimentos não habilitado</strong><p>{stats.reason}</p></div>}
      {!error && stats?.available && (
        <>
          <div className="manager-kpis">
            <Metric label="Atendimentos registrados" value={count.format(stats.total)} note="Consultas feitas no chat simulado" />
            <Metric label="Resolvidos pelo assistente" value={count.format(stats.resolved)} note={stats.botResolutionRate === null ? "Sem atendimentos concluídos" : `${percent.format(stats.botResolutionRate)} dos casos encontrados`} />
            <Metric label="Escalados" value={count.format(stats.escalated)} note="Sem atualização, inconclusivos ou pedidos do cliente" />
            <Metric label="Pedido não encontrado" value={count.format(stats.notFound)} note="Código sem correspondência" />
          </div>
          {stats.byStatus.length > 0 && (
            <ul className="wismo-ops__status" aria-label="Atendimentos por status logístico">
              {stats.byStatus.map((item) => <li key={item.status}><span className={`wismo-badge wismo-badge--${item.status}`}>{WISMO_STATUS_LABELS[item.status]}</span> <strong>{count.format(item.count)}</strong></li>)}
            </ul>
          )}
          {stats.recent.length > 0 ? (
            <div className="manager-table-scroll wismo-ops__table">
              <table>
                <caption className="sr-only">Atendimentos WISMO recentes</caption>
                <thead><tr><th>Momento</th><th>Pedido</th><th>Status</th><th>Resultado</th><th>Motivo do escalonamento</th></tr></thead>
                <tbody>
                  {stats.recent.map((row) => (
                    <tr key={row.id}>
                      <td><time dateTime={row.occurredAt}>{dateTime.format(new Date(row.occurredAt))}</time></td>
                      <td>{row.orderCode}</td>
                      <td><span className={`wismo-badge wismo-badge--${row.status}`}>{WISMO_STATUS_LABELS[row.status]}</span></td>
                      <td>{WISMO_OUTCOME_LABELS[row.outcome]}</td>
                      <td>{row.escalationReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="manager-empty"><strong>Nenhum atendimento ainda</strong><p>Abra <a href="/pedido">/pedido</a>, consulte um pedido e atualize este bloco.</p></div>
          )}
        </>
      )}

      <WismoImpactSimulator
        basisVolume={service.wismo}
        basisAverageCostCents={basisCost}
        demoResolutionRate={stats?.available ? stats.botResolutionRate : null}
        demoTotal={stats?.available ? stats.resolved + stats.escalated : 0}
      />
    </section>
  );
}
