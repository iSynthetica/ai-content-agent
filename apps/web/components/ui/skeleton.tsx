// shadcn/ui — Skeleton (стиль new-york). Loading-стан (DS §7): Skeleton, не спінер на весь екран.
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
