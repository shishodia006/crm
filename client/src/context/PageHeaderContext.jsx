import { createContext } from 'react';

// Value is the stable `setPageTabs` setter from Layout's useState — pages call
// usePageTabs() to register their tab strip so it renders in the single shared
// topbar instead of a second header block in the page content.
export const PageHeaderContext = createContext(null);
