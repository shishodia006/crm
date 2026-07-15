import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import { usePageTabs } from '../../hooks/usePageTabs.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import BroadcastsTab from './BroadcastsTab.jsx';
import TemplatesTab from './TemplatesTab.jsx';

function CampaignAnalytics({ campaignId }) {
  const navigate = useNavigate();
  const { data, loading } = useResource(`/api/campaigns/${campaignId}`);
  if (loading) return <LoadingBox />;
  const campaign = data?.campaign;
  if (!campaign) return <div className="alert alert-warning">Campaign not found.</div>;
  const stats = data?.stats ?? {};
  const steps = data?.stepAnalytics ?? [];
  const maxSent = Math.max(1, ...steps.map((step) => Number(step.sent || 0)));
  const rate = (value, total) => (total ? `${Math.round((Number(value || 0) / Number(total)) * 100)}%` : '—');

  return (
    <div>
      <div className="d-flex align-items-center mb-4 gap-2">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/campaigns')}><i className="bi bi-arrow-left" /></button>
        <div className="me-auto"><h4 className="fw-bold mb-0">{campaign.name}</h4><div className="text-muted text-12">Flow performance & drop-off analysis</div></div>
        <button className="btn btn-crm btn-crm-sm" onClick={() => navigate(`/campaigns/${campaign.id}/simple-builder`)}><i className="bi bi-diagram-3 me-1" />Open Builder</button>
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

const TABS = [
  { key: 'sequences', label: 'Drip Sequences' },
  { key: 'broadcasts', label: 'Broadcasts' },
  { key: 'templates', label: 'Templates' },
  { key: 'builder', label: 'Builder' },
];

const CHANNEL_ICON = { email: 'envelope-fill', whatsapp: 'whatsapp', sms: 'chat-dots-fill', rcs: 'phone-vibrate-fill' };

function SequenceCard({ campaign, onToggleStatus, onOpenAnalytics, onOpenBuilder, onDelete }) {
  return (
    <div className="col-md-6">
      <div className="card crm-card h-100">
        <div className="card-body p-4">
          <div className="d-flex justify-content-between align-items-start mb-1">
            <div className="crm-link fw-bold text-15" onClick={() => onOpenAnalytics(campaign.id)}>{campaign.name}</div>
            <span className={`badge badge-crm badge-${campaign.status === 'active' ? 'live' : 'draft'}`}>
              {campaign.status === 'active' ? 'Active' : campaign.status === 'paused' ? 'Paused' : campaign.status}
            </span>
          </div>
          <div className="text-muted text-12 mb-3">
            {campaign.step_count} step{campaign.step_count === 1 ? '' : 's'}
            {campaign.channels?.length > 0 && (
              <> &middot; {campaign.channels.map((ch) => <i key={ch} className={`bi bi-${CHANNEL_ICON[ch]} ms-1`} title={ch} />)}</>
            )}
          </div>

          <div className="row g-2 text-center mb-3">
            <div className="col-3"><div className="fw-bold text-16">{campaign.enrolled ?? 0}</div><div className="text-11 text-muted-3">Enrolled</div></div>
            <div className="col-3"><div className="fw-bold text-16 icon-green">{campaign.open_rate}%</div><div className="text-11 text-muted-3">Opens</div></div>
            <div className="col-3"><div className="fw-bold text-16 icon-amber">{campaign.click_rate}%</div><div className="text-11 text-muted-3">Clicks</div></div>
            <div className="col-3"><div className="fw-bold text-16 icon-green">{campaign.converted ?? 0}</div><div className="text-11 text-muted-3">Converted</div></div>
          </div>

          {campaign.insight && (
            <div className={`crm-insight-banner ${campaign.insight.type} mb-3`}>
              <i className="bi bi-lightbulb-fill" />{campaign.insight.text}
            </div>
          )}

          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary flex-grow-1" onClick={() => onOpenBuilder(campaign.id)}>
              <i className="bi bi-diagram-3 me-1" />Builder
            </button>
            <button className={`btn btn-sm flex-grow-1 ${campaign.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`} onClick={() => onToggleStatus(campaign)}>
              {campaign.status === 'active' ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-sm btn-outline-danger" title="Delete sequence" onClick={() => onDelete(campaign)}>
              <i className="bi bi-trash3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SequencesTab({ onOpenAnalytics, onOpenBuilder }) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useResource('/api/campaigns');
  const campaigns = data?.campaigns ?? [];

  const toggleStatus = async (c) => {
    try {
      if (c.status === 'active') { await api.post(`/api/campaigns/${c.id}/pause`, {}); toast('Sequence paused.', 'warning'); }
      else { await api.post(`/api/campaigns/${c.id}/activate`, {}); toast('Sequence activated.', 'success'); }
      reload();
    } catch (err) { toast(err.message, 'danger'); }
  };

  const deleteSequence = async (c) => {
    if (!(await confirm(`Delete "${c.name}"? This will remove its steps and enrollment history and cannot be undone.`, { title: 'Delete sequence' }))) return;
    try { await api.delete(`/api/campaigns/${c.id}`); toast('Sequence deleted.', 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  if (loading) return <LoadingBox />;
  if (campaigns.length === 0) {
    return (
      <div className="card crm-card"><div className="card-body crm-empty">
        <i className="bi bi-lightning-charge crm-empty-icon" />
        <div className="crm-empty-title">No drip sequences yet</div>
        <div className="crm-empty-sub">Create one to start automating follow-ups.</div>
        <button className="btn-crm mt-3" onClick={() => navigate('/campaigns/new')}><i className="bi bi-plus-lg" />New Sequence</button>
      </div></div>
    );
  }
  return <div className="row g-3">{campaigns.map((c) => <SequenceCard key={c.id} campaign={c} onToggleStatus={toggleStatus} onOpenAnalytics={onOpenAnalytics} onOpenBuilder={onOpenBuilder} onDelete={deleteSequence} />)}</div>;
}

function BuilderPicker({ onOpen }) {
  const { data, loading } = useResource('/api/campaigns');
  const campaigns = data?.campaigns ?? [];
  if (loading) return <LoadingBox />;
  if (campaigns.length === 0) return <p className="text-muted text-center py-5">No sequences to edit yet — create one first.</p>;
  return (
    <div className="card crm-card"><div className="card-body p-4">
      <h6 className="fw-bold mb-3 text-brand">Choose a sequence to edit</h6>
      <div className="list-group">
        {campaigns.map((c) => (
          <button key={c.id} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onClick={() => onOpen(c.id)}>
            <span className="fw-semibold">{c.name}</span>
            <span className="text-muted text-12">{c.step_count} steps</span>
          </button>
        ))}
      </div>
    </div></div>
  );
}

export default function CampaignsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('sequences');
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  usePageTabs(id ? null : TABS, tab, setTab);

  if (id) return <CampaignAnalytics campaignId={id} />;

  const handlePrimaryAction = () => {
    if (tab === 'sequences') navigate('/campaigns/new');
    else if (tab === 'broadcasts') setShowBroadcastModal(true);
    else if (tab === 'templates') navigate('/templates/new');
  };

  const primaryLabel = tab === 'broadcasts' ? 'New Broadcast' : tab === 'templates' ? 'New Template' : 'New Sequence';

  return (
    <div>
      <div className="d-flex align-items-center justify-content-end flex-wrap gap-2 mb-3">
        <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={() => navigate('/reports')}>
          <i className="bi bi-bell me-1" />Drip Report
        </button>
        {tab !== 'builder' && (
          <button className="btn-crm" onClick={handlePrimaryAction}><i className="bi bi-plus-lg" />{primaryLabel}</button>
        )}
      </div>

      {tab === 'sequences' && (
        <SequencesTab
          onOpenAnalytics={(cid) => navigate(`/campaigns/${cid}`)}
          onOpenBuilder={(cid) => navigate(`/campaigns/${cid}/simple-builder`)}
        />
      )}
      {tab === 'broadcasts' && <BroadcastsTab showCreate={showBroadcastModal} onCloseCreate={() => setShowBroadcastModal(false)} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'builder' && <BuilderPicker onOpen={(cid) => navigate(`/campaigns/${cid}/simple-builder`)} />}
    </div>
  );
}
