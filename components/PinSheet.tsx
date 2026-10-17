"use client";

import { useState } from "react";
import PinInput from "./PinInput";
import Sheet from "./Sheet";
import { acceptPinOffer, PIN_LENGTH, removePin, setPin } from "@/lib/vault";

export type PinSheetMode = "offer" | "setup" | "change" | "remove";

const TITLES: Record<PinSheetMode, string> = {
  offer: "Quick unlock",
  setup: "Set up PIN",
  change: "Change PIN",
  remove: "Remove PIN",
};

type Props = {
  mode: PinSheetMode | null;
  /** After the PIN was saved or removed. */
  onDone: () => void;
  /** Closed without a change ("Not now" for the offer). */
  onCancel: () => void;
};

export default function PinSheet({ mode, onDone, onCancel }: Props) {
  return (
    <Sheet open={!!mode} onClose={onCancel} title={mode ? TITLES[mode] : ""}>
      {mode === "remove" ? (
        <RemovePin onDone={onDone} onCancel={onCancel} />
      ) : (
        mode && <PinForm key={mode} mode={mode} onDone={onDone} onCancel={onCancel} />
      )}
    </Sheet>
  );
}

const fieldClass = "bg-accent-soft/70";
const primaryClass =
  "h-14 w-full rounded-2xl bg-accent text-base font-semibold text-white shadow-lg shadow-violet-500/30 transition active:scale-[0.98] disabled:bg-accent-soft disabled:text-muted disabled:shadow-none";
const secondaryClass = "h-11 w-full rounded-2xl text-sm font-semibold text-muted transition active:bg-accent-soft";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="px-1 text-center text-sm font-medium text-rose-700">
      {message}
    </p>
  );
}

function PinForm({ mode, onDone, onCancel }: { mode: Exclude<PinSheetMode, "remove">; onDone: () => void; onCancel: () => void }) {
  // The offer comes straight after a password unlock, so it skips the password step.
  const [step, setStep] = useState<"password" | "pin" | "confirm">(mode === "offer" ? "pin" : "password");
  const [password, setPassword] = useState("");
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(confirmed: string) {
    if (confirmed !== pin) {
      setError("The PINs didn’t match. Try again.");
      setPinValue("");
      setConfirm("");
      setStep("pin");
      return;
    }
    setBusy(true);
    setError(null);
    if (mode === "offer") {
      await acceptPinOffer(pin);
    } else if (!(await setPin(password, pin))) {
      setBusy(false);
      setError("Wrong password.");
      setPassword("");
      setPinValue("");
      setConfirm("");
      setStep("password");
      return;
    }
    onDone();
  }

  if (step === "password") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!password) return;
          setError(null);
          setStep("pin");
        }}
        className="flex flex-col gap-3"
        noValidate
      >
        <p className="text-center text-sm text-muted">Enter your password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete="current-password"
          enterKeyHint="next"
          autoFocus
          className="h-12 rounded-2xl bg-accent-soft/70 px-4 text-[15px] text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-violet-300"
        />
        <ErrorText message={error} />
        <button type="submit" disabled={!password} className={primaryClass}>
          Continue
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "offer" && step === "pin" && (
        <p className="text-center text-sm text-muted">
          Unlock with a {PIN_LENGTH}-digit PIN instead of typing your password each time. Your password still works.
        </p>
      )}
      <p className="text-center text-sm font-medium text-ink">
        {step === "pin" ? `Choose a ${PIN_LENGTH}-digit PIN` : "Enter it again to confirm"}
      </p>
      {step === "pin" ? (
        <PinInput
          key="pin"
          value={pin}
          onChange={setPinValue}
          onComplete={() => {
            setError(null);
            setStep("confirm");
          }}
          label="New PIN"
          autoFocus
          className={fieldClass}
        />
      ) : (
        <PinInput key="confirm" value={confirm} onChange={setConfirm} onComplete={save} label="Confirm PIN" autoFocus disabled={busy} className={fieldClass} />
      )}
      <ErrorText message={error} />
      <p className="text-center text-xs text-muted">
        A PIN keeps out someone who picks up your phone. Your password is the stronger lock. 5 wrong PINs remove the PIN.
      </p>
      <button type="button" onClick={onCancel} className={secondaryClass}>
        {mode === "offer" ? "Not now" : "Cancel"}
      </button>
    </div>
  );
}

function RemovePin({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted">You’ll unlock with your password instead.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await removePin();
          onDone();
        }}
        className="h-12 w-full rounded-2xl bg-rose-50 text-sm font-semibold text-rose-800 transition active:bg-rose-100"
      >
        Remove PIN
      </button>
      <button type="button" onClick={onCancel} className={secondaryClass}>
        Cancel
      </button>
    </div>
  );
}
