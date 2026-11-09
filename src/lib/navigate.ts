export const navigate = (path: string) => {
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== path) window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};
