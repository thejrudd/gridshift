# Prediction Share Cards

Back: [[Home]]

Prediction share cards turn an already completed GridShift season prediction into a fixed-format PNG and a portable link. They do not introduce a second prediction workflow: the card, link, QR code, and later outcome grading all use the same committed snapshot built from `PredictionContext` state.

## Product Contract

- Creation is limited to the current NFL season and the upcoming NFL season. GridShift treats March as the start of a new prediction season: January and February still belong to the season that began in the previous calendar year.
- Export requires a connected Sleeper manager. The manager display name and username come from that connection and cannot be edited in the studio.
- Export remains locked until all 32 records are valid and balanced and all 13 playoff outcomes form a legal, reseeded NFL bracket. Advanced mode additionally requires one valid pick for every one of the 272 regular-season games, with its derived records matching the displayed records.
- **Randomize Predictions** commits the regular season and a complete randomized playoff bracket together, including lowest-remaining-seed reseeding, so its result is immediately eligible for sharing when Sleeper is connected.
- The pick week is derived from the loaded schedule and embedded with the season in the snapshot and card. It is not a freeform field.
- Recipients can view a shared prediction without connecting Sleeper. Opening a shared link does not replace local predictions unless the recipient explicitly chooses **Save as my predictions**.
- Share-card titles are curated. Each of the five card types has 15 title choices; the manager identity, season, and pick-week context remain fixed.

## Snapshot And State

`src/utils/predictionSnapshot.js` owns the versioned `gridshift.prediction-snapshot` schema, validation, schedule fingerprinting, record derivation, and reconstruction of in-app prediction state. Version 1 stores:

- season, pick week, creation time, and prediction mode;
- the connected Sleeper manager identity;
- all 32 final records;
- all 13 playoff selections;
- advanced game picks and a schedule fingerprint when advanced mode is used.

`src/context/PredictionContext.jsx` persists prediction state by season under `gridshift-predictions-v2`. It migrates the previous single-season key once, retains playoff selections with their season, and keeps a one-step local backup when a recipient applies shared predictions. Imported snapshots are validated before they can reach the provider.

## Portable Links And QR Codes

`src/utils/predictionShareCodec.js` creates a versioned, checksummed payload in the URL fragment. The fragment is never sent to a web server as part of the HTTP request, so the first release needs no prediction database or short-link service.

The codec uses browser-native deflate compression when available and enforces strict compressed, expanded, and token-size limits before decoding. Advanced picks use the canonical schedule order rather than repeating hundreds of game IDs; this keeps current links small enough for a practical QR code. As a result, viewing an older advanced snapshot later requires GridShift to retain or load the matching season schedule whose fingerprint is embedded in the snapshot. Record-mode snapshots remain schedule-independent after creation.

The QR code is generated locally from the same URL shown by **Copy link**. Anyone holding the image or link can read the predictions and the included public manager identity, so the studio states that sharing boundary directly.

## Recipient Flow

`src/App.jsx` detects a share token on the Predictions route, decodes and validates it, and displays the shared picks without mutating the recipient's saved state. The banner identifies the sender and season and offers:

- **Open share card** for a currently supported season, preserving the sender's original snapshot and presentation;
- **Save as my predictions**, which requires confirmation, writes the snapshot into its season, and preserves a restorable local backup;
- **Dismiss**, which returns to the recipient's unchanged predictions.

Historical snapshots can be decoded and viewed, but they cannot be used to create a new export or overwrite a current/upcoming prediction season.

## Card System

The renderer lives in `src/components/predictions/share/` and is coordinated by `src/components/ExportPreview.jsx`.

| Card | Content |
|---|---|
| Full board | All 32 projected records grouped by division |
| Champions | Super Bowl, AFC, and NFC winners |
| Division winners | All eight projected division champions |
| Playoff seeding | Seeds 1 through 7 in both conferences |
| Full bracket | Wild Card through Super Bowl selections |

Every card supports a 1080x1080 square or 1080x1350 tall canvas and Broadcast dark or Bright poster theming. `src/components/predictions/share/predictionShareCards.css` owns the fixed export geometry; `src/components/predictionShareExport.css` owns only the responsive studio shell and preview scaling.

## Future Outcome Grading

Outcome grading should consume the immutable snapshot instead of current editable UI state. A later grading schema should record the grading-engine version, final-results fingerprint, category scores, explanation, and letter grade without changing snapshot version 1. Keeping prediction input separate from evaluation makes grades reproducible if the rubric changes.

The first grading pass should separately score record accuracy, division winners, playoff qualification/seeding, round advancement, conference champions, and Super Bowl champion. The exact weights and letter-grade thresholds remain a product decision for that later release.

## Validation Checklist

- Snapshot and codec unit tests cover malformed data, completion gates, season policy, checksum failures, compression limits, and record/advanced round trips.
- Card tests cover every card type, curated-title collection, theme, and canvas size.
- Bracket tests cover NFL lowest-seed reseeding after each round.
- Browser validation should cover a populated shared URL without a Sleeper prompt, non-destructive opening, all five card types, both canvas sizes, both themes, mobile studio fit, link copy, and a real PNG download.
- Before shipping, also run the standard GridShift build, changed-file lint, `git diff --check`, and the release tour gates required by `AGENTS.md`.
