# Commit and Release Workflow

Read this document only when committing, preparing a release, changing release
metadata, moving tracked bugs to Fixed, or generating release notes.

## Never auto-commit

Do not create commits, bump versions, update release-tracking files solely
because a version was mentioned, or push changes unless the user explicitly
asks.

A statement such as “let's work on v8.7” establishes version context; it is not
permission to commit.

After committing, do not run git push. The user pushes manually. The one
exception is a commit to main, covered below.

## Committing to main

A user request to commit or merge to main also authorizes the release and
deploy steps that follow it. After the main commit passes every gate in this
document, finish all of these in the same pass:

1. Push main and the version tag to origin (`git push origin main` and
   `git push origin vX.Y[.Z]`). Tag the main commit `vX.Y[.Z]` if it is not
   tagged yet.
2. Create the GitHub release from that tag, titled `vX.Y[.Z] - Short Release
   Theme`, with release notes written to the GitHub release notes format below:
   `gh release create vX.Y[.Z] --title "vX.Y[.Z] - Short Release Theme"
   --notes-file <notes.md> --latest`.
3. Deploy the tag on the GridShift VPS (SSH host `gridshift`):
   `ssh -t gridshift deploy-gridshift --ref vX.Y[.Z]`. The script lives at
   `/usr/local/bin/deploy-gridshift`, deploys `/opt/gridshift/app` with
   `/opt/gridshift/.env`, keeps the old containers up until the build succeeds,
   and accepts `--force` to redeploy a commit that is already checked out. Do
   not use the repository's `update.sh`; it targets a different install layout.
4. Report the release URL and the deploy result. A failed deploy is not a
   passing step: report the script output and leave the release in place.

Commits to any other branch keep the no-push rule.

## Before every commit

1. Ask the user whether open bugs assigned to the target version have actually
   been resolved.
2. Show the current KNOWN_BUGS.md Open entries assigned to the target version
   and obtain explicit user confirmation before moving any entry to Fixed.
3. Do not move version-specific bugs to Fixed based only on implementation
   assumptions.
4. Review the proposed commit/release scope and its diff. Give the user a
   concise list of genuinely new user-facing capabilities in that scope; do
   not count enhancements or bug fixes as new features. Ask them to confirm or
   correct the list. If there are no new features, say so and ask them to
   confirm that there are none. Do not start the What's New tour gate until
   the user confirms the feature list or confirms that there are no new
   features.
5. Review TO_DO.md against the proposed commit scope and CHANGELOG.md on every
   commit. Update TO_DO.md in the same pass: remove work shipped in this
   commit, reconcile implemented or deferred items, and ensure the earliest
   versioned section still represents the next unshipped release.
6. Show the user the upcoming features currently planned for the next release
   and ask them to confirm they are still in scope or identify changes. Resolve
   the plan and update TO_DO.md before the commit proceeds.
7. Run the required validation and, after that confirmation, the historical
   What's New tour gate.
8. Cross-check release metadata against the actual diff.

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

Before editing src/data/whatsNew.js or running either tour validation command,
inspect the proposed commit/release scope and its diff. Present the candidate
list of genuinely new user-facing capabilities; do not count enhancements or
bug fixes as new features. Ask the user to confirm or correct the list. If no
new features are present, explicitly say so and ask the user to confirm that
there are none. Wait for that confirmation before adding or changing What's New
entries or starting the tour gate.

For feature releases, include which confirmed shipped features the user wants
covered by the in-app What's New tour in the same confirmation. Do not infer
tour coverage from the size of the diff. If the user's correction leaves the
feature list or tour coverage ambiguous, resolve that before proceeding.

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

After the user confirms the new-feature list or confirms that there are no new
features, invoke the validate-gridshift-tour skill and validate the complete
historical tour, not only the target release. Never run the tour validation
commands before that confirmation.

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

`TO_DO.md` is a user-owned local planning document and is intentionally excluded
from Git. Keep the workspace copy available for roadmap reviews and commit
preparation; do not publish or stage it.

- Versioned sections are chronological, earliest first.
- Backlog (Unversioned) remains last.
- Add newly planned features to the appropriate upcoming version or backlog when
  requested or agreed upon.
- Delete completed version sections once shipped; completed work belongs in
  CHANGELOG.md.
- Before committing, cross-check TO_DO.md against CHANGELOG.md and remove
  shipped work.
- Review and update TO_DO.md for every commit, including when the right update
  is to record that the next-release plan remains unchanged. Confirm with the
  user that upcoming features still belong in the next release before each
  commit.
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
