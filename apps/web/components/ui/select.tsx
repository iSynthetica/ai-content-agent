// Легкий Select на нативному <select> + токени DS (§7 роестр компонентів). Radix-Select-пакет
// у проєкті ще не встановлено, а CLI/інсталяції заборонені — тож замість нового залежника це
// хендрайтнутий контрол на семантичних токенах, стилістично узгоджений з Input.
// Сумісний з <FormControl> (Slot): forwardRef → нативний <select>, тож id/aria/ref з rhf лягають
// саме на елемент керування. Опції передаються як <option>-діти.
import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
