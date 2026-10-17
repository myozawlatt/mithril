"use client";

import { useMemo, useState } from "react";
import BudgetSheet from "./BudgetSheet";
import EmptyState from "./EmptyState";
import ExpenseList from "./ExpenseList";
import ExpenseSheet from "./ExpenseSheet";
import Fab from "./Fab";
import Header from "./Header";
import MonthsSummaryView from "./MonthsSummaryView";
import PinSheet from "./PinSheet";
import SearchView from "./SearchView";
import SummaryCard from "./SummaryCard";
import UndoToast from "./UndoToast";
import { budgetTotal } from "@/lib/budget";
import type { Expense } from "@/lib/db";
import { currentMonth, type MonthKey } from "@/lib/format";
import { labelOrFallback } from "@/lib/labels";
import { deleteExpense, restoreExpense, useBudget, useHasExpenses, useLabels, useMonthExpenses } from "@/lib/repo";
import { useSync } from "@/lib/sync";
import { useBackToClose } from "@/lib/useBackToClose";
import { dismissPinOffer, useVault } from "@/lib/vault";

/** The whole app screen. Client-only: rendered after hydration. */
export default function Tracker() {
  const [month, setMonth] = useState<MonthKey>(currentMonth);
  const [sheet, setSheet] = useState<"none" | "expense" | "budget">("none");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [view, setView] = useState<"month" | "search" | "summary">("month");
  const [undo, setUndo] = useState<{ id: string; message: string } | null>(null);

  const show = (v: typeof view) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  useBackToClose(view !== "month", () => show("month"));
  useSync();

  const expenses = useMonthExpenses(month);
  const budgetLines = useBudget(month);
  const budget = budgetLines && budgetTotal(budgetLines);
  const labels = useLabels();
  const hasExpenses = useHasExpenses();
  const vault = useVault();
  // After a password unlock with no PIN set, offer one (until "Not now").
  const pinOffer = vault.status === "unlocked" && vault.pinOffer;

  const { total, slices } = useMemo(() => {
    const byLabel = new Map<string, number>();
    let sum = 0;
    for (const e of expenses ?? []) {
      sum += e.amount;
      byLabel.set(e.labelId, (byLabel.get(e.labelId) ?? 0) + e.amount);
    }
    return {
      total: sum,
      slices: [...byLabel].map(([labelId, amount]) => ({ labelId, amount })).sort((a, b) => b.amount - a.amount),
    };
  }, [expenses]);

  const close = () => {
    setSheet("none");
    setEditing(null);
  };

  const edit = (e: Expense) => {
    setEditing(e);
    setSheet("expense");
  };

  async function remove(e: Expense) {
    await deleteExpense(e.id);
    const name = e.note || labelOrFallback(labels?.byId, e.labelId).name;
    setUndo({ id: e.id, message: `Deleted “${name}”` });
  }

  const loading = expenses === undefined || budget === undefined || labels === undefined || hasExpenses === undefined;

  return (
    <>
      {view === "search" && labels ? (
        <SearchView labels={labels.byId} onClose={() => show("month")} onSelect={edit} onDelete={remove} />
      ) : view === "summary" ? (
        <MonthsSummaryView
          month={month}
          onPick={(m) => {
            setMonth(m);
            show("month");
          }}
          onBack={() => show("month")}
        />
      ) : (
        <>
          <Header
            month={month}
            onMonthChange={setMonth}
            onSearch={() => show("search")}
            onOpenSummary={() => show("summary")}
          />

          {loading ? (
            <div className="glass h-33 animate-pulse rounded-[28px]" />
          ) : (
            <>
              <SummaryCard
                total={total}
                budget={budget}
                slices={slices}
                labels={labels.byId}
                onEditBudget={() => setSheet("budget")}
                onOpenSummary={() => show("summary")}
              />
              {expenses.length === 0 ? (
                <EmptyState isCurrentMonth={month === currentMonth()} isFirstRun={!hasExpenses} />
              ) : (
                <ExpenseList expenses={expenses} labels={labels.byId} onSelect={edit} onDelete={remove} />
              )}
            </>
          )}
        </>
      )}

      {view !== "summary" && (
        <Fab
          onClick={() => {
            setEditing(null);
            setSheet("expense");
          }}
        />
      )}

      {undo && (
        <UndoToast
          key={undo.id}
          message={undo.message}
          onUndo={() => {
            restoreExpense(undo.id);
            setUndo(null);
          }}
          onDismiss={() => setUndo(null)}
        />
      )}

      {labels && (
        <ExpenseSheet open={sheet === "expense"} onClose={close} onDelete={remove} labels={labels} expense={editing} />
      )}
      <BudgetSheet open={sheet === "budget"} onClose={close} month={month} lines={budgetLines ?? []} />
      <PinSheet mode={pinOffer ? "offer" : null} onDone={() => {}} onCancel={dismissPinOffer} />
    </>
  );
}
