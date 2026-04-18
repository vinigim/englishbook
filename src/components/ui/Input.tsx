import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <>
        <input
          ref={ref}
          className={cn(
            "w-full h-11 px-4 bg-paper border border-line text-ink",
            "placeholder:text-muted",
            "focus:outline-none focus:border-ink focus:ring-0",
            "transition-colors",
            error && "border-accent focus:border-accent",
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-accent text-sm mt-1">{error}</p>
        ) : null}
      </>
    );
  }
);
Input.displayName = "Input";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-ink mb-2 tracking-tight",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
