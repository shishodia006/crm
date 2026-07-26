const { dealsStore, dealsShow } = await import('./src/controllers/pipeline.controller.js');

const fakeReq1 = { companyId: 1, body: { title: 'Test Deal Fields', lead_id: 1, stage_id: 1, value: 1000, probability: 50, expected_close_date: '2026-08-01', notes: 'This is a test note.' } };
let out1 = null;
await dealsStore(fakeReq1, { json: (b) => { out1 = b; } });
console.log('Create result:', JSON.stringify(out1));

const dealId = out1.data.id;
const fakeReq2 = { companyId: 1, params: { id: String(dealId) } };
let out2 = null;
await dealsShow(fakeReq2, { json: (b) => { out2 = b; } });
console.log('Show result — expected_close_date:', out2.data.deal.expected_close_date, '| notes:', out2.data.deal.notes, '| status:', out2.data.deal.status);

// cleanup
const mysql = (await import('mysql2/promise')).default;
const conn = await mysql.createConnection({ host:'127.0.0.1', port:3306, user:'root', password:'', database:'dotdomino_crm_dev' });
await conn.query('DELETE FROM deals WHERE id=?', [dealId]);
await conn.end();
