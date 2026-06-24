import { useNavigate, useParams } from 'react-router-dom';
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

function CampaignAnalytics({ campaignId }) {
  const navigate = useNavigate();
  const { data, loading } = useResource(`/api/campaigns/${campaignId}`);
  if (loading) return <LoadingBox />;
  const campaign = data?.campaign;
  if (!campaign) return <div className="alert alert-warning">Campaign not found.</div>;
  const stats = data?.stats ?? {};
  const steps = data?.stepAnalytics ?? [];
  const maxSent = Math.max(1, ...steps.map((step) => Number(step.sent || 0)));
  const rate = (value, total) => total ? `${Math.round((Number(value || 0) / Number(total)) * 100)}%` : '—';

  return (
    <div>
      <div className="d-flex align-items-center mb-4 gap-2">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/campaigns')}><i className="bi bi-arrow-left" /></button>
        <div className="me-auto"><h4 className="fw-bold mb-0">{campaign.name}</h4><div className="text-muted text-12">Flow performance & drop-off analysis</div></div>
        <button className="btn btn-crm btn-crm-sm" onClick={() => navigate(`/campaigns/${campaign.id}/builder`)}><i className="bi bi-diagram-3 me-1" />Open Builder</button>
      </div>

      <div className="row g-3 mb-4">
        {[
          ['Enrolled', stats.total || 0, 'people', 'primary'], ['Active', stats.active || 0, 'lightning', 'warning'],
          ['Converted', stats.converted || 0, 'check2-circle', 'success'], ['Exited', stats.exited || 0, 'box-arrow-right', 'secondary'],
        ].map(([label, value, icon, color]) => <div className="col-6 col-lg-3" key={label}><div className="card border-0 shadow-sm"><div className="card-body py-3 d-flex align-items-center gap-3"><i className={`bi bi-${icon} fs-4 text-${color}`} /><div><div className="text-muted text-11">{label}</div><div className="fs-4 fw-bold">{value}</div></div></div></div></div>)}
      </div>

      <div className="card border-0 shadow-sm mb-4"><div className="card-body p-4"><h6 className="fw-bold mb-1">Step performance</h6><p className="text-muted text-12 mb-3">Drop-off is calculated from the highest sending step in this workflow.</p>
        {steps.length === 0 ? <div className="text-muted text-13 py-3">No workflow activity yet.</div> : <div className="table-responsive"><table className="table align-middle mb-0 crm-table"><thead><tr><th>STEP</th><th>SENT / DROP-OFF</th><th>DELIVERED</th><th>READ / OPEN</th><th>CLICKED</th><th>REPLIED</th><th>FAILED</th></tr></thead><tbody>{steps.map((step) => {
          const sent = Number(step.sent || 0); const drop = Math.max(0, maxSent - sent);
          return <tr key={step.step_id}><td><span className="badge text-bg-light border me-2">#{step.step_order}</span><span className="text-capitalize fw-semibold">{String(step.type || '').replaceAll('_', ' ')}</span></td><td style={{ minWidth: 160 }}><div className="d-flex justify-content-between text-11 mb-1"><span>{sent} sent</span><span className="text-muted">{drop ? `${drop} drop-off` : '—'}</span></div><div className="progress" style={{ height: 6 }}><div className="progress-bar bg-primary" style={{ width: `${Math.round((sent / maxSent) * 100)}%` }} /></div></td><td>{step.delivered} <span className="text-muted text-11">({rate(step.delivered, sent)})</span></td><td>{step.read_or_opened} <span className="text-muted text-11">({rate(step.read_or_opened, sent)})</span></td><td>{step.clicked}</td><td>{step.replied}</td><td className={Number(step.failed) ? 'text-danger fw-semibold' : ''}>{step.failed}</td></tr>;
        })}</tbody></table></div>}
      </div></div>

      <div className="card border-0 shadow-sm"><div className="card-body p-4"><h6 className="fw-bold mb-3">Channel performance</h6><div className="row g-3">{(data?.channels ?? []).map((channel) => <div className="col-md-3 col-6" key={channel.channel}><div className="border rounded-3 p-3"><div className="text-capitalize fw-semibold">{channel.channel}</div><div className="text-muted text-12 mt-1">{channel.sent} sent · {channel.delivered} delivered</div><div className="text-success text-12 mt-1">{channel.replied || 0} replies</div></div></div>)}</div></div></div>
    </div>
  );
}

export default function CampaignsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/campaigns');
  const campaigns = data?.campaigns ?? [];

  if (id) return <CampaignAnalytics campaignId={id} />;

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
