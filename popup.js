(async () => {
  const G = globalThis.MLFGeo;
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const city = $('city');
  const suggestions = $('suggestions');
  const radius = $('radius');
  const hideShipping = $('hideShipping');
  const hideAds = $('hideAds');
  const hideUnknown = $('hideUnknown');
  const useFacebook = $('useFacebook');
  const source = $('source');
  const status = $('status');
  const counts = $('counts');
  const unknownBox = $('unknownBox');
  const unknownList = $('unknownList');
  const copyUnknown = $('copyUnknown');
  let unknownSamples = [];

  copyUnknown.addEventListener('click', async () => {
    const text = unknownSamples.join('\n');
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Older copy path, for pages where the clipboard API is not allowed.
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      copied = document.execCommand('copy');
      area.remove();
    }
    copyUnknown.textContent = copied ? 'Copied' : 'Copy failed';
    setTimeout(() => (copyUnknown.textContent = 'Copy'), 1500);
  });

  const stored = await chrome.storage.sync.get('settings');
  let settings = { ...G.DEFAULT_SETTINGS, ...stored.settings };
  // Facebook's own location filter, as last read by the content script.
  let fbLocation = (await chrome.storage.local.get('fbLocation')).fbLocation ?? null;
  // The city table is only needed to check a typed city and to suggest
  // cities, so it loads in the background and the popup shows straight away.
  let table = null;
  let cityIndex = [];
  const getJson = (path) => fetch(chrome.runtime.getURL(path)).then((r) => r.json());
  const tableReady = Promise.all([
    getJson('data/places.json'),
    getJson('data/aliases.json').catch(() => ({})),
  ]).then(([t, aliases]) => {
    table = G.withAliases(t, aliases);
    cityIndex = G.buildCityIndex(table);
  });

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
    hideUnknown.checked = settings.hideUnknown;
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
  hideUnknown.addEventListener('change', () => save({ hideUnknown: hideUnknown.checked }));
  useFacebook.addEventListener('click', () => save({ manualOverride: false }));

  // Editing either field switches to a manual location made of both fields
  // as currently shown, so changing only the radius keeps the shown city.
  async function saveManualLocation() {
    await tableReady;
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

  // Suggestions under the city field while typing: nearest matches first,
  // measured from the location currently in effect.
  let matches = [];
  let active = -1;

  function closeSuggestions() {
    matches = [];
    active = -1;
    suggestions.hidden = true;
    suggestions.replaceChildren();
    city.setAttribute('aria-expanded', 'false');
    city.removeAttribute('aria-activedescendant');
  }

  function highlight(index) {
    active = index;
    [...suggestions.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
    city.setAttribute('aria-activedescendant', `suggestion-${active}`);
  }

  function showSuggestions() {
    if (!table) return tableReady.then(showSuggestions);
    const near = G.effectiveSettings(settings, fbLocation, table).center;
    matches = G.suggestCities(cityIndex, city.value, near);
    if (!matches.length) return closeSuggestions();
    suggestions.replaceChildren(
      ...matches.map((match, i) => {
        const li = document.createElement('li');
        li.id = `suggestion-${i}`;
        li.setAttribute('role', 'option');
        li.textContent = match.label;
        return li;
      }),
    );
    suggestions.hidden = false;
    city.setAttribute('aria-expanded', 'true');
    highlight(0);
  }

  function pickSuggestion(index) {
    city.value = matches[index].label;
    closeSuggestions();
    saveManualLocation();
  }

  city.addEventListener('input', showSuggestions);
  city.addEventListener('keydown', (e) => {
    if (suggestions.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      pickSuggestion(active);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // keep the popup open; just close the list
      closeSuggestions();
    }
  });
  // mousedown, not click, so the field keeps focus and does not fire `change`
  // with the half-typed text first.
  suggestions.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const li = e.target.closest('li');
    if (li) pickSuggestion([...suggestions.children].indexOf(li));
  });
  suggestions.addEventListener('mousemove', (e) => {
    const li = e.target.closest('li');
    if (li) highlight([...suggestions.children].indexOf(li));
  });
  city.addEventListener('blur', closeSuggestions);

  city.addEventListener('change', saveManualLocation);
  radius.addEventListener('change', saveManualLocation);

  // The counts are redrawn only when they change, so the periodic refresh
  // does not take keyboard focus off the "unknown city" toggle.
  let lastCounts = null;

  async function refreshCounts() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const c = await chrome.tabs.sendMessage(tab.id, { type: 'getCounts' });
      if (!c?.active) throw new Error('not on Marketplace');
      const key = JSON.stringify(c);
      if (key === lastCounts) return;
      lastCounts = key;
      counts.textContent = `Hidden: ${c.far} out of range, ${c.ship} shipping, ${c.ad} ads · `;
      const unknownText = `${c.unknown} unknown city${c.unknownHidden ? ' (hidden)' : ''}`;
      unknownSamples = c.unknownSamples ?? [];
      if (c.unknown > 0 && unknownSamples.length) {
        // The phrase opens a list of the location lines that were not recognised.
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'link';
        toggle.textContent = unknownText;
        toggle.setAttribute('aria-expanded', String(!unknownBox.hidden));
        toggle.addEventListener('click', () => {
          unknownBox.hidden = !unknownBox.hidden;
          toggle.setAttribute('aria-expanded', String(!unknownBox.hidden));
        });
        counts.append(toggle);
        unknownList.replaceChildren(
          ...unknownSamples.map((line) => {
            const li = document.createElement('li');
            li.textContent = line;
            return li;
          }),
        );
      } else {
        counts.append(unknownText);
        unknownBox.hidden = true;
      }
    } catch {
      lastCounts = null;
      unknownBox.hidden = true;
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
    setTimeout(refreshCounts, 400); // let the page re-filter first
  });

  render();
  refreshCounts();
  // The page keeps filtering while the popup is open (more listings load as
  // the feed scrolls), so keep the counts current.
  setInterval(refreshCounts, 1500);
})();
