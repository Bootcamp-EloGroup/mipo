"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardRow,
  ManagerDashboardData,
} from "@/src/domain/manager-dashboard";
import {
  simulateImpact,
  projectExperimentScenario,
} from "@/src/domain/impact-simulator";
import { products as storefrontProducts } from "@/src/data/products";
import { VERTICE_PRODUCT_SIZE_GUIDES } from "@/src/services/measurement-fit";
import { WismoOperations } from "@/src/components/wismo-operations";

type View = "executive" | "customers" | "operations";
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
const fullDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const riskLabel: Record<DashboardRow["risk"], string> = {
  size: "Tamanho",
  quality: "Qualidade",
  preference_mismatch: "Preferência",
  stock: "Estoque",
  none: "Sem intervenção",
  insufficient_evidence: "Evidência insuficiente",
};
const decisionLabel: Record<DashboardRow["decision"], string> = {
  accepted: "Aceita",
  kept_original: "Original mantida",
  not_required: "Não necessária",
  pending: "Pendente",
  abandoned: "Sem resposta",
};
function Metric({
  label,
  value,
  note,
  source = "historical",
  accent = false,
  priority = "secondary",
}: {
  label: string;
  value: string;
  note: string;
  source?: "historical" | "snapshot" | "demo" | "scenario";
  accent?: boolean;
  priority?: "primary" | "secondary" | "technical";
}) {
  return (
    <article
      className={`manager-metric manager-metric--${priority} ${accent ? "manager-metric--accent" : ""}`}
    >
      <div>
        <span className={`origin origin--${source}`}>
          {source === "historical"
            ? "Histórico"
            : source === "snapshot"
              ? "Snapshot"
              : source === "demo"
                ? "Demo"
                : "Cenário"}
        </span>
        <p>{label}</p>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function ChartCard({
  eyebrow,
  title,
  summary,
  children,
  table,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <article className="chart-card">
      <header>
        <div>
          <p className="manager-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </header>
      <p className="chart-summary">{summary}</p>
      <div
        className="chart-frame"
        role="img"
        aria-label={`${title}. ${summary}`}
      >
        {children}
      </div>
      <details className="chart-data">
        <summary>Ver dados em tabela</summary>
        {table}
      </details>
    </article>
  );
}
function DataTable({
  headers,
  rows,
  caption,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
  caption: string;
}) {
  return (
    <div className="manager-table-scroll">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Empty({
  message = "Nenhum dado disponível para este recorte.",
}: {
  message?: string;
}) {
  return (
    <div className="manager-empty">
      <strong>Sem dados</strong>
      <p>{message}</p>
    </div>
  );
}

export function ManagerDashboard() {
  const [data, setData] = useState<ManagerDashboardData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("executive");
  const [filters, setFilters] = useState({
    period: "all",
    channel: "",
    category: "",
    origin: "all",
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.period !== "all") {
        const from = new Date();
        from.setDate(from.getDate() - Number(filters.period));
        params.set("from", from.toISOString().slice(0, 10));
      }
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.category) params.set("category", filters.category);
      params.set("origin", filters.origin);
      const response = await fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Falha ao carregar o painel.");
      setData(payload);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao carregar o painel.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 120);
    return () => clearTimeout(timer);
  }, [load]);
  const marginRate = data?.executive.revenueCents
    ? data.executive.marginCents / data.executive.revenueCents
    : null;
  const returnRate = data?.executive.orders
    ? data.executive.returns / data.executive.orders
    : null;
  const acceptance = data?.mipo.decided
    ? data.mipo.accepted / data.mipo.decided
    : null;
  const wismoRate = data?.service.tickets
    ? data.service.wismo / data.service.tickets
    : null;
  const availability = data?.agent.total
    ? 1 - (data.agent.fallback + data.agent.rejected) / data.agent.total
    : null;
  const [scenarioRate, setScenarioRate] = useState(60);
  const [avoidableShare, setAvoidableShare] = useState(50);
  const [simMode, setSimMode] = useState<"parametric" | "ab">("parametric");
  const [abSplit, setAbSplit] = useState(50);
  const [abAcceptance, setAbAcceptance] = useState(65);
  const [abReturnCost, setAbReturnCost] = useState(45);
  const scenario = useMemo(() => {
    const basis = data?.scenarioBasis;
    return simulateImpact({
      eligibleInterventions: basis?.eligibleInterventions ?? 0,
      assumedAcceptanceRate: scenarioRate / 100,
      observedReturnRate: basis?.observedReturnRate ?? 0,
      assumedAvoidableReturnShare: avoidableShare / 100,
      averageMarginPerOrderCents: basis?.averageMarginPerOrderCents ?? 0,
      averageReturnCostCents: basis?.averageReturnCostCents ?? null,
    });
  }, [data, scenarioRate, avoidableShare]);
  const abResult = useMemo(() => {
    const basis = data?.scenarioBasis;
    const eligible = basis?.eligibleInterventions ?? 0;
    const observedReturnRate = basis?.observedReturnRate ?? 0.25;
    return projectExperimentScenario({
      totalEligibleSessions: eligible,
      splitRatio: abSplit / 100,
      observedControlReturnRate: observedReturnRate,
      mipoAcceptanceRate: abAcceptance / 100,
      avoidableReturnShare: avoidableShare / 100,
      averageReturnCostCents: abReturnCost * 100,
      averageMarginPerOrderCents: basis?.averageMarginPerOrderCents ?? 0,
    });
  }, [data, abSplit, abAcceptance, avoidableShare, abReturnCost]);
  if (loading && !data)
    return (
      <main className="manager-state">
        <span className="manager-loader" />
        <h1>Consolidando os indicadores…</h1>
        <p>Receita, clientes, operação e evidências MIPO.</p>
      </main>
    );
  if (error && !data)
    return (
      <main className="manager-state">
        <p className="manager-eyebrow">Falha de leitura</p>
        <h1>Não foi possível abrir o painel.</h1>
        <p>{error}</p>
        <button onClick={() => void load()}>Tentar novamente</button>
      </main>
    );
  if (!data) return null;
  const monthly = data.executive.monthly.map((item) => ({
    ...item,
    revenue: item.revenueCents / 100,
    margin: item.marginCents / 100,
    label: item.month.slice(5) + "/" + item.month.slice(0, 4),
  }));
  const channels = data.executive.channels.map((item) => ({
    ...item,
    revenue: item.revenueCents / 100,
    margin: item.marginCents / 100,
  }));
  const weekly = data.service.weekly.map((item) => ({
    ...item,
    label: shortDate.format(new Date(`${item.week}T12:00:00`)),
  }));
  const daily = data.mipo.daily.map((item) => ({
    ...item,
    label: shortDate.format(new Date(`${item.day}T12:00:00`)),
  }));
  return (
    <>
      <a className="skip-link" href="#dashboard-main">
        Pular para os indicadores
      </a>
      <main id="dashboard-main" className="manager-shell">
        <header className="manager-topbar">
          <a href="/" className="manager-brand">
            VÉRTICE <span>MIPO / GESTÃO</span>
          </a>
          <div>
            <span className={`manager-sync ${loading ? "is-loading" : ""}`}>
              {loading ? "Atualizando" : "Dados consolidados"}
            </span>
            <time dateTime={data.generatedAt}>
              {fullDate.format(new Date(data.generatedAt))}
            </time>
            <button onClick={() => void load()} disabled={loading}>
              Atualizar
            </button>
          </div>
        </header>
        <section className="manager-hero">
          <div>
            <p className="manager-eyebrow">Torre de controle gerencial</p>
            <h1>
              Da margem à<br />
              <em>decisão.</em>
            </h1>
          </div>
          <div>
            <p>
              Uma leitura integrada do negócio, da experiência do cliente e da
              operação MIPO. Valores estimados são separados dos resultados
              observados.
            </p>
            <dl>
              <div>
                <dt>Janela histórica</dt>
                <dd>
                  {data.historicalWindow.from?.slice(0, 10) ?? "—"} —{" "}
                  {data.historicalWindow.to?.slice(0, 10) ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Origem MIPO</dt>
                <dd>
                  {filters.origin === "demo"
                    ? "Demonstração"
                    : filters.origin === "historical"
                      ? "Observada"
                      : "Todas"}
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <nav
          className="manager-tabs"
          role="tablist"
          aria-label="Visões do painel"
        >
          {(
            [
              ["executive", "Executivo"],
              ["customers", "Clientes e canais"],
              ["operations", "Operação e atendimento"],
            ] as const
          ).map(([id, label], index) => (
            <button
              key={id}
              id={`${id}-tab`}
              role="tab"
              aria-selected={view === id}
              aria-controls={`${id}-panel`}
              tabIndex={view === id ? 0 : -1}
              onClick={() => setView(id)}
            >
              <span>0{index + 1}</span>
              {label}
            </button>
          ))}
        </nav>
        <section className="manager-filters" aria-label="Filtros globais">
          <label>
            Período
            <select
              value={filters.period}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  period: event.target.value,
                }))
              }
            >
              <option value="all">Todo o histórico</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Últimos 12 meses</option>
            </select>
          </label>
          <label>
            Canal
            <select
              value={filters.channel}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  channel: event.target.value,
                }))
              }
            >
              <option value="">Todos os canais</option>
              {data.options.channels.map((item) => (
                <option key={item.value}>{item.value}</option>
              ))}
            </select>
          </label>
          <label>
            Categoria
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  category: event.target.value,
                }))
              }
            >
              <option value="">Todas as categorias</option>
              {data.options.categories.map((item) => (
                <option key={item.value}>{item.value}</option>
              ))}
            </select>
          </label>
          <label>
            Origem MIPO
            <select
              value={filters.origin}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  origin: event.target.value,
                }))
              }
            >
              <option value="all">Todas</option>
              <option value="historical">Histórico observado</option>
              <option value="demo">Demonstração</option>
            </select>
          </label>
        </section>
        {error && (
          <div className="manager-warning" role="status">
            A atualização falhou. Os últimos dados carregados continuam
            visíveis.{" "}
            <button onClick={() => void load()}>Tentar novamente</button>
          </div>
        )}
        {view === "executive" && (
          <section className="manager-view" aria-labelledby="executive-title">
            <header className="view-heading">
              <div>
                <p className="manager-eyebrow">01 / Resumo do negócio</p>
                <h2 id="executive-title">Visão executiva</h2>
              </div>
              <p>
                Resultados históricos do case. Estoque representa o snapshot
                mais recente.
              </p>
            </header>
            <div className="manager-kpis">
              <Metric
                label="Receita líquida"
                value={money.format(data.executive.revenueCents / 100)}
                note={`${count.format(data.executive.orders)} pedidos`}
              />
              <Metric
                label="Margem de contribuição"
                value={money.format(data.executive.marginCents / 100)}
                note={
                  marginRate === null
                    ? "Taxa indisponível"
                    : `${percentage.format(marginRate)} da receita`
                }
                accent
              />
              <Metric
                label="Taxa de devolução"
                value={
                  returnRate === null ? "—" : percentage.format(returnRate)
                }
                note={`${count.format(data.executive.returns)} pedidos devolvidos`}
              />
              <Metric
                label="SKUs críticos"
                value={count.format(data.executive.criticalSkus)}
                note="Crítico, ruptura ou até 3 unidades"
                source="snapshot"
              />
              <Metric
                label="Exposição em estoque"
                value={money.format(
                  data.executive.inventoryExposureCents / 100,
                )}
                note="Preço sugerido × saldo disponível"
                source="snapshot"
              />
            </div>
            <div className="manager-chart-grid">
              <ChartCard
                eyebrow="Tendência mensal"
                title="Receita e margem"
                summary={
                  monthly.length
                    ? `A série contém ${monthly.length} meses do histórico filtrado.`
                    : "Sem meses no recorte."
                }
                table={
                  <DataTable
                    caption="Receita e margem mensais"
                    headers={["Mês", "Receita", "Margem"]}
                    rows={monthly.map((i) => [
                      i.label,
                      money.format(i.revenue),
                      money.format(i.margin),
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthly}>
                    <defs>
                      <linearGradient
                        id="revenueFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0"
                          stopColor="#69764d"
                          stopOpacity={0.38}
                        />
                        <stop
                          offset="1"
                          stopColor="#69764d"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#dedbd0" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                      tickLine={false}
                    />
                    <Tooltip formatter={(v) => money.format(Number(v))} />
                    <Legend />
                    <Area
                      name="Receita"
                      dataKey="revenue"
                      stroke="#4e5841"
                      fill="url(#revenueFill)"
                      strokeWidth={2}
                    />
                    <Line
                      name="Margem"
                      dataKey="margin"
                      stroke="#a4492e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                eyebrow="Comparativo"
                title="Canais de venda"
                summary={
                  channels[0]
                    ? `${channels[0].channel} lidera a receita no recorte.`
                    : "Sem canais no recorte."
                }
                table={
                  <DataTable
                    caption="Desempenho por canal"
                    headers={[
                      "Canal",
                      "Receita",
                      "Margem",
                      "Pedidos",
                      "Devoluções",
                    ]}
                    rows={channels.map((i) => [
                      i.channel,
                      money.format(i.revenue),
                      money.format(i.margin),
                      i.orders,
                      i.returns,
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={channels}
                    layout="vertical"
                    margin={{ left: 18 }}
                  >
                    <CartesianGrid stroke="#dedbd0" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                    />
                    <YAxis type="category" dataKey="channel" width={86} />
                    <Tooltip formatter={(v) => money.format(Number(v))} />
                    <Legend />
                    <Bar
                      name="Receita"
                      dataKey="revenue"
                      fill="#4e5841"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      name="Margem"
                      dataKey="margin"
                      fill="#c98d63"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <section
              className={`scenario-card ${simMode === "ab" ? "scenario-card--ab" : ""}`}
            >
              <div className="scenario-card__header">
                <div>
                  <p className="manager-eyebrow">
                    {simMode === "ab"
                      ? "Projeção de experimento · não causal"
                      : "Cenário estimado · não causal"}
                  </p>
                  <h2>
                    {simMode === "ab"
                      ? "Desenho projetado de controle e tratamento"
                      : "Exposição potencial das intervenções"}
                  </h2>
                  <p>
                    {simMode === "ab"
                      ? "Projeção baseada em premissas para planejar um futuro experimento. Não representa resultados observados, causalidade ou economia capturada."
                      : "Esta simulação aplica uma premissa ajustável às recomendações elegíveis. Não representa economia realizada."}
                  </p>
                </div>
                <div
                  className="scenario-card__toggle"
                  role="tablist"
                  aria-label="Modo do simulador"
                >
                  <button
                    type="button"
                    className={`scenario-toggle-btn ${simMode === "parametric" ? "is-active" : ""}`}
                    onClick={() => setSimMode("parametric")}
                  >
                    Cenário Paramétrico
                  </button>
                  <button
                    type="button"
                    className={`scenario-toggle-btn ${simMode === "ab" ? "is-active" : ""}`}
                    onClick={() => setSimMode("ab")}
                  >
                    Projeção de Experimento
                  </button>
                </div>
              </div>
              {simMode === "parametric" ? (
                <div className="scenario-parametric-row">
                  <label>
                    Taxa de aceitação assumida <strong>{scenarioRate}%</strong>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={scenarioRate}
                      onChange={(event) =>
                        setScenarioRate(Number(event.target.value))
                      }
                    />
                  </label>
                  <dl>
                    <div>
                      <dt>Elegíveis</dt>
                      <dd>{scenario.eligible}</dd>
                    </div>
                    <div>
                      <dt>Aceitas no cenário</dt>
                      <dd>{scenario.accepted}</dd>
                    </div>
                    <div>
                      <dt>Devoluções potencialmente evitadas</dt>
                      <dd>{scenario.avoided}</dd>
                    </div>
                    <div>
                      <dt>Exposição estimada</dt>
                      <dd>{money.format(scenario.exposure / 100)}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="scenario-ab-content">
                  <div className="scenario-ab-controls">
                    <label>
                      Divisão MIPO:{" "}
                      <strong>
                        {abSplit}% / {100 - abSplit}%
                      </strong>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        step="5"
                        value={abSplit}
                        onChange={(e) => setAbSplit(Number(e.target.value))}
                      />
                      <small>Tratamento (MIPO) vs. Controle</small>
                    </label>
                    <label>
                      Adesão MIPO Assumida: <strong>{abAcceptance}%</strong>
                      <input
                        type="range"
                        min="20"
                        max="95"
                        step="5"
                        value={abAcceptance}
                        onChange={(e) =>
                          setAbAcceptance(Number(e.target.value))
                        }
                      />
                      <small>Taxa de aceite das sugestões de caimento</small>
                    </label>
                    <label>
                      Custo Frete Reverso: <strong>R$ {abReturnCost},00</strong>
                      <input
                        type="range"
                        min="20"
                        max="120"
                        step="5"
                        value={abReturnCost}
                        onChange={(e) =>
                          setAbReturnCost(Number(e.target.value))
                        }
                      />
                      <small>Logística reversa e triagem por devolução</small>
                    </label>
                  </div>
                  <div className="scenario-ab-comparison">
                    <article className="scenario-ab-arm scenario-ab-arm--control">
                      <div className="scenario-ab-arm__header">
                        <span className="origin origin--snapshot">Grupo A</span>
                        <h3>Controle (Sem MIPO)</h3>
                      </div>
                      <p className="scenario-ab-arm__traffic">
                        {count.format(abResult.control.sessions)} pedidos
                        elegíveis ({100 - abSplit}%)
                      </p>
                      <div className="scenario-ab-arm__kpi">
                        <span>Taxa de Devolução</span>
                        <strong>
                          {percentage.format(abResult.control.returnRate)}
                        </strong>
                        <small>
                          {count.format(abResult.control.returns)} devoluções
                          projetadas
                        </small>
                      </div>
                      <div className="scenario-ab-arm__cost">
                        <span>Custo Logística Reversa:</span>
                        <b>
                          {money.format(
                            abResult.control.reverseLogisticsCostCents / 100,
                          )}
                        </b>
                      </div>
                    </article>
                    <article className="scenario-ab-arm scenario-ab-arm--mipo">
                      <div className="scenario-ab-arm__header">
                        <span className="origin origin--scenario">Grupo B</span>
                        <h3>Tratamento (MIPO Ativo)</h3>
                      </div>
                      <p className="scenario-ab-arm__traffic">
                        {count.format(abResult.mipo.sessions)} pedidos
                        assistidos ({abSplit}%)
                      </p>
                      <div className="scenario-ab-arm__kpi">
                        <span>Taxa de Devolução</span>
                        <strong className="text-acid">
                          {percentage.format(abResult.mipo.returnRate)}
                        </strong>
                        <small>
                          {count.format(abResult.mipo.returns)} devoluções
                          projetadas
                        </small>
                      </div>
                      <div className="scenario-ab-arm__cost">
                        <span>Custo Logística Reversa:</span>
                        <b className="text-acid">
                          {money.format(
                            abResult.mipo.reverseLogisticsCostCents / 100,
                          )}
                        </b>
                      </div>
                    </article>
                  </div>
                  <div className="scenario-ab-footer">
                    <div className="scenario-ab-impact-kpi">
                      <span>Devoluções Potencialmente Evitadas</span>
                      <strong>
                        {count.format(abResult.delta.avoidedReturns)}
                      </strong>
                      <small>
                        -
                        {(abResult.delta.relativeReductionRate * 100).toFixed(
                          1,
                        )}
                        % vs. base
                      </small>
                    </div>
                    <div className="scenario-ab-impact-kpi scenario-ab-impact-kpi--savings">
                      <span>Custo Potencialmente Evitado</span>
                      <strong>
                        {money.format(
                          abResult.delta.potentialReturnCostAvoidedCents / 100,
                        )}
                      </strong>
                      <small>Projeção de custo, não valor capturado</small>
                    </div>
                    <div className="scenario-ab-significance">
                      <div className="scenario-ab-sig-header">
                        <span className={"sig-pill sig-pill--pending"}>
                          Projeção sem evidência causal
                        </span>
                        <small>Exige dados observados dos dois grupos</small>
                      </div>
                      <p>
                        A diferença exibida é inteiramente derivada das
                        premissas informadas. Significância estatística só
                        poderá ser calculada após a coleta real.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
            <div className="manager-detail-grid">
              <article className="manager-list-card">
                <h2>Produtos por margem</h2>
                {data.executive.products.length ? (
                  <ol>
                    {data.executive.products.slice(0, 6).map((item) => (
                      <li key={item.product}>
                        <div>
                          <strong>{item.product}</strong>
                          <span>
                            {item.category} · {item.returns} devoluções
                          </span>
                        </div>
                        <b>{money.format(item.marginCents / 100)}</b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty />
                )}
              </article>
              <article className="manager-list-card">
                <h2>Posição de estoque</h2>
                {data.executive.inventory.length ? (
                  <ol>
                    {data.executive.inventory.map((item) => (
                      <li key={item.status}>
                        <div>
                          <strong>{item.status}</strong>
                          <span>{count.format(item.skuCount)} SKUs</span>
                        </div>
                        <b>{money.format(item.exposureCents / 100)}</b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty />
                )}
              </article>
            </div>
          </section>
        )}
        {view === "customers" && (
          <section className="manager-view" aria-labelledby="customers-title">
            <header className="view-heading">
              <div>
                <p className="manager-eyebrow">02 / Base e distribuição</p>
                <h2 id="customers-title">Clientes e canais</h2>
              </div>
              <p>
                Clientes são um snapshot agregado. Não há evolução temporal
                inferida.
              </p>
            </header>
            <div className="manager-kpis">
              <Metric
                label="Clientes na base"
                value={count.format(data.customers.total)}
                note="Sem identificadores pessoais"
                source="snapshot"
              />
              <Metric
                label="Segmentos RFM"
                value={count.format(data.customers.segments.length)}
                note="Composição atual da base"
                source="snapshot"
              />
              <Metric
                label="Canais com vendas"
                value={count.format(data.executive.channels.length)}
                note="No período filtrado"
              />
              <Metric
                label="Receita média por pedido"
                value={
                  data.executive.orders
                    ? money.format(
                        data.executive.revenueCents /
                          data.executive.orders /
                          100,
                      )
                    : "—"
                }
                note="Receita líquida ÷ pedidos"
              />
            </div>
            <div className="manager-chart-grid">
              <ChartCard
                eyebrow="Snapshot cadastral"
                title="Segmentos RFM"
                summary={
                  data.customers.segments[0]
                    ? `${data.customers.segments[0].label} é o maior segmento da base atual.`
                    : "Importe os agregados de clientes para preencher esta visão."
                }
                table={
                  <DataTable
                    caption="Clientes por segmento RFM"
                    headers={[
                      "Segmento",
                      "Clientes",
                      "LTV médio",
                      "Pedidos médios",
                    ]}
                    rows={data.customers.segments.map((i) => [
                      i.label,
                      i.customers,
                      money.format(i.averageLtvCents / 100),
                      decimal.format(i.averageOrders),
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.customers.segments}
                    layout="vertical"
                    margin={{ left: 18 }}
                  >
                    <CartesianGrid stroke="#dedbd0" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="label" width={105} />
                    <Tooltip />
                    <Bar
                      name="Clientes"
                      dataKey="customers"
                      fill="#65704f"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                eyebrow="Mix de acesso"
                title="Dispositivo principal"
                summary={
                  data.customers.devices[0]
                    ? `${data.customers.devices[0].label} concentra a maior parcela declarada.`
                    : "Sem distribuição por dispositivo."
                }
                table={
                  <DataTable
                    caption="Clientes por dispositivo"
                    headers={["Dispositivo", "Clientes"]}
                    rows={data.customers.devices.map((i) => [
                      i.label,
                      i.customers,
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.customers.devices}>
                    <CartesianGrid stroke="#dedbd0" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      name="Clientes"
                      dataKey="customers"
                      fill="#9b7a4d"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <section className="manager-table-card marketing-summary">
              <header>
                <div>
                  <p className="manager-eyebrow">Aquisição histórica</p>
                  <h2>Campanhas e retorno observado</h2>
                </div>
                <span>Sem atribuição causal a pedidos</span>
              </header>
              <div className="manager-kpis">
                <Metric
                  label="Campanhas"
                  value={count.format(data.marketing.campaigns)}
                  note="Registros agregados"
                  source="historical"
                />
                <Metric
                  label="Investimento"
                  value={money.format(data.marketing.spendCents / 100)}
                  note="Valor informado na origem"
                  source="historical"
                />
                <Metric
                  label="Conversões"
                  value={count.format(data.marketing.conversions)}
                  note="Conversões informadas"
                  source="historical"
                />
                <Metric
                  label="Receita atribuída"
                  value={money.format(data.marketing.revenueCents / 100)}
                  note="Atribuição da fonte, não margem"
                  source="historical"
                />
              </div>
              {data.marketing.byChannel.length ? (
                <DataTable
                  caption="Marketing por canal"
                  headers={[
                    "Canal",
                    "Campanhas",
                    "Investimento",
                    "Conversões",
                    "Receita atribuída",
                  ]}
                  rows={data.marketing.byChannel.map((item) => [
                    item.label,
                    count.format(item.campaigns),
                    money.format(item.spendCents / 100),
                    count.format(item.conversions),
                    money.format(item.revenueCents / 100),
                  ])}
                />
              ) : (
                <Empty message="Importe os agregados de marketing para preencher esta visão." />
              )}
            </section>
            <div className="manager-detail-grid">
              <article className="manager-list-card">
                <h2>Nível de fidelidade</h2>
                {data.customers.loyalty.length ? (
                  <ol>
                    {data.customers.loyalty.map((i) => (
                      <li key={i.label}>
                        <strong>{i.label}</strong>
                        <b>{count.format(i.customers)}</b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty />
                )}
              </article>
              <article className="manager-list-card">
                <h2>Estados com maior base</h2>
                {data.customers.states.length ? (
                  <ol>
                    {data.customers.states.map((i) => (
                      <li key={i.label}>
                        <strong>{i.label}</strong>
                        <b>{count.format(i.customers)}</b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty />
                )}
              </article>
            </div>
          </section>
        )}
        {view === "operations" && (
          <section className="manager-view" aria-labelledby="operations-title">
            <header className="view-heading">
              <div>
                <p className="manager-eyebrow">03 / Operação observável</p>
                <h2 id="operations-title">Operação e atendimento</h2>
              </div>
              <p>
                Atendimento usa agregados históricos; intervenções demo
                permanecem identificadas.
              </p>
            </header>
            <div className="manager-kpis">
              <Metric
                label="Tickets"
                value={count.format(data.service.tickets)}
                note={`${wismoRate === null ? "—" : percentage.format(wismoRate)} relacionados a WISMO`}
              />
              <Metric
                label="CSAT médio"
                value={
                  data.service.csat === null
                    ? "—"
                    : decimal.format(data.service.csat)
                }
                note="Média das notas disponíveis"
              />
              <Metric
                label="Primeira resposta"
                value={
                  data.service.firstResponseMinutes === null
                    ? "—"
                    : `${decimal.format(data.service.firstResponseMinutes)} min`
                }
                note="Média ponderada"
              />
              <Metric
                label="Backlog"
                value={count.format(data.service.backlog)}
                note="Status ainda não concluído"
              />
              <Metric
                label="Custo de atendimento"
                value={money.format(data.service.costCents / 100)}
                note="No período filtrado"
              />
            </div>
            <div className="manager-chart-grid">
              <ChartCard
                eyebrow="Atendimento"
                title="Tickets e WISMO por semana"
                summary={
                  weekly.length
                    ? `${count.format(data.service.wismo)} tickets WISMO no recorte.`
                    : "Importe os agregados de atendimento para preencher esta série."
                }
                table={
                  <DataTable
                    caption="Tickets semanais"
                    headers={["Semana", "Tickets", "WISMO", "CSAT"]}
                    rows={weekly.map((i) => [
                      i.label,
                      i.tickets,
                      i.wismo,
                      i.csat ?? "—",
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly}>
                    <CartesianGrid stroke="#dedbd0" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      name="Tickets"
                      dataKey="tickets"
                      stroke="#4e5841"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      name="WISMO"
                      dataKey="wismo"
                      stroke="#a4492e"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                eyebrow="Experiência MIPO"
                title="Intervenções e aceitações"
                summary={
                  daily.length
                    ? `${count.format(data.mipo.accepted)} recomendações aceitas entre ${count.format(data.mipo.evaluated)} avaliações.`
                    : "Execute ou gere interações para preencher esta série."
                }
                table={
                  <DataTable
                    caption="Intervenções MIPO diárias"
                    headers={["Dia", "Intervenções", "Aceitas"]}
                    rows={daily.map((i) => [
                      i.label,
                      i.interventions,
                      i.accepted,
                    ])}
                  />
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily}>
                    <CartesianGrid stroke="#dedbd0" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area
                      name="Intervenções"
                      dataKey="interventions"
                      stroke="#4e5841"
                      fill="#cbd2b7"
                    />
                    <Line
                      name="Aceitas"
                      dataKey="accepted"
                      stroke="#a4492e"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <section className="mipo-funnel" aria-labelledby="funnel-title">
              <div>
                <p className="manager-eyebrow">Funil MIPO</p>
                <h2 id="funnel-title">Da avaliação à decisão</h2>
              </div>
              {[
                { label: "Avaliadas", value: data.mipo.evaluated },
                { label: "Acionáveis", value: data.mipo.actionable },
                { label: "Decididas", value: data.mipo.decided },
                { label: "Aceitas", value: data.mipo.accepted },
              ].map((item, index) => (
                <div key={item.label}>
                  <span>0{index + 1}</span>
                  <strong>{count.format(item.value)}</strong>
                  <p>{item.label}</p>
                  {index > 0 && (
                    <small>
                      {data.mipo.evaluated
                        ? percentage.format(item.value / data.mipo.evaluated)
                        : "—"}{" "}
                      das avaliações
                    </small>
                  )}
                </div>
              ))}
            </section>
            <WismoOperations service={data.service} />
            <section className="pilot-results" aria-labelledby="pilot-results-title">
              <header>
                <div>
                  <p className="manager-eyebrow">Experimento observado · separado da projeção</p>
                  <h2 id="pilot-results-title">Resultados do piloto no checkout</h2>
                </div>
                <span className={`pilot-status ${data.pilot.readyForComparison ? "is-ready" : "is-collecting"}`}>
                  {data.pilot.readyForComparison ? "Amostra mínima atingida" : "Em coleta"}
                </span>
              </header>
              <p>Pedidos e devoluções são exibidos por grupo. Até haver ao menos 30 desfechos observados em cada braço, nenhuma diferença deve ser interpretada como efeito causal.</p>
              <div className="pilot-results__grid">
                <article>
                  <span>Controle · sem assistência</span>
                  <strong>{data.pilot.control.returnRate === null ? "—" : percentage.format(data.pilot.control.returnRate)}</strong>
                  <small>{count.format(data.pilot.control.observed)} desfechos de {count.format(data.pilot.control.orders)} pedidos · {count.format(data.pilot.control.returns)} devoluções</small>
                </article>
                <article>
                  <span>Tratamento · MIPO ativo</span>
                  <strong>{data.pilot.treatment.returnRate === null ? "—" : percentage.format(data.pilot.treatment.returnRate)}</strong>
                  <small>{count.format(data.pilot.treatment.observed)} desfechos de {count.format(data.pilot.treatment.orders)} pedidos · {count.format(data.pilot.treatment.returns)} devoluções</small>
                </article>
              </div>
            </section>
            <section className="size-governance" aria-labelledby="size-governance-title">
              <header><div><p className="manager-eyebrow">Governança de produto</p><h2 id="size-governance-title">Grades usadas pelo assistente</h2></div><span className="origin origin--demo">Dados demonstrativos</span></header>
              <p>A recomendação usa somente estas grades versionadas. Publicação comercial exige homologação da ficha técnica; a IA não altera faixas nem tamanhos.</p>
              <div>{Object.values(VERTICE_PRODUCT_SIZE_GUIDES).map((guide) => <article key={guide.version}><span>{storefrontProducts.find((product) => product.id === guide.productId)?.title ?? guide.label}</span><strong>{guide.version}</strong><small>{guide.label}<br/>Métricas: {[...new Set(Object.values(guide.ranges).flatMap((ranges) => Object.keys(ranges)))].map((metric) => ({bust:"busto",waist:"cintura",hip:"quadril"})[metric as "bust"|"waist"|"hip"]).join(", ")}</small><b>Revisão necessária</b></article>)}</div>
            </section>
            <section className="agent-health">
              <header>
                <div>
                  <p className="manager-eyebrow">
                    Operação técnica · separada de impacto
                  </p>
                  <h2>Saúde da IA</h2>
                </div>
                <span className="origin origin--demo">
                  Telemetria operacional
                </span>
              </header>
              <div className="manager-kpis">
                <Metric
                  label="Disponibilidade assistida"
                  value={
                    availability === null
                      ? "—"
                      : percentage.format(availability)
                  }
                  note={`${data.agent.total} execuções concluídas`}
                  source={data.agent.source}
                />
                <Metric
                  label="EloAgents"
                  value={count.format(data.agent.eloagents)}
                  note="Provedor primário"
                  source={data.agent.source}
                />
                <Metric
                  label="Groq"
                  value={count.format(data.agent.groq)}
                  note="Fallback de modelo"
                  source={data.agent.source}
                />
                <Metric
                  label="Fallback local"
                  value={count.format(data.agent.fallback)}
                  note={`${data.agent.timeouts} timeouts classificados`}
                  source={data.agent.source}
                />
                <Metric
                  label="Cache"
                  value={count.format(data.agent.cacheHits)}
                  note={`${data.agent.rejected} rejeições de política`}
                  source={data.agent.source}
                />
                <Metric
                  label="Latência média"
                  value={
                    data.agent.averageLatencyMs === null
                      ? "—"
                      : `${count.format(data.agent.averageLatencyMs)} ms`
                  }
                  note="Execuções com latência registrada"
                  source={data.agent.source}
                />
              </div>
            </section>
            <section className="manager-table-card">
              <header>
                <div>
                  <p className="manager-eyebrow">Rastreabilidade</p>
                  <h2>Intervenções recentes</h2>
                </div>
                <span>{data.mipo.recent.length} registros</span>
              </header>
              {data.mipo.recent.length ? (
                <DataTable
                  caption="Intervenções MIPO recentes"
                  headers={[
                    "Momento",
                    "Produto",
                    "Risco",
                    "Evidência",
                    "Decisão",
                    "Origem",
                    "IA",
                  ]}
                  rows={data.mipo.recent.map((row) => [
                    fullDate.format(new Date(row.occurredAt)),
                    `${row.product} · ${row.selectedSize}${row.recommendedSize ? ` → ${row.recommendedSize}` : ""}`,
                    riskLabel[row.risk],
                    row.evidence,
                    decisionLabel[row.decision],
                    row.origin === "demo" ? "Demo" : "Histórico",
                    row.agentStatus ?? "Sem execução",
                  ])}
                />
              ) : (
                <Empty message="Use a loja ou execute o seed demonstrativo para gerar eventos." />
              )}
            </section>
          </section>
        )}
      </main>
    </>
  );
}
