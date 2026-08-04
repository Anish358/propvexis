/* Badge — PropVexis primitive.
 *
 * Generic status pill. Trading semantics (profit / loss / break-even / payout)
 * are NOT variants here: the domain ring belongs to a domain component composed
 * on top, so that `Badge` never has to know what a break-even is. */
export { Badge, badgeVariants } from "@/components/ui/badge";
