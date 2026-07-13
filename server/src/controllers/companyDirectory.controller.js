import { q, scalar } from '../db/pool.js';
import { ok } from '../utils/response.js';

export async function index(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
  const offset = (page - 1) * perPage;

  const total = Number(await scalar(
    "SELECT COUNT(DISTINCT company) FROM leads WHERE company_id=? AND company IS NOT NULL AND company<>''",
    [req.companyId]
  ));

  const companies = await q(
    `SELECT l.company AS name, MAX(l.industry) AS industry,
            COUNT(DISTINCT l.id) AS contacts, COUNT(DISTINCT d.id) AS deals,
            COALESCE(SUM(d.value),0) AS value
     FROM leads l LEFT JOIN deals d ON d.lead_id=l.id AND d.company_id=?
     WHERE l.company_id=? AND l.company IS NOT NULL AND l.company<>''
     GROUP BY l.company ORDER BY value DESC, contacts DESC LIMIT ${perPage} OFFSET ${offset}`,
    [req.companyId, req.companyId]
  );

  ok(res, { companies, total, page, lastPage: Math.ceil(total / perPage) || 1 });
}
