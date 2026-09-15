# Flat Data Surface — Implementation

Load only when implementing. The rules live in SKILL.md.

## Markup

One table per scope. Groups are `tbody` elements, not separate tables, so a
single `thead` serves them all.

```jsx
<section className="surface-section">
  <table aria-label={`${scopeLabel} standings`}>
    <colgroup>{COLUMNS.map((c) => <col key={c.key} className={`col--${c.key}`} />)}</colgroup>
    <thead>
      <tr>
        {COLUMNS.map((c) => (
          <th key={c.key} scope="col">
            {abbreviate && c.short ? <abbr title={c.full}>{c.short}</abbr> : c.full}
          </th>
        ))}
      </tr>
    </thead>
    {groups.map((group) => (
      <tbody key={group.id}>
        <tr className="group-row">
          <th colSpan={COLUMNS.length} scope="colgroup">
            <span className="group-name">{group.label}</span>
            <span className="group-scope">{scopeLabel}</span>
          </th>
        </tr>
        {group.rows.map((row) => <Row key={row.id} row={row} />)}
      </tbody>
    ))}
  </table>
</section>
```

`scope="colgroup"` on the group row and a distinct `aria-label` per table keep
the flattened structure readable to assistive technology.

## Sticky header

`position: sticky` on `thead` or `tr` is unreliable with `border-collapse:
collapse`. Use `separate` and stick the cells.

```css
.surface-table {
  width: 100%;
  table-layout: fixed;      /* uniform columns across every group */
  border-collapse: separate;
  border-spacing: 0;
}

.surface-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--color-bg);
  /* Shield the scroll container's top padding: without this, rows show in the
     band above the frozen header. Overhang is clipped by the container. */
  box-shadow: 0 -40px 0 var(--color-bg);
}
```

Find the real offset before choosing the shield depth:

```js
const th = document.querySelector('thead th');
let el = th, owner = null;
while (el && el !== document.body) {
  const cs = getComputedStyle(el);
  if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { owner = el; break; }
  el = el.parentElement;
}
({ stickyTop: th.getBoundingClientRect().top, ownerTop: owner?.getBoundingClientRect().top,
   padTop: owner && getComputedStyle(owner).paddingTop });
```

The gap between `ownerTop` and `stickyTop` is the band to shield.

## Uniform rows

```css
.surface-table td {
  height: 54px;            /* acts as a floor; keep content from exceeding it */
  vertical-align: middle;
}

.surface-row-name {
  white-space: nowrap;     /* wrapping here is what makes groups uneven */
}
```

`height` on a cell is a minimum, not a cap. Content taller than the row still
grows it, so the wrap has to be prevented rather than hidden — clipping the
overflow would truncate identity, which the rules forbid.

## Narrowing tiers

Two independent media queries, not one. Column labels abbreviate well before the
identity column gets tight, so binding both to one breakpoint either clips names
or abbreviates far too early.

```jsx
const abbreviate = useMediaQuery('(max-width: 1179px)'); // short column labels
const compact = useMediaQuery('(max-width: 639px)');     // drop secondary identity
```

Derive the upper boundary rather than guessing:

```
required = rankCol + identityCol(widest real value) + (metricCols × count)
boundary = required + sidebarWidth + horizontalPadding
```

Measure `sidebarWidth` and the container padding in the running app; a collapsed
sidebar only adds slack, so a boundary computed with it expanded is safe.

## Measurement snippet

Run at each tier boundary, one pixel below it, and at the narrowest width.

```js
const table = document.querySelector('.surface-table');
const container = document.querySelector('.surface-root');
const th = [...document.querySelectorAll('.surface-table thead th')];
const names = [...document.querySelectorAll('.surface-row-name')];
const rows = [...document.querySelectorAll('.surface-row')];
JSON.stringify({
  vw: window.innerWidth,
  tableW: Math.round(table.getBoundingClientRect().width),
  containerW: container.clientWidth,
  headerClipped: th.filter((h) => h.scrollWidth > h.clientWidth + 1).map((h) => h.textContent),
  nameClipped: [...new Set(names.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent))],
  distinctRowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
  docOverflow: document.documentElement.scrollWidth > window.innerWidth,
}, null, 1);
```

Pass condition: both clipped arrays empty, `distinctRowHeights` length 1,
`docOverflow` false.

## Two-scope hand-off

With one sticky header per scope, the first header is pushed out by the second
as the boundary crosses — sticky cannot escape its own table. Both headers are
briefly visible during that hand-off; that is correct and self-resolving. Do not
try to suppress it by merging the tables.

A blank region captured mid-scroll is usually a transient paint, not a layout
bug. Confirm with `elementFromPoint` before chasing it.
