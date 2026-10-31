import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50",
  secondary: "bg-white text-stone-800 shadow-sm ring-1 ring-inset ring-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:text-stone-400",
  ghost: "text-stone-700 hover:bg-stone-100 active:bg-stone-200 disabled:text-stone-400",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }
>(function Button({ className, variant = "primary", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg px-3 border border-stone-300 bg-white text-sm text-stone-900 shadow-xs outline-none transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-stone-50 disabled:text-stone-500",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg px-3 py-2 border border-stone-300 bg-white text-sm text-stone-900 shadow-xs outline-none transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-stone-50 disabled:text-stone-500",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg pr-8 pl-3 border border-stone-300 bg-white text-sm text-stone-900 shadow-xs outline-none transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:bg-stone-50 disabled:text-stone-500",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-stone-700", className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs leading-relaxed text-stone-500">{hint}</p>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-stone-200/80 bg-white p-5 shadow-card", className)} {...props} />;
}

export function Badge({
  className,
  tone = "stone",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "stone" | "green" | "red" | "amber" | "brand" }) {
  const tones = {
    stone: "bg-stone-50 text-stone-700 ring-stone-500/20",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
    brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", tones[tone], className)}
      {...props}
    />
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } | null }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>;
  return null;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-stone-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Veg / non-veg / egg indicator used on Indian menus. */
export function FoodTypeIcon({ type }: { type: "VEG" | "NON_VEG" | "EGG" }) {
  const color = type === "VEG" ? "border-green-600 text-green-600" : type === "EGG" ? "border-amber-500 text-amber-500" : "border-red-700 text-red-700";
  return (
    <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-2", color)} title={type}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

/** Small metric tile used on overview pages. */
export function StatCard({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-stone-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </Card>
  );
}
