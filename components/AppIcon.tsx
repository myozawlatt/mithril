import Image from "next/image";

/** The app icon (white-rimmed vault mark) above the sign-in and install screens. */
export default function AppIcon() {
  return (
    // Unoptimized: loads the precached file itself, so it shows offline.
    <Image
      src="/icons/icon-192.png"
      alt=""
      width={80}
      height={80}
      unoptimized
      priority
      className="mx-auto mb-4 size-20 rounded-full shadow-[0_8px_24px_rgba(30,37,64,0.25)]"
    />
  );
}
