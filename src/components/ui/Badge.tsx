import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const badgeVariants: Record<BadgeVariant, string> = {
  neutral: "bg-line text-ink",
  success: "bg-ink text-paper",
  warning: "bg-paper text-ink border border-ink",
  danger: "bg-accent text-paper",
  info: "bg-paper text-accent border border-accent",
};

export function Badge({
  className,
  variant = "neutral",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-xs font-medium tracking-wide uppercase",
        badgeVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

type AlertVariant = "info" | "success" | "warning" | "danger";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
  title?: string;
};

const alertVariants: Record<AlertVariant, string> = {
  info: "bg-paper border-ink text-ink",
  success: "bg-ink border-ink text-paper",
  warning: "bg-paper border-ink text-ink",
  danger: "bg-paper border-accent text-accent",
};

export function Alert({
  className,
  variant = "info",
  title,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      className={cn(
        "border-l-4 p-4",
        alertVariants[variant],
        className
      )}
      role="alert"
      {...props}
    >
      {title ? (
        <p className="font-semibold tracking-tight mb-1">{title}</p>
      ) : null}
      <div className="text-sm">{children}</div>
    </div>
  );
}
