(() => {
  'use strict';

  const elements = {
    loading: document.querySelector('#loadingPanel'),
    setup: document.querySelector('#setupPanel'),
    login: document.querySelector('#loginPanel'),
    dashboard: document.querySelector('#dashboard'),
    logout: document.querySelector('#logoutButton'),
    scheduleEditor: document.querySelector('#scheduleEditor'),
    galleryList: document.querySelector('#galleryList'),
    promotionList: document.querySelector('#promotionList')
  };

  const days = [
    ['monday', 'E hënë'], ['tuesday', 'E martë'], ['wednesday', 'E mërkurë'],
    ['thursday', 'E enjte'], ['friday', 'E premte'], ['saturday', 'E shtunë'], ['sunday', 'E diel']
  ];
  let siteData = { schedule: {}, gallery: [], promotions: [] };

  function show(name) {
    ['loading', 'setup', 'login', 'dashboard'].forEach(key => { elements[key].hidden = key !== name; });
    elements.logout.hidden = name !== 'dashboard';
  }

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Kërkesa nuk u realizua.');
    return data;
  }

  function status(form, message = '', type = '') {
    const target = form.querySelector('[data-status]');
    if (!target) return;
    target.textContent = message;
    target.className = `status ${type}`;
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button, input, textarea').forEach(control => { control.disabled = busy; });
  }


  function fileToData(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Zgjidhni një foto.'));
      if (file.size > 4 * 1024 * 1024) return reject(new Error('Fotoja është shumë e madhe. Maksimumi është 4 MB.'));
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
      reader.onerror = () => reject(new Error('Fotoja nuk mund të lexohej.'));
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  async function boot() {
    try {
      const state = await request('/api/admin/status');
      if (state.authenticated) return openDashboard();
      show(state.needsSetup ? 'setup' : 'login');
    } catch (error) {
      elements.loading.querySelector('p').textContent = error.message;
    }
  }

  async function openDashboard() {
    show('dashboard');
    siteData = await request('/api/site');
    renderSchedule();
    renderGallery();
    renderPromotions();
  }

  function renderSchedule() {
    elements.scheduleEditor.innerHTML = days.map(([key, label]) => {
      const day = siteData.schedule[key] || { open: '10:00', close: '21:00', closed: false };
      return `<div class="schedule-edit-row" data-day="${key}">
        <strong>${label}</strong>
        <label>Hapet <input type="time" name="${key}-open" value="${escapeHtml(day.open || '10:00')}"></label>
        <label>Mbyllet <input type="time" name="${key}-close" value="${escapeHtml(day.close || '21:00')}"></label>
        <label><input type="checkbox" name="${key}-closed" ${day.closed ? 'checked' : ''}> Mbyllur</label>
      </div>`;
    }).join('');
  }

  function renderGallery() {
    const items = siteData.gallery || [];
    elements.galleryList.innerHTML = items.length ? items.map(item => `<article class="item-card">
      <img src="${escapeHtml(item.image)}" alt="">
      <div class="item-copy"><h3>${escapeHtml(item.captionSq || 'Foto pa titull')}</h3><p>${escapeHtml(item.captionEn || '')}</p></div>
      <div class="item-actions"><button class="btn btn-danger" type="button" data-delete-gallery="${escapeHtml(item.id)}">Fshi</button></div>
    </article>`).join('') : '<p class="empty">Nuk ka foto në galeri.</p>';
  }

  function renderPromotions() {
    const items = siteData.promotions || [];
    elements.promotionList.innerHTML = items.length ? items.map(item => `<article class="item-card">
      <img src="${escapeHtml(item.image)}" alt="">
      <div class="item-copy"><h3>${escapeHtml(item.titleSq)}</h3><p><span class="badge">${item.active === false ? 'E fshehur' : 'Aktive'}</span> ${escapeHtml(item.titleEn)}</p></div>
      <div class="item-actions"><button class="btn btn-secondary" type="button" data-toggle-promotion="${escapeHtml(item.id)}" data-active="${item.active !== false}">${item.active === false ? 'Aktivizo' : 'Fshihe'}</button><button class="btn btn-danger" type="button" data-delete-promotion="${escapeHtml(item.id)}">Fshi</button></div>
    </article>`).join('') : '<p class="empty">Nuk ka reklama.</p>';
  }

  document.querySelector('#setupForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('password') !== data.get('confirmPassword')) return status(form, 'Fjalëkalimet nuk përputhen.', 'error');
    setBusy(form, true); status(form, 'Po krijohet…');
    try {
      await request('/api/admin/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: data.get('password') }) });
      form.reset(); await openDashboard();
    } catch (error) { status(form, error.message, 'error'); }
    finally { setBusy(form, false); }
  });

  document.querySelector('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true); status(form, 'Po identifikohet…');
    try {
      await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: data.get('password') }) });
      form.reset(); await openDashboard();
    } catch (error) { status(form, error.message, 'error'); }
    finally { setBusy(form, false); }
  });

  document.querySelector('#scheduleForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const schedule = {};
    days.forEach(([key]) => {
      schedule[key] = {
        open: form.elements[`${key}-open`].value,
        close: form.elements[`${key}-close`].value,
        closed: form.elements[`${key}-closed`].checked
      };
    });
    setBusy(form, true); status(form, 'Po ruhet…');
    try {
      const result = await request('/api/admin/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedule) });
      siteData.schedule = result.schedule; status(form, 'Orari u ruajt.', 'success');
    } catch (error) { status(form, error.message, 'error'); }
    finally { setBusy(form, false); }
  });

  document.querySelector('#galleryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true); status(form, 'Po ngarkohet fotoja…');
    try {
      const payload = {
        image: await fileToData(form.elements.image.files[0]),
        captionSq: data.get('captionSq'), captionEn: data.get('captionEn'),
        altSq: data.get('altSq'), altEn: data.get('altEn')
      };
      const item = await request('/api/admin/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      siteData.gallery.unshift(item); renderGallery(); form.reset(); status(form, 'Fotoja u shtua.', 'success');
    } catch (error) { status(form, error.message, 'error'); }
    finally { setBusy(form, false); }
  });

  document.querySelector('#promotionForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(form, true); status(form, 'Po publikohet reklama…');
    try {
      const payload = {
        image: await fileToData(form.elements.image.files[0]),
        titleSq: data.get('titleSq'), titleEn: data.get('titleEn'),
        descriptionSq: data.get('descriptionSq'), descriptionEn: data.get('descriptionEn'),
        link: data.get('link')
      };
      const item = await request('/api/admin/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      siteData.promotions.unshift(item); renderPromotions(); form.reset(); status(form, 'Reklama u publikua.', 'success');
    } catch (error) { status(form, error.message, 'error'); }
    finally { setBusy(form, false); }
  });

  elements.galleryList.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-gallery]');
    if (!button || !confirm('Ta fshij këtë foto?')) return;
    button.disabled = true;
    try {
      await request(`/api/admin/gallery/${encodeURIComponent(button.dataset.deleteGallery)}`, { method: 'DELETE' });
      siteData.gallery = siteData.gallery.filter(item => item.id !== button.dataset.deleteGallery); renderGallery();
    } catch (error) { alert(error.message); button.disabled = false; }
  });

  elements.promotionList.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-promotion]');
    const toggleButton = event.target.closest('[data-toggle-promotion]');
    if (deleteButton) {
      if (!confirm('Ta fshij këtë reklamë?')) return;
      deleteButton.disabled = true;
      try {
        await request(`/api/admin/promotions/${encodeURIComponent(deleteButton.dataset.deletePromotion)}`, { method: 'DELETE' });
        siteData.promotions = siteData.promotions.filter(item => item.id !== deleteButton.dataset.deletePromotion); renderPromotions();
      } catch (error) { alert(error.message); deleteButton.disabled = false; }
    }
    if (toggleButton) {
      toggleButton.disabled = true;
      const active = toggleButton.dataset.active !== 'true';
      try {
        const updated = await request(`/api/admin/promotions/${encodeURIComponent(toggleButton.dataset.togglePromotion)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) });
        const index = siteData.promotions.findIndex(item => item.id === updated.id);
        if (index >= 0) siteData.promotions[index] = updated;
        renderPromotions();
      } catch (error) { alert(error.message); toggleButton.disabled = false; }
    }
  });

  elements.logout.addEventListener('click', async () => {
    try { await request('/api/admin/logout', { method: 'POST' }); } catch (_) {}
    show('login');
  });

  boot();
})();
