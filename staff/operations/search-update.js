// Update filtered transaction rows without replacing an active search input.
// Replacing the input mid-composition breaks Korean IME (e.g. "다이소" becomes "ㄷㅏㅇㅣㅅㅗ").
export function updateLedgerSearchResults(currentPage, nextPage, page, activeInput) {
 if (!['expenses', 'sales', 'payroll'].includes(page) || activeInput?.id !== 'ledger-search') return false;
 const selector = page === 'expenses' ? '.expense-ledger' : page === 'sales' ? '.sales-ledger' : '.payroll-ledger';
 const currentPanel = currentPage.querySelector(selector);
 const nextPanel = nextPage.querySelector(selector);
 if (!currentPanel || !nextPanel || currentPanel.querySelector('#ledger-search') !== activeInput) return false;
 const oldCount = currentPanel.querySelector('.toolbar-count');
 const newCount = nextPanel.querySelector('.toolbar-count');
 if (!oldCount || !newCount) return false;
 if (page === 'expenses') {
  const selectors = ['.expense-summary-head', '.expense-columns'];
  const pairs = selectors.map(selector => [currentPanel.querySelector(selector), nextPanel.querySelector(selector)]);
  if (pairs.some(([oldNode, newNode]) => !oldNode || !newNode)) return false;
  oldCount.textContent = newCount.textContent;
  for (const [oldNode, newNode] of pairs) oldNode.replaceWith(newNode);
 } else {
  const oldToolbar = currentPanel.querySelector('.toolbar');
  const newToolbar = nextPanel.querySelector('.toolbar');
  if (!oldToolbar || !newToolbar) return false;
  // Only the results change; the toolbar and its in-progress IME composition remain mounted.
  oldCount.textContent = newCount.textContent;
  for (const child of [...currentPanel.children]) if (child !== oldToolbar) child.remove();
  currentPanel.append(...[...nextPanel.children].filter(child => child !== newToolbar));
 }
 return true;
}
