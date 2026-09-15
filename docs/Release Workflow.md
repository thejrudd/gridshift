# Commit and Release Workflow

Read this document only when committing, preparing a release, changing release
metadata, moving tracked bugs to Fixed, or generating release notes.

## Never auto-commit

Do not create commits, bump versions, update release-tracking files solely
because a version was mentioned, or push changes unless the user explicitly
asks.

A statement such as “let's work on v8.7” establishes version context; it is not
permission to commit.

After committing, do not run git push. The user pushes manually.

## Before every commit

1. Ask the user whether open bugs assigned to the target version have actually
   been resolved.
2. Show the current KNOWN_BUGS.md Open entries assigned to the target version
   and obtain explicit user confirmation before moving any entry to Fixed.
3. Do not move version-specific bugs to Fixed based only on implementation
   assumptions.
4. Run the required validation and the historical What's New tour gate.
5. Cross-check release metadata against the actual diff.

## Version-bump checklist

For every commit that bumps the version, update all applicable release files:

1. CHANGELOG.md
2. KNOWN_BUGS.md
3. TO_DO.md
4. package.json
5. README.md
6. src/data/whatsNew.js for feature releases only

Updating package.json is required because the version change forces
vite-plugin-pwa to regenerate the service-worker precache revision. Verify the
derived version display and release URL during validation; do not manually edit
src/components/Sidebar.jsx unless the Sidebar implementation itself changes.

### What's New

For feature releases, ask the user which shipped changes should receive in-app
What's New tour coverage.

Append the new version entry to src/data/whatsNew.js; entries remain oldest
first.

Each feature contains:

- id
- name
- description
- one to three tour steps

Each step includes:

- a route using the applyRoute shape;
- an anchor selector such as data-tour;
- tooltip title;
- tooltip body.

Add missing data-tour attributes where needed. If a newer feature replaces or
materially changes an older toured feature, use supersedes with the older
feature id. Do not rewrite historical entries except to repair broken routes,
anchors, or copy. Patch and bug-fix versions do not receive What's New entries.

## Historical What's New tour gate

Before every commit, invoke the validate-gridshift-tour skill and validate the
complete historical tour, not only the target release.

The gate must:

1. Run npm run validate:tour.
2. Run npm run test:e2e:tour.
3. Validate desktop and mobile routes, anchors, tooltips, and advancement.
4. Evaluate feature evolution across crossed versions and apply supersession
   where newer behavior replaces older behavior.
5. Review staged changes affecting routes, navigation, conditional rendering,
   feature names/copy, tour context/demo state, or data-tour anchor owners.
6. Confirm remaining historical tooltip text accurately describes the current
   UI.
7. Treat mechanical or semantic historical failures as commit blockers.

For upgrades spanning multiple feature versions, validate effective crossed
entries in order after supersession. Do not replay raw historical entries when
doing so would revive obsolete behavior.

A successful build or unit-test run does not replace this gate.

## CHANGELOG.md

- Never use an Unreleased section.
- Every entry belongs to a specific version.
- Entries are chronological: oldest first, newest last.
- If the target version is unclear, ask before writing the entry.

## KNOWN_BUGS.md

Add a bug to Open before fixing it when it is user-visible, a regression, may
survive the current session, or has separate tracking value.

Do not create tracker churn for a trivial implementation mistake discovered and
corrected within the same active task before it reaches a completed state.

If a previously fixed bug recurs, move it back to Open and remove its Fixed In
version. Move bugs to Fixed only at commit time, using the actual committed
version. Never use Unreleased.

## TO_DO.md

- Versioned sections are chronological, earliest first.
- Backlog (Unversioned) remains last.
- Add newly planned features to the appropriate upcoming version or backlog when
  requested or agreed upon.
- Delete completed version sections once shipped; completed work belongs in
  CHANGELOG.md.
- Before committing, cross-check TO_DO.md against CHANGELOG.md and remove
  shipped work.
- The earliest versioned section always represents the next unshipped version.

## README.md

- Features list major features only, one line each.
- What's New shows only the most recently committed version and links to
  CHANGELOG.md for history.
- Roadmap derives major planned versions and significant blocked features from
  TO_DO.md, not backlog polish or unversioned experiments.

## Commit messages

Version or release subjects use:

vX.Y[.Z] - Short Release Theme

Include a short summary sentence and a Highlights list of major shipped
changes. Keep the message aligned with the actual diff, CHANGELOG.md, and
README.md.

## GitHub release notes

When asked for GitHub release notes, return raw Markdown source:

# vX.Y[.Z] - Short Release Theme

Use sections in this order when applicable:

1. ## New Features
2. ## Improvements
3. ## Bug Fixes

Describe changes between the previous released version and the requested
release. Keep bullets user-facing and grouped by feature area.
