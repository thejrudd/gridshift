/**
 * Flat data table (Stage 5.1): rows divided by hairlines on the page surface,
 * meta-styled column headers, no frame. Mark a clickable row with
 * `className="is-interactive"` plus a keyboard handler; it then shows hover,
 * active, and focus states. Cell alignment: right by default (numbers),
 * `is-start` for identity columns, `is-center` for marks.
 */
export default function DataTable({ children, label = undefined, className = '', scrollClassName = '', minWidth = undefined }) {
  return (
    <div className={`gs-table-scroll ${scrollClassName}`.trim()}>
      <table className={`gs-table ${className}`.trim()} aria-label={label} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}
