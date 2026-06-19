import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/settings/general', label: 'General', icon: 'sliders' },
  { to: '/settings/users', label: 'Users', icon: 'people' },
  { to: '/settings/integrations', label: 'Integrations', icon: 'plug' },
  { to: '/settings/sources', label: 'Lead Sources', icon: 'funnel' },
  { to: '/settings/pipeline', label: 'Pipeline Stages', icon: 'kanban' },
];

export default function SettingsPage() {
  return (
    <>
      <h4 className="fw-bold mb-4">Settings</h4>
      <div className="row g-3">
        <div className="col-lg-2">
          <nav className="nav flex-column gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `nav-link rounded px-3 py-2 d-flex align-items-center gap-2 text-14 ${isActive ? 'bg-primary text-white' : 'text-body'}`
                }
              >
                <i className={`bi bi-${tab.icon}`} />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="col-lg-10">
          <Outlet />
        </div>
      </div>
    </>
  );
}
