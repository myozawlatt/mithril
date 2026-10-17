export default function Fab({ onClick }: { onClick: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-end px-5 pb-safe">
      <button
        type="button"
        onClick={onClick}
        aria-label="Add expense"
        className="pointer-events-auto mb-2 grid size-16 place-items-center rounded-[22px] bg-linear-to-br from-violet-600 to-violet-800 text-white shadow-xl shadow-violet-600/35 transition active:scale-95"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
