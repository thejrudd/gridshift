# NFL Predictor - QA Checklist

Use this file only when explicitly doing QA, manual validation, regression testing,
or test-plan review. Do not pull it into normal implementation context by default.

---

## Matchup QA

1. Open `Companion -> Matchup`.
2. Change the week once or twice.
   Expected: the URL updates each time and the selected week in the UI matches it.
3. Refresh the page on a non-default week.
   Expected: the same week stays selected after reload.
4. Open any player modal from Matchup.
   Expected: the modal opens normally; no URL change is required.
5. While that modal is open, change the week.
   Expected: the modal closes and the new week becomes the visible state.
6. Use browser back/forward after changing weeks.
   Expected: the UI week always tracks the URL correctly.

## Upgrade QA

1. Open `Trade -> Upgrade`.
2. Wait a second, then run a first search.
   Expected: first search should feel lighter than before.
3. Change one setting without rerunning:
   target player, outgoing players, posture, picks.
   Expected: the old results stay visible.
4. After changing a setting, look for the stale-results notice.
   Expected: the UI tells you the filters changed and you need to run the search again.
5. Run the search again with the updated settings.
   Expected: results refresh cleanly without a blank or broken transition.
6. Run the same search twice.
   Expected: repeated search should feel warm and more immediate.

## Trade Consistency QA

1. In `Trade -> Agent`, pick a partner and build a simple trade context.
2. Move to `Intelligence`.
   Expected: no stale state, no contradictory framing, no unusual lag.
3. Move to `Upgrade`.
   Expected: no stale partner context, no obviously broken value behavior, no blank carryover state.
4. Switch to a different partner and repeat once.
   Expected: the old partner's context does not leak into the new one.
5. Go back and forth between `Agent`, `Intelligence`, and `Upgrade`.
   Expected: navigation stays responsive and state remains coherent.
