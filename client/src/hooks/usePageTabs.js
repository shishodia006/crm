import { useContext, useEffect } from 'react';
import { PageHeaderContext } from '../context/PageHeaderContext.jsx';

/**
 * Registers a tab strip to render in the shared Layout topbar instead of the
 * page's own content, so a page never shows two stacked header bars.
 * `tabs` should be a stable (module-level) array of { key, label, icon? },
 * `active` the current active key, `onChange` a stable setter (e.g. useState's).
 */
export function usePageTabs(tabs, active, onChange) {
  const setPageTabs = useContext(PageHeaderContext);
  useEffect(() => {
    if (!setPageTabs) return undefined;
    if (!tabs || tabs.length === 0) { setPageTabs(null); return undefined; }
    setPageTabs({ tabs, active, onChange });
    return () => setPageTabs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPageTabs, tabs, active, onChange]);
}
