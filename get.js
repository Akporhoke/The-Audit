// Highlights the matching nav link as each bank section scrolls into view.
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('nav.bank-jump a');
  const sections = document.querySelectorAll('section.bank');

  if (!navLinks.length || !sections.length) return;

  const linkFor = (id) =>
    document.querySelector(`nav.bank-jump a[href="#${id}"]`);

  const setActive = (id) => {
    navLinks.forEach((link) => link.classList.remove('active'));
    const active = linkFor(id);
    if (active) active.classList.add('active');
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActive(entry.target.id);
        }
      });
    },
    {
      // Section counts as "current" once it's near the top of the viewport,
      // just below the sticky nav.
      rootMargin: '-100px 0px -70% 0px',
      threshold: 0,
    }
  );

  sections.forEach((section) => observer.observe(section));

  // Set the first bank active by default on load.
  setActive(sections[0].id);
});
