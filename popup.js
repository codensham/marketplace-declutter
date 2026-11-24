(async () => {
  const G = globalThis.MLFGeo;
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const hideShipping = $('hideShipping');
  const hideAds = $('hideAds');
  const hideUnknown = $('hideUnknown');
  const grace = $('grace');
  const priceMin = $('priceMin');
  const priceMax = $('priceMax');
  const priceHint = $('priceHint');
  const graceInfo = $('graceInfo');
  const graceHelp = $('graceHelp');
  const source = $('source');
  const counts = $('counts');
  const unknownBox = $('unknownBox');
  const unknownList = $('unknownList');
  const copyUnknown = $('copyUnknown');
  const farBox = $('farBox');
  const farList = $('farList');
  let unknownSamples = [];

  $('graceLabel').textContent = `Allow ${G.GRACE_MILES} mi past the radius`;
  graceHelp.textContent =
    `Recommended. Facebook's location isn't 100% accurate, and distances here are ` +
    `straight lines between town centres, so a town a few miles past your radius ` +
    `is usually just as close. With this on, only towns more than ${G.GRACE_MILES} ` +
    `miles past the radius are hidden.`;
  graceInfo.addEventListener('click', () => {
    graceHelp.hidden = !graceHelp.hidden;
    graceInfo.setAttribute('aria-expanded', String(!graceHelp.hidden));
  });

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

  // Shows the toggles and the area being filtered, which is always
  // Marketplace's own location filter.
  function render() {
    enabled.checked = settings.enabled;
    hideShipping.checked = settings.hideShipping;
    hideAds.checked = settings.hideAds;
    hideUnknown.checked = settings.hideUnknown;
    grace.checked = settings.grace;
    priceMin.value = settings.priceMin ?? '';
    priceMax.value = settings.priceMax ?? '';
    source.textContent = fbLocation
      ? `${fbLocation.city}, ${fbLocation.state} · within ${Math.round(fbLocation.radiusMiles)} mi (from Facebook)`
      : 'Open Marketplace so its location can be read.';
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    render();
    setTimeout(refreshCounts, 400); // let the page re-filter first
  }

  enabled.addEventListener('change', () => save({ enabled: enabled.checked }));
  hideShipping.addEventListener('change', () => save({ hideShipping: hideShipping.checked }));
  hideAds.addEventListener('change', () => save({ hideAds: hideAds.checked }));
  hideUnknown.addEventListener('change', () => save({ hideUnknown: hideUnknown.checked }));
  grace.addEventListener('change', () => save({ grace: grace.checked }));
  // Saved as a pair, while typing: the popup closes the moment the user
  // clicks back on the page, often before the field loses focus. A minimum
  // above the maximum is left unsaved until the other field catches up.
  let priceTimer = null;
  const savePrice = () => {
    clearTimeout(priceTimer);
    const range = globalThis.MLFListing.normalizePriceRange(priceMin.value, priceMax.value);
    priceHint.hidden = range !== null;
    if (range && (range.priceMin !== settings.priceMin || range.priceMax !== settings.priceMax)) save(range);
  };
  for (const field of [priceMin, priceMax]) {
    field.addEventListener('input', () => {
      clearTimeout(priceTimer);
      priceTimer = setTimeout(savePrice, 400);
    });
    field.addEventListener('change', savePrice);
  }

  // The counts are redrawn only when they change, so the periodic refresh
  // does not take keyboard focus off the "unknown city" toggle.
  let lastCounts = null;

  // A count phrase that shows or hides the list box below the counts.
  function listToggle(text, box) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link';
    toggle.textContent = text;
    toggle.setAttribute('aria-expanded', String(!box.hidden));
    toggle.setAttribute('aria-controls', box.id);
    toggle.addEventListener('click', () => {
      box.hidden = !box.hidden;
      toggle.setAttribute('aria-expanded', String(!box.hidden));
    });
    return toggle;
  }

  async function refreshCounts() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const c = await chrome.tabs.sendMessage(tab.id, { type: 'getCounts' });
      if (!c?.active) throw new Error('not on Marketplace');
      const key = JSON.stringify(c);
      if (key === lastCounts) return;
      lastCounts = key;
      counts.replaceChildren('Hidden: ');

      // "N out of range" opens the hidden cities, nearest first.
      const far = c.farCities ?? [];
      const farText = `${c.far} out of range`;
      if (c.far > 0 && far.length) {
        counts.append(listToggle(farText, farBox));
        farList.replaceChildren(
          ...far.map(({ label, count, miles }) => {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = count > 1 ? `${label} (${count})` : label;
            const dist = document.createElement('span');
            dist.className = 'miles';
            dist.textContent = miles === null ? 'out of state' : `${miles} mi`;
            li.append(name, dist);
            return li;
          }),
        );
      } else {
        counts.append(farText);
        farBox.hidden = true;
      }
      counts.append(`, ${c.ship} shipping, ${c.ad} ads, ${c.price ?? 0} outside price range · `);

      // "N unknown city" opens the location lines that were not recognised.
      const unknownText = `${c.unknown} unknown city${c.unknownHidden ? ' (hidden)' : ''}`;
      unknownSamples = c.unknownSamples ?? [];
      if (c.unknown > 0 && unknownSamples.length) {
        counts.append(listToggle(unknownText, unknownBox));
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
      farBox.hidden = true;
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
