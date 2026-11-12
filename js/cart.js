(function (window) {
    const KEY = 'atri_cart_v1'

    function read() {
        try {
            const data = JSON.parse(localStorage.getItem(KEY) || '[]');
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    function write(items) {
        try {
            localStorage.setItem(KEY, JSON.stringify(items))
        } catch (e) {

        }
        notify(items);
    }

    function notify(items) {
        window.dispatchEvent(new CustomEvent('atri:cart', {detail: {items}}));
    }

    function newId() {
        return window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()) + Math.random().toString(16).slice(2);
    }

    const Cart = {
        items: read,

        add(item) {
            const items = read();
            items.push(Object.assign({id: newId()}, item));
            write(items);
        },

        remove(id) {
            write(read().filter(item => item.id !== id));
        },

        // Products only; gifts have no quantity. A quantity below 1 removes the line.
        setQuantity(id, quantity) {
            const qty = Math.floor(Number(quantity)) || 0;
            if (qty < 1) return Cart.remove(id);
            write(read().map(item =>
                item.id === id && item.type !== 'gift' ? Object.assign({}, item, {quantity: qty}) : item));
        },

        clear() {
            write([]);
        },

        // Total units (a product with quantity 3 counts as 3), used by the header badges.
        count() {
            return read().reduce((n, item) => n + (item.type === 'gift' ? 1 : Math.max(1, Number(item.quantity) || 1)), 0);
        },

        subtotalCents() {
            return read().reduce((sum, item) => {
                if (item.type === 'gift') return sum + item.amount_cents;
                return sum + (item.unit_cents || 0) * item.quantity;
            }, 0);
        },

        async checkout(endpoint, options = {}) {
            const items = read().map(item =>
                item.type === 'gift' ? {
                    type: 'gift',
                    frequency: item.frequency,
                    amount_cents: item.amount_cents,
                    fund: item.fund || 'general'
                } : {type: 'product', sku: item.sku, quantity: item.quantity});

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({items, email: options.email || null}),
            })

            const data = await response.json().catch((() => ({})));
            if (!response.ok) {
                throw new Error(data.detail || 'Checkout could not be started. Please try again later.');
                // TODO Need to have alert option that will go to team.
            }
            return data.uri;
        },
    };

    window.addEventListener('storage', event => {
        if (event.key === KEY) notify(read());
    });

    window.ATRICart = Cart;
})(window);