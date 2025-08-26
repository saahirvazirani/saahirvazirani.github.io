// Small enhancements: mobile nav toggle, intersection-based reveal, smooth scroll, footer year, and a basic contact form handler.

(function () {
  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav
  const toggle = document.getElementById('nav-toggle');
  const mobile = document.getElementById('mobile-menu');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const isOpen = mobile.classList.toggle('hidden') === false; // hidden was present -> removed -> now open
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
    // Close menu on link click
    mobile.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        mobile.classList.add('hidden');
        toggle.setAttribute('aria-expanded', 'false');
      })
    );
  }

  // IntersectionObserver: reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    // Fallback
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // Smooth scroll for internal links (native is set via CSS, this is just for offset in some browsers)
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#' || id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.pageYOffset - 72; // account for sticky header
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });

  // Contact form now uses mailto: let the browser handle it.
  const mailForm = document.getElementById('contact-form');
  if (mailForm) {
    mailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = new FormData(mailForm);
      const name = String(data.get('name') || '').trim();
      const body = String(data.get('body') || '').trim();
      const to = 'vaziranisaahir@gmail.com';
      const subject = `Website contact from ${name || 'visitor'}`;
      const message = body + (name ? `\n\n— ${name}` : '');
      const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.location.href = href;
    });
  }
})();
