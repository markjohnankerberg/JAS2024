/*
 * Audio Bibles Matching Banner
 *
 * Fetches products from data-api-url and renders gift choices ahead of the custom-gift choice.
 *
 * Source: ATRI Store API, GET /api/v1/products/ → { results: [...] }. Per product it uses
 *   sku, name, description, price.current ("10.00"), image {url, alt} or gallery[0].
 * Optional keys honoured if the API adds them later: unit_label, unit_label_plural,
 *   units_per_gift, given_count, match_text, sort_order, is_active.
 *
 * Video: if the photo panel has a video, a "background" one is a muted loop started here (not
 * with autoplay, so reduced-motion visitors keep the poster) with a pause button; a "player"
 * one is a plain <video controls> and needs no script.
 *
 * Cart: dispatches a bubbling "atri:cart:add" CustomEvent on the button and, if present,
 * calls window.ATRICart.add(item) with cart.js item shapes:
 *   product → { type: 'product', sku, name, unit_cents, quantity }   (quantity from the −/+ stepper)
 *   custom  → { type: 'gift', frequency: 'one-time', amount_cents, fund }
 */
(function () {
    'use strict';

    var CART_EVENT = 'atri:cart:add';
    var usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    var usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    var usd = { format: function (n) { return (n % 1 ? usdCents : usdWhole).format(n); } };
    var num = new Intl.NumberFormat('en-US');

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalize(raw) {
        // Store API: price is { current: "10.00", ... }; image is { url, alt } or null (fall back to gallery).
        var cents = raw.price && typeof raw.price === 'object'
            ? Math.round(parseFloat(raw.price.current) * 100)
            : raw.price_cents != null ? Number(raw.price_cents) : Math.round(Number(raw.price) * 100);
        var img = raw.image && typeof raw.image === 'object' ? raw.image : (raw.gallery && raw.gallery[0]) || null;
        var units = Number(raw.units_per_gift || raw.units || 1);
        var singular = raw.unit_label || null;
        return {
            id: String(raw.id || raw.sku),
            sku: raw.sku || String(raw.id),
            name: raw.name,
            price: cents / 100,
            priceCents: cents,
            image: img ? img.url : (raw.image_url || raw.image || ''),
            imageAlt: (img && img.alt) || raw.image_alt || raw.name,
            description: raw.description || '',
            units: units,
            unitSingular: singular,
            unitPlural: raw.unit_label_plural || (singular ? singular + 's' : null),
            given: raw.given_count != null ? Number(raw.given_count) : null,
            matchText: raw.match_text || null,
            sort: raw.sort_order != null ? Number(raw.sort_order) : 0,
            active: raw.is_active !== false
        };
    }

    function matchLine(p, multiplier, quantity) {
        var q = quantity || 1;
        if (p.matchText && q === 1) return p.matchText;
        var total = p.price * q;
        if (!p.unitSingular) {
            var effect = multiplier === 2 ? 'doubled' : multiplier === 3 ? 'tripled' : 'multiplied ' + multiplier + '×';
            return 'Your ' + usd.format(total) + ' gift is ' + effect + '.';
        }
        var units = p.units * multiplier * q;
        return 'Your ' + usd.format(total) + ' gift provides ' + num.format(units) + ' ' +
            (units === 1 ? p.unitSingular : p.unitPlural) + '.';
    }

    function choiceHTML(p, cfg) {
        return '' +
            '<li class="abb-card' + (p.image ? ' abb-card--media' : '') + '" data-sku="' + esc(p.sku) + '" data-abb-product="' + esc(p.id) + '">' +
            '<button type="button" class="abb-choice' + (p.image ? ' abb-choice--media' : '') + '" data-abb-choice="' + esc(p.id) + '" aria-pressed="false">' +
            (p.image
                ? '<img class="abb-choice__img" src="' + esc(p.image) + '" alt="" width="62" height="62" loading="lazy" decoding="async">'
                : '') +
            '<span class="abb-choice__text">' +
            '<strong>' + esc(p.name) + ' · ' + esc(usd.format(p.price)) + '</strong>' +
            '<small>' + esc(matchLine(p, cfg.multiplier)) + '</small>' +
            '</span>' +
            '</button>' +
            '<div class="abb-card__qty" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
            '<button type="button" class="abb__step" data-abb-qty-step="-1" aria-label="Decrease quantity" disabled>&minus;</button>' +
            '<input type="number" class="abb-card__qty-value" data-abb-qty-value value="0" min="0" max="99" step="1" inputmode="numeric" aria-label="Quantity for ' + esc(p.name) + '">' +
            '<button type="button" class="abb__step" data-abb-qty-step="1" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '</li>';
    }

    function cacheKey(url) { return 'abb:' + url; }

    function readCache(url, minutes) {
        if (!minutes) return null;
        try {
            var hit = JSON.parse(sessionStorage.getItem(cacheKey(url)) || 'null');
            if (hit && Date.now() - hit.t < minutes * 60000) return hit.d;
        } catch (e) { /* storage unavailable */ }
        return null;
    }

    function writeCache(url, data) {
        try { sessionStorage.setItem(cacheKey(url), JSON.stringify({ t: Date.now(), d: data })); } catch (e) {}
    }

    function fetchPage(url, signal) {
        return fetch(url, { headers: { Accept: 'application/json' }, signal: signal })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
    }

    function fetchProducts(url, minutes) {
        var cached = readCache(url, minutes);
        if (cached) return Promise.resolve(cached);
        var ctrl = 'AbortController' in window ? new AbortController() : null;
        var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 15000);

        function fetchAll(pageUrl, acc) {
            return fetchPage(pageUrl, ctrl && ctrl.signal).then(function (json) {
                var items = Array.isArray(json) ? json : (json.items || json.results || []);
                acc = acc.concat(items);
                if (json.next) return fetchAll(json.next, acc);
                return acc;
            });
        }

        return fetchAll(url, [])
            .then(function (allItems) {
                writeCache(url, allItems);
                return allItems;
            })
            .finally(function () { if (timer) clearTimeout(timer); });
    }

    function addToCart(btn, item, live) {
        var ev = new CustomEvent(CART_EVENT, { bubbles: true, cancelable: true, detail: item });
        btn.dispatchEvent(ev);
        if (window.ATRICart && typeof window.ATRICart.add === 'function') {
            window.ATRICart.add(item);
        }
        var original = btn.textContent;
        btn.classList.add('is-added');
        btn.textContent = 'Added!';
        live.textContent = item.name + ' added to cart.';
        setTimeout(function () {
            btn.classList.remove('is-added');
            btn.textContent = original;
        }, 1800);
    }

    function init(root) {
        if (root.__abbInit) return;
        root.__abbInit = true;

        var cfg = {
            url: root.dataset.apiUrl,
            multiplier: Number(root.dataset.multiplier) || 3,
            max: Number(root.dataset.max) || 4,
            cacheMinutes: Number(root.dataset.cacheMinutes) || 0,
            allowedSkus: root.dataset.allowedSkus
                ? root.dataset.allowedSkus.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
                : null
        };
        var choices = root.querySelector('.abb__choices');
        var custom = root.querySelector('[data-abb-custom]');
        var addBtn = root.querySelector('[data-abb-add]');
        var errorEl = root.querySelector('[data-abb-error]');
        var live = root.querySelector('[data-abb-live]');
        var products = {};
        var selected = null;
        var MAX_QTY = 99;
        var qtys = {};   // per-card quantity, keyed by product id

        /* Update one card's stepper + match line ("Your $90 gift is tripled."). */
        function renderCard(id) {
            var p = products[id];
            var li = p && choices.querySelector('li[data-abb-product="' + id + '"]');
            if (!li) return;
            var q = qtys[id] || 0;
            var field = li.querySelector('[data-abb-qty-value]');
            if (document.activeElement !== field || field.value !== '') field.value = String(q);
            li.querySelector('[data-abb-qty-step="-1"]').disabled = q <= 0;
            li.querySelector('[data-abb-qty-step="1"]').disabled = q >= MAX_QTY;
            li.querySelector('.abb-choice small').textContent = matchLine(p, cfg.multiplier, Math.max(1, q));
            syncAddBtn();
        }

        /* Add to Cart shows its hover colour once the selected card's counter is above 0. */
        function syncAddBtn() {
            var ready = !!selected && selected !== 'custom' && (qtys[selected] || 0) > 0;
            addBtn.classList.toggle('is-ready', ready);
        }

        function clearSkeletons() {
            root.querySelectorAll('[data-abb-skeleton]').forEach(function (el) { el.remove(); });
        }

        function select(id) {
            selected = id;
            choices.querySelectorAll('[data-abb-choice]').forEach(function (b) {
                var on = b.getAttribute('data-abb-choice') === id;
                b.setAttribute('aria-pressed', String(on));
                var card = b.closest('li.abb-card');
                if (card) card.classList.toggle('is-selected', on);
            });
            if (custom) custom.hidden = id !== 'custom';
            syncAddBtn();
        }

        /* Custom amount −/+ : steps by data-step, never below the minimum. */
        if (custom) custom.addEventListener('click', function (e) {
            var b = e.target.closest('[data-abb-amount-step]');
            if (!b) return;
            var input = custom.querySelector('[data-abb-amount]');
            var min = Number(custom.dataset.min) || 1;
            var step = Number(custom.dataset.step) || 5;
            var dir = Number(b.getAttribute('data-abb-amount-step'));
            var current = Number(input.value) || 0;
            // Snap to the step grid so $12 + $5 -> $15, not $17.
            var next = dir > 0 ? Math.floor(current / step) * step + step : Math.ceil(current / step) * step - step;
            input.value = String(Math.max(min, next));
            input.removeAttribute('aria-invalid');
            live.textContent = 'Gift amount ' + usd.format(Number(input.value)) + '.';
        });

        choices.addEventListener('click', function (e) {
            /* Card −/+ : change that card's quantity and select it. */
            var step = e.target.closest('[data-abb-qty-step]');
            if (step) {
                var id = step.closest('li[data-abb-product]').getAttribute('data-abb-product');
                qtys[id] = Math.min(MAX_QTY, Math.max(0, (qtys[id] || 0) + Number(step.getAttribute('data-abb-qty-step'))));
                if (selected !== id) select(id);
                renderCard(id);
                live.textContent = products[id].name + ', quantity ' + qtys[id] + '.';
                return;
            }
            // Typing in the counter is handled below; don't treat it as a card click.
            if (e.target.closest('.abb-card__qty')) return;
            // Clicks on the card's padding (outside its button) select it too.
            var card = e.target.closest('li.abb-card');
            var btn = e.target.closest('[data-abb-choice]') || (card && card.querySelector('[data-abb-choice]'));
            if (!btn) return;
            var picked = btn.getAttribute('data-abb-choice');
            select(picked);
            // Clicking a card whose counter is 0 starts it at 1.
            if (products[picked] && !(qtys[picked] > 0)) {
                qtys[picked] = 1;
                renderCard(picked);
            }
            if (selected === 'custom') custom.querySelector('[data-abb-amount]').focus();
        });

        /* Typing in a card's counter: whole numbers 0–99, and it selects that card. A blank
           box is left alone while typing and becomes 0 when the visitor leaves it. */
        function typedQty(field, settle) {
            var id = field.closest('li[data-abb-product]').getAttribute('data-abb-product');
            var v = parseInt(field.value, 10);
            if (Number.isNaN(v)) {
                if (!settle) return;
                v = 0;
            }
            qtys[id] = Math.min(MAX_QTY, Math.max(0, v));
            if (selected !== id) select(id);
            if (settle || String(qtys[id]) !== field.value) field.value = String(qtys[id]);
            renderCard(id);
        }
        choices.addEventListener('input', function (e) {
            if (e.target.matches('[data-abb-qty-value]')) typedQty(e.target, false);
        });
        choices.addEventListener('change', function (e) {
            if (e.target.matches('[data-abb-qty-value]')) {
                typedQty(e.target, true);
                var id = e.target.closest('li[data-abb-product]').getAttribute('data-abb-product');
                live.textContent = products[id].name + ', quantity ' + qtys[id] + '.';
            }
        });

        addBtn.addEventListener('click', function () {
            if (!selected) {
                live.textContent = 'Please choose a gift option.';
                return;
            }

            if (selected !== 'custom') {
                var p = products[selected];
                if (!p) return;
                if (!(qtys[selected] > 0)) {
                    live.textContent = 'Use + to choose how many ' + p.name + ' gifts to give.';
                    var plus = choices.querySelector('li[data-abb-product="' + selected + '"] [data-abb-qty-step="1"]');
                    if (plus) plus.focus();
                    return;
                }
                addToCart(addBtn, {
                    type: 'product', sku: p.sku, name: p.name, unit_cents: p.priceCents,
                    quantity: qtys[selected], image: p.image, matchMultiplier: cfg.multiplier, campaign: 'audio-bibles'
                }, live);
                qtys[selected] = 0;
                renderCard(selected);
                return;
            }

            var input = custom.querySelector('[data-abb-amount]');
            var min = Number(custom.dataset.min) || 1;
            var amount = Math.round(Number(input.value) * 100) / 100;
            if (!amount || amount < min) {
                input.setAttribute('aria-invalid', 'true');
                live.textContent = 'Please enter an amount of at least ' + usd.format(min) + '.';
                input.focus();
                return;
            }
            input.removeAttribute('aria-invalid');
            addToCart(addBtn, {
                type: 'gift', frequency: 'one-time', amount_cents: Math.round(amount * 100),
                fund: custom.dataset.sku, name: 'Audio Bibles — Custom Gift',
                matchMultiplier: cfg.multiplier, campaign: 'audio-bibles'
            }, live);
            input.value = '';
        });

        if (!cfg.url) {
            clearSkeletons();
            if (custom) select('custom');
            return;
        }

        fetchProducts(cfg.url, cfg.cacheMinutes)
            .then(function (items) {
                var list = items.map(normalize)
                    .filter(function (p) {
                        if (!p.active || !p.id || !isFinite(p.price)) return false;
                        if (cfg.allowedSkus) return cfg.allowedSkus.indexOf(p.sku) !== -1;
                        return true;
                    })
                    .sort(function (a, b) { return a.sort - b.sort; })
                    .slice(0, cfg.max);

                list.forEach(function (p) { products[p.id] = p; });
                clearSkeletons();

                var html = list.map(function (p) { return choiceHTML(p, cfg); }).join('');
                var customItem = choices.querySelector('[data-abb-custom-item]');
                if (customItem) customItem.insertAdjacentHTML('beforebegin', html);
                else choices.insertAdjacentHTML('beforeend', html);

                if (list.length) select(list[0].id);
                else {
                    errorEl.hidden = false;
                    if (custom) select('custom');
                }
            })
            .catch(function (err) {
                console.error('[Audio Bibles banner] failed to load products:', err);
                clearSkeletons();
                errorEl.hidden = false;
                if (custom) select('custom');
            });
    }

    /*
     * Background video loop in the photo panel. It has no autoplay attribute, so it only moves
     * when this runs and the visitor has not asked for reduced motion; otherwise the poster
     * (the panel's image) stays. The pause button is shown only once playback has started.
     * Kept apart from init() so the video works even if the product feed fails.
     */
    function initVideo(root) {
        var video = root.querySelector('[data-abb-bg-video]');
        var toggle = root.querySelector('[data-abb-video-toggle]');
        if (!video || !toggle) return;
        var label = toggle.querySelector('[data-abb-video-toggle-label]');
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

        function sync() {
            var paused = video.paused;
            toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
            label.textContent = paused ? 'Play video' : 'Pause video';
        }
        function play() {
            var started = video.play();
            if (started && started.catch) started.catch(function () { sync(); });
        }

        video.addEventListener('play', function () { toggle.hidden = false; sync(); });
        video.addEventListener('pause', sync);
        toggle.addEventListener('click', function () {
            if (video.paused) play(); else video.pause();
        });
        if (!(reduce && reduce.matches)) play();
    }

    /*
     * Player mode: the gold play button over the video starts it, then hides while it plays
     * and comes back when it's paused or ends. Native controls also work and stay in sync.
     */
    function initPlayer(root) {
        var wrap = root.querySelector('[data-abb-player]');
        if (!wrap) return;
        var video = wrap.querySelector('video');
        var btn = wrap.querySelector('[data-abb-play]');
        function sync() { wrap.classList.toggle('is-playing', !video.paused && !video.ended); }
        btn.addEventListener('click', function () {
            var started = video.play();
            if (started && started.catch) started.catch(sync);
            video.focus();
        });
        video.addEventListener('play', sync);
        video.addEventListener('pause', sync);
        video.addEventListener('ended', sync);
    }

    function boot() {
        document.querySelectorAll('.abb').forEach(function (root) {
            initVideo(root);
            initPlayer(root);
            init(root);
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
