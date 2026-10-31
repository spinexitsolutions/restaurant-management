import { APP_NAME } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Product mark: a "D" with a flow line through it. Also used for the app icons. */
export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" fill="#2554eb" />
      <path
        d="M10 9.5h7.25a6.5 6.5 0 0 1 0 13H10z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 16h10"
        stroke="#93b4fd"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  inverted,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-tight",
          inverted ? "text-white" : "text-stone-900",
        )}
      >
        {APP_NAME}
      </span>
    </span>
  );
}
