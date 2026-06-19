import { q, scalar } from '../db/pool.js';

export async function index(req, res) {
  const items = await q(
    'SELECT id,title,body,link,is_read,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 10',
    [req.user.id]
  );
  const unread = Number(await scalar('SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0', [req.user.id]));
  res.json({ unread, items: items.map((item) => ({ ...item, id: Number(item.id), is_read: Boolean(item.is_read) })) });
}
