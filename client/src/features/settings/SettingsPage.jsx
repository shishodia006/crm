import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/settings/profile", label: "Profile", icon: "person" },
  { to: "/settings/team", label: "Team", icon: "people" },
  { to: "/settings/general", label: "General", icon: "sliders" },
  { to: "/settings/integrations", label: "Integrations", icon: "plug" },
  { to: "/settings/pipeline", label: "Pipeline Stages", icon: "kanban" },
  { to: "/settings/billing", label: "Billing", icon: "credit-card" },
];
export default function SettingsPage() {
  return (
    <div>
      <div className="row g-3 mt-3">
        <div className="col-lg-3 crm-settings-nav-sticky">
          <div className="mb-4">
            <h5 className="fw-bold mb-0 text-brand">Settings</h5>
            <div className="text-muted text-12">
              Account, team, and ecosystem configuration.
            </div>
          </div>
          <div className="card crm-card">
            <div className="card-body p-2">
              <nav className="d-flex flex-column gap-1">
                {TABS.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      `crm-settings-nav-item${isActive ? " active" : ""}`
                    }
                  >
                    <i className={`bi bi-${tab.icon}`} />
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </div>  
          </div>
        </div>
        <div className="col-lg-9">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
