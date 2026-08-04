/* Card — PropVexis primitive (compound: 7 parts).
 *
 * Surface is `bg-card` = var(--panel); radius resolves through --radius-4xl,
 * which the bridge points at our largest step (--r-2xl); internal rhythm comes
 * from --card-spacing, built on --spacing = var(--s-1).
 *
 * NOTE for the KPI work: DESIGN-LANGUAGE locks the Net P&L card as the master
 * sizing component — content adapts to the container, never the reverse. This
 * primitive is a generic surface and does not encode that rule. A KPI card is a
 * domain component to be composed on top, not a variant of this. */
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
