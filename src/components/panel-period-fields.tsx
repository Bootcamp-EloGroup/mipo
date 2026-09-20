"use client";

import "./panel-extras.css";

/** AAAA-MM-DD no fuso do navegador. */
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Datas do filtro de período personalizado do topo do painel (aparecem com "Período personalizado"). */
export function PeriodCustomFields({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const today = localDate(new Date());
  const inverted = from !== "" && to !== "" && from > to;
  return (
    <div className="manager-filters__custom">
      <label>
        De
        <input type="date" value={from} max={to || today} onChange={(event) => onChange(event.target.value, to)} />
      </label>
      <label>
        Até
        <input type="date" value={to} min={from || undefined} max={today} onChange={(event) => onChange(from, event.target.value)} />
      </label>
      {inverted && <p role="alert">A data inicial não pode ser depois da final; o painel mantém o último recorte válido.</p>}
    </div>
  );
}
