import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const STATUS_COLOR = { active: 'success', paused: 'warning', draft: 'secondary', completed: 'primary' };

export default function CampaignsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/campaigns');
  const campaigns = data?.campaigns ?? [];

  const toggleStatus = async (c) => {
    try {
      if (c.status === 'active') {
        await api.post(`/api/campaigns/${c.id}/pause`, {});
        toast('Campaign paused.', 'warning');
      } else {
        await api.post(`/api/campaigns/${c.id}/activate`, {});
        toast('Campaign activated.', 'success');
      }
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  return (
    <>
      <div className="d-flex align-items-center mb-4">
        <h4 className="fw-bold mb-0 me-auto d-flex align-items-center gap-2">
          <i className="bi bi-send text-brand" />Campaigns
        </h4>
        <button className="btn btn-crm btn-crm-sm" onClick={() => navigate('/campaigns/new')}>
          <i className="bi bi-plus-lg" />New Campaign
        </button>
      </div>

      <div className="card border-0 shadow-sm">
        {loading ? <LoadingBox /> : (
          <table className="table table-hover align-middle mb-0 crm-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th>ENROLLED</th>
                <th>ACTIVE</th>
                <th>CONVERTED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-5">No campaigns yet.</td>
                </tr>
              ) : campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span
                      className="fw-semibold text-primary crm-link"
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                    >
                      {c.name}
                    </span>
                    {c.description && (
                      <div className="text-muted text-11 mt-1">{c.description}</div>
                    )}
                  </td>
                  <td className="text-13 text-muted">{c.type}</td>
                  <td>
                    <span className={`badge text-bg-${STATUS_COLOR[c.status] ?? 'secondary'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="text-13">{c.enrolled ?? 0}</td>
                  <td className="text-13">{c.active_leads ?? ''}</td>
                  <td className="text-13">{c.converted ?? ''}</td>
                  <td>
                    <div className="d-flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn btn-outline-secondary btn-sm text-13 px-3"
                        onClick={() => navigate(`/campaigns/${c.id}/builder`)}
                      >
                        Builder
                      </button>
                      <button
                        className={`btn btn-sm text-13 px-3 ${c.status === 'active' ? 'btn-warning' : 'btn-success'}`}
                        onClick={() => toggleStatus(c)}
                      >
                        {c.status === 'active' ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
