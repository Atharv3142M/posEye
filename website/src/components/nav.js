export function initNav(activePage = 'home') {
  const themeBtn = document.getElementById('theme-toggle');
  const root = document.documentElement;
  const stored = localStorage.getItem('posEye-theme');
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const initial = stored || (prefersLight ? 'light' : 'dark');
  applyTheme(initial, false);

  function applyTheme(theme, persist = true) {
    document.body.classList.toggle('light', theme === 'light');
    root.dataset.theme = theme;
    if (persist) localStorage.setItem('posEye-theme', theme);
    if (themeBtn) {
      themeBtn.textContent = theme === 'light' ? '☾' : '☼';
      themeBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      themeBtn.setAttribute('title', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#f5f7f3' : '#080b0d';
  }

  themeBtn?.addEventListener('click', () => {
    applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
  });

  // Follow OS preference only until the visitor explicitly chooses a theme.
  window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', event => {
    if (!localStorage.getItem('posEye-theme')) applyTheme(event.matches ? 'light' : 'dark', false);
  });

  const mobileToggle = document.getElementById('mobile-menu-toggle');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  if (mobileToggle && mobileDrawer) {
    mobileToggle.addEventListener('click', () => {
      const open = mobileDrawer.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', String(open));
    });
    mobileDrawer.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      mobileDrawer.classList.remove('open');
      mobileToggle.setAttribute('aria-expanded', 'false');
    }));
  }
}
