(async () => {
  const G = globalThis.MLFGeo;
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const city = $('city');
  const radius = $('radius');
  const hideShipping = $('hideShipping');
  const hideAds = $('hideAds');
  const status = $('status');
  const counts = $('counts');

  const stored = await chrome.storage.sync.get('settings');
  let settings = { ...G.DEFAULT_SETTINGS, ...stored.settings };
  const table = await fetch(chrome.runtime.getURL('data/places.json')).then((r) => r.json());

  enabled.checked = settings.enabled;
  hideShipping.checked = settings.hideShipping;
  hideAds.checked = settings.hideAds;

  let facebookHint = ''; // set when the page is using Facebook's own location

  // Fills the city and radius fields: Facebook's location (read-only) while
  // the page is matching it, otherwise the saved settings.
  function showLocation(page) {
    const shown = G.popupLocation(settings, page);
    city.value = shown.city;
    radius.value = shown.radius;
    city.disabled = radius.disabled = shown.locked;
    facebookHint = shown.locked ? "Using the location set in Facebook's filter" : '';
  }

  function showStatus(error) {
    status.className = error ? '' : 'hint';
    status.textContent =
      error || facebookHint || (settings.center ? '' : 'Set your city to filter by distance');
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    showStatus('');
    setTimeout(refreshCounts, 400); // let the page re-filter first
  }

  enabled.addEventListener('change', () => save({ enabled: enabled.checked }));
  hideShipping.addEventListener('change', () => save({ hideShipping: hideShipping.checked }));
  hideAds.addEventListener('change', () => save({ hideAds: hideAds.checked }));

  city.addEventListener('change', () => {
    const label = city.value.trim();
    if (!label) return save({ centerLabel: '', center: null });
    const loc = G.parseLocationLine(label);
    const coords = loc && G.lookup(table, loc.city, loc.state);
    if (!coords) return showStatus('City not found — use the form "City, ST"');
    return save({ centerLabel: label, center: coords });
  });

  radius.addEventListener('change', () => {
    const miles = Number(radius.value);
    if (!radius.value.trim() || !Number.isFinite(miles) || miles < 1 || miles > 500) {
      return showStatus('Radius must be 1–500 miles');
    }
    return save({ radiusMiles: miles });
  });

  async function refreshCounts() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const c = await chrome.tabs.sendMessage(tab.id, { type: 'getCounts' });
      if (!c?.active) throw new Error('not on Marketplace');
      showLocation(c);
      if (!status.textContent || status.className === 'hint') showStatus('');
      counts.textContent =
        `Hidden: ${c.far} out of range, ${c.ship} shipping, ${c.ad} ads · ` +
        `${c.unknown} unknown city`;
    } catch {
      showLocation(null);
      if (status.className === 'hint') showStatus('');
      counts.textContent = 'Open Facebook Marketplace to see counts';
    }
  }

  showLocation(null);
  showStatus('');
  refreshCounts();
})();
