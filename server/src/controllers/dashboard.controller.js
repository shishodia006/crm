import { q, one, scalar } from '../db/pool.js';
import { ok } from '../utils/response.js';

export async function index(req, res) {
  const days = 30;
  const pendingTaskCount = Number(await scalar(
    'SELECT COUNT(*) FROM tasks WHERE done=0 AND (assigned_to=? OR assigned_to IS NULL)',
    [req.user.id]
  ));
  const stats = {
    total_leads: Number(await scalar('SELECT COUNT(*) FROM leads')),
    new_today: Number(await scalar('SELECT COUNT(*) FROM leads WHERE DATE(created_at)=CURDATE()')),
    hot_leads: Number(await scalar("SELECT COUNT(*) FROM leads WHERE category IN ('hot','sales_ready')")),
    converted: Number(await scalar("SELECT COUNT(*) FROM leads WHERE status='won'")),
    revenue: Number(await scalar('SELECT COALESCE(SUM(amount),0) FROM revenue_records WHERE YEAR(recorded_at)=YEAR(NOW())')),
    active_campaigns: Number(await scalar("SELECT COUNT(*) FROM campaigns WHERE status='active'")),
    pending_tasks: pendingTaskCount,
    active_agents: Number(await scalar("SELECT COUNT(*) FROM users WHERE role IN ('agent','manager') AND is_active=1"))
  };
  const dripStats = await one(
    `SELECT
       COUNT(DISTINCT CASE WHEN le.status='active' THEN le.id END) AS active_enrollments,
       COUNT(DISTINCT CASE WHEN le.status='converted' THEN le.id END) AS total_converted,
       COUNT(DISTINCT CASE WHEN DATE(cm.sent_at)=CURDATE() THEN cm.id END) AS msgs_today,
       ROUND(SUM(CASE WHEN cm.channel='email' AND cm.status='opened' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END)
        /NULLIF(SUM(CASE WHEN cm.channel='email' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END),0)*100,1) AS email_open_rate,
       ROUND(SUM(CASE WHEN cm.channel='whatsapp' AND cm.status='opened' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END)
        /NULLIF(SUM(CASE WHEN cm.channel='whatsapp' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END),0)*100,1) AS wa_read_rate,
       COUNT(DISTINCT CASE WHEN DATE(cm.sent_at)=CURDATE() AND cm.status='failed' THEN cm.id END) AS failed_today
     FROM lead_enrollments le LEFT JOIN communications cm ON cm.enrollment_id=le.id`
  );
  const channelRows = await q(
    `SELECT channel, COUNT(*) AS sent, SUM(status IN ('opened','clicked','read','delivered')) AS delivered, SUM(status='failed') AS failed
     FROM communications WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY channel`
  );
  const channelSends = Object.fromEntries(channelRows.map((row) => [row.channel, row]));
  const dailyLeads = await q(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total FROM leads
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date ASC`
  );
  const sourceStats = await q(
    `SELECT ls.name AS source, ls.slug, COUNT(l.id) AS total, SUM(l.status='won') AS won
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id GROUP BY l.source_id ORDER BY total DESC`
  );
  const categoryStats = await q('SELECT category, COUNT(*) AS total FROM leads GROUP BY category');
  const funnelStats = await q(
    `SELECT ps.name AS stage, COUNT(d.id) AS total FROM pipeline_stages ps
     LEFT JOIN deals d ON d.stage_id=ps.id WHERE ps.is_lost=0
     GROUP BY ps.id, ps.name ORDER BY ps.stage_order ASC`
  );
  const recentLeads = await q(
    `SELECT l.*, ls.name AS source_name FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id ORDER BY l.created_at DESC LIMIT 10`
  );
  const pendingTasks = await q(
    `SELECT t.*, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id
     WHERE t.done=0 AND t.assigned_to=? ORDER BY t.due_at ASC LIMIT 8`,
    [req.user.id]
  );
  ok(res, { stats, dripStats, channelSends, dailyLeads, sourceStats, categoryStats, funnelStats, recentLeads, pendingTasks });
}

export async function dailyStats(req, res) {
  const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
  const data = await q(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total FROM leads
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
     GROUP BY DATE(created_at) ORDER BY date ASC`
  );
  ok(res, { rows: data });
}
