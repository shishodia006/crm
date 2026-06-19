export default function Table({ columns, rows, onRow, emptyText = 'No records found.' }) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            {columns.map((col) => (
              <th key={col.key ?? col.label} style={col.style} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center text-muted py-4">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={onRow ? () => onRow(row) : undefined}
                style={onRow ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key ?? col.label} className={col.cellClassName}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
