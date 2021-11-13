(() => {
    const w = window,
        n = w.navigator,
        d = w.document,
        l = w.location,
        t = Date.now,
        t0 = t(),
        focusArr = [{f: !d.hidden && d.visibilityState != 'hidden' && d.visibilityState != 'prerender', t: t() - t0}],
        id = (d.currentScript || d.querySelector('script[src$=".min.js"]')).getAttribute('data-id');

    if(id == 'DNT' || n.doNotTrack == '1') {
        console.log("okie, we won't collect any data about you (ꈍ ‸ ꈍ✿)");
        return;
    }

    w.addEventListener('error', e => {
    });

    const focused = () => {
        let tF = 0;
        let tT = 0;
        for(let i = 1; i < focusArr.length; ++i) {
            const timePassed = focusArr[i].t - focusArr[i-1].t;
            tT += timePassed;
            if(focusArr[i-1].f) tF += timePassed;
        };
        const last = focusArr.length - 1;
        const toNow = (t() - t0) - focusArr[last].t;
        tT += toNow;
        if(focusArr[last].f) tF += toNow;
        return {tF, tT};
    };

    const ev = (type, data = {}) => {
        const _data = JSON.stringify({
            n: type,
            t: t(),
            d: data,
            id,
            f: focused()
        })

        if(n.sendBeacon) n.sendBeacon('/api/event/', _data);
        else {
            const req = new XMLHttpRequest();
            req.open('POST', '/api/event/', true);
            req.setRequestHeader('Content-Type', 'application/json');
            req.send(_data);
        }
    };

    const potentialLinkPress = e => {
        const newTabClick = e.type == 'click' || e.type == 'touchstart';
        if(newTabClick || (e.type == 'auxclick' && e.which == 2)) {
            let link = e.target;
            while(link && (typeof link.tagName == 'undefined' || link.tagName.toLowerCase() != 'a' || !link.href)) link = link.parentNode;
            if(link && link.href) {
                const isOutbound = link.host && link.host != l.host;
                const willOpenInNewTab = !((!link.target || /^_(self|parent|top)$/i.test(link.target)) && (!(e.ctrlKey || e.metaKey || e.shiftKey) && newTabClick));
                ev('link', {
                    outbound: isOutbound,
                    target: link.href,
                    newTab: willOpenInNewTab
                });
                if(!willOpenInNewTab) {
                    e.preventDefault();
                    setTimeout(() => l.href = link.href, 150);
                }
            }
        }
    };

    /*d.addEventListener('click', potentialLinkPress);
    d.addEventListener('auxclick', potentialLinkPress);
    d.addEventListener('touchstart', potentialLinkPress);*/
    w.addEventListener('load', () => ev('pageview', {
        width: w.innerWidth,
        headless: n.webdriver
    }));
    w.addEventListener('visibilitychange', () => {
        focusArr.push({f: !d.hidden && d.visibilityState == 'visible', t: t() - t0})
    });
    w.addEventListener('beforeunload', () => ev('pageexit'));
    w.addEventListener('unload', () => ev('pageexit'));
})();