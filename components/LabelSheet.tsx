"use client";

import { useId, useState } from "react";
import CharCount from "./CharCount";
import Sheet from "./Sheet";
import { cleanLabelName, LABEL_MAX } from "@/lib/labels";
import { deleteLabel, LabelNameTakenError, renameLabel, useLabelUsage, type LabelUsage } from "@/lib/repo";

type Props = { open: boolean; onClose: () => void };

/** Rename, merge and delete labels. Opened from the Account menu. */
export default function LabelSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Labels">
      {open && <LabelManager onDone={onClose} />}
    </Sheet>
  );
}

const expenses = (n: number) => `${n} expense${n === 1 ? "" : "s"}`;

const iconButtonClass =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted transition active:bg-white/70 disabled:opacity-35";

function LabelManager({ onDone }: { onDone: () => void }) {
  const usage = useLabelUsage();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(item: LabelUsage) {
    if (confirming !== item.label.id) {
      setConfirming(item.label.id);
      setError(null);
      return;
    }
    setConfirming(null);
    try {
      await deleteLabel(item.label.id);
    } catch {
      setError(`Couldn’t delete “${item.label.name}”. It may be in use now.`);
    }
  }

  if (!usage) return <div className="h-32 animate-pulse rounded-2xl bg-accent-soft/60" />;

  return (
    <div className="flex flex-col gap-4">
      {usage.length === 0 ? (
        <p className="rounded-2xl bg-accent-soft/60 p-4 text-center text-sm text-muted">
          No labels yet. They’re made when you save an expense.
        </p>
      ) : (
        <ul className="-mx-1 flex max-h-[55vh] flex-col gap-2 overflow-y-auto px-1 py-1">
          {usage.map((item) =>
            editing === item.label.id ? (
              <RenameRow key={item.label.id} item={item} onDone={() => setEditing(null)} />
            ) : (
              <li key={item.label.id} className="flex items-center gap-2 rounded-2xl bg-accent-soft/60 py-1 pr-1 pl-4">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.label.color }} aria-hidden />
                <span className="min-w-0 flex-1 py-2">
                  <span className="block text-[15px] font-medium wrap-break-word text-ink">{item.label.name}</span>
                  <span className="block text-xs text-muted">{item.count ? expenses(item.count) : "Not used"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item.label.id);
                    setConfirming(null);
                    setError(null);
                  }}
                  aria-label={`Rename ${item.label.name}`}
                  className={iconButtonClass}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
                {confirming === item.label.id ? (
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    onBlur={() => setConfirming(null)}
                    autoFocus
                    className="h-11 shrink-0 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white transition active:bg-rose-700"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={item.count > 0}
                    aria-label={
                      item.count > 0
                        ? `Can’t delete ${item.label.name}: used by ${expenses(item.count)}`
                        : `Delete ${item.label.name}`
                    }
                    title={item.count > 0 ? `Used by ${expenses(item.count)}` : undefined}
                    className={iconButtonClass}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                    </svg>
                  </button>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {error && (
        <p role="alert" className="px-1 text-center text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      {usage.length > 0 && (
        <p className="px-1 text-center text-xs text-muted">
          A label in use can’t be deleted. To fold one into another, rename it to that label’s name.
        </p>
      )}

      <button
        type="button"
        onClick={onDone}
        className="h-12 w-full rounded-2xl text-sm font-semibold text-muted transition active:bg-accent-soft"
      >
        Done
      </button>
    </div>
  );
}

function RenameRow({ item, onDone }: { item: LabelUsage; onDone: () => void }) {
  const [name, setName] = useState(item.label.name);
  const [clash, setClash] = useState<LabelNameTakenError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const countId = useId();

  async function save(merge = false) {
    const clean = cleanLabelName(name);
    if (!clean) return setError("A label needs a name.");
    if (clean === item.label.name) return onDone();
    setBusy(true);
    setError(null);
    try {
      await renameLabel(item.label.id, clean, { merge });
      onDone();
    } catch (err) {
      if (err instanceof LabelNameTakenError) setClash(err);
      else setError("Couldn’t rename. Try again.");
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-accent-soft/60 p-2 pt-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-2"
      >
        <div className="relative">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setClash(null);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              // Cancel the rename, not the whole sheet.
              e.stopPropagation();
              onDone();
            }}
            autoFocus
            maxLength={LABEL_MAX}
            enterKeyHint="done"
            autoCapitalize="words"
            aria-label={`New name for ${item.label.name}`}
            aria-describedby={countId}
            className="h-12 w-full rounded-2xl bg-white px-4 text-[15px] font-medium text-ink outline-none focus:ring-2 focus:ring-violet-300"
          />
          <CharCount id={countId} length={name.length} max={LABEL_MAX} />
        </div>

        {clash ? (
          <div role="alert" className="flex flex-col gap-2 px-1">
            <p className="text-sm text-ink">
              You already have “{clash.taken}”.{" "}
              {clash.moving ? `Move ${expenses(clash.moving)} into it?` : "Merge this label into it?"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setClash(null)}
                className="h-11 flex-1 rounded-2xl text-sm font-semibold text-muted transition active:bg-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => save(true)}
                className="h-11 flex-1 rounded-2xl bg-accent text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                Merge
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDone}
              className="h-11 flex-1 rounded-2xl text-sm font-semibold text-muted transition active:bg-white/70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-11 flex-1 rounded-2xl bg-accent text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              Save
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="px-1 text-sm font-medium text-rose-700">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
