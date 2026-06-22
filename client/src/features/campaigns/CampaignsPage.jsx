import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const STATUS_COLOR = { active: 'success', paused: 'warning', draft: 'secondary', completed: 'primary' };

function ChannelPill({ icon, color, sent, delivered, label }) {
  if (!sent) return null;
  const pct = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  return (
    <div className="d-flex align-items-center gap-1 text-11" title={`${label}: ${sent} sent, ${delivered} delivered (${pct}%)`}>
      <i className={`bi ${icon}`} style={{ color, fontSize: 12 }} />
      <span className="fw-semibold">{sent}</span>
      {delivered > 0 && (
        <span className="text-muted">/ <span className="text-success fw-semibold">{delivered}</span></span>
      )}
    </div>
  );
}

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
                <th style={{ minWidth: 130 }}>MESSAGES</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-5">No campaigns yet.</td>
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
                    {(c.wa_sent > 0 || c.sms_sent > 0 || c.rcs_sent > 0 || c.email_sent > 0) ? (
                      <div className="d-flex flex-column gap-1">
                        <ChannelPill icon="bi-whatsapp"       color="#25D366" sent={Number(c.wa_sent||0)}    delivered={Number(c.wa_delivered||0)}  label="WhatsApp" />
                        <ChannelPill icon="bi-chat-dots"      color="#6c757d" sent={Number(c.sms_sent||0)}   delivered={Number(c.sms_delivered||0)} label="SMS" />
                        <ChannelPill icon="bi-chat-square-dots" color="#0dcaf0" sent={Number(c.rcs_sent||0)} delivered={Number(c.rcs_delivered||0)} label="RCS" />
                        <ChannelPill icon="bi-envelope"       color="#6f42c1" sent={Number(c.email_sent||0)} delivered={Number(c.email_opened||0)}  label="Email" />
                      </div>
                    ) : (
                      <span className="text-muted text-12">—</span>
                    )}
                  </td>
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
