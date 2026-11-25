(async () => {
  const G = globalThis.MLFGeo;
  const L = globalThis.MLFListing;
  const $ = (id) => document.getElementById(id);
  const enabled = $('enabled');
  const hideFar = $('hideFar');
  const hideShipping = $('hideShipping');
  const hideAds = $('hideAds');
  const hideUnknown = $('hideUnknown');
  const priceMin = $('priceMin');
  const priceMax = $('priceMax');
  const priceHint = $('priceHint');
  const source = $('source');
  const total = $('total');
  const heroText = $('heroText');
  const farCount = $('farCount');
  const shipCount = $('shipCount');
  const adCount = $('adCount');
  const unknownCount = $('unknownCount');
  const priceCount = $('priceCount');
  const unknownBox = $('unknownBox');
  const unknownList = $('unknownList');
  const copyUnknown = $('copyUnknown');
  const farBox = $('farBox');
  const farList = $('farList');
  let unknownSamples = [];

  $('graceNote').textContent =
    `Includes ${G.GRACE_MILES} extra miles, because Facebook's location isn't exact.`;

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

  // Shows the choices and the area being filtered, which is always
  // Marketplace's own location filter.
  function render() {
    enabled.checked = settings.enabled;
    document.body.classList.toggle('off', !settings.enabled);
    hideFar.checked = settings.hideFar;
    hideShipping.checked = settings.hideShipping;
    hideAds.checked = settings.hideAds;
    hideUnknown.checked = settings.hideUnknown;
    priceMin.value = settings.priceMin ?? '';
    priceMax.value = settings.priceMax ?? '';
    source.textContent = fbLocation
      ? `Outside ${fbLocation.city}, ${fbLocation.state} · ${Math.round(fbLocation.radiusMiles)} mi`
      : 'Outside your Marketplace area';
  }

  async function save(patch) {
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    render();
    setTimeout(refreshCounts, 400); // let the page re-filter first
  }

  enabled.addEventListener('change', () => save({ enabled: enabled.checked }));
  hideFar.addEventListener('change', () => save({ hideFar: hideFar.checked }));
  hideShipping.addEventListener('change', () => save({ hideShipping: hideShipping.checked }));
  hideAds.addEventListener('change', () => save({ hideAds: hideAds.checked }));
  hideUnknown.addEventListener('change', () => save({ hideUnknown: hideUnknown.checked }));

  // Saved as a pair, while typing: the popup closes the moment the user
  // clicks back on the page, often before the field loses focus. A minimum
  // above the maximum is left unsaved until the other field catches up.
  let priceTimer = null;
  const savePrice = () => {
    clearTimeout(priceTimer);
    const range = L.normalizePriceRange(priceMin.value, priceMax.value);
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

  // A count that shows or hides the list box under its row. It sits inside
  // the row's label, so its click must not also flip the row's eye.
  function listToggle(text, box) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link';
    toggle.textContent = text;
    toggle.setAttribute('aria-expanded', String(!box.hidden));
    toggle.setAttribute('aria-controls', box.id);
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      box.hidden = !box.hidden;
      toggle.setAttribute('aria-expanded', String(!box.hidden));
    });
    return toggle;
  }

  // "9 hidden" or "3 shown"; nothing for none.
  const countText = (n, hidden) => (n > 0 ? `${n} ${hidden ? 'hidden' : 'shown'}` : '');

  function showList(countEl, text, box, list, items) {
    if (text && items.length) {
      countEl.replaceChildren(listToggle(text, box));
      list.replaceChildren(...items);
    } else {
      countEl.textContent = text;
      box.hidden = true;
    }
  }

  // The counts are redrawn only when they change, so the periodic refresh
  // does not take keyboard focus off a control.
  let lastCounts = null;

  async function refreshCounts() {
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const c = await chrome.tabs.sendMessage(tab.id, { type: 'getCounts' });
      if (!c?.active) throw new Error('not on Marketplace');
      const key = JSON.stringify([c, settings.hideFar]);
      if (key === lastCounts) return;
      lastCounts = key;

      total.textContent = String(c.hidden ?? 0);
      heroText.textContent = `listing${c.hidden === 1 ? '' : 's'} hidden on this page`;

      showList(
        farCount,
        countText(c.far, settings.hideFar),
        farBox,
        farList,
        (c.farCities ?? []).map(({ label, count, miles }) => {
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
      shipCount.textContent = countText(c.ship, true);
      adCount.textContent = countText(c.ad, true);
      priceCount.textContent = countText(c.price ?? 0, true);

      unknownSamples = c.unknownSamples ?? [];
      showList(
        unknownCount,
        countText(c.unknown, c.unknownHidden),
        unknownBox,
        unknownList,
        unknownSamples.map((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          return li;
        }),
      );
    } catch {
      lastCounts = null;
      unknownBox.hidden = true;
      farBox.hidden = true;
      for (const el of [farCount, shipCount, adCount, unknownCount, priceCount]) el.textContent = '';
      total.textContent = '–';
      // A Marketplace tab that does not answer was open before the extension
      // was installed or reloaded, so the filter is not running in it.
      const url = tab?.url ?? '';
      heroText.textContent = url.startsWith('https://www.facebook.com/marketplace')
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
