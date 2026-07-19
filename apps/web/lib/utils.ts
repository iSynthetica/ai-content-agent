import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn — злиття Tailwind-класів без конфліктів (clsx + tailwind-merge).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
