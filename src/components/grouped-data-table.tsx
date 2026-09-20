"use client";

import { Fragment, useState } from "react";
import "./panel-extras.css";

type Column<T> = {
  header: string;
  /** Valor exibido na linha de detalhe. */
  value: (item: T) => string | number;
  /** Se informado, as linhas de grupo mostram a soma desta coluna; senão mostram "—". */
  sum?: (item: T) => number;
  format?: (total: number) => string;
};

type Props<T> = {
  caption: string;
  /** "month" agrupa por mês; "quarter" por trimestre; "year" agrupa por ano e, dentro do ano, por mês. */
  groupBy: "month" | "quarter" | "year";
  firstHeader: string;
  items: T[];
  /** Data do item: AAAA-MM-DD ou AAAA-MM. */
  dateOf: (item: T) => string;
  /** Rótulo do item na linha de detalhe (dia, semana ou mês, como já era exibido). */
  labelOf: (item: T) => string;
  columns: Array<Column<T>>;
};

type Group<T> = { key: string; label: string; items: T[]; children?: Array<Group<T>> };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function monthGroup(date: string): { key: string; label: string } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const name = monthName.format(new Date(year, month - 1, 1));
  return { key: `${year}-${String(month).padStart(2, "0")}`, label: name.charAt(0).toUpperCase() + name.slice(1) };
}

function quarterGroup(date: string): { key: string; label: string } {
  const year = Number(date.slice(0, 4));
  const quarter = Math.ceil(Number(date.slice(5, 7)) / 3);
  return { key: `${year}-Q${quarter}`, label: `${quarter}º trimestre de ${year}` };
}

function collect<T>(items: T[], keyOf: (item: T) => { key: string; label: string }): Array<Group<T>> {
  const groups: Array<Group<T>> = [];
  for (const item of items) {
    const { key, label } = keyOf(item);
    const found = groups.find((group) => group.key === key);
    if (found) found.items.push(item);
    else groups.push({ key, label, items: [item] });
  }
  return groups;
}

const HEADERS = { month: "Mês", quarter: "Trimestre", year: "Ano" } as const;
const CAPTIONS = { month: "mês", quarter: "trimestre", year: "ano e mês" } as const;

/** Tabela dos gráficos agrupada por mês, trimestre ou ano (com meses dentro); o "+" ao lado do grupo abre o detalhamento. */
export function GroupedDataTable<T>({ caption, groupBy, firstHeader, items, dateOf, labelOf, columns }: Props<T>) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups: Array<Group<T>> =
    groupBy === "year"
      ? collect(items, (item) => ({ key: dateOf(item).slice(0, 4), label: dateOf(item).slice(0, 4) })).map((year) => ({
          ...year,
          children: collect(year.items, (item) => monthGroup(dateOf(item))),
        }))
      : collect(items, (item) => (groupBy === "quarter" ? quarterGroup(dateOf(item)) : monthGroup(dateOf(item))));

  const totals = (group: Group<T>, column: Column<T>) =>
    column.sum ? (column.format ?? String)(group.items.reduce((total, item) => total + (column.sum?.(item) ?? 0), 0)) : "—";
  const toggle = (key: string) => setOpen((current) => ({ ...current, [key]: current[key] !== true }));

  const plus = (group: Group<T>) => {
    const expanded = open[group.key] === true;
    return (
      <button
        type="button"
        className="panel-plus"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Ocultar" : "Abrir"} detalhamento de ${group.label}`}
        onClick={() => toggle(group.key)}
      >
        {expanded ? "−" : "+"}
      </button>
    );
  };

  const leafRows = (group: Group<T>, deep: boolean) =>
    group.items.map((item, index) => (
      <tr key={`${group.key}-${index}`} className={`panel-child-row${deep ? " panel-child-row--deep" : ""}`}>
        <td>{labelOf(item)}</td>
        {columns.map((column) => <td key={column.header}>{column.value(item)}</td>)}
      </tr>
    ));

  return (
    <div className="manager-table-scroll">
      <table>
        <caption className="sr-only">{caption}, agrupado por {CAPTIONS[groupBy]}</caption>
        <thead>
          <tr>
            <th>{HEADERS[groupBy]} <span className="sr-only">/ {firstHeader}</span></th>
            {columns.map((column) => <th key={column.header}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              <tr className="panel-group-row">
                <td>{plus(group)}{group.label}</td>
                {columns.map((column) => <td key={column.header}>{totals(group, column)}</td>)}
              </tr>
              {open[group.key] === true && (group.children
                ? group.children.map((month) => (
                    <Fragment key={month.key}>
                      <tr className="panel-subgroup-row">
                        <td>{plus(month)}{month.label}</td>
                        {columns.map((column) => <td key={column.header}>{totals(month, column)}</td>)}
                      </tr>
                      {open[month.key] === true && leafRows(month, true)}
                    </Fragment>
                  ))
                : leafRows(group, false))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
