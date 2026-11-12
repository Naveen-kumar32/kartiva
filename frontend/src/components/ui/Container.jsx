import { cn } from "@/utils/cn";

export function Container({ as: Tag = "div", children, className }) {
  return <Tag className={cn("mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8", className)}>{children}</Tag>;
}
