"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import AmountInput from "./AmountInput";
import CharCount from "./CharCount";
import LabelPicker from "./LabelPicker";
import Sheet from "./Sheet";
import type { Expense } from "@/lib/db";
import { formatNumber, parseAmount, todayKey } from "@/lib/format";
import { cleanLabelName } from "@/lib/labels";
import { addExpense, updateExpense, type LabelIndex } from "@/lib/repo";

const NOTE_MAX = 80;

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
  // Editing keeps its label; a new expense starts with none, so the label is always a choice.
  const [label, setLabel] = useState(() => (expense ? labels.byId.get(expense.labelId)?.name : undefined) ?? "");
  const [date, setDate] = useState(expense?.date ?? todayKey());
  const [note, setNote] = useState(expense?.note ?? "");
  const amountRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteCountId = useId();

  // Grow the note box to fit its wrapped lines.
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [note]);

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
        {/* A textarea so a long note wraps; it stays one line of text, and Enter still submits. */}
        <div className="relative min-w-0">
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value.replace(/\s*\n\s*/g, " "))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }}
            placeholder="Note (optional)"
            maxLength={NOTE_MAX}
            rows={1}
            enterKeyHint="done"
            aria-label="Note"
            aria-describedby={noteCountId}
            className="block min-h-12 w-full resize-none overflow-hidden rounded-2xl bg-accent-soft/70 px-4 py-3.5 text-sm leading-5 text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-violet-300"
          />
          <CharCount id={noteCountId} length={note.length} max={NOTE_MAX} />
        </div>
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
