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
  city.value = settings.centerLabel;
  radius.value = settings.radiusMiles;
  hideShipping.checked = settings.hideShipping;
  hideAds.checked = settings.hideAds;

  function showStatus(error) {
    status.className = error ? '' : 'hint';
    status.textContent = error || (settings.center ? '' : 'Set your city to filter by distance');
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
      counts.textContent =
        `Hidden: ${c.far} out of range, ${c.ship} shipping, ${c.ad} ads · ` +
        `${c.unknown} unknown city`;
    } catch {
      counts.textContent = 'Open Facebook Marketplace to see counts';
    }
  }

  showStatus('');
  refreshCounts();
})();
