async function trackingInteractedElement(elementKeys, elementSelectors, description) {
    let data = {
        domain: window.location.hostname,
        url: window.location.href,
        description : description,
        keys: elementKeys,
        selectors: elementSelectors, 
    };

    const url = 'https://qgmbm5vap7.execute-api.us-east-1.amazonaws.com/dev';

    if (typeof fetch != "undefined") {
        fetch(url, {
            mode: 'no-cors',
            method: "POST", 
            body: JSON.stringify(data)
        }).catch(e => {
            console.log(e);
        });
    } else {
        let xhr = createCORSRequest('POST', url);
        if (!xhr) {
            console.log('CORS not supported');
            return;
        }
        xhr.onerror = function(e) {
            console.log(e);
        };
        xhr.send(JSON.stringify(data));
    }
}

function createCORSRequest(method, url) {
    let xhr = new XMLHttpRequest();
    if ("withCredentials" in xhr) {
        // XHR for Chrome/Firefox/Opera/Safari.
        xhr.open(method, url, true);
    } else if (typeof XDomainRequest != "undefined") {
        // XDomainRequest for IE.
        xhr = new XDomainRequest();
        xhr.open(method, url);
    } else {
        // CORS not supported.
        xhr = null;
    }
    return xhr;
}