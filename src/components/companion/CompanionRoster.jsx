import { useState } from 'react';
import CompanionLeague from './CompanionLeague';

/**
 * Compatibility entry point for the former single-team Roster route.
 *
 * Rosters now has one canonical implementation in CompanionLeague. App-level
 * routing should pass routeState/onRouteStateChange so the selected roster and
 * Draft Picks subview remain URL-addressable. The local state fallback keeps
 * legacy mounts interactive while old routes are being normalized.
 */
export default function CompanionRoster({
  onTradePlayer,
  onViewPlayer,
  tradeDisabled = false,
  tradeDisabledTitle = 'Trade is not available for the connected platform.',
  routeState = null,
  onRouteStateChange = null,
}) {
  const [localRouteState, setLocalRouteState] = useState({ subView: 'roster', rosterId: null });
  const resolvedRouteState = routeState ?? localRouteState;
  const handleRouteStateChange = onRouteStateChange ?? setLocalRouteState;

  return (
    <CompanionLeague
      onTradePlayer={onTradePlayer}
      onViewPlayer={onViewPlayer}
      tradeDisabled={tradeDisabled}
      tradeDisabledTitle={tradeDisabledTitle}
      routeState={resolvedRouteState}
      onRouteStateChange={handleRouteStateChange}
    />
  );
}
