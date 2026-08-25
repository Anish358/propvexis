/* Alert — PropVexis primitive.
 *
 * A re-export, but read the two constraints before using it.
 *
 * 1. `info` AND `success` ARE INERT — `default`, `error` and `warning` render.
 *    Verified against the built stylesheet, not assumed: `--warning` already exists
 *    (tokens.css -> bridge.css `--color-warning`), so that variant compiles; `--info`
 *    and `--success` do not exist and those two resolve to nothing.
 *
 *    `shadcn add @coss/alert` offers to create all of them, by appending seven pairs
 *    to tailwind.css built from Tailwind's raw palette (`--color-blue-500`,
 *    `--color-emerald-500`, `--color-amber-500`, …). Reverted — and the two missing
 *    ones are missing for a reason that is specific rather than general:
 *      · `--success` in emerald is a GREEN used as status, and DESIGN-LANGUAGE §4 is
 *        explicit that "green and red are trade outcomes only. Never status, never
 *        chrome." A green banner in a trading journal reads as profit.
 *      · `--info` in blue is BRAND blue used as status, and §4 reserves blue for
 *        "primary actions and data".
 *    Amber has no such collision, which is why the one status colour this app does
 *    have is the one it can afford. Adding either of the others is an §21 amendment,
 *    not a CLI default.
 *
 *    Using `info` or `success` anyway renders an unstyled box, silently. There is a
 *    test in new-account-pages.test.js holding that.
 *
 * 2. `error` DEPENDS ON AN OPEN RULE. It draws `border-destructive/bg-destructive`,
 *    and bridge.css maps destructive to `--loss` because there is no other slot —
 *    §17, ⬜ OPEN, "revisit; do not build on it". Using it for a FAILED ACTION is the
 *    library's own meaning of the slot, so the usage is right; what is provisional is
 *    the colour it borrows. When §17 is decided, this is the call site to revisit, and
 *    it is one file rather than every page that shows an error.
 */
export { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
