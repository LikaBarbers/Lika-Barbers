(() => {
  'use strict';

  const lang = document.documentElement.lang === 'en' ? 'en' : 'sq';
  const dayNames = {
    sq: { monday: 'E hënë', tuesday: 'E martë', wednesday: 'E mërkurë', thursday: 'E enjte', friday: 'E premte', saturday: 'E shtunë', sunday: 'E diel' },
    en: { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }
  };
  const labels = {
    sq: { closed: 'Mbyllur', offer: 'Ofertë', details: 'Shiko ofertën' },
    en: { closed: 'Closed', offer: 'Promotion', details: 'View offer' }
  };

  const menuButton = document.querySelector('[data-menu-button]');
  const navigation = document.querySelector('[data-navigation]');
  if (menuButton && navigation) {
    const closeMenu = () => {
      navigation.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };
    menuButton.addEventListener('click', () => {
      const open = navigation.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-open', open);
    });
    navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    window.addEventListener('resize', () => { if (window.innerWidth > 980) closeMenu(); });
  }

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  function renderSchedule(schedule) {
    const target = document.querySelector('[data-schedule]');
    if (!target || !schedule) return;
    target.innerHTML = Object.entries(dayNames[lang]).map(([key, name]) => {
      const day = schedule[key] || { closed: true };
      const hours = day.closed ? `<span class="closed">${labels[lang].closed}</span>` : `<span>${day.open} – ${day.close}</span>`;
      return `<div class="schedule-row"><strong>${name}</strong>${hours}</div>`;
    }).join('');
  }

  function renderGallery(gallery) {
    const target = document.querySelector('[data-gallery]');
    if (!target || !Array.isArray(gallery) || gallery.length === 0) return;
    target.innerHTML = gallery.map(item => {
      const alt = lang === 'sq' ? item.altSq : item.altEn;
      const caption = lang === 'sq' ? item.captionSq : item.captionEn;
      return `<figure class="gallery-card"><img src="${escapeAttribute(item.image)}" alt="${escapeAttribute(alt || '')}" loading="lazy" width="1200" height="1000"><figcaption class="gallery-caption">${escapeHtml(caption || '')}</figcaption></figure>`;
    }).join('');
  }

  function renderPromotions(promotions) {
    const section = document.querySelector('[data-promotions-section]');
    const target = document.querySelector('[data-promotions]');
    if (!section || !target) return;
    const active = (promotions || []).filter(item => item.active !== false);
    if (!active.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    target.innerHTML = active.map(item => {
      const title = lang === 'sq' ? item.titleSq : item.titleEn;
      const description = lang === 'sq' ? item.descriptionSq : item.descriptionEn;
      const action = item.link ? `<a class="btn btn-primary" href="${escapeAttribute(item.link)}" target="_blank" rel="noopener">${labels[lang].details}</a>` : '';
      return `<article class="promotion-shell"><img class="promotion-image" src="${escapeAttribute(item.image)}" alt="${escapeAttribute(title)}" loading="lazy"><div class="promotion-copy"><p class="eyebrow">${labels[lang].offer}</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description || '')}</p>${action}</div></article>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  fetch('/api/site', { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Could not load site data')))
    .then(data => {
      renderSchedule(data.schedule);
      renderGallery(data.gallery);
      renderPromotions(data.promotions);
    })
    .catch(error => console.warn(error.message));
})();
