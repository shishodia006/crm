import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import Table from '../../components/common/Table.jsx';

export default function SourcesSettings() {
  const { data, loading } = useResource('/api/settings/sources');
  const sources = data?.sources ?? [];

  const columns = [
    { label: 'Name', key: 'name' },
    { label: 'Slug', render: (r) => <code className="small">{r.slug}</code> },
    { label: 'Category', key: 'category' },
    { label: 'Leads', render: (r) => <span className="badge bg-secondary">{r.lead_count}</span> },
    { label: 'Ingest URL', render: (r) => (
      <code className="small">/ingest/{r.slug}</code>
    )},
  ];

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <h6 className="fw-semibold mb-3">Lead Sources</h6>
        {loading ? <LoadingBox /> : <Table columns={columns} rows={sources} />}
      </div>
    </div>
  );
}
