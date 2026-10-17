"use client";

import { useEffect, useRef, useState } from "react";
import AmountInput from "./AmountInput";
import LabelPicker from "./LabelPicker";
import Sheet from "./Sheet";
import type { Expense } from "@/lib/db";
import { formatNumber, parseAmount, todayKey } from "@/lib/format";
import { cleanLabelName } from "@/lib/labels";
import { addExpense, updateExpense, type LabelIndex } from "@/lib/repo";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Deleting is owned by the parent so it can offer Undo. */
  onDelete: (e: Expense) => void;
  labels: LabelIndex;
  /** Present when editing an existing expense. */
  expense?: Expense | null;
};

export default function ExpenseSheet({ open, onClose, onDelete, labels, expense }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={expense ? "Edit expense" : "New expense"}>
      {/* Remount per open so the form resets cleanly. */}
      {open && (
        <ExpenseForm key={expense?.id ?? "new"} expense={expense} labels={labels} onDone={onClose} onDelete={onDelete} />
      )}
    </Sheet>
  );
}

function ExpenseForm({
  expense,
  labels,
  onDone,
  onDelete,
}: {
  expense?: Expense | null;
  labels: LabelIndex;
  onDone: () => void;
  onDelete: (e: Expense) => void;
}) {
  const [amount, setAmount] = useState(expense ? formatNumber(expense.amount) : "");
  // Editing keeps its label; a new expense starts from the most recently used one.
  const [label, setLabel] = useState(
    () => (expense ? labels.byId.get(expense.labelId)?.name : labels.suggestions[0]?.name) ?? "",
  );
  const [date, setDate] = useState(expense?.date ?? todayKey());
  const [note, setNote] = useState(expense?.note ?? "");
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus after the slide-in so iOS keeps the sheet in view.
    const t = setTimeout(() => amountRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  const value = parseAmount(amount);
  const labelName = cleanLabelName(label);
  const canSave = value > 0 && !!date && !!labelName;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const input = { amount: value, label: labelName, date, note: note.trim() };
    if (expense) await updateExpense(expense.id, input);
    else await addExpense(input);
    onDone();
  }

  function remove() {
    if (!expense) return;
    onDone();
    onDelete(expense);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <AmountInput ref={amountRef} value={amount} onChange={setAmount} label="Amount in MMK" />

      <LabelPicker value={label} onChange={setLabel} labels={labels} />

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <input
          type="date"
          value={date}
          max="9999-12-31"
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className="h-12 rounded-2xl bg-accent-soft/70 px-3 text-sm font-medium text-ink outline-none focus:ring-2 focus:ring-violet-300"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          maxLength={80}
          enterKeyHint="done"
          aria-label="Note"
          className="h-12 min-w-0 rounded-2xl bg-accent-soft/70 px-4 text-sm text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-violet-300"
        />
      </div>

      <div className="flex gap-2">
        {expense && (
          <button
            type="button"
            onClick={remove}
            className="h-14 rounded-2xl bg-rose-50 px-5 text-sm font-semibold text-rose-800 transition active:bg-rose-100"
          >
            Delete
          </button>
        )}
        <button
          type="submit"
          disabled={!canSave}
          className="h-14 flex-1 rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98] disabled:bg-accent-soft disabled:text-muted disabled:shadow-none"
        >
          {expense ? "Save changes" : "Add expense"}
        </button>
      </div>
    </form>
  );
}
