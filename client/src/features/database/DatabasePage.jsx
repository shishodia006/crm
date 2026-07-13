import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { usePageTabs } from '../../hooks/usePageTabs.js';
import ContactsTab from './ContactsTab.jsx';
import CompaniesTab from './CompaniesTab.jsx';
import ListsTab from './ListsTab.jsx';

const TABS = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'companies', label: 'Companies' },
  { key: 'lists', label: 'Lists' },
];

export default function DatabasePage() {
  const [tab, setTab] = useState('contacts');
  const [companyFilter, setCompanyFilter] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);

  const { data: leadsCount } = useResource('/api/leads?limit=1');
  const { data: companiesCount } = useResource('/api/company-directory?limit=1');
  const { data: listsData } = useResource('/api/segments');

  const counts = {
    contacts: leadsCount?.pagination?.total ?? 0,
    companies: companiesCount?.total ?? 0,
    lists: listsData?.segments?.length ?? 0,
  };

  const handleExport = () => { window.location = '/api/leads/export'; };

  const handlePrimaryAction = () => {
    if (tab === 'contacts') setShowAddContact(true);
    else if (tab === 'lists') setShowCreateList(true);
  };

  const primaryLabel = tab === 'lists' ? 'New List' : 'Add Contact';

  const tabsWithBadges = TABS.map((t) => ({ ...t, badge: counts[t.key] }));
  usePageTabs(tabsWithBadges, tab, setTab);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-end flex-wrap gap-2 mb-3">
        <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={handleExport}>
          <i className="bi bi-download me-1" />Export CSV
        </button>
        {tab !== 'companies' && (
          <button className="btn-crm" onClick={handlePrimaryAction}><i className="bi bi-plus-lg" />{primaryLabel}</button>
        )}
      </div>

      {tab === 'contacts' && (
        <ContactsTab
          companyFilter={companyFilter}
          onClearCompanyFilter={() => setCompanyFilter(null)}
          showAddModal={showAddContact}
          onCloseAddModal={() => setShowAddContact(false)}
        />
      )}
      {tab === 'companies' && <CompaniesTab onViewContacts={(name) => { setCompanyFilter(name); setTab('contacts'); }} />}
      {tab === 'lists' && <ListsTab showCreate={showCreateList} onCloseCreate={() => setShowCreateList(false)} />}
    </div>
  );
}
