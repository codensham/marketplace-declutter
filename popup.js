(async () => {
  const G = globalThis.MLFGeo;
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const city = $('city');
  const radius = $('radius');
  const hideShipping = $('hideShipping');
  const hideAds = $('hideAds');
  const useFacebook = $('useFacebook');
  const source = $('source');
  const status = $('status');
  const counts = $('counts');

  const stored = await chrome.storage.sync.get('settings');
  let settings = { ...G.DEFAULT_SETTINGS, ...stored.settings };
  // Facebook's own location filter, as last read by the content script.
  let fbLocation = (await chrome.storage.local.get('fbLocation')).fbLocation ?? null;
  const table = await fetch(chrome.runtime.getURL('data/places.json')).then((r) => r.json());

  function showError(message) {
    status.textContent = message;
  }

  // Fills the city and radius fields and says where they came from.
  function render() {
    const shown = G.popupLocation(settings, fbLocation);
    city.value = shown.city;
    radius.value = shown.radius;
    enabled.checked = settings.enabled;
    hideShipping.checked = settings.hideShipping;
    hideAds.checked = settings.hideAds;
    useFacebook.hidden = !settings.manualOverride;
    if (shown.source === 'facebook') {
      source.textContent = "Matching Facebook's location. Edit to override.";
    } else if (settings.manualOverride) {
      source.textContent = 'Using your own location.';
    } else if (settings.center) {
      source.textContent = "Facebook's location not read yet; using your saved city.";
    } else {
      source.textContent = 'Open Marketplace to pick up its location, or enter a city.';
    }
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    showError('');
    render();
    setTimeout(refreshCounts, 400); // let the page re-filter first
  }

  enabled.addEventListener('change', () => save({ enabled: enabled.checked }));
  hideShipping.addEventListener('change', () => save({ hideShipping: hideShipping.checked }));
  hideAds.addEventListener('change', () => save({ hideAds: hideAds.checked }));
  useFacebook.addEventListener('click', () => save({ manualOverride: false }));

  // Editing either field switches to a manual location made of both fields
  // as currently shown, so changing only the radius keeps the shown city.
  function saveManualLocation() {
    const label = city.value.trim();
    const loc = G.parseLocationLine(label);
    const coords = loc && G.lookup(table, loc.city, loc.state);
    if (!coords) return showError('City not found — use the form "City, ST"');
    const miles = Number(radius.value);
    if (!radius.value.trim() || !Number.isFinite(miles) || miles < 1 || miles > 500) {
      return showError('Radius must be 1–500 miles');
    }
    return save({ manualOverride: true, centerLabel: label, center: coords, radiusMiles: miles });
  }

  city.addEventListener('change', saveManualLocation);
  radius.addEventListener('change', saveManualLocation);

  async function refreshCounts() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const c = await chrome.tabs.sendMessage(tab.id, { type: 'getCounts' });
      if (!c?.active) throw new Error('not on Marketplace');
      counts.textContent =
        `Hidden: ${c.far} out of range, ${c.ship} shipping, ${c.ad} ads · ` +
        `${c.unknown} unknown city`;
    } catch {
      // A Marketplace tab that does not answer was open before the extension
      // was installed or reloaded, so the filter is not running in it.
      const url = tab?.url ?? '';
      counts.textContent = url.startsWith('https://www.facebook.com/marketplace')
        ? 'Refresh this tab to start filtering'
        : 'Open Facebook Marketplace to see counts';
    }
  }

  // The content script reports a new location as soon as Facebook's changes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.fbLocation) return;
    fbLocation = changes.fbLocation.newValue ?? null;
    render();
  });

  render();
  refreshCounts();
})();
