import React, { useMemo, useState } from 'react';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { searchPlatforms } from '../platformCatalog.js';
import { findFirm } from '../../prop/propFirms.js';

/* Which platform the account runs on.
 *
 * IT READS platformCatalog.js, NEVER src/domain/sync/platforms.js. The backend
 * registry is the authority for what is actually enabled, and the frontend cannot
 * import it: the deploy rsyncs `src` and `frontend/dist` as two independent trees, so
 * an import across that line works locally and crashes on the box. platformCatalog.js
 * is the presentation half — names, blurbs, status — and platform-catalog.test.js is
 * what keeps the two from drifting.
 *
 * SOON CARDS STAY FINDABLE AND STAY UNSELECTABLE. `searchPlatforms` deliberately does
 * not filter by status, and neither does this page: filtering them out would turn
 * "when is cTrader coming?" into "cTrader does not exist", which is a worse answer
 * than a disabled card. What makes the disabled state honest is the blurb — every
 * card in the catalog carries one for exactly this reason, so a greyed name is never
 * bare. Selecting one would 400 at provision, six questions later.
 *
 * THE PROP PATH NARROWS TO THE FIRM (spec §7.2): a firm implies its platform, so
 * showing all five invites the wrong answer. The rest stay one toggle away rather
 * than hidden, because the catalog's own list can be incomplete for a firm we have
 * not verified. The unlisted firm names every platform (Task 2), so it needs no
 * special case here — it simply arrives with the full list.
 *
 * WHEN CHOOSING ADVANCES, AND WHEN IT DOES NOT. The rule this flow follows: if the
 * choice is the only thing the step collects, choosing advances; if the step collects
 * anything else, choosing selects and an explicit action leaves. So the prop path
 * advances on a card (nothing else to answer) and the live path does not, because it
 * also offers the broker field — and a card that advanced would carry the user past a
 * field they had not reached yet. Same rule that makes the capital step advance on a
 * card and the name step use Continue.
 *
 * `patchDraft` drops a chosen `import_method` the new platform does not offer, so
 * switching from MetaTrader 5 to Other after choosing Auto Sync needs no handling
 * here — the import step simply asks again.
 */
export default function PlatformStep() {
  const { draft, patch, advance } = useFlow();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [broker, setBroker] = useState(() => draft.broker || '');

  const isProp = draft.capital_kind === 'prop';
  const firmPlatforms = isProp ? findFirm(draft.firm_id)?.platforms ?? null : null;

  const cards = useMemo(() => {
    const found = searchPlatforms(query);
    // The narrowing applies to the firm's own list only, and a typed query overrides
    // it: someone searching for "ctrader" has told us what they are looking for, and
    // hiding it behind a toggle at that point is answering a question they did not
    // ask.
    if (!firmPlatforms || showAll || query.trim() !== '') return found;
    return found.filter((c) => firmPlatforms.includes(c.id));
  }, [query, firmPlatforms, showAll]);

  const hiddenCount = firmPlatforms && !showAll && query.trim() === ''
    ? searchPlatforms('').length - cards.length
    : 0;

  function choose(card) {
    if (card.status !== 'live') return;
    if (isProp) {
      patch({ platform: card.id });
      advance();
      return;
    }
    // Live: select only. The broker field is still ahead of the user.
    patch({ platform: card.id, broker: broker.trim() || null });
  }

  function onContinue() {
    patch({ broker: broker.trim() || null });
    advance();
  }

  const chosen = draft.platform;

  return (
    <>
      <WizardHeading align="center" eyebrow="Add Account" title="Which broker or platform?" />

      <WizardGroup>
        <Field>
          <FieldLabel htmlFor="naf-platform-search">Search platforms</FieldLabel>
          <Input
            id="naf-platform-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="mt5, cTrader…"
            autoComplete="off"
          />
        </Field>

        <ChoiceGrid>
          {cards.map((card) => (
            <ChoiceCard
              key={card.id}
              title={card.name}
              description={card.blurb}
              selected={chosen === card.id}
              disabled={card.status !== 'live'}
              badge={card.status === 'soon' ? <Badge tone="neutral">Soon</Badge> : null}
              onClick={() => choose(card)}
            />
          ))}
        </ChoiceGrid>

        {/* Rendered only when something is actually hidden, and it names how many —
            "Show all platforms" beside a complete grid is a control that does
            nothing, and the user cannot tell which case they are in. */}
        {hiddenCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show all platforms ({hiddenCount} more)
          </Button>
        ) : null}

        {/* Live only. toProvisionPayload nulls `broker` on the prop path, so collecting
            it there would be input we throw away — and asking for it would imply we
            keep it. */}
        {!isProp ? (
          <Field>
            <FieldLabel htmlFor="naf-broker">Broker (optional)</FieldLabel>
            <Input
              id="naf-broker"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="IC Markets"
              autoComplete="off"
              maxLength={80}
            />
          </Field>
        ) : null}
      </WizardGroup>

      {!isProp ? (
        <Button variant="primary" onClick={onContinue} disabled={!chosen}>Continue</Button>
      ) : null}
    </>
  );
}
