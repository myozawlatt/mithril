type Props = { id: string; length: number; max: number };

/** A field's character count as a legend on its top-right edge. The parent must be `relative`. */
export default function CharCount({ id, length, max }: Props) {
  return (
    <span
      id={id}
      className={`pointer-events-none absolute -top-2 right-3 rounded-full bg-white px-1.5 text-[11px] leading-4 tabular-nums ${
        length >= max ? "font-semibold text-rose-700" : "text-muted"
      }`}
    >
      <span aria-hidden>
        {length}/{max}
      </span>
      <span className="sr-only">
        {length} of {max} characters
      </span>
    </span>
  );
}
