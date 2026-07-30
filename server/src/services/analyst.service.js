import { getSetting } from './settings.service.js';
import { pipelineSnapshot, businessHealth, actionRequired, leadSourceTrends, monthlyGoals, dripSequences, liveActivity } from './overview.service.js';
import { revenueBySource, agentLeaderboard, responseTimeSla, regionalBreakdown } from './customReport.service.js';

export async function buildAnalystContext(companyId) {
  const [funnel, health, action, sources, goals, drip, activity, revenue, agents, responseTime, regions] = await Promise.all([
    pipelineSnapshot(companyId),
    businessHealth(companyId),
    actionRequired(companyId),
    leadSourceTrends(companyId),
    monthlyGoals(companyId),
    dripSequences(companyId),
    liveActivity(companyId),
    revenueBySource(companyId),
    agentLeaderboard(companyId),
    responseTimeSla(companyId),
    regionalBreakdown(companyId)
  ]);

  return {
    pipeline_funnel: funnel,
    business_health: health,
    stalled_deals: action.items.slice(0, 20),
    stalled_deals_summary: { count: action.count, at_risk_value: action.atRiskValue },
    lead_sources: sources.sources,
    lead_source_insight: sources.insight,
    monthly_goals: goals,
    drip_campaigns: drip.campaigns.map((c) => ({ name: c.name, status: c.status, enrolled: c.enrolled, converted: c.converted, openRate: c.openRate, clickRate: c.clickRate, insight: c.insight })),
    drip_totals: drip.totals,
    recent_activity: activity,
    revenue_by_source: revenue,
    agent_leaderboard: agents,
    response_time_by_channel: responseTime,
    regional_breakdown: regions
  };
}

const SYSTEM_PROMPT = `You are Dot Domino CRM's in-app analyst. You answer questions about the user's pipeline, leads, and campaigns using ONLY the JSON data provided below — never invent numbers that aren't in it. If the data needed to answer isn't present, say so plainly instead of guessing.

Style: short paragraphs and bullet points, bold the key numbers/stage names using **double asterisks**, and end with one concrete, specific next action you could take for them (e.g. offer to list deals, draft an email, or pull a different cut of the data).

CRM DATA SNAPSHOT (JSON):
`;

export async function askAnalyst(companyId, priorMessages, question) {
  const apiUrl = (await getSetting('ai_api_url', '', companyId)).trim();
  const apiKey = (await getSetting('ai_api_key', '', companyId)).trim();
  if (!apiUrl || !apiKey) {
    const err = new Error('AI provider is not configured for this company.');
    err.code = 'ai_provider_not_configured';
    throw err;
  }
  const model = await getSetting('ai_model', '', companyId);
  const context = await buildAnalystContext(companyId);

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}${JSON.stringify(context)}` },
    ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question }
  ];

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || undefined, messages })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'AI provider request failed');
  const reply = payload?.choices?.[0]?.message?.content || payload?.output_text || '';
  if (!reply) throw new Error('AI provider returned an empty response.');
  return reply;
}
