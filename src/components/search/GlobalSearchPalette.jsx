// ── Global search palette ──────────────────────────────────────────────────
// One search surface, reachable from anywhere with Cmd/Ctrl+K or the search
// button in the top bar or sidebar.
//
// Built on the shared Modal so it inherits Escape-to-close, body scroll locking,
// and useSheetHistory — which is what makes browser back close the palette
// rather than navigating away from the page behind it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Modal from '../Modal.jsx';
import GlobalSearchAnswerCard from './GlobalSearchAnswerCard.jsx';
import GlobalSearchGuide from './GlobalSearchGuide.jsx';
import GlobalSearchResultRow from './GlobalSearchResultRow.jsx';
import { isEmptyQuery, parseGlobalQuery } from '../../utils/globalSearch/parseIntent.js';
import { rankResults } from '../../utils/globalSearch/rank.js';
import { resolveAnswer } from '../../utils/globalSearch/answers/index.js';
import { buildResultDetail } from '../../utils/globalSearch/detail.js';

const GROUP_LIMIT = 6;

// Hover selects on the first pointer *movement* over a row, with no delay and no
// height animation on the expansion.
//
// The earlier design animated the first expansion and waited 120 ms for hover
// intent, which looked considered and felt slow: every row you pointed at owed
// you a third of a second before it admitted it had been pointed at. Responding
// on the same frame is worth more than the transition was.
//
// The delay was there for a real reason — an expanding row shifts the rows below
// it out from under a sweeping cursor, which under `mouseenter` re-selects
// whatever lands beneath the pointer. Tracking `mousemove` instead of
// `mouseenter` is what makes removing the delay safe: a row that arrives under a
// stationary cursor generates no movement, so it cannot steal the selection.

export default function GlobalSearchPalette({
  index,
  status = 'ready',
  darkMode = false,
  onClose,
  onNavigate,
  onCommand,
  onSelectPlayerId,
  onRoute,
  answerData = null,
  notice = null,
  onClearNotice,
  resolvingId = null,
}) {
  const [query, setQuery] = useState('');
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Suppresses hover-driven selection while the arrow keys are driving, so a
  // stationary cursor the list scrolls under does not steal the selection.
  const keyboardNavRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const slots = useMemo(() => parseGlobalQuery(query), [query]);

  const groups = useMemo(() => {
    if (!index || isEmptyQuery(slots)) return [];
    return rankResults(index, slots, { groupLimit: GROUP_LIMIT });
  }, [index, slots]);

  // Flattened in render order, so arrow keys move across group boundaries the
  // way the list reads.
  const flatResults = useMemo(
    () => groups.flatMap((group) => group.results),
    [groups],
  );

  // Clamped during render rather than reset in an effect: the result list can
  // shrink between renders, and a stored index would briefly point past its end.
  const activeIndex = flatResults.length
    ? Math.min(rawActiveIndex, flatResults.length - 1)
    : 0;

  // Answers are additive: a resolver returning null (cold cache, or a query it
  // does not handle) simply means the result list stands on its own.
  const answer = useMemo(() => {
    if (!answerData || !groups.length) return null;
    try {
      return resolveAnswer(slots, groups, answerData);
    } catch {
      // An answer is an enhancement; it must never take the result list down.
      return null;
    }
  }, [answerData, groups, slots]);

  const activeDetail = useMemo(() => {
    const record = flatResults[activeIndex]?.record;
    if (!record) return null;
    return buildResultDetail(record, { index, answerData });
  }, [activeIndex, answerData, flatResults, index]);

  const correction = slots.corrections?.[0] ?? null;

  const handleSelect = useCallback((entry) => {
    if (!entry) return;
    if (entry.record.command) {
      onCommand?.(entry.record.command);
      return;
    }
    onNavigate?.(entry);
  }, [onCommand, onNavigate]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!flatResults.length) return;
      event.preventDefault();
      keyboardNavRef.current = true;
      setActiveIndex((previous) => {
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = previous + delta;
        if (next < 0) return flatResults.length - 1;
        if (next >= flatResults.length) return 0;
        return next;
      });
      return;
    }

    if (event.key === 'Enter') {
      if (!flatResults.length) return;
      event.preventDefault();
      handleSelect(flatResults[activeIndex]);
    }
  }, [activeIndex, flatResults, handleSelect]);

  // Keep the whole expanded row in view, detail included.
  useEffect(() => {
    if (!keyboardNavRef.current) return;
    const node = listRef.current?.querySelector('[data-active-shell="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, activeDetail]);

  // Pointer movement, not entry — see the note at the top of the file.
  const handlePointerMove = useCallback((position) => {
    keyboardNavRef.current = false;
    setActiveIndex((previous) => (previous === position ? previous : position));
  }, []);

  // An index that failed to load is reported, not silently shown as an empty
  // result list that looks like the query simply matched nothing.
  const failed = status === 'error';
  const loading = status === 'loading' || status === 'idle';
  const showGuide = !failed && (!query.trim() || (!groups.length && loading));
  let flatCursor = -1;

  return (
    <Modal
      onClose={onClose}
      mobileSheet
      ariaLabel="Search GridShift"
      containerClassName="global-search-panel"
    >
      <div className="global-search">
        <div className="global-search__header">
          <svg
            className="global-search__icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="global-search__input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              onClearNotice?.();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search players, teams, weeks, your league…"
            aria-label="Search GridShift"
            role="combobox"
            aria-expanded={flatResults.length > 0}
            aria-controls="global-search-results"
            aria-activedescendant={
              flatResults.length ? `global-search-option-${activeIndex}` : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
          {query ? (
            <button
              type="button"
              className="global-search__clear"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>

        {correction ? (
          <div className="global-search__correction">
            Showing results for <strong>{correction.to}</strong>
          </div>
        ) : null}

        {notice ? (
          <p className="global-search__notice" role="status">{notice}</p>
        ) : null}

        <div
          className="global-search__results"
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          ref={listRef}
        >
          {showGuide ? (
            <GlobalSearchGuide onExample={(example) => {
              setQuery(example);
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
            />
          ) : null}

          {!showGuide && !failed && answer ? (
            <GlobalSearchAnswerCard
              answer={answer}
              onSelectPlayer={onSelectPlayerId}
              onRoute={onRoute}
            />
          ) : null}

          {failed ? (
            <p className="global-search__empty">
              Search is unavailable — the index could not be loaded.
            </p>
          ) : null}

          {!showGuide && !failed && !groups.length ? (
            <p className="global-search__empty">
              No matches for “{query.trim()}”.
            </p>
          ) : null}

          {!showGuide && !failed && groups.map((group) => (
            <div key={group.kind} className="global-search__group">
              <div className="global-search__group-label">{group.label}</div>
              {group.results.map((entry) => {
                flatCursor += 1;
                const position = flatCursor;
                return (
                  <div
                    key={`${entry.record.kind}:${entry.record.id}`}
                    data-active-shell={position === activeIndex ? 'true' : undefined}
                    onMouseMove={() => handlePointerMove(position)}
                  >
                    <GlobalSearchResultRow
                      id={`global-search-option-${position}`}
                      entry={entry}
                      active={position === activeIndex}
                      resolving={entry.record.id === resolvingId}
                      detail={position === activeIndex ? activeDetail : null}
                      darkMode={darkMode}
                      onSelect={handleSelect}
                      onRoute={onRoute}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="global-search__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </Modal>
  );
}
