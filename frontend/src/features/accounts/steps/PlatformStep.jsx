import React, { useMemo, useState } from 'react';
import {
  Badge, Button, ChoiceCard, ChoiceGrid, Field, FieldDescription, FieldLabel, Input,
  WizardGroup, WizardHeading,
} from '@/components/primitives';
import { useFlow } from '../NewAccountFlow.jsx';
import { searchPlatforms } from '../platformCatalog.js';

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
 * EVERY PLATFORM IS LISTED, ALWAYS (owner decision 2026-09-08, reversing the spec
 * §7.2 narrowing this page shipped with). The prop path used to filter the grid to the
 * chosen firm's `platforms` list and hide the rest behind a "Show all platforms"
 * toggle, on the reading that a firm implies its platform.
 *
 * IT DOES NOT, AND THE CATALOG WAS WRONG ABOUT THE FIRM THE OWNER ACTUALLY USES.
 * GoatFundedTrader is recorded as `platforms: ['mt5']` while issuing cTrader logins —
 * so a trader adding their real GFT cTrader account was shown MetaTrader 5, one card,
 * and had to find "Show all platforms (4 more)" to reach the platform they were
 * holding in the other tab. A narrowing that depends on our own catalog being complete
 * for every prop firm on earth will keep being wrong in exactly this direction, and
 * being wrong hides the right answer instead of merely offering too many.
 *
 * So the grid is the whole catalog and `status` carries the difference: a platform we
 * do not serve yet is present, badged Soon, and unselectable. That is the same
 * treatment the soon cards already had — it now applies to the firm question too.
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
  const [broker, setBroker] = useState(() => draft.broker || '');

  const isProp = draft.capital_kind === 'prop';

  // The search box is the only thing that narrows the grid now. `searchPlatforms`
  // deliberately does not filter by status, so a Soon platform stays findable by name.
  const cards = useMemo(() => searchPlatforms(query), [query]);

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
      <WizardHeading align="center" title="Which broker or platform?" />

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
