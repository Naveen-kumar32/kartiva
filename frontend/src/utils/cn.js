// Joins truthy class names: cn("a", cond && "b")
export const cn = (...classes) => classes.filter(Boolean).join(" ");
