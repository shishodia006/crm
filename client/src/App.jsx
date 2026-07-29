import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { useAuth } from './hooks/useAuth.js';
import Layout from './components/layout/Layout.jsx';
import LoadingBox from './components/common/LoadingBox.jsx';

import LoginPage from './features/auth/LoginPage.jsx';
import RegisterPage from './features/auth/RegisterPage.jsx';
import ForgotPage from './features/auth/ForgotPage.jsx';
import ResetPage from './features/auth/ResetPage.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import MasterDashboardPage from './features/dashboard/MasterDashboardPage.jsx';
import LeadsPage from './features/leads/LeadsPage.jsx';
import LeadDetail from './features/leads/LeadDetail.jsx';
import LeadForm from './features/leads/LeadForm.jsx';
import PipelinePage from './features/pipeline/PipelinePage.jsx';
import DealDetail from './features/pipeline/DealDetail.jsx';
import DealForm from './features/pipeline/DealForm.jsx';
import CampaignsPage from './features/campaigns/CampaignsPage.jsx';
import CampaignForm from './features/campaigns/CampaignForm.jsx';
import WorkflowBuilder from './features/campaigns/WorkflowBuilder.jsx';
import SimpleBuilder from './features/campaigns/SimpleBuilder.jsx';
import TemplatesPage from './features/templates/TemplatesPage.jsx';
import TemplateForm from './features/templates/TemplateForm.jsx';
import BroadcastsPage from './features/broadcasts/BroadcastsPage.jsx';
import TasksPage from './features/tasks/TasksPage.jsx';
import ConversationsPage from './features/conversations/ConversationsPage.jsx';
import ReportsPage from './features/reports/ReportsPage.jsx';
import SettingsPage from './features/settings/SettingsPage.jsx';
import GeneralSettings from './features/settings/GeneralSettings.jsx';
import UsersSettings from './features/settings/UsersSettings.jsx';
import IntegrationsSettings from './features/settings/IntegrationsSettings.jsx';
import SourcesSettings from './features/settings/SourcesSettings.jsx';
import PipelineSettings from './features/settings/PipelineSettings.jsx';
import AiAgentsSettings from './features/settings/AiAgentsSettings.jsx';
import ChannelsPage from './features/settings/ChannelsPage.jsx';
import AnalystPage from './features/analyst/AnalystPage.jsx';
import DatabasePage from './features/database/DatabasePage.jsx';
import ProfileSettings from './features/settings/ProfileSettings.jsx';
import TeamSettings from './features/settings/TeamSettings.jsx';
import BillingSettings from './features/settings/BillingSettings.jsx';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <LoadingBox height="100vh" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <LoadingBox height="100vh" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
        <BrowserRouter>
          <Routes>
            {/* Guest routes */}
            <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="/forgot-password" element={<GuestOnly><ForgotPage /></GuestOnly>} />
            <Route path="/reset-password/:token" element={<GuestOnly><ResetPage /></GuestOnly>} />

            {/* App routes */}
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/master-dashboard" element={<MasterDashboardPage />} />
              <Route path="/database" element={<DatabasePage />} />

              {/* Leads */}
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/new" element={<LeadForm />} />
              <Route path="/leads/:id" element={<LeadDetail />} />
              <Route path="/leads/:id/edit" element={<LeadForm />} />

              {/* Pipeline */}
              <Route path="/pipeline" element={<PipelinePage />} />
              <Route path="/deals/new" element={<DealForm />} />
              <Route path="/deals/:id" element={<DealDetail />} />

              {/* Campaigns */}
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/new" element={<CampaignForm />} />
              <Route path="/campaigns/:id" element={<CampaignsPage />} />
              <Route path="/campaigns/:id/builder" element={<WorkflowBuilder />} />
              <Route path="/campaigns/:id/simple-builder" element={<SimpleBuilder />} />

              {/* Broadcasts */}
              <Route path="/broadcasts" element={<BroadcastsPage />} />

              {/* Templates */}
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/templates/new" element={<TemplateForm />} />
              <Route path="/templates/:id" element={<TemplateForm />} />

              {/* Conversations */}
              <Route path="/conversations" element={<ConversationsPage />} />

              {/* Tasks */}
              <Route path="/tasks" element={<TasksPage />} />

              {/* Reports */}
              <Route path="/reports" element={<ReportsPage />} />

              {/* My Analyst */}
              <Route path="/analyst" element={<AnalystPage />} />

              {/* Standalone admin pages */}
              <Route path="/sources" element={<SourcesSettings />} />
              <Route path="/integrations" element={<IntegrationsSettings />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/users" element={<UsersSettings />} />
              <Route path="/ai-agents" element={<AiAgentsSettings />} />
              <Route path="/revenue" element={<ReportsPage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />}>
                <Route index element={<Navigate to="/settings/profile" replace />} />
                <Route path="profile" element={<ProfileSettings />} />
                <Route path="team" element={<TeamSettings />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route path="users" element={<UsersSettings />} />
                <Route path="pipeline" element={<PipelineSettings />} />
                <Route path="billing" element={<BillingSettings />} />
              </Route>
            </Route>

            {/* 404 fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
