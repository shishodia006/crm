export default function StatCard({ title, value, icon, color = 'primary', sub }) {
  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-body d-flex align-items-center gap-3">
        <div
          className={`crm-stat-icon bg-${color} bg-opacity-10 rounded-3 d-flex align-items-center justify-content-center`}
        >
          <i className={`bi bi-${icon} fs-4 text-${color}`} />
        </div>
        <div className="flex-grow-1 min-w-0">
          <div className="text-muted small mb-1">{title}</div>
          <div className="fs-4 fw-bold lh-1">{value ?? '—'}</div>
          {sub && <div className="text-muted small mt-1">{sub}</div>}
        </div>
      </div>
    </div>
  );
}
