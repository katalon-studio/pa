(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Recorder = require("./src/recorder").Recorder;
const recorder = new Recorder(window);

recorder.addEventHandler(
  "clickAt",
  "click",
  function(event) {
    if (event.button == 0 && event.isTrusted) {
      var top = event.pageY,
        left = event.pageX;
      var element = event.target;
      do {
        top -= element.offsetTop;
        left -= element.offsetLeft;
        element = element.offsetParent;
      } while (element);
      var target = event.target;
      var currentURL = this.window.document.URL;
      var clickType = this.rec_getMouseButton(event);
      if (this.rec_isElementMouseUpEventRecordable(target, clickType)) {
        this.processOnClickTarget(target, clickType, currentURL);
      }
    }
  },
  true
);

recorder.attach();

},{"./src/recorder":32}],2:[function(require,module,exports){
module.exports = require('./lib/axios');
},{"./lib/axios":4}],3:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var buildURL = require('./../helpers/buildURL');
var buildFullPath = require('../core/buildFullPath');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var createError = require('../core/createError');

module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;

    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password || '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    var fullPath = buildFullPath(config.baseURL, config.url);
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;

    // Listen for ready state
    request.onreadystatechange = function handleLoad() {
      if (!request || request.readyState !== 4) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(timeoutErrorMessage, config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      var cookies = require('./../helpers/cookies');

      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ?
        cookies.read(config.xsrfCookieName) :
        undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    if (config.responseType) {
      try {
        request.responseType = config.responseType;
      } catch (e) {
        // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
        // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
        if (config.responseType !== 'json') {
          throw e;
        }
      }
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled(cancel) {
        if (!request) {
          return;
        }

        request.abort();
        reject(cancel);
        // Clean up request
        request = null;
      });
    }

    if (requestData === undefined) {
      requestData = null;
    }

    // Send the request
    request.send(requestData);
  });
};

},{"../core/buildFullPath":10,"../core/createError":11,"./../core/settle":15,"./../helpers/buildURL":19,"./../helpers/cookies":21,"./../helpers/isURLSameOrigin":23,"./../helpers/parseHeaders":25,"./../utils":27}],4:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var bind = require('./helpers/bind');
var Axios = require('./core/Axios');
var mergeConfig = require('./core/mergeConfig');
var defaults = require('./defaults');

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Factory for creating new instances
axios.create = function create(instanceConfig) {
  return createInstance(mergeConfig(axios.defaults, instanceConfig));
};

// Expose Cancel & CancelToken
axios.Cancel = require('./cancel/Cancel');
axios.CancelToken = require('./cancel/CancelToken');
axios.isCancel = require('./cancel/isCancel');

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = require('./helpers/spread');

module.exports = axios;

// Allow use of default import syntax in TypeScript
module.exports.default = axios;

},{"./cancel/Cancel":5,"./cancel/CancelToken":6,"./cancel/isCancel":7,"./core/Axios":8,"./core/mergeConfig":14,"./defaults":17,"./helpers/bind":18,"./helpers/spread":26,"./utils":27}],5:[function(require,module,exports){
'use strict';

/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;

module.exports = Cancel;

},{}],6:[function(require,module,exports){
'use strict';

var Cancel = require('./Cancel');

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }

    token.reason = new Cancel(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

module.exports = CancelToken;

},{"./Cancel":5}],7:[function(require,module,exports){
'use strict';

module.exports = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};

},{}],8:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var buildURL = require('../helpers/buildURL');
var InterceptorManager = require('./InterceptorManager');
var dispatchRequest = require('./dispatchRequest');
var mergeConfig = require('./mergeConfig');

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }

  config = mergeConfig(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  // Hook up interceptors middleware
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

Axios.prototype.getUri = function getUri(config) {
  config = mergeConfig(this.defaults, config);
  return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function(url, data, config) {
    return this.request(utils.merge(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

module.exports = Axios;

},{"../helpers/buildURL":19,"./../utils":27,"./InterceptorManager":9,"./dispatchRequest":12,"./mergeConfig":14}],9:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};

module.exports = InterceptorManager;

},{"./../utils":27}],10:[function(require,module,exports){
'use strict';

var isAbsoluteURL = require('../helpers/isAbsoluteURL');
var combineURLs = require('../helpers/combineURLs');

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
module.exports = function buildFullPath(baseURL, requestedURL) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
};

},{"../helpers/combineURLs":20,"../helpers/isAbsoluteURL":22}],11:[function(require,module,exports){
'use strict';

var enhanceError = require('./enhanceError');

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
module.exports = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};

},{"./enhanceError":13}],12:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );

  // Flatten headers
  config.headers = utils.merge(
    config.headers.common || {},
    config.headers[config.method] || {},
    config.headers
  );

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

},{"../cancel/isCancel":7,"../defaults":17,"./../utils":27,"./transformData":16}],13:[function(require,module,exports){
'use strict';

/**
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
module.exports = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }

  error.request = request;
  error.response = response;
  error.isAxiosError = true;

  error.toJSON = function() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: this.config,
      code: this.code
    };
  };
  return error;
};

},{}],14:[function(require,module,exports){
'use strict';

var utils = require('../utils');

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 * @returns {Object} New object resulting from merging config2 to config1
 */
module.exports = function mergeConfig(config1, config2) {
  // eslint-disable-next-line no-param-reassign
  config2 = config2 || {};
  var config = {};

  var valueFromConfig2Keys = ['url', 'method', 'params', 'data'];
  var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy'];
  var defaultToConfig2Keys = [
    'baseURL', 'url', 'transformRequest', 'transformResponse', 'paramsSerializer',
    'timeout', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
    'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress',
    'maxContentLength', 'validateStatus', 'maxRedirects', 'httpAgent',
    'httpsAgent', 'cancelToken', 'socketPath'
  ];

  utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    }
  });

  utils.forEach(mergeDeepPropertiesKeys, function mergeDeepProperties(prop) {
    if (utils.isObject(config2[prop])) {
      config[prop] = utils.deepMerge(config1[prop], config2[prop]);
    } else if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (utils.isObject(config1[prop])) {
      config[prop] = utils.deepMerge(config1[prop]);
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  var axiosKeys = valueFromConfig2Keys
    .concat(mergeDeepPropertiesKeys)
    .concat(defaultToConfig2Keys);

  var otherKeys = Object
    .keys(config2)
    .filter(function filterAxiosKeys(key) {
      return axiosKeys.indexOf(key) === -1;
    });

  utils.forEach(otherKeys, function otherKeysDefaultToConfig2(prop) {
    if (typeof config2[prop] !== 'undefined') {
      config[prop] = config2[prop];
    } else if (typeof config1[prop] !== 'undefined') {
      config[prop] = config1[prop];
    }
  });

  return config;
};

},{"../utils":27}],15:[function(require,module,exports){
'use strict';

var createError = require('./createError');

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  if (!validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};

},{"./createError":11}],16:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
module.exports = function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};

},{"./../utils":27}],17:[function(require,module,exports){
(function (process){
'use strict';

var utils = require('./utils');
var normalizeHeaderName = require('./helpers/normalizeHeaderName');

var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = require('./adapters/xhr');
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = require('./adapters/http');
  }
  return adapter;
}

var defaults = {
  adapter: getDefaultAdapter(),

  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data) {
    /*eslint no-param-reassign:0*/
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],

  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,

  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',

  maxContentLength: -1,

  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
};

defaults.headers = {
  common: {
    'Accept': 'application/json, text/plain, */*'
  }
};

utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});

module.exports = defaults;

}).call(this,require('_process'))
},{"./adapters/http":3,"./adapters/xhr":3,"./helpers/normalizeHeaderName":24,"./utils":27,"_process":34}],18:[function(require,module,exports){
'use strict';

module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

},{}],19:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

function encode(val) {
  return encodeURIComponent(val).
    replace(/%40/gi, '@').
    replace(/%3A/gi, ':').
    replace(/%24/g, '$').
    replace(/%2C/gi, ',').
    replace(/%20/g, '+').
    replace(/%5B/gi, '[').
    replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }

  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      if (utils.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }

      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });

    serializedParams = parts.join('&');
  }

  if (serializedParams) {
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }

    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};

},{"./../utils":27}],20:[function(require,module,exports){
'use strict';

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
module.exports = function combineURLs(baseURL, relativeURL) {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
};

},{}],21:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs support document.cookie
    (function standardBrowserEnv() {
      return {
        write: function write(name, value, expires, path, domain, secure) {
          var cookie = [];
          cookie.push(name + '=' + encodeURIComponent(value));

          if (utils.isNumber(expires)) {
            cookie.push('expires=' + new Date(expires).toGMTString());
          }

          if (utils.isString(path)) {
            cookie.push('path=' + path);
          }

          if (utils.isString(domain)) {
            cookie.push('domain=' + domain);
          }

          if (secure === true) {
            cookie.push('secure');
          }

          document.cookie = cookie.join('; ');
        },

        read: function read(name) {
          var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
          return (match ? decodeURIComponent(match[3]) : null);
        },

        remove: function remove(name) {
          this.write(name, '', Date.now() - 86400000);
        }
      };
    })() :

  // Non standard browser env (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return {
        write: function write() {},
        read: function read() { return null; },
        remove: function remove() {}
      };
    })()
);

},{"./../utils":27}],22:[function(require,module,exports){
'use strict';

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
module.exports = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
};

},{}],23:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

module.exports = (
  utils.isStandardBrowserEnv() ?

  // Standard browser envs have full support of the APIs needed to test
  // whether the request URL is of the same origin as current location.
    (function standardBrowserEnv() {
      var msie = /(msie|trident)/i.test(navigator.userAgent);
      var urlParsingNode = document.createElement('a');
      var originURL;

      /**
    * Parse a URL to discover it's components
    *
    * @param {String} url The URL to be parsed
    * @returns {Object}
    */
      function resolveURL(url) {
        var href = url;

        if (msie) {
        // IE needs attribute set twice to normalize properties
          urlParsingNode.setAttribute('href', href);
          href = urlParsingNode.href;
        }

        urlParsingNode.setAttribute('href', href);

        // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
        return {
          href: urlParsingNode.href,
          protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
          host: urlParsingNode.host,
          search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
          hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
          hostname: urlParsingNode.hostname,
          port: urlParsingNode.port,
          pathname: (urlParsingNode.pathname.charAt(0) === '/') ?
            urlParsingNode.pathname :
            '/' + urlParsingNode.pathname
        };
      }

      originURL = resolveURL(window.location.href);

      /**
    * Determine if a URL shares the same origin as the current location
    *
    * @param {String} requestURL The URL to test
    * @returns {boolean} True if URL shares the same origin, otherwise false
    */
      return function isURLSameOrigin(requestURL) {
        var parsed = (utils.isString(requestURL)) ? resolveURL(requestURL) : requestURL;
        return (parsed.protocol === originURL.protocol &&
            parsed.host === originURL.host);
      };
    })() :

  // Non standard browser envs (web workers, react-native) lack needed support.
    (function nonStandardBrowserEnv() {
      return function isURLSameOrigin() {
        return true;
      };
    })()
);

},{"./../utils":27}],24:[function(require,module,exports){
'use strict';

var utils = require('../utils');

module.exports = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

},{"../utils":27}],25:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
var ignoreDuplicateOf = [
  'age', 'authorization', 'content-length', 'content-type', 'etag',
  'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since',
  'last-modified', 'location', 'max-forwards', 'proxy-authorization',
  'referer', 'retry-after', 'user-agent'
];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
module.exports = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;

  if (!headers) { return parsed; }

  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));

    if (key) {
      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
        return;
      }
      if (key === 'set-cookie') {
        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
      }
    }
  });

  return parsed;
};

},{"./../utils":27}],26:[function(require,module,exports){
'use strict';

/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
module.exports = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};

},{}],27:[function(require,module,exports){
'use strict';

var bind = require('./helpers/bind');

/*global toString:true*/

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return toString.call(val) === '[object Array]';
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor)
    && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
function isArrayBuffer(val) {
  return toString.call(val) === '[object ArrayBuffer]';
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(val) {
  return (typeof FormData !== 'undefined') && (val instanceof FormData);
}

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if ((typeof ArrayBuffer !== 'undefined') && (ArrayBuffer.isView)) {
    result = ArrayBuffer.isView(val);
  } else {
    result = (val) && (val.buffer) && (val.buffer instanceof ArrayBuffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && typeof val === 'object';
}

/**
 * Determine if a value is a Date
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
function isDate(val) {
  return toString.call(val) === '[object Date]';
}

/**
 * Determine if a value is a File
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
function isFile(val) {
  return toString.call(val) === '[object File]';
}

/**
 * Determine if a value is a Blob
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
function isBlob(val) {
  return toString.call(val) === '[object Blob]';
}

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a URLSearchParams object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.replace(/^\s*/, '').replace(/\s*$/, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' ||
                                           navigator.product === 'NativeScript' ||
                                           navigator.product === 'NS')) {
    return false;
  }
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (typeof obj !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }

  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = merge(result[key], val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Function equal to merge with the difference being that no reference
 * to original objects is kept.
 *
 * @see merge
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function deepMerge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (typeof result[key] === 'object' && typeof val === 'object') {
      result[key] = deepMerge(result[key], val);
    } else if (typeof val === 'object') {
      result[key] = deepMerge({}, val);
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

module.exports = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  deepMerge: deepMerge,
  extend: extend,
  trim: trim
};

},{"./helpers/bind":18}],28:[function(require,module,exports){
/*!
 * jQuery JavaScript Library v3.4.1
 * https://jquery.com/
 *
 * Includes Sizzle.js
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2019-05-01T21:04Z
 */
( function( global, factory ) {

	"use strict";

	if ( typeof module === "object" && typeof module.exports === "object" ) {

		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
} )( typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Edge <= 12 - 13+, Firefox <=18 - 45+, IE 10 - 11, Safari 5.1 - 9+, iOS 6 - 9.1
// throw exceptions when non-strict code (e.g., ASP.NET 4.5) accesses strict mode
// arguments.callee.caller (trac-13335). But as of jQuery 3.0 (2016), strict mode should be common
// enough that all such attempts are guarded in a try block.
"use strict";

var arr = [];

var document = window.document;

var getProto = Object.getPrototypeOf;

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var fnToString = hasOwn.toString;

var ObjectFunctionString = fnToString.call( Object );

var support = {};

var isFunction = function isFunction( obj ) {

      // Support: Chrome <=57, Firefox <=52
      // In some browsers, typeof returns "function" for HTML <object> elements
      // (i.e., `typeof document.createElement( "object" ) === "function"`).
      // We don't want to classify *any* DOM node as a function.
      return typeof obj === "function" && typeof obj.nodeType !== "number";
  };


var isWindow = function isWindow( obj ) {
		return obj != null && obj === obj.window;
	};




	var preservedScriptAttributes = {
		type: true,
		src: true,
		nonce: true,
		noModule: true
	};

	function DOMEval( code, node, doc ) {
		doc = doc || document;

		var i, val,
			script = doc.createElement( "script" );

		script.text = code;
		if ( node ) {
			for ( i in preservedScriptAttributes ) {

				// Support: Firefox 64+, Edge 18+
				// Some browsers don't support the "nonce" property on scripts.
				// On the other hand, just using `getAttribute` is not enough as
				// the `nonce` attribute is reset to an empty string whenever it
				// becomes browsing-context connected.
				// See https://github.com/whatwg/html/issues/2369
				// See https://html.spec.whatwg.org/#nonce-attributes
				// The `node.getAttribute` check was added for the sake of
				// `jQuery.globalEval` so that it can fake a nonce-containing node
				// via an object.
				val = node[ i ] || node.getAttribute && node.getAttribute( i );
				if ( val ) {
					script.setAttribute( i, val );
				}
			}
		}
		doc.head.appendChild( script ).parentNode.removeChild( script );
	}


function toType( obj ) {
	if ( obj == null ) {
		return obj + "";
	}

	// Support: Android <=2.3 only (functionish RegExp)
	return typeof obj === "object" || typeof obj === "function" ?
		class2type[ toString.call( obj ) ] || "object" :
		typeof obj;
}
/* global Symbol */
// Defining this global in .eslintrc.json would create a danger of using the global
// unguarded in another place, it seems safer to define global only for this module



var
	version = "3.4.1",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {

		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android <=4.0 only
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

jQuery.fn = jQuery.prototype = {

	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {

		// Return all the elements in a clean array
		if ( num == null ) {
			return slice.call( this );
		}

		// Return just the one element from the set
		return num < 0 ? this[ num + this.length ] : this[ num ];
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	each: function( callback ) {
		return jQuery.each( this, callback );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map( this, function( elem, i ) {
			return callback.call( elem, i, elem );
		} ) );
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor();
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[ 0 ] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !isFunction( target ) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {

		// Only deal with non-null/undefined values
		if ( ( options = arguments[ i ] ) != null ) {

			// Extend the base object
			for ( name in options ) {
				copy = options[ name ];

				// Prevent Object.prototype pollution
				// Prevent never-ending loop
				if ( name === "__proto__" || target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
					( copyIsArray = Array.isArray( copy ) ) ) ) {
					src = target[ name ];

					// Ensure proper type for the source value
					if ( copyIsArray && !Array.isArray( src ) ) {
						clone = [];
					} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
						clone = {};
					} else {
						clone = src;
					}
					copyIsArray = false;

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend( {

	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isPlainObject: function( obj ) {
		var proto, Ctor;

		// Detect obvious negatives
		// Use toString instead of jQuery.type to catch host objects
		if ( !obj || toString.call( obj ) !== "[object Object]" ) {
			return false;
		}

		proto = getProto( obj );

		// Objects with no prototype (e.g., `Object.create( null )`) are plain
		if ( !proto ) {
			return true;
		}

		// Objects with prototype are plain iff they were constructed by a global Object function
		Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
		return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
	},

	isEmptyObject: function( obj ) {
		var name;

		for ( name in obj ) {
			return false;
		}
		return true;
	},

	// Evaluates a script in a global context
	globalEval: function( code, options ) {
		DOMEval( code, { nonce: options && options.nonce } );
	},

	each: function( obj, callback ) {
		var length, i = 0;

		if ( isArrayLike( obj ) ) {
			length = obj.length;
			for ( ; i < length; i++ ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		} else {
			for ( i in obj ) {
				if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
					break;
				}
			}
		}

		return obj;
	},

	// Support: Android <=4.0 only
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArrayLike( Object( arr ) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	// Support: Android <=4.0 only, PhantomJS 1 only
	// push.apply(_, arraylike) throws on ancient WebKit
	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var length, value,
			i = 0,
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArrayLike( elems ) ) {
			length = elems.length;
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
} );

if ( typeof Symbol === "function" ) {
	jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
}

// Populate the class2type map
jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
function( i, name ) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
} );

function isArrayLike( obj ) {

	// Support: real iOS 8.2 only (not reproducible in simulator)
	// `in` check used to prevent JIT error (gh-2145)
	// hasOwn isn't used here due to false negatives
	// regarding Nodelist length in IE
	var length = !!obj && "length" in obj && obj.length,
		type = toType( obj );

	if ( isFunction( obj ) || isWindow( obj ) ) {
		return false;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.3.4
 * https://sizzlejs.com/
 *
 * Copyright JS Foundation and other contributors
 * Released under the MIT license
 * https://js.foundation/
 *
 * Date: 2019-04-08
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	nonnativeSelectorCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// https://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",

	// http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = "(?:\\\\.|[\\w-]|[^\0-\\xa0])+",

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + identifier + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),
	rdescend = new RegExp( whitespace + "|>" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + identifier + ")" ),
		"CLASS": new RegExp( "^\\.(" + identifier + ")" ),
		"TAG": new RegExp( "^(" + identifier + "|[*])" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rhtml = /HTML$/i,
	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,

	// CSS escapes
	// http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// CSS string/identifier serialization
	// https://drafts.csswg.org/cssom/#common-serializing-idioms
	rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
	fcssescape = function( ch, asCodePoint ) {
		if ( asCodePoint ) {

			// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
			if ( ch === "\0" ) {
				return "\uFFFD";
			}

			// Control characters and (dependent upon position) numbers get escaped as code points
			return ch.slice( 0, -1 ) + "\\" + ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
		}

		// Other potentially-special ASCII characters get backslash-escaped
		return "\\" + ch;
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	},

	inDisabledFieldset = addCombinator(
		function( elem ) {
			return elem.disabled === true && elem.nodeName.toLowerCase() === "fieldset";
		},
		{ dir: "parentNode", next: "legend" }
	);

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var m, i, elem, nid, match, groups, newSelector,
		newContext = context && context.ownerDocument,

		// nodeType defaults to 9, since context defaults to document
		nodeType = context ? context.nodeType : 9;

	results = results || [];

	// Return early from calls with invalid selector or context
	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	// Try to shortcut find operations (as opposed to filters) in HTML documents
	if ( !seed ) {

		if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
			setDocument( context );
		}
		context = context || document;

		if ( documentIsHTML ) {

			// If the selector is sufficiently simple, try using a "get*By*" DOM method
			// (excepting DocumentFragment context, where the methods don't exist)
			if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {

				// ID selector
				if ( (m = match[1]) ) {

					// Document context
					if ( nodeType === 9 ) {
						if ( (elem = context.getElementById( m )) ) {

							// Support: IE, Opera, Webkit
							// TODO: identify versions
							// getElementById can match elements by name instead of ID
							if ( elem.id === m ) {
								results.push( elem );
								return results;
							}
						} else {
							return results;
						}

					// Element context
					} else {

						// Support: IE, Opera, Webkit
						// TODO: identify versions
						// getElementById can match elements by name instead of ID
						if ( newContext && (elem = newContext.getElementById( m )) &&
							contains( context, elem ) &&
							elem.id === m ) {

							results.push( elem );
							return results;
						}
					}

				// Type selector
				} else if ( match[2] ) {
					push.apply( results, context.getElementsByTagName( selector ) );
					return results;

				// Class selector
				} else if ( (m = match[3]) && support.getElementsByClassName &&
					context.getElementsByClassName ) {

					push.apply( results, context.getElementsByClassName( m ) );
					return results;
				}
			}

			// Take advantage of querySelectorAll
			if ( support.qsa &&
				!nonnativeSelectorCache[ selector + " " ] &&
				(!rbuggyQSA || !rbuggyQSA.test( selector )) &&

				// Support: IE 8 only
				// Exclude object elements
				(nodeType !== 1 || context.nodeName.toLowerCase() !== "object") ) {

				newSelector = selector;
				newContext = context;

				// qSA considers elements outside a scoping root when evaluating child or
				// descendant combinators, which is not what we want.
				// In such cases, we work around the behavior by prefixing every selector in the
				// list with an ID selector referencing the scope context.
				// Thanks to Andrew Dupont for this technique.
				if ( nodeType === 1 && rdescend.test( selector ) ) {

					// Capture the context ID, setting it first if necessary
					if ( (nid = context.getAttribute( "id" )) ) {
						nid = nid.replace( rcssescape, fcssescape );
					} else {
						context.setAttribute( "id", (nid = expando) );
					}

					// Prefix every selector in the list
					groups = tokenize( selector );
					i = groups.length;
					while ( i-- ) {
						groups[i] = "#" + nid + " " + toSelector( groups[i] );
					}
					newSelector = groups.join( "," );

					// Expand context for sibling selectors
					newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
						context;
				}

				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch ( qsaError ) {
					nonnativeSelectorCache( selector, true );
				} finally {
					if ( nid === expando ) {
						context.removeAttribute( "id" );
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {function(string, object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created element and returns a boolean result
 */
function assert( fn ) {
	var el = document.createElement("fieldset");

	try {
		return !!fn( el );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( el.parentNode ) {
			el.parentNode.removeChild( el );
		}
		// release memory in IE
		el = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = arr.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			a.sourceIndex - b.sourceIndex;

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for :enabled/:disabled
 * @param {Boolean} disabled true for :disabled; false for :enabled
 */
function createDisabledPseudo( disabled ) {

	// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
	return function( elem ) {

		// Only certain elements can match :enabled or :disabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
		// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
		if ( "form" in elem ) {

			// Check for inherited disabledness on relevant non-disabled elements:
			// * listed form-associated elements in a disabled fieldset
			//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
			// * option elements in a disabled optgroup
			//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
			// All such elements have a "form" property.
			if ( elem.parentNode && elem.disabled === false ) {

				// Option elements defer to a parent optgroup if present
				if ( "label" in elem ) {
					if ( "label" in elem.parentNode ) {
						return elem.parentNode.disabled === disabled;
					} else {
						return elem.disabled === disabled;
					}
				}

				// Support: IE 6 - 11
				// Use the isDisabled shortcut property to check for disabled fieldset ancestors
				return elem.isDisabled === disabled ||

					// Where there is no isDisabled, check manually
					/* jshint -W018 */
					elem.isDisabled !== !disabled &&
						inDisabledFieldset( elem ) === disabled;
			}

			return elem.disabled === disabled;

		// Try to winnow out elements that can't be disabled before trusting the disabled property.
		// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
		// even exist on them, let alone have a boolean value.
		} else if ( "label" in elem ) {
			return elem.disabled === disabled;
		}

		// Remaining elements are neither :enabled nor :disabled
		return false;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	var namespace = elem.namespaceURI,
		docElem = (elem.ownerDocument || elem).documentElement;

	// Support: IE <=8
	// Assume HTML when documentElement doesn't yet exist, such as inside loading iframes
	// https://bugs.jquery.com/ticket/4833
	return !rhtml.test( namespace || docElem && docElem.nodeName || "HTML" );
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, subWindow,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// Return early if doc is invalid or already selected
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Update global variables
	document = doc;
	docElem = document.documentElement;
	documentIsHTML = !isXML( document );

	// Support: IE 9-11, Edge
	// Accessing iframe documents after unload throws "permission denied" errors (jQuery #13936)
	if ( preferredDoc !== document &&
		(subWindow = document.defaultView) && subWindow.top !== subWindow ) {

		// Support: IE 11, Edge
		if ( subWindow.addEventListener ) {
			subWindow.addEventListener( "unload", unloadHandler, false );

		// Support: IE 9 - 10 only
		} else if ( subWindow.attachEvent ) {
			subWindow.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( el ) {
		el.className = "i";
		return !el.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( el ) {
		el.appendChild( document.createComment("") );
		return !el.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( document.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programmatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( el ) {
		docElem.appendChild( el ).id = expando;
		return !document.getElementsByName || !document.getElementsByName( expando ).length;
	});

	// ID filter and find
	if ( support.getById ) {
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var elem = context.getElementById( id );
				return elem ? [ elem ] : [];
			}
		};
	} else {
		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" &&
					elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};

		// Support: IE 6 - 7 only
		// getElementById is not reliable as a find shortcut
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var node, i, elems,
					elem = context.getElementById( id );

				if ( elem ) {

					// Verify the id attribute
					node = elem.getAttributeNode("id");
					if ( node && node.value === id ) {
						return [ elem ];
					}

					// Fall back on getElementsByName
					elems = context.getElementsByName( id );
					i = 0;
					while ( (elem = elems[i++]) ) {
						node = elem.getAttributeNode("id");
						if ( node && node.value === id ) {
							return [ elem ];
						}
					}
				}

				return [];
			}
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See https://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( document.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( el ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// https://bugs.jquery.com/ticket/12359
			docElem.appendChild( el ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\r\\' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// https://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( el.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !el.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.4, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.8+
			if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !el.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibling-combinator selector` fails
			if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( el ) {
			el.innerHTML = "<a href='' disabled='disabled'></a>" +
				"<select disabled='disabled'><option/></select>";

			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = document.createElement("input");
			input.setAttribute( "type", "hidden" );
			el.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( el.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( el.querySelectorAll(":enabled").length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Support: IE9-11+
			// IE's :disabled selector does not pick up the children of disabled fieldsets
			docElem.appendChild( el ).disabled = true;
			if ( el.querySelectorAll(":disabled").length !== 2 ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			el.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( el ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( el, "*" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( el, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully self-exclusive
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === document || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === document || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === document ? -1 :
				b === document ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	if ( support.matchesSelector && documentIsHTML &&
		!nonnativeSelectorCache[ expr + " " ] &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {
			nonnativeSelectorCache( expr, true );
		}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.escape = function( sel ) {
	return (sel + "").replace( rcssescape, fcssescape );
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, uniqueCache, outerCache, node, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType,
						diff = false;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) {

										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {

							// Seek `elem` from a previously-cached index

							// ...in a gzip-friendly way
							node = parent;
							outerCache = node[ expando ] || (node[ expando ] = {});

							// Support: IE <9 only
							// Defend against cloned attroperties (jQuery gh-1709)
							uniqueCache = outerCache[ node.uniqueID ] ||
								(outerCache[ node.uniqueID ] = {});

							cache = uniqueCache[ type ] || [];
							nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
							diff = nodeIndex && cache[ 2 ];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									uniqueCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						} else {
							// Use previously-cached element index if available
							if ( useCache ) {
								// ...in a gzip-friendly way
								node = elem;
								outerCache = node[ expando ] || (node[ expando ] = {});

								// Support: IE <9 only
								// Defend against cloned attroperties (jQuery gh-1709)
								uniqueCache = outerCache[ node.uniqueID ] ||
									(outerCache[ node.uniqueID ] = {});

								cache = uniqueCache[ type ] || [];
								nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
								diff = nodeIndex;
							}

							// xml :nth-child(...)
							// or :nth-last-child(...) or :nth(-last)?-of-type(...)
							if ( diff === false ) {
								// Use the same loop as above to seek `elem` from the start
								while ( (node = ++nodeIndex && node && node[ dir ] ||
									(diff = nodeIndex = 0) || start.pop()) ) {

									if ( ( ofType ?
										node.nodeName.toLowerCase() === name :
										node.nodeType === 1 ) &&
										++diff ) {

										// Cache the index of each encountered element
										if ( useCache ) {
											outerCache = node[ expando ] || (node[ expando ] = {});

											// Support: IE <9 only
											// Defend against cloned attroperties (jQuery gh-1709)
											uniqueCache = outerCache[ node.uniqueID ] ||
												(outerCache[ node.uniqueID ] = {});

											uniqueCache[ type ] = [ dirruns, diff ];
										}

										if ( node === elem ) {
											break;
										}
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": createDisabledPseudo( false ),
		"disabled": createDisabledPseudo( true ),

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ?
				argument + length :
				argument > length ?
					length :
					argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		skip = combinator.next,
		key = skip || dir,
		checkNonElements = base && key === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
			return false;
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, uniqueCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});

						// Support: IE <9 only
						// Defend against cloned attroperties (jQuery gh-1709)
						uniqueCache = outerCache[ elem.uniqueID ] || (outerCache[ elem.uniqueID ] = {});

						if ( skip && skip === elem.nodeName.toLowerCase() ) {
							elem = elem[ dir ] || elem;
						} else if ( (oldCache = uniqueCache[ key ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							uniqueCache[ key ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
			return false;
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context === document || context || outermost;
			}

			// Add elements passing elementMatchers directly to results
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					if ( !context && elem.ownerDocument !== document ) {
						setDocument( elem );
						xml = !documentIsHTML;
					}
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context || document, xml) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// `i` is now the count of elements visited above, and adding it to `matchedCount`
			// makes the latter nonnegative.
			matchedCount += i;

			// Apply set filters to unmatched elements
			// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
			// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
			// no element matchers and no seed.
			// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
			// case, which will result in a "00" `matchedCount` that differs from `i` but is also
			// numerically zero.
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is only one selector in the list and no seed
	// (the latter of which guarantees us context)
	if ( match.length === 1 ) {

		// Reduce context if the leading compound selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( el ) {
	// Should return 1, but returns 4 (following)
	return el.compareDocumentPosition( document.createElement("fieldset") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// https://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( el ) {
	el.innerHTML = "<a href='#'></a>";
	return el.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( el ) {
	el.innerHTML = "<input/>";
	el.firstChild.setAttribute( "value", "" );
	return el.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( el ) {
	return el.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;

// Deprecated
jQuery.expr[ ":" ] = jQuery.expr.pseudos;
jQuery.uniqueSort = jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;
jQuery.escapeSelector = Sizzle.escape;




var dir = function( elem, dir, until ) {
	var matched = [],
		truncate = until !== undefined;

	while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
		if ( elem.nodeType === 1 ) {
			if ( truncate && jQuery( elem ).is( until ) ) {
				break;
			}
			matched.push( elem );
		}
	}
	return matched;
};


var siblings = function( n, elem ) {
	var matched = [];

	for ( ; n; n = n.nextSibling ) {
		if ( n.nodeType === 1 && n !== elem ) {
			matched.push( n );
		}
	}

	return matched;
};


var rneedsContext = jQuery.expr.match.needsContext;



function nodeName( elem, name ) {

  return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

};
var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			return !!qualifier.call( elem, i, elem ) !== not;
		} );
	}

	// Single element
	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		} );
	}

	// Arraylike of elements (jQuery, arguments, Array)
	if ( typeof qualifier !== "string" ) {
		return jQuery.grep( elements, function( elem ) {
			return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
		} );
	}

	// Filtered directly for both simple and complex selectors
	return jQuery.filter( qualifier, elements, not );
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	if ( elems.length === 1 && elem.nodeType === 1 ) {
		return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
	}

	return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
		return elem.nodeType === 1;
	} ) );
};

jQuery.fn.extend( {
	find: function( selector ) {
		var i, ret,
			len = this.length,
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter( function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			} ) );
		}

		ret = this.pushStack( [] );

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		return len > 1 ? jQuery.uniqueSort( ret ) : ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow( this, selector || [], false ) );
	},
	not: function( selector ) {
		return this.pushStack( winnow( this, selector || [], true ) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
} );


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	// Shortcut simple #id case for speed
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

	init = jQuery.fn.init = function( selector, context, root ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Method init() accepts an alternate rootjQuery
		// so migrate can support jQuery.sub (gh-2101)
		root = root || rootjQuery;

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[ 0 ] === "<" &&
				selector[ selector.length - 1 ] === ">" &&
				selector.length >= 3 ) {

				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && ( match[ 1 ] || !context ) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[ 1 ] ) {
					context = context instanceof jQuery ? context[ 0 ] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[ 1 ],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {

							// Properties of context are called as methods if possible
							if ( isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[ 2 ] );

					if ( elem ) {

						// Inject the element directly into the jQuery object
						this[ 0 ] = elem;
						this.length = 1;
					}
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || root ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this[ 0 ] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( isFunction( selector ) ) {
			return root.ready !== undefined ?
				root.ready( selector ) :

				// Execute immediately if ready is not present
				selector( jQuery );
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,

	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend( {
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter( function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[ i ] ) ) {
					return true;
				}
			}
		} );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			targets = typeof selectors !== "string" && jQuery( selectors );

		// Positional selectors never match, since there's no _selection_ context
		if ( !rneedsContext.test( selectors ) ) {
			for ( ; i < l; i++ ) {
				for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

					// Always skip document fragments
					if ( cur.nodeType < 11 && ( targets ?
						targets.index( cur ) > -1 :

						// Don't pass non-elements to Sizzle
						cur.nodeType === 1 &&
							jQuery.find.matchesSelector( cur, selectors ) ) ) {

						matched.push( cur );
						break;
					}
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.uniqueSort(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter( selector )
		);
	}
} );

function sibling( cur, dir ) {
	while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each( {
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return siblings( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return siblings( elem.firstChild );
	},
	contents: function( elem ) {
		if ( typeof elem.contentDocument !== "undefined" ) {
			return elem.contentDocument;
		}

		// Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
		// Treat the template element as a regular one in browsers that
		// don't support it.
		if ( nodeName( elem, "template" ) ) {
			elem = elem.content || elem;
		}

		return jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {

			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.uniqueSort( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
} );
var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



// Convert String-formatted options into Object-formatted ones
function createOptions( options ) {
	var object = {};
	jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	} );
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		createOptions( options ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,

		// Last fire value for non-forgettable lists
		memory,

		// Flag to know if list was already fired
		fired,

		// Flag to prevent firing
		locked,

		// Actual callback list
		list = [],

		// Queue of execution data for repeatable lists
		queue = [],

		// Index of currently firing callback (modified by add/remove as needed)
		firingIndex = -1,

		// Fire callbacks
		fire = function() {

			// Enforce single-firing
			locked = locked || options.once;

			// Execute callbacks for all pending executions,
			// respecting firingIndex overrides and runtime changes
			fired = firing = true;
			for ( ; queue.length; firingIndex = -1 ) {
				memory = queue.shift();
				while ( ++firingIndex < list.length ) {

					// Run callback and check for early termination
					if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
						options.stopOnFalse ) {

						// Jump to end and forget the data so .add doesn't re-fire
						firingIndex = list.length;
						memory = false;
					}
				}
			}

			// Forget the data if we're done with it
			if ( !options.memory ) {
				memory = false;
			}

			firing = false;

			// Clean up if we're done firing for good
			if ( locked ) {

				// Keep an empty list if we have data for future add calls
				if ( memory ) {
					list = [];

				// Otherwise, this object is spent
				} else {
					list = "";
				}
			}
		},

		// Actual Callbacks object
		self = {

			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {

					// If we have memory from a past run, we should fire after adding
					if ( memory && !firing ) {
						firingIndex = list.length - 1;
						queue.push( memory );
					}

					( function add( args ) {
						jQuery.each( args, function( _, arg ) {
							if ( isFunction( arg ) ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && toType( arg ) !== "string" ) {

								// Inspect recursively
								add( arg );
							}
						} );
					} )( arguments );

					if ( memory && !firing ) {
						fire();
					}
				}
				return this;
			},

			// Remove a callback from the list
			remove: function() {
				jQuery.each( arguments, function( _, arg ) {
					var index;
					while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
						list.splice( index, 1 );

						// Handle firing indexes
						if ( index <= firingIndex ) {
							firingIndex--;
						}
					}
				} );
				return this;
			},

			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ?
					jQuery.inArray( fn, list ) > -1 :
					list.length > 0;
			},

			// Remove all callbacks from the list
			empty: function() {
				if ( list ) {
					list = [];
				}
				return this;
			},

			// Disable .fire and .add
			// Abort any current/pending executions
			// Clear all callbacks and values
			disable: function() {
				locked = queue = [];
				list = memory = "";
				return this;
			},
			disabled: function() {
				return !list;
			},

			// Disable .fire
			// Also disable .add unless we have memory (since it would have no effect)
			// Abort any pending executions
			lock: function() {
				locked = queue = [];
				if ( !memory && !firing ) {
					list = memory = "";
				}
				return this;
			},
			locked: function() {
				return !!locked;
			},

			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( !locked ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					queue.push( args );
					if ( !firing ) {
						fire();
					}
				}
				return this;
			},

			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},

			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


function Identity( v ) {
	return v;
}
function Thrower( ex ) {
	throw ex;
}

function adoptValue( value, resolve, reject, noValue ) {
	var method;

	try {

		// Check for promise aspect first to privilege synchronous behavior
		if ( value && isFunction( ( method = value.promise ) ) ) {
			method.call( value ).done( resolve ).fail( reject );

		// Other thenables
		} else if ( value && isFunction( ( method = value.then ) ) ) {
			method.call( value, resolve, reject );

		// Other non-thenables
		} else {

			// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
			// * false: [ value ].slice( 0 ) => resolve( value )
			// * true: [ value ].slice( 1 ) => resolve()
			resolve.apply( undefined, [ value ].slice( noValue ) );
		}

	// For Promises/A+, convert exceptions into rejections
	// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
	// Deferred#then to conditionally suppress rejection.
	} catch ( value ) {

		// Support: Android 4.0 only
		// Strict mode functions invoked without .call/.apply get global-object context
		reject.apply( undefined, [ value ] );
	}
}

jQuery.extend( {

	Deferred: function( func ) {
		var tuples = [

				// action, add listener, callbacks,
				// ... .then handlers, argument index, [final state]
				[ "notify", "progress", jQuery.Callbacks( "memory" ),
					jQuery.Callbacks( "memory" ), 2 ],
				[ "resolve", "done", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 0, "resolved" ],
				[ "reject", "fail", jQuery.Callbacks( "once memory" ),
					jQuery.Callbacks( "once memory" ), 1, "rejected" ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				"catch": function( fn ) {
					return promise.then( null, fn );
				},

				// Keep pipe for back-compat
				pipe: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;

					return jQuery.Deferred( function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {

							// Map tuples (progress, done, fail) to arguments (done, fail, progress)
							var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

							// deferred.progress(function() { bind to newDefer or newDefer.notify })
							// deferred.done(function() { bind to newDefer or newDefer.resolve })
							// deferred.fail(function() { bind to newDefer or newDefer.reject })
							deferred[ tuple[ 1 ] ]( function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && isFunction( returned.promise ) ) {
									returned.promise()
										.progress( newDefer.notify )
										.done( newDefer.resolve )
										.fail( newDefer.reject );
								} else {
									newDefer[ tuple[ 0 ] + "With" ](
										this,
										fn ? [ returned ] : arguments
									);
								}
							} );
						} );
						fns = null;
					} ).promise();
				},
				then: function( onFulfilled, onRejected, onProgress ) {
					var maxDepth = 0;
					function resolve( depth, deferred, handler, special ) {
						return function() {
							var that = this,
								args = arguments,
								mightThrow = function() {
									var returned, then;

									// Support: Promises/A+ section 2.3.3.3.3
									// https://promisesaplus.com/#point-59
									// Ignore double-resolution attempts
									if ( depth < maxDepth ) {
										return;
									}

									returned = handler.apply( that, args );

									// Support: Promises/A+ section 2.3.1
									// https://promisesaplus.com/#point-48
									if ( returned === deferred.promise() ) {
										throw new TypeError( "Thenable self-resolution" );
									}

									// Support: Promises/A+ sections 2.3.3.1, 3.5
									// https://promisesaplus.com/#point-54
									// https://promisesaplus.com/#point-75
									// Retrieve `then` only once
									then = returned &&

										// Support: Promises/A+ section 2.3.4
										// https://promisesaplus.com/#point-64
										// Only check objects and functions for thenability
										( typeof returned === "object" ||
											typeof returned === "function" ) &&
										returned.then;

									// Handle a returned thenable
									if ( isFunction( then ) ) {

										// Special processors (notify) just wait for resolution
										if ( special ) {
											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special )
											);

										// Normal processors (resolve) also hook into progress
										} else {

											// ...and disregard older resolution values
											maxDepth++;

											then.call(
												returned,
												resolve( maxDepth, deferred, Identity, special ),
												resolve( maxDepth, deferred, Thrower, special ),
												resolve( maxDepth, deferred, Identity,
													deferred.notifyWith )
											);
										}

									// Handle all other returned values
									} else {

										// Only substitute handlers pass on context
										// and multiple values (non-spec behavior)
										if ( handler !== Identity ) {
											that = undefined;
											args = [ returned ];
										}

										// Process the value(s)
										// Default process is resolve
										( special || deferred.resolveWith )( that, args );
									}
								},

								// Only normal processors (resolve) catch and reject exceptions
								process = special ?
									mightThrow :
									function() {
										try {
											mightThrow();
										} catch ( e ) {

											if ( jQuery.Deferred.exceptionHook ) {
												jQuery.Deferred.exceptionHook( e,
													process.stackTrace );
											}

											// Support: Promises/A+ section 2.3.3.3.4.1
											// https://promisesaplus.com/#point-61
											// Ignore post-resolution exceptions
											if ( depth + 1 >= maxDepth ) {

												// Only substitute handlers pass on context
												// and multiple values (non-spec behavior)
												if ( handler !== Thrower ) {
													that = undefined;
													args = [ e ];
												}

												deferred.rejectWith( that, args );
											}
										}
									};

							// Support: Promises/A+ section 2.3.3.3.1
							// https://promisesaplus.com/#point-57
							// Re-resolve promises immediately to dodge false rejection from
							// subsequent errors
							if ( depth ) {
								process();
							} else {

								// Call an optional hook to record the stack, in case of exception
								// since it's otherwise lost when execution goes async
								if ( jQuery.Deferred.getStackHook ) {
									process.stackTrace = jQuery.Deferred.getStackHook();
								}
								window.setTimeout( process );
							}
						};
					}

					return jQuery.Deferred( function( newDefer ) {

						// progress_handlers.add( ... )
						tuples[ 0 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onProgress ) ?
									onProgress :
									Identity,
								newDefer.notifyWith
							)
						);

						// fulfilled_handlers.add( ... )
						tuples[ 1 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onFulfilled ) ?
									onFulfilled :
									Identity
							)
						);

						// rejected_handlers.add( ... )
						tuples[ 2 ][ 3 ].add(
							resolve(
								0,
								newDefer,
								isFunction( onRejected ) ?
									onRejected :
									Thrower
							)
						);
					} ).promise();
				},

				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 5 ];

			// promise.progress = list.add
			// promise.done = list.add
			// promise.fail = list.add
			promise[ tuple[ 1 ] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(
					function() {

						// state = "resolved" (i.e., fulfilled)
						// state = "rejected"
						state = stateString;
					},

					// rejected_callbacks.disable
					// fulfilled_callbacks.disable
					tuples[ 3 - i ][ 2 ].disable,

					// rejected_handlers.disable
					// fulfilled_handlers.disable
					tuples[ 3 - i ][ 3 ].disable,

					// progress_callbacks.lock
					tuples[ 0 ][ 2 ].lock,

					// progress_handlers.lock
					tuples[ 0 ][ 3 ].lock
				);
			}

			// progress_handlers.fire
			// fulfilled_handlers.fire
			// rejected_handlers.fire
			list.add( tuple[ 3 ].fire );

			// deferred.notify = function() { deferred.notifyWith(...) }
			// deferred.resolve = function() { deferred.resolveWith(...) }
			// deferred.reject = function() { deferred.rejectWith(...) }
			deferred[ tuple[ 0 ] ] = function() {
				deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
				return this;
			};

			// deferred.notifyWith = list.fireWith
			// deferred.resolveWith = list.fireWith
			// deferred.rejectWith = list.fireWith
			deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
		} );

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( singleValue ) {
		var

			// count of uncompleted subordinates
			remaining = arguments.length,

			// count of unprocessed arguments
			i = remaining,

			// subordinate fulfillment data
			resolveContexts = Array( i ),
			resolveValues = slice.call( arguments ),

			// the master Deferred
			master = jQuery.Deferred(),

			// subordinate callback factory
			updateFunc = function( i ) {
				return function( value ) {
					resolveContexts[ i ] = this;
					resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( !( --remaining ) ) {
						master.resolveWith( resolveContexts, resolveValues );
					}
				};
			};

		// Single- and empty arguments are adopted like Promise.resolve
		if ( remaining <= 1 ) {
			adoptValue( singleValue, master.done( updateFunc( i ) ).resolve, master.reject,
				!remaining );

			// Use .then() to unwrap secondary thenables (cf. gh-3000)
			if ( master.state() === "pending" ||
				isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

				return master.then();
			}
		}

		// Multiple arguments are aggregated like Promise.all array elements
		while ( i-- ) {
			adoptValue( resolveValues[ i ], updateFunc( i ), master.reject );
		}

		return master.promise();
	}
} );


// These usually indicate a programmer mistake during development,
// warn about them ASAP rather than swallowing them by default.
var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

jQuery.Deferred.exceptionHook = function( error, stack ) {

	// Support: IE 8 - 9 only
	// Console exists when dev tools are open, which can happen at any time
	if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
		window.console.warn( "jQuery.Deferred exception: " + error.message, error.stack, stack );
	}
};




jQuery.readyException = function( error ) {
	window.setTimeout( function() {
		throw error;
	} );
};




// The deferred used on DOM ready
var readyList = jQuery.Deferred();

jQuery.fn.ready = function( fn ) {

	readyList
		.then( fn )

		// Wrap jQuery.readyException in a function so that the lookup
		// happens at the time of error handling instead of callback
		// registration.
		.catch( function( error ) {
			jQuery.readyException( error );
		} );

	return this;
};

jQuery.extend( {

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );
	}
} );

jQuery.ready.then = readyList.then;

// The ready event handler and self cleanup method
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed );
	window.removeEventListener( "load", completed );
	jQuery.ready();
}

// Catch cases where $(document).ready() is called
// after the browser event has already occurred.
// Support: IE <=9 - 10 only
// Older IE sometimes signals "interactive" too soon
if ( document.readyState === "complete" ||
	( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

	// Handle it asynchronously to allow scripts the opportunity to delay ready
	window.setTimeout( jQuery.ready );

} else {

	// Use the handy event callback
	document.addEventListener( "DOMContentLoaded", completed );

	// A fallback to window.onload, that will always work
	window.addEventListener( "load", completed );
}




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( toType( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			access( elems, fn, i, key[ i ], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {

			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn(
					elems[ i ], key, raw ?
					value :
					value.call( elems[ i ], i, fn( elems[ i ], key ) )
				);
			}
		}
	}

	if ( chainable ) {
		return elems;
	}

	// Gets
	if ( bulk ) {
		return fn.call( elems );
	}

	return len ? fn( elems[ 0 ], key ) : emptyGet;
};


// Matches dashed string for camelizing
var rmsPrefix = /^-ms-/,
	rdashAlpha = /-([a-z])/g;

// Used by camelCase as callback to replace()
function fcamelCase( all, letter ) {
	return letter.toUpperCase();
}

// Convert dashed to camelCase; used by the css and data modules
// Support: IE <=9 - 11, Edge 12 - 15
// Microsoft forgot to hump their vendor prefix (#9572)
function camelCase( string ) {
	return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
}
var acceptData = function( owner ) {

	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};




function Data() {
	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;

Data.prototype = {

	cache: function( owner ) {

		// Check if the owner object already has a cache
		var value = owner[ this.expando ];

		// If not, create one
		if ( !value ) {
			value = {};

			// We can accept data for non-element nodes in modern browsers,
			// but we should not, see #8335.
			// Always return an empty object.
			if ( acceptData( owner ) ) {

				// If it is a node unlikely to be stringify-ed or looped over
				// use plain assignment
				if ( owner.nodeType ) {
					owner[ this.expando ] = value;

				// Otherwise secure it in a non-enumerable property
				// configurable must be true to allow the property to be
				// deleted when data is removed
				} else {
					Object.defineProperty( owner, this.expando, {
						value: value,
						configurable: true
					} );
				}
			}
		}

		return value;
	},
	set: function( owner, data, value ) {
		var prop,
			cache = this.cache( owner );

		// Handle: [ owner, key, value ] args
		// Always use camelCase key (gh-2257)
		if ( typeof data === "string" ) {
			cache[ camelCase( data ) ] = value;

		// Handle: [ owner, { properties } ] args
		} else {

			// Copy the properties one-by-one to the cache object
			for ( prop in data ) {
				cache[ camelCase( prop ) ] = data[ prop ];
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		return key === undefined ?
			this.cache( owner ) :

			// Always use camelCase key (gh-2257)
			owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
	},
	access: function( owner, key, value ) {

		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				( ( key && typeof key === "string" ) && value === undefined ) ) {

			return this.get( owner, key );
		}

		// When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i,
			cache = owner[ this.expando ];

		if ( cache === undefined ) {
			return;
		}

		if ( key !== undefined ) {

			// Support array or space separated string of keys
			if ( Array.isArray( key ) ) {

				// If key is an array of keys...
				// We always set camelCase keys, so remove that.
				key = key.map( camelCase );
			} else {
				key = camelCase( key );

				// If a key with the spaces exists, use it.
				// Otherwise, create an array by matching non-whitespace
				key = key in cache ?
					[ key ] :
					( key.match( rnothtmlwhite ) || [] );
			}

			i = key.length;

			while ( i-- ) {
				delete cache[ key[ i ] ];
			}
		}

		// Remove the expando if there's no more data
		if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

			// Support: Chrome <=35 - 45
			// Webkit & Blink performance suffers when deleting properties
			// from DOM nodes, so set to undefined instead
			// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
			if ( owner.nodeType ) {
				owner[ this.expando ] = undefined;
			} else {
				delete owner[ this.expando ];
			}
		}
	},
	hasData: function( owner ) {
		var cache = owner[ this.expando ];
		return cache !== undefined && !jQuery.isEmptyObject( cache );
	}
};
var dataPriv = new Data();

var dataUser = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /[A-Z]/g;

function getData( data ) {
	if ( data === "true" ) {
		return true;
	}

	if ( data === "false" ) {
		return false;
	}

	if ( data === "null" ) {
		return null;
	}

	// Only convert to a number if it doesn't change the string
	if ( data === +data + "" ) {
		return +data;
	}

	if ( rbrace.test( data ) ) {
		return JSON.parse( data );
	}

	return data;
}

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = getData( data );
			} catch ( e ) {}

			// Make sure we set the data so it isn't changed later
			dataUser.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend( {
	hasData: function( elem ) {
		return dataUser.hasData( elem ) || dataPriv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return dataUser.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		dataUser.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to dataPriv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return dataPriv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		dataPriv.remove( elem, name );
	}
} );

jQuery.fn.extend( {
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = dataUser.get( elem );

				if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE 11 only
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = camelCase( name.slice( 5 ) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					dataPriv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each( function() {
				dataUser.set( this, key );
			} );
		}

		return access( this, function( value ) {
			var data;

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {

				// Attempt to get data from the cache
				// The key will always be camelCased in Data
				data = dataUser.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each( function() {

				// We always store the camelCased key
				dataUser.set( this, key, value );
			} );
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each( function() {
			dataUser.remove( this, key );
		} );
	}
} );


jQuery.extend( {
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = dataPriv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || Array.isArray( data ) ) {
					queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
			empty: jQuery.Callbacks( "once memory" ).add( function() {
				dataPriv.remove( elem, [ type + "queue", key ] );
			} )
		} );
	}
} );

jQuery.fn.extend( {
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[ 0 ], type );
		}

		return data === undefined ?
			this :
			this.each( function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			} );
	},
	dequeue: function( type ) {
		return this.each( function() {
			jQuery.dequeue( this, type );
		} );
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},

	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
} );
var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var documentElement = document.documentElement;



	var isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem );
		},
		composed = { composed: true };

	// Support: IE 9 - 11+, Edge 12 - 18+, iOS 10.0 - 10.2 only
	// Check attachment across shadow DOM boundaries when possible (gh-3504)
	// Support: iOS 10.0-10.2 only
	// Early iOS 10 versions support `attachShadow` but not `getRootNode`,
	// leading to errors. We need to check for `getRootNode`.
	if ( documentElement.getRootNode ) {
		isAttached = function( elem ) {
			return jQuery.contains( elem.ownerDocument, elem ) ||
				elem.getRootNode( composed ) === elem.ownerDocument;
		};
	}
var isHiddenWithinTree = function( elem, el ) {

		// isHiddenWithinTree might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;

		// Inline style trumps all
		return elem.style.display === "none" ||
			elem.style.display === "" &&

			// Otherwise, check computed style
			// Support: Firefox <=43 - 45
			// Disconnected elements can have computed display: none, so first confirm that elem is
			// in the document.
			isAttached( elem ) &&

			jQuery.css( elem, "display" ) === "none";
	};

var swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};




function adjustCSS( elem, prop, valueParts, tween ) {
	var adjusted, scale,
		maxIterations = 20,
		currentValue = tween ?
			function() {
				return tween.cur();
			} :
			function() {
				return jQuery.css( elem, prop, "" );
			},
		initial = currentValue(),
		unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

		// Starting value computation is required for potential unit mismatches
		initialInUnit = elem.nodeType &&
			( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
			rcssNum.exec( jQuery.css( elem, prop ) );

	if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

		// Support: Firefox <=54
		// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
		initial = initial / 2;

		// Trust units reported by jQuery.css
		unit = unit || initialInUnit[ 3 ];

		// Iteratively approximate from a nonzero starting point
		initialInUnit = +initial || 1;

		while ( maxIterations-- ) {

			// Evaluate and update our best guess (doubling guesses that zero out).
			// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
			jQuery.style( elem, prop, initialInUnit + unit );
			if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
				maxIterations = 0;
			}
			initialInUnit = initialInUnit / scale;

		}

		initialInUnit = initialInUnit * 2;
		jQuery.style( elem, prop, initialInUnit + unit );

		// Make sure we update the tween properties later on
		valueParts = valueParts || [];
	}

	if ( valueParts ) {
		initialInUnit = +initialInUnit || +initial || 0;

		// Apply relative offset (+=/-=) if specified
		adjusted = valueParts[ 1 ] ?
			initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
			+valueParts[ 2 ];
		if ( tween ) {
			tween.unit = unit;
			tween.start = initialInUnit;
			tween.end = adjusted;
		}
	}
	return adjusted;
}


var defaultDisplayMap = {};

function getDefaultDisplay( elem ) {
	var temp,
		doc = elem.ownerDocument,
		nodeName = elem.nodeName,
		display = defaultDisplayMap[ nodeName ];

	if ( display ) {
		return display;
	}

	temp = doc.body.appendChild( doc.createElement( nodeName ) );
	display = jQuery.css( temp, "display" );

	temp.parentNode.removeChild( temp );

	if ( display === "none" ) {
		display = "block";
	}
	defaultDisplayMap[ nodeName ] = display;

	return display;
}

function showHide( elements, show ) {
	var display, elem,
		values = [],
		index = 0,
		length = elements.length;

	// Determine new display value for elements that need to change
	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		display = elem.style.display;
		if ( show ) {

			// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
			// check is required in this first loop unless we have a nonempty display value (either
			// inline or about-to-be-restored)
			if ( display === "none" ) {
				values[ index ] = dataPriv.get( elem, "display" ) || null;
				if ( !values[ index ] ) {
					elem.style.display = "";
				}
			}
			if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
				values[ index ] = getDefaultDisplay( elem );
			}
		} else {
			if ( display !== "none" ) {
				values[ index ] = "none";

				// Remember what we're overwriting
				dataPriv.set( elem, "display", display );
			}
		}
	}

	// Set the display of the elements in a second loop to avoid constant reflow
	for ( index = 0; index < length; index++ ) {
		if ( values[ index ] != null ) {
			elements[ index ].style.display = values[ index ];
		}
	}

	return elements;
}

jQuery.fn.extend( {
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each( function() {
			if ( isHiddenWithinTree( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		} );
	}
} );
var rcheckableType = ( /^(?:checkbox|radio)$/i );

var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]*)/i );

var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



// We have to close these tags to support XHTML (#13200)
var wrapMap = {

	// Support: IE <=9 only
	option: [ 1, "<select multiple='multiple'>", "</select>" ],

	// XHTML parsers do not magically insert elements in the
	// same way that tag soup parsers do. So we cannot shorten
	// this by omitting <tbody> or other required elements.
	thead: [ 1, "<table>", "</table>" ],
	col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
	tr: [ 2, "<table><tbody>", "</tbody></table>" ],
	td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

	_default: [ 0, "", "" ]
};

// Support: IE <=9 only
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;


function getAll( context, tag ) {

	// Support: IE <=9 - 11 only
	// Use typeof to avoid zero-argument method invocation on host objects (#15151)
	var ret;

	if ( typeof context.getElementsByTagName !== "undefined" ) {
		ret = context.getElementsByTagName( tag || "*" );

	} else if ( typeof context.querySelectorAll !== "undefined" ) {
		ret = context.querySelectorAll( tag || "*" );

	} else {
		ret = [];
	}

	if ( tag === undefined || tag && nodeName( context, tag ) ) {
		return jQuery.merge( [ context ], ret );
	}

	return ret;
}


// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		dataPriv.set(
			elems[ i ],
			"globalEval",
			!refElements || dataPriv.get( refElements[ i ], "globalEval" )
		);
	}
}


var rhtml = /<|&#?\w+;/;

function buildFragment( elems, context, scripts, selection, ignored ) {
	var elem, tmp, tag, wrap, attached, j,
		fragment = context.createDocumentFragment(),
		nodes = [],
		i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		elem = elems[ i ];

		if ( elem || elem === 0 ) {

			// Add nodes directly
			if ( toType( elem ) === "object" ) {

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

			// Convert non-html into a text node
			} else if ( !rhtml.test( elem ) ) {
				nodes.push( context.createTextNode( elem ) );

			// Convert html into DOM nodes
			} else {
				tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

				// Deserialize a standard representation
				tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
				wrap = wrapMap[ tag ] || wrapMap._default;
				tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

				// Descend through wrappers to the right content
				j = wrap[ 0 ];
				while ( j-- ) {
					tmp = tmp.lastChild;
				}

				// Support: Android <=4.0 only, PhantomJS 1 only
				// push.apply(_, arraylike) throws on ancient WebKit
				jQuery.merge( nodes, tmp.childNodes );

				// Remember the top-level container
				tmp = fragment.firstChild;

				// Ensure the created nodes are orphaned (#12392)
				tmp.textContent = "";
			}
		}
	}

	// Remove wrapper from fragment
	fragment.textContent = "";

	i = 0;
	while ( ( elem = nodes[ i++ ] ) ) {

		// Skip elements already in the context collection (trac-4087)
		if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
			if ( ignored ) {
				ignored.push( elem );
			}
			continue;
		}

		attached = isAttached( elem );

		// Append to fragment
		tmp = getAll( fragment.appendChild( elem ), "script" );

		// Preserve script evaluation history
		if ( attached ) {
			setGlobalEval( tmp );
		}

		// Capture executables
		if ( scripts ) {
			j = 0;
			while ( ( elem = tmp[ j++ ] ) ) {
				if ( rscriptType.test( elem.type || "" ) ) {
					scripts.push( elem );
				}
			}
		}
	}

	return fragment;
}


( function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Android 4.0 - 4.3 only
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Android <=4.1 only
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE <=11 only
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
} )();


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

// Support: IE <=9 - 11+
// focus() and blur() are asynchronous, except when they are no-op.
// So expect focus to be synchronous when the element is already active,
// and blur to be synchronous when the element is not already active.
// (focus and blur are always synchronous in other supported browsers,
// this just defines when we can count on it).
function expectSync( elem, type ) {
	return ( elem === safeActiveElement() ) === ( type === "focus" );
}

// Support: IE <=9 only
// Accessing document.activeElement can throw unexpectedly
// https://bugs.jquery.com/ticket/13393
function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

function on( elem, types, selector, data, fn, one ) {
	var origFn, type;

	// Types can be a map of types/handlers
	if ( typeof types === "object" ) {

		// ( types-Object, selector, data )
		if ( typeof selector !== "string" ) {

			// ( types-Object, data )
			data = data || selector;
			selector = undefined;
		}
		for ( type in types ) {
			on( elem, type, selector, data, types[ type ], one );
		}
		return elem;
	}

	if ( data == null && fn == null ) {

		// ( types, fn )
		fn = selector;
		data = selector = undefined;
	} else if ( fn == null ) {
		if ( typeof selector === "string" ) {

			// ( types, selector, fn )
			fn = data;
			data = undefined;
		} else {

			// ( types, data, fn )
			fn = data;
			data = selector;
			selector = undefined;
		}
	}
	if ( fn === false ) {
		fn = returnFalse;
	} else if ( !fn ) {
		return elem;
	}

	if ( one === 1 ) {
		origFn = fn;
		fn = function( event ) {

			// Can use an empty set, since event contains the info
			jQuery().off( event );
			return origFn.apply( this, arguments );
		};

		// Use same guid so caller can remove using origFn
		fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
	}
	return elem.each( function() {
		jQuery.event.add( this, types, fn, data, selector );
	} );
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Ensure that invalid selectors throw exceptions at attach time
		// Evaluate against documentElement in case elem is a non-element node (e.g., document)
		if ( selector ) {
			jQuery.find.matchesSelector( documentElement, selector );
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !( events = elemData.events ) ) {
			events = elemData.events = {};
		}
		if ( !( eventHandle = elemData.handle ) ) {
			eventHandle = elemData.handle = function( e ) {

				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend( {
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join( "." )
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !( handlers = events[ type ] ) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup ||
					special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

		if ( !elemData || !( events = elemData.events ) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[ t ] ) || [];
			type = origType = tmp[ 1 ];
			namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[ 2 ] &&
				new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector ||
						selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown ||
					special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove data and the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			dataPriv.remove( elem, "handle events" );
		}
	},

	dispatch: function( nativeEvent ) {

		// Make a writable jQuery.Event from the native event object
		var event = jQuery.event.fix( nativeEvent );

		var i, j, ret, matched, handleObj, handlerQueue,
			args = new Array( arguments.length ),
			handlers = ( dataPriv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[ 0 ] = event;

		for ( i = 1; i < arguments.length; i++ ) {
			args[ i ] = arguments[ i ];
		}

		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( ( handleObj = matched.handlers[ j++ ] ) &&
				!event.isImmediatePropagationStopped() ) {

				// If the event is namespaced, then each handler is only invoked if it is
				// specially universal or its namespaces are a superset of the event's.
				if ( !event.rnamespace || handleObj.namespace === false ||
					event.rnamespace.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
						handleObj.handler ).apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( ( event.result = ret ) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, handleObj, sel, matchedHandlers, matchedSelectors,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		if ( delegateCount &&

			// Support: IE <=9
			// Black-hole SVG <use> instance trees (trac-13180)
			cur.nodeType &&

			// Support: Firefox <=42
			// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
			// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
			// Support: IE 11 only
			// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
			!( event.type === "click" && event.button >= 1 ) ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
					matchedHandlers = [];
					matchedSelectors = {};
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matchedSelectors[ sel ] === undefined ) {
							matchedSelectors[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) > -1 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matchedSelectors[ sel ] ) {
							matchedHandlers.push( handleObj );
						}
					}
					if ( matchedHandlers.length ) {
						handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		cur = this;
		if ( delegateCount < handlers.length ) {
			handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
		}

		return handlerQueue;
	},

	addProp: function( name, hook ) {
		Object.defineProperty( jQuery.Event.prototype, name, {
			enumerable: true,
			configurable: true,

			get: isFunction( hook ) ?
				function() {
					if ( this.originalEvent ) {
							return hook( this.originalEvent );
					}
				} :
				function() {
					if ( this.originalEvent ) {
							return this.originalEvent[ name ];
					}
				},

			set: function( value ) {
				Object.defineProperty( this, name, {
					enumerable: true,
					configurable: true,
					writable: true,
					value: value
				} );
			}
		} );
	},

	fix: function( originalEvent ) {
		return originalEvent[ jQuery.expando ] ?
			originalEvent :
			new jQuery.Event( originalEvent );
	},

	special: {
		load: {

			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		click: {

			// Utilize native event to ensure correct state for checkable inputs
			setup: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Claim the first handler
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					// dataPriv.set( el, "click", ... )
					leverageNative( el, "click", returnTrue );
				}

				// Return false to allow normal processing in the caller
				return false;
			},
			trigger: function( data ) {

				// For mutual compressibility with _default, replace `this` access with a local var.
				// `|| data` is dead code meant only to preserve the variable through minification.
				var el = this || data;

				// Force setup before triggering a click
				if ( rcheckableType.test( el.type ) &&
					el.click && nodeName( el, "input" ) ) {

					leverageNative( el, "click" );
				}

				// Return non-false to allow normal event-path propagation
				return true;
			},

			// For cross-browser consistency, suppress native .click() on links
			// Also prevent it if we're currently inside a leveraged native-event stack
			_default: function( event ) {
				var target = event.target;
				return rcheckableType.test( target.type ) &&
					target.click && nodeName( target, "input" ) &&
					dataPriv.get( target, "click" ) ||
					nodeName( target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	}
};

// Ensure the presence of an event listener that handles manually-triggered
// synthetic events by interrupting progress until reinvoked in response to
// *native* events that it fires directly, ensuring that state changes have
// already occurred before other listeners are invoked.
function leverageNative( el, type, expectSync ) {

	// Missing expectSync indicates a trigger call, which must force setup through jQuery.event.add
	if ( !expectSync ) {
		if ( dataPriv.get( el, type ) === undefined ) {
			jQuery.event.add( el, type, returnTrue );
		}
		return;
	}

	// Register the controller as a special universal handler for all event namespaces
	dataPriv.set( el, type, false );
	jQuery.event.add( el, type, {
		namespace: false,
		handler: function( event ) {
			var notAsync, result,
				saved = dataPriv.get( this, type );

			if ( ( event.isTrigger & 1 ) && this[ type ] ) {

				// Interrupt processing of the outer synthetic .trigger()ed event
				// Saved data should be false in such cases, but might be a leftover capture object
				// from an async native handler (gh-4350)
				if ( !saved.length ) {

					// Store arguments for use when handling the inner native event
					// There will always be at least one argument (an event object), so this array
					// will not be confused with a leftover capture object.
					saved = slice.call( arguments );
					dataPriv.set( this, type, saved );

					// Trigger the native event and capture its result
					// Support: IE <=9 - 11+
					// focus() and blur() are asynchronous
					notAsync = expectSync( this, type );
					this[ type ]();
					result = dataPriv.get( this, type );
					if ( saved !== result || notAsync ) {
						dataPriv.set( this, type, false );
					} else {
						result = {};
					}
					if ( saved !== result ) {

						// Cancel the outer synthetic event
						event.stopImmediatePropagation();
						event.preventDefault();
						return result.value;
					}

				// If this is an inner synthetic event for an event with a bubbling surrogate
				// (focus or blur), assume that the surrogate already propagated from triggering the
				// native event and prevent that from happening again here.
				// This technically gets the ordering wrong w.r.t. to `.trigger()` (in which the
				// bubbling surrogate propagates *after* the non-bubbling base), but that seems
				// less bad than duplication.
				} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
					event.stopPropagation();
				}

			// If this is a native event triggered above, everything is now in order
			// Fire an inner synthetic event with the original arguments
			} else if ( saved.length ) {

				// ...and capture the result
				dataPriv.set( this, type, {
					value: jQuery.event.trigger(

						// Support: IE <=9 - 11+
						// Extend with the prototype to reset the above stopImmediatePropagation()
						jQuery.extend( saved[ 0 ], jQuery.Event.prototype ),
						saved.slice( 1 ),
						this
					)
				} );

				// Abort handling of the native event
				event.stopImmediatePropagation();
			}
		}
	} );
}

jQuery.removeEvent = function( elem, type, handle ) {

	// This "if" is needed for plain objects
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle );
	}
};

jQuery.Event = function( src, props ) {

	// Allow instantiation without the 'new' keyword
	if ( !( this instanceof jQuery.Event ) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&

				// Support: Android <=2.3 only
				src.returnValue === false ?
			returnTrue :
			returnFalse;

		// Create target properties
		// Support: Safari <=6 - 7 only
		// Target should not be a text node (#504, #13143)
		this.target = ( src.target && src.target.nodeType === 3 ) ?
			src.target.parentNode :
			src.target;

		this.currentTarget = src.currentTarget;
		this.relatedTarget = src.relatedTarget;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || Date.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	constructor: jQuery.Event,
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,
	isSimulated: false,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && !this.isSimulated ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && !this.isSimulated ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Includes all common event props including KeyEvent and MouseEvent specific props
jQuery.each( {
	altKey: true,
	bubbles: true,
	cancelable: true,
	changedTouches: true,
	ctrlKey: true,
	detail: true,
	eventPhase: true,
	metaKey: true,
	pageX: true,
	pageY: true,
	shiftKey: true,
	view: true,
	"char": true,
	code: true,
	charCode: true,
	key: true,
	keyCode: true,
	button: true,
	buttons: true,
	clientX: true,
	clientY: true,
	offsetX: true,
	offsetY: true,
	pointerId: true,
	pointerType: true,
	screenX: true,
	screenY: true,
	targetTouches: true,
	toElement: true,
	touches: true,

	which: function( event ) {
		var button = event.button;

		// Add which for key events
		if ( event.which == null && rkeyEvent.test( event.type ) ) {
			return event.charCode != null ? event.charCode : event.keyCode;
		}

		// Add which for click: 1 === left; 2 === middle; 3 === right
		if ( !event.which && button !== undefined && rmouseEvent.test( event.type ) ) {
			if ( button & 1 ) {
				return 1;
			}

			if ( button & 2 ) {
				return 3;
			}

			if ( button & 4 ) {
				return 2;
			}

			return 0;
		}

		return event.which;
	}
}, jQuery.event.addProp );

jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {
	jQuery.event.special[ type ] = {

		// Utilize native event if possible so blur/focus sequence is correct
		setup: function() {

			// Claim the first handler
			// dataPriv.set( this, "focus", ... )
			// dataPriv.set( this, "blur", ... )
			leverageNative( this, type, expectSync );

			// Return false to allow normal processing in the caller
			return false;
		},
		trigger: function() {

			// Force setup before trigger
			leverageNative( this, type );

			// Return non-false to allow normal event-path propagation
			return true;
		},

		delegateType: delegateType
	};
} );

// Create mouseenter/leave events using mouseover/out and event-time checks
// so that event delegation works in jQuery.
// Do the same for pointerenter/pointerleave and pointerover/pointerout
//
// Support: Safari 7 only
// Safari sends mouseenter too often; see:
// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
// for the description of the bug (it existed in older Chrome versions as well).
jQuery.each( {
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mouseenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
} );

jQuery.fn.extend( {

	on: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn );
	},
	one: function( types, selector, data, fn ) {
		return on( this, types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {

			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ?
					handleObj.origType + "." + handleObj.namespace :
					handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {

			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {

			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each( function() {
			jQuery.event.remove( this, types, fn, selector );
		} );
	}
} );


var

	/* eslint-disable max-len */

	// See https://github.com/eslint/eslint/issues/3229
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,

	/* eslint-enable */

	// Support: IE <=10 - 11, Edge 12 - 13 only
	// In IE/Edge using regex groups here causes severe slowdowns.
	// See https://connect.microsoft.com/IE/feedback/details/1736512/
	rnoInnerhtml = /<script|<style|<link/i,

	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;

// Prefer a tbody over its parent table for containing new rows
function manipulationTarget( elem, content ) {
	if ( nodeName( elem, "table" ) &&
		nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

		return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
	}

	return elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
		elem.type = elem.type.slice( 5 );
	} else {
		elem.removeAttribute( "type" );
	}

	return elem;
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( dataPriv.hasData( src ) ) {
		pdataOld = dataPriv.access( src );
		pdataCur = dataPriv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( dataUser.hasData( src ) ) {
		udataOld = dataUser.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		dataUser.set( dest, udataCur );
	}
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

function domManip( collection, args, callback, ignored ) {

	// Flatten any nested arrays
	args = concat.apply( [], args );

	var fragment, first, scripts, hasScripts, node, doc,
		i = 0,
		l = collection.length,
		iNoClone = l - 1,
		value = args[ 0 ],
		valueIsFunction = isFunction( value );

	// We can't cloneNode fragments that contain checked, in WebKit
	if ( valueIsFunction ||
			( l > 1 && typeof value === "string" &&
				!support.checkClone && rchecked.test( value ) ) ) {
		return collection.each( function( index ) {
			var self = collection.eq( index );
			if ( valueIsFunction ) {
				args[ 0 ] = value.call( this, index, self.html() );
			}
			domManip( self, args, callback, ignored );
		} );
	}

	if ( l ) {
		fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
		first = fragment.firstChild;

		if ( fragment.childNodes.length === 1 ) {
			fragment = first;
		}

		// Require either new content or an interest in ignored elements to invoke the callback
		if ( first || ignored ) {
			scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
			hasScripts = scripts.length;

			// Use the original fragment for the last item
			// instead of the first because it can end up
			// being emptied incorrectly in certain situations (#8070).
			for ( ; i < l; i++ ) {
				node = fragment;

				if ( i !== iNoClone ) {
					node = jQuery.clone( node, true, true );

					// Keep references to cloned scripts for later restoration
					if ( hasScripts ) {

						// Support: Android <=4.0 only, PhantomJS 1 only
						// push.apply(_, arraylike) throws on ancient WebKit
						jQuery.merge( scripts, getAll( node, "script" ) );
					}
				}

				callback.call( collection[ i ], node, i );
			}

			if ( hasScripts ) {
				doc = scripts[ scripts.length - 1 ].ownerDocument;

				// Reenable scripts
				jQuery.map( scripts, restoreScript );

				// Evaluate executable scripts on first document insertion
				for ( i = 0; i < hasScripts; i++ ) {
					node = scripts[ i ];
					if ( rscriptType.test( node.type || "" ) &&
						!dataPriv.access( node, "globalEval" ) &&
						jQuery.contains( doc, node ) ) {

						if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

							// Optional AJAX dependency, but won't run scripts if not present
							if ( jQuery._evalUrl && !node.noModule ) {
								jQuery._evalUrl( node.src, {
									nonce: node.nonce || node.getAttribute( "nonce" )
								} );
							}
						} else {
							DOMEval( node.textContent.replace( rcleanScript, "" ), node, doc );
						}
					}
				}
			}
		}
	}

	return collection;
}

function remove( elem, selector, keepData ) {
	var node,
		nodes = selector ? jQuery.filter( selector, elem ) : elem,
		i = 0;

	for ( ; ( node = nodes[ i ] ) != null; i++ ) {
		if ( !keepData && node.nodeType === 1 ) {
			jQuery.cleanData( getAll( node ) );
		}

		if ( node.parentNode ) {
			if ( keepData && isAttached( node ) ) {
				setGlobalEval( getAll( node, "script" ) );
			}
			node.parentNode.removeChild( node );
		}
	}

	return elem;
}

jQuery.extend( {
	htmlPrefilter: function( html ) {
		return html.replace( rxhtmlTag, "<$1></$2>" );
	},

	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = isAttached( elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: https://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	cleanData: function( elems ) {
		var data, elem, type,
			special = jQuery.event.special,
			i = 0;

		for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
			if ( acceptData( elem ) ) {
				if ( ( data = elem[ dataPriv.expando ] ) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataPriv.expando ] = undefined;
				}
				if ( elem[ dataUser.expando ] ) {

					// Support: Chrome <=35 - 45+
					// Assign undefined instead of using delete, see Data#remove
					elem[ dataUser.expando ] = undefined;
				}
			}
		}
	}
} );

jQuery.fn.extend( {
	detach: function( selector ) {
		return remove( this, selector, true );
	},

	remove: function( selector ) {
		return remove( this, selector );
	},

	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each( function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				} );
		}, null, value, arguments.length );
	},

	append: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		} );
	},

	prepend: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		} );
	},

	before: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		} );
	},

	after: function() {
		return domManip( this, arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		} );
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; ( elem = this[ i ] ) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		} );
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = jQuery.htmlPrefilter( value );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch ( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var ignored = [];

		// Make the changes, replacing each non-ignored context element with the new content
		return domManip( this, arguments, function( elem ) {
			var parent = this.parentNode;

			if ( jQuery.inArray( this, ignored ) < 0 ) {
				jQuery.cleanData( getAll( this ) );
				if ( parent ) {
					parent.replaceChild( elem, this );
				}
			}

		// Force callback invocation
		}, ignored );
	}
} );

jQuery.each( {
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: Android <=4.0 only, PhantomJS 1 only
			// .get() because push.apply(_, arraylike) throws on ancient WebKit
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
} );
var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {

		// Support: IE <=11 only, Firefox <=30 (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		var view = elem.ownerDocument.defaultView;

		if ( !view || !view.opener ) {
			view = window;
		}

		return view.getComputedStyle( elem );
	};

var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



( function() {

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computeStyleTests() {

		// This is a singleton, we need to execute it only once
		if ( !div ) {
			return;
		}

		container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
			"margin-top:1px;padding:0;border:0";
		div.style.cssText =
			"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
			"margin:auto;border:1px;padding:1px;" +
			"width:60%;top:1%";
		documentElement.appendChild( container ).appendChild( div );

		var divStyle = window.getComputedStyle( div );
		pixelPositionVal = divStyle.top !== "1%";

		// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
		reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

		// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
		// Some styles come back with percentage values, even though they shouldn't
		div.style.right = "60%";
		pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

		// Support: IE 9 - 11 only
		// Detect misreporting of content dimensions for box-sizing:border-box elements
		boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

		// Support: IE 9 only
		// Detect overflow:scroll screwiness (gh-3699)
		// Support: Chrome <=64
		// Don't get tricked when zoom affects offsetWidth (gh-4029)
		div.style.position = "absolute";
		scrollboxSizeVal = roundPixelMeasures( div.offsetWidth / 3 ) === 12;

		documentElement.removeChild( container );

		// Nullify the div so it wouldn't be stored in the memory and
		// it will also be a sign that checks already performed
		div = null;
	}

	function roundPixelMeasures( measure ) {
		return Math.round( parseFloat( measure ) );
	}

	var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
		reliableMarginLeftVal,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	// Finish early in limited (non-browser) environments
	if ( !div.style ) {
		return;
	}

	// Support: IE <=9 - 11 only
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	jQuery.extend( support, {
		boxSizingReliable: function() {
			computeStyleTests();
			return boxSizingReliableVal;
		},
		pixelBoxStyles: function() {
			computeStyleTests();
			return pixelBoxStylesVal;
		},
		pixelPosition: function() {
			computeStyleTests();
			return pixelPositionVal;
		},
		reliableMarginLeft: function() {
			computeStyleTests();
			return reliableMarginLeftVal;
		},
		scrollboxSize: function() {
			computeStyleTests();
			return scrollboxSizeVal;
		}
	} );
} )();


function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,

		// Support: Firefox 51+
		// Retrieving style before computed somehow
		// fixes an issue with getting wrong values
		// on detached elements
		style = elem.style;

	computed = computed || getStyles( elem );

	// getPropertyValue is needed for:
	//   .css('filter') (IE 9 only, #12537)
	//   .css('--customProperty) (#3144)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];

		if ( ret === "" && !isAttached( elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// A tribute to the "awesome hack by Dean Edwards"
		// Android Browser returns percentage for some values,
		// but width seems to be reliably pixels.
		// This is against the CSSOM draft spec:
		// https://drafts.csswg.org/cssom/#resolved-values
		if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?

		// Support: IE <=9 - 11 only
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {

	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {

				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return ( this.get = hookFn ).apply( this, arguments );
		}
	};
}


var cssPrefixes = [ "Webkit", "Moz", "ms" ],
	emptyStyle = document.createElement( "div" ).style,
	vendorProps = {};

// Return a vendor-prefixed property or undefined
function vendorPropName( name ) {

	// Check for vendor prefixed names
	var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in emptyStyle ) {
			return name;
		}
	}
}

// Return a potentially-mapped jQuery.cssProps or vendor prefixed property
function finalPropName( name ) {
	var final = jQuery.cssProps[ name ] || vendorProps[ name ];

	if ( final ) {
		return final;
	}
	if ( name in emptyStyle ) {
		return name;
	}
	return vendorProps[ name ] = vendorPropName( name ) || name;
}


var

	// Swappable if display is none or starts with table
	// except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rcustomProp = /^--/,
	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	};

function setPositiveNumber( elem, value, subtract ) {

	// Any relative (+/-) values have already been
	// normalized at this point
	var matches = rcssNum.exec( value );
	return matches ?

		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
		value;
}

function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
	var i = dimension === "width" ? 1 : 0,
		extra = 0,
		delta = 0;

	// Adjustment may not be necessary
	if ( box === ( isBorderBox ? "border" : "content" ) ) {
		return 0;
	}

	for ( ; i < 4; i += 2 ) {

		// Both box models exclude margin
		if ( box === "margin" ) {
			delta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
		}

		// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
		if ( !isBorderBox ) {

			// Add padding
			delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// For "border" or "margin", add border
			if ( box !== "padding" ) {
				delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

			// But still keep track of it otherwise
			} else {
				extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}

		// If we get here with a border-box (content + padding + border), we're seeking "content" or
		// "padding" or "margin"
		} else {

			// For "content", subtract padding
			if ( box === "content" ) {
				delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// For "content" or "padding", subtract border
			if ( box !== "margin" ) {
				delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	// Account for positive content-box scroll gutter when requested by providing computedVal
	if ( !isBorderBox && computedVal >= 0 ) {

		// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
		// Assuming integer scroll gutter, subtract the rest and round down
		delta += Math.max( 0, Math.ceil(
			elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
			computedVal -
			delta -
			extra -
			0.5

		// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
		// Use an explicit zero to avoid NaN (gh-3964)
		) ) || 0;
	}

	return delta;
}

function getWidthOrHeight( elem, dimension, extra ) {

	// Start with computed style
	var styles = getStyles( elem ),

		// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
		// Fake content-box until we know it's needed to know the true value.
		boxSizingNeeded = !support.boxSizingReliable() || extra,
		isBorderBox = boxSizingNeeded &&
			jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
		valueIsBorderBox = isBorderBox,

		val = curCSS( elem, dimension, styles ),
		offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

	// Support: Firefox <=54
	// Return a confounding non-pixel value or feign ignorance, as appropriate.
	if ( rnumnonpx.test( val ) ) {
		if ( !extra ) {
			return val;
		}
		val = "auto";
	}


	// Fall back to offsetWidth/offsetHeight when value is "auto"
	// This happens for inline elements with no explicit setting (gh-3571)
	// Support: Android <=4.1 - 4.3 only
	// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
	// Support: IE 9-11 only
	// Also use offsetWidth/offsetHeight for when box sizing is unreliable
	// We use getClientRects() to check for hidden/disconnected.
	// In those cases, the computed value can be trusted to be border-box
	if ( ( !support.boxSizingReliable() && isBorderBox ||
		val === "auto" ||
		!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) &&
		elem.getClientRects().length ) {

		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

		// Where available, offsetWidth/offsetHeight approximate border box dimensions.
		// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
		// retrieved value as a content box dimension.
		valueIsBorderBox = offsetProp in elem;
		if ( valueIsBorderBox ) {
			val = elem[ offsetProp ];
		}
	}

	// Normalize "" and auto
	val = parseFloat( val ) || 0;

	// Adjust for the element's box model
	return ( val +
		boxModelAdjustment(
			elem,
			dimension,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles,

			// Provide the current computed size to request scroll gutter calculation (gh-3589)
			val
		)
	) + "px";
}

jQuery.extend( {

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"animationIterationCount": true,
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"gridArea": true,
		"gridColumn": true,
		"gridColumnEnd": true,
		"gridColumnStart": true,
		"gridRow": true,
		"gridRowEnd": true,
		"gridRowStart": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name ),
			style = elem.style;

		// Make sure that we're working with the right name. We don't
		// want to query the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
				value = adjustCSS( elem, name, ret );

				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add the unit (except for certain CSS properties)
			// The isCustomProp check can be removed in jQuery 4.0 when we only auto-append
			// "px" to a few hardcoded values.
			if ( type === "number" && !isCustomProp ) {
				value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
			}

			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !( "set" in hooks ) ||
				( value = hooks.set( elem, value, extra ) ) !== undefined ) {

				if ( isCustomProp ) {
					style.setProperty( name, value );
				} else {
					style[ name ] = value;
				}
			}

		} else {

			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks &&
				( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = camelCase( name ),
			isCustomProp = rcustomProp.test( name );

		// Make sure that we're working with the right name. We don't
		// want to modify the value if it is a CSS custom property
		// since they are user-defined.
		if ( !isCustomProp ) {
			name = finalPropName( origName );
		}

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || isFinite( num ) ? num || 0 : val;
		}

		return val;
	}
} );

jQuery.each( [ "height", "width" ], function( i, dimension ) {
	jQuery.cssHooks[ dimension ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

					// Support: Safari 8+
					// Table columns in Safari have non-zero offsetWidth & zero
					// getBoundingClientRect().width unless display is changed.
					// Support: IE <=11 only
					// Running getBoundingClientRect on a disconnected node
					// in IE throws an error.
					( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
						swap( elem, cssShow, function() {
							return getWidthOrHeight( elem, dimension, extra );
						} ) :
						getWidthOrHeight( elem, dimension, extra );
			}
		},

		set: function( elem, value, extra ) {
			var matches,
				styles = getStyles( elem ),

				// Only read styles.position if the test has a chance to fail
				// to avoid forcing a reflow.
				scrollboxSizeBuggy = !support.scrollboxSize() &&
					styles.position === "absolute",

				// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
				boxSizingNeeded = scrollboxSizeBuggy || extra,
				isBorderBox = boxSizingNeeded &&
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
				subtract = extra ?
					boxModelAdjustment(
						elem,
						dimension,
						extra,
						isBorderBox,
						styles
					) :
					0;

			// Account for unreliable border-box dimensions by comparing offset* to computed and
			// faking a content-box to get border and padding (gh-3699)
			if ( isBorderBox && scrollboxSizeBuggy ) {
				subtract -= Math.ceil(
					elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
					parseFloat( styles[ dimension ] ) -
					boxModelAdjustment( elem, dimension, "border", false, styles ) -
					0.5
				);
			}

			// Convert to pixels if value adjustment is needed
			if ( subtract && ( matches = rcssNum.exec( value ) ) &&
				( matches[ 3 ] || "px" ) !== "px" ) {

				elem.style[ dimension ] = value;
				value = jQuery.css( elem, dimension );
			}

			return setPositiveNumber( elem, value, subtract );
		}
	};
} );

jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
	function( elem, computed ) {
		if ( computed ) {
			return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
				elem.getBoundingClientRect().left -
					swap( elem, { marginLeft: 0 }, function() {
						return elem.getBoundingClientRect().left;
					} )
				) + "px";
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each( {
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split( " " ) : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( prefix !== "margin" ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
} );

jQuery.fn.extend( {
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( Array.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	}
} );


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || jQuery.easing._default;
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			// Use a property on the element directly when it is not a DOM element,
			// or when there is no matching style property that exists.
			if ( tween.elem.nodeType !== 1 ||
				tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );

			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {

			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.nodeType === 1 && (
					jQuery.cssHooks[ tween.prop ] ||
					tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9 only
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	},
	_default: "swing"
};

jQuery.fx = Tween.prototype.init;

// Back compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, inProgress,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rrun = /queueHooks$/;

function schedule() {
	if ( inProgress ) {
		if ( document.hidden === false && window.requestAnimationFrame ) {
			window.requestAnimationFrame( schedule );
		} else {
			window.setTimeout( schedule, jQuery.fx.interval );
		}

		jQuery.fx.tick();
	}
}

// Animations created synchronously will run synchronously
function createFxNow() {
	window.setTimeout( function() {
		fxNow = undefined;
	} );
	return ( fxNow = Date.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
		isBox = "width" in props || "height" in props,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHiddenWithinTree( elem ),
		dataShow = dataPriv.get( elem, "fxshow" );

	// Queue-skipping animations hijack the fx hooks
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always( function() {

			// Ensure the complete handler is called before this completes
			anim.always( function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			} );
		} );
	}

	// Detect show/hide animations
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.test( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// Pretend to be hidden if this is a "show" and
				// there is still data from a stopped show/hide
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;

				// Ignore all other no-op show/hide data
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	// Bail out if this is a no-op like .hide().hide()
	propTween = !jQuery.isEmptyObject( props );
	if ( !propTween && jQuery.isEmptyObject( orig ) ) {
		return;
	}

	// Restrict "overflow" and "display" styles during box animations
	if ( isBox && elem.nodeType === 1 ) {

		// Support: IE <=9 - 11, Edge 12 - 15
		// Record all 3 overflow attributes because IE does not infer the shorthand
		// from identically-valued overflowX and overflowY and Edge just mirrors
		// the overflowX value there.
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Identify a display type, preferring old show/hide data over the CSS cascade
		restoreDisplay = dataShow && dataShow.display;
		if ( restoreDisplay == null ) {
			restoreDisplay = dataPriv.get( elem, "display" );
		}
		display = jQuery.css( elem, "display" );
		if ( display === "none" ) {
			if ( restoreDisplay ) {
				display = restoreDisplay;
			} else {

				// Get nonempty value(s) by temporarily forcing visibility
				showHide( [ elem ], true );
				restoreDisplay = elem.style.display || restoreDisplay;
				display = jQuery.css( elem, "display" );
				showHide( [ elem ] );
			}
		}

		// Animate inline elements as inline-block
		if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
			if ( jQuery.css( elem, "float" ) === "none" ) {

				// Restore the original display value at the end of pure show/hide animations
				if ( !propTween ) {
					anim.done( function() {
						style.display = restoreDisplay;
					} );
					if ( restoreDisplay == null ) {
						display = style.display;
						restoreDisplay = display === "none" ? "" : display;
					}
				}
				style.display = "inline-block";
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always( function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		} );
	}

	// Implement show/hide animations
	propTween = false;
	for ( prop in orig ) {

		// General show/hide setup for this element animation
		if ( !propTween ) {
			if ( dataShow ) {
				if ( "hidden" in dataShow ) {
					hidden = dataShow.hidden;
				}
			} else {
				dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
			}

			// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
			if ( toggle ) {
				dataShow.hidden = !hidden;
			}

			// Show elements before animating them
			if ( hidden ) {
				showHide( [ elem ], true );
			}

			/* eslint-disable no-loop-func */

			anim.done( function() {

			/* eslint-enable no-loop-func */

				// The final step of a "hide" animation is actually hiding the element
				if ( !hidden ) {
					showHide( [ elem ] );
				}
				dataPriv.remove( elem, "fxshow" );
				for ( prop in orig ) {
					jQuery.style( elem, prop, orig[ prop ] );
				}
			} );
		}

		// Per-property setup
		propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
		if ( !( prop in dataShow ) ) {
			dataShow[ prop ] = propTween.start;
			if ( hidden ) {
				propTween.end = propTween.start;
				propTween.start = 0;
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( Array.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = Animation.prefilters.length,
		deferred = jQuery.Deferred().always( function() {

			// Don't match elem in the :animated selector
			delete tick.elem;
		} ),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

				// Support: Android 2.3 only
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ] );

			// If there's more to do, yield
			if ( percent < 1 && length ) {
				return remaining;
			}

			// If this was an empty animation, synthesize a final progress notification
			if ( !length ) {
				deferred.notifyWith( elem, [ animation, 1, 0 ] );
			}

			// Resolve the animation and report its conclusion
			deferred.resolveWith( elem, [ animation ] );
			return false;
		},
		animation = deferred.promise( {
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, {
				specialEasing: {},
				easing: jQuery.easing._default
			}, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,

					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.notifyWith( elem, [ animation, 1, 0 ] );
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		} ),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length; index++ ) {
		result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			if ( isFunction( result.stop ) ) {
				jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
					result.stop.bind( result );
			}
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	// Attach callbacks from options
	animation
		.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		} )
	);

	return animation;
}

jQuery.Animation = jQuery.extend( Animation, {

	tweeners: {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value );
			adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
			return tween;
		} ]
	},

	tweener: function( props, callback ) {
		if ( isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.match( rnothtmlwhite );
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length; index++ ) {
			prop = props[ index ];
			Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
			Animation.tweeners[ prop ].unshift( callback );
		}
	},

	prefilters: [ defaultPrefilter ],

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			Animation.prefilters.unshift( callback );
		} else {
			Animation.prefilters.push( callback );
		}
	}
} );

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !isFunction( easing ) && easing
	};

	// Go to the end state if fx are off
	if ( jQuery.fx.off ) {
		opt.duration = 0;

	} else {
		if ( typeof opt.duration !== "number" ) {
			if ( opt.duration in jQuery.fx.speeds ) {
				opt.duration = jQuery.fx.speeds[ opt.duration ];

			} else {
				opt.duration = jQuery.fx.speeds._default;
			}
		}
	}

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend( {
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate( { opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {

				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || dataPriv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each( function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = dataPriv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this &&
					( type == null || timers[ index ].queue === type ) ) {

					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		} );
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each( function() {
			var index,
				data = dataPriv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		} );
	}
} );

jQuery.each( [ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
} );

// Generate shortcuts for custom animations
jQuery.each( {
	slideDown: genFx( "show" ),
	slideUp: genFx( "hide" ),
	slideToggle: genFx( "toggle" ),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
} );

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = Date.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];

		// Run the timer and safely remove it when done (allowing for external removal)
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	jQuery.fx.start();
};

jQuery.fx.interval = 13;
jQuery.fx.start = function() {
	if ( inProgress ) {
		return;
	}

	inProgress = true;
	schedule();
};

jQuery.fx.stop = function() {
	inProgress = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,

	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// https://web.archive.org/web/20100324014747/http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = window.setTimeout( next, time );
		hooks.stop = function() {
			window.clearTimeout( timeout );
		};
	} );
};


( function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: Android <=4.3 only
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE <=11 only
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: IE <=11 only
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
} )();


var boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend( {
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each( function() {
			jQuery.removeAttr( this, name );
		} );
	}
} );

jQuery.extend( {
	attr: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set attributes on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		// Attribute hooks are determined by the lowercase version
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
		}

		if ( value !== undefined ) {
			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;
			}

			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			elem.setAttribute( name, value + "" );
			return value;
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		ret = jQuery.find.attr( elem, name );

		// Non-existent attributes return null, we normalize to undefined
		return ret == null ? undefined : ret;
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	},

	removeAttr: function( elem, value ) {
		var name,
			i = 0,

			// Attribute names can contain non-HTML whitespace characters
			// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
			attrNames = value && value.match( rnothtmlwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( ( name = attrNames[ i++ ] ) ) {
				elem.removeAttribute( name );
			}
		}
	}
} );

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {

			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};

jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle,
			lowercaseName = name.toLowerCase();

		if ( !isXML ) {

			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ lowercaseName ];
			attrHandle[ lowercaseName ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				lowercaseName :
				null;
			attrHandle[ lowercaseName ] = handle;
		}
		return ret;
	};
} );




var rfocusable = /^(?:input|select|textarea|button)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend( {
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each( function() {
			delete this[ jQuery.propFix[ name ] || name ];
		} );
	}
} );

jQuery.extend( {
	prop: function( elem, name, value ) {
		var ret, hooks,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks &&
				( ret = hooks.set( elem, value, name ) ) !== undefined ) {
				return ret;
			}

			return ( elem[ name ] = value );
		}

		if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
			return ret;
		}

		return elem[ name ];
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {

				// Support: IE <=9 - 11 only
				// elem.tabIndex doesn't always return the
				// correct value when it hasn't been explicitly set
				// https://web.archive.org/web/20141116233347/http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				if ( tabindex ) {
					return parseInt( tabindex, 10 );
				}

				if (
					rfocusable.test( elem.nodeName ) ||
					rclickable.test( elem.nodeName ) &&
					elem.href
				) {
					return 0;
				}

				return -1;
			}
		}
	},

	propFix: {
		"for": "htmlFor",
		"class": "className"
	}
} );

// Support: IE <=11 only
// Accessing the selectedIndex property
// forces the browser to respect setting selected
// on the option
// The getter ensures a default option is selected
// when in an optgroup
// eslint rule "no-unused-expressions" is disabled for this code
// since it considers such accessions noop
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		},
		set: function( elem ) {

			/* eslint no-unused-expressions: "off" */

			var parent = elem.parentNode;
			if ( parent ) {
				parent.selectedIndex;

				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
		}
	};
}

jQuery.each( [
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
} );




	// Strip and collapse whitespace according to HTML spec
	// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
	function stripAndCollapse( value ) {
		var tokens = value.match( rnothtmlwhite ) || [];
		return tokens.join( " " );
	}


function getClass( elem ) {
	return elem.getAttribute && elem.getAttribute( "class" ) || "";
}

function classesToArray( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === "string" ) {
		return value.match( rnothtmlwhite ) || [];
	}
	return [];
}

jQuery.fn.extend( {
	addClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, curValue, clazz, j, finalValue,
			i = 0;

		if ( isFunction( value ) ) {
			return this.each( function( j ) {
				jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
			} );
		}

		if ( !arguments.length ) {
			return this.attr( "class", "" );
		}

		classes = classesToArray( value );

		if ( classes.length ) {
			while ( ( elem = this[ i++ ] ) ) {
				curValue = getClass( elem );

				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

				if ( cur ) {
					j = 0;
					while ( ( clazz = classes[ j++ ] ) ) {

						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) > -1 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = stripAndCollapse( cur );
					if ( curValue !== finalValue ) {
						elem.setAttribute( "class", finalValue );
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isValidValue = type === "string" || Array.isArray( value );

		if ( typeof stateVal === "boolean" && isValidValue ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( isFunction( value ) ) {
			return this.each( function( i ) {
				jQuery( this ).toggleClass(
					value.call( this, i, getClass( this ), stateVal ),
					stateVal
				);
			} );
		}

		return this.each( function() {
			var className, i, self, classNames;

			if ( isValidValue ) {

				// Toggle individual class names
				i = 0;
				self = jQuery( this );
				classNames = classesToArray( value );

				while ( ( className = classNames[ i++ ] ) ) {

					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( value === undefined || type === "boolean" ) {
				className = getClass( this );
				if ( className ) {

					// Store className if set
					dataPriv.set( this, "__className__", className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				if ( this.setAttribute ) {
					this.setAttribute( "class",
						className || value === false ?
						"" :
						dataPriv.get( this, "__className__" ) || ""
					);
				}
			}
		} );
	},

	hasClass: function( selector ) {
		var className, elem,
			i = 0;

		className = " " + selector + " ";
		while ( ( elem = this[ i++ ] ) ) {
			if ( elem.nodeType === 1 &&
				( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
					return true;
			}
		}

		return false;
	}
} );




var rreturn = /\r/g;

jQuery.fn.extend( {
	val: function( value ) {
		var hooks, ret, valueIsFunction,
			elem = this[ 0 ];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] ||
					jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks &&
					"get" in hooks &&
					( ret = hooks.get( elem, "value" ) ) !== undefined
				) {
					return ret;
				}

				ret = elem.value;

				// Handle most common string cases
				if ( typeof ret === "string" ) {
					return ret.replace( rreturn, "" );
				}

				// Handle cases where value is null/undef or number
				return ret == null ? "" : ret;
			}

			return;
		}

		valueIsFunction = isFunction( value );

		return this.each( function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( valueIsFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( Array.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				} );
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		} );
	}
} );

jQuery.extend( {
	valHooks: {
		option: {
			get: function( elem ) {

				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :

					// Support: IE <=10 - 11 only
					// option.text throws exceptions (#14686, #14858)
					// Strip and collapse whitespace
					// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
					stripAndCollapse( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option, i,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one",
					values = one ? null : [],
					max = one ? index + 1 : options.length;

				if ( index < 0 ) {
					i = max;

				} else {
					i = one ? index : 0;
				}

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// Support: IE <=9 only
					// IE8-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&

							// Don't return options that are disabled or in a disabled optgroup
							!option.disabled &&
							( !option.parentNode.disabled ||
								!nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					/* eslint-disable no-cond-assign */

					if ( option.selected =
						jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
					) {
						optionSet = true;
					}

					/* eslint-enable no-cond-assign */
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
} );

// Radios and checkboxes getter/setter
jQuery.each( [ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( Array.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute( "value" ) === null ? "on" : elem.value;
		};
	}
} );




// Return jQuery for attributes-only inclusion


support.focusin = "onfocusin" in window;


var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	stopPropagationCallback = function( e ) {
		e.stopPropagation();
	};

jQuery.extend( jQuery.event, {

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

		cur = lastElement = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "." ) > -1 ) {

			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split( "." );
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf( ":" ) < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join( "." );
		event.rnamespace = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === ( elem.ownerDocument || document ) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
			lastElement = cur;
			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( dataPriv.get( cur, "events" ) || {} )[ event.type ] &&
				dataPriv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( ( !special._default ||
				special._default.apply( eventPath.pop(), data ) === false ) &&
				acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;

					if ( event.isPropagationStopped() ) {
						lastElement.addEventListener( type, stopPropagationCallback );
					}

					elem[ type ]();

					if ( event.isPropagationStopped() ) {
						lastElement.removeEventListener( type, stopPropagationCallback );
					}

					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	// Piggyback on a donor event to simulate a different one
	// Used only for `focus(in | out)` events
	simulate: function( type, elem, event ) {
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true
			}
		);

		jQuery.event.trigger( e, null, elem );
	}

} );

jQuery.fn.extend( {

	trigger: function( type, data ) {
		return this.each( function() {
			jQuery.event.trigger( type, data, this );
		} );
	},
	triggerHandler: function( type, data ) {
		var elem = this[ 0 ];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
} );


// Support: Firefox <=44
// Firefox doesn't have focus(in | out) events
// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
//
// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
// focus(in | out) events fire after focus & blur events,
// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
if ( !support.focusin ) {
	jQuery.each( { focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
			jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ) );
		};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = dataPriv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				dataPriv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = dataPriv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					dataPriv.remove( doc, fix );

				} else {
					dataPriv.access( doc, fix, attaches );
				}
			}
		};
	} );
}
var location = window.location;

var nonce = Date.now();

var rquery = ( /\?/ );



// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE 9 - 11 only
	// IE throws on parseFromString with invalid input.
	try {
		xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( Array.isArray( obj ) ) {

		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {

				// Treat each array item as a scalar.
				add( prefix, v );

			} else {

				// Item is non-scalar (array or object), encode its numeric index.
				buildParams(
					prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
					v,
					traditional,
					add
				);
			}
		} );

	} else if ( !traditional && toType( obj ) === "object" ) {

		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {

		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, valueOrFunction ) {

			// If value is a function, invoke it and use its return value
			var value = isFunction( valueOrFunction ) ?
				valueOrFunction() :
				valueOrFunction;

			s[ s.length ] = encodeURIComponent( key ) + "=" +
				encodeURIComponent( value == null ? "" : value );
		};

	if ( a == null ) {
		return "";
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		} );

	} else {

		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" );
};

jQuery.fn.extend( {
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map( function() {

			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		} )
		.filter( function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		} )
		.map( function( i, elem ) {
			var val = jQuery( this ).val();

			if ( val == null ) {
				return null;
			}

			if ( Array.isArray( val ) ) {
				return jQuery.map( val, function( val ) {
					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
				} );
			}

			return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		} ).get();
	}
} );


var
	r20 = /%20/g,
	rhash = /#.*$/,
	rantiCache = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Anchor tag for parsing the document origin
	originAnchor = document.createElement( "a" );
	originAnchor.href = location.href;

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

		if ( isFunction( func ) ) {

			// For each dataType in the dataTypeExpression
			while ( ( dataType = dataTypes[ i++ ] ) ) {

				// Prepend if requested
				if ( dataType[ 0 ] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

				// Otherwise append
				} else {
					( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" &&
				!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		} );
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {

		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}

		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},

		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {

								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s.throws ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return {
								state: "parsererror",
								error: conv ? e : "No conversion from " + prev + " to " + current
							};
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend( {

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: location.href,
		type: "GET",
		isLocal: rlocalProtocol.test( location.protocol ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",

		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /\bxml\b/,
			html: /\bhtml/,
			json: /\bjson\b/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,

			// URL without anti-cache param
			cacheURL,

			// Response headers
			responseHeadersString,
			responseHeaders,

			// timeout handle
			timeoutTimer,

			// Url cleanup var
			urlAnchor,

			// Request state (becomes false upon send and true upon completion)
			completed,

			// To know if global events are to be dispatched
			fireGlobals,

			// Loop variable
			i,

			// uncached part of the url
			uncached,

			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),

			// Callbacks context
			callbackContext = s.context || s,

			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context &&
				( callbackContext.nodeType || callbackContext.jquery ) ?
					jQuery( callbackContext ) :
					jQuery.event,

			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),

			// Status-dependent callbacks
			statusCode = s.statusCode || {},

			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},

			// Default abort message
			strAbort = "canceled",

			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( completed ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
									( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
										.concat( match[ 2 ] );
							}
						}
						match = responseHeaders[ key.toLowerCase() + " " ];
					}
					return match == null ? null : match.join( ", " );
				},

				// Raw string
				getAllResponseHeaders: function() {
					return completed ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( completed == null ) {
						name = requestHeadersNames[ name.toLowerCase() ] =
							requestHeadersNames[ name.toLowerCase() ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( completed == null ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( completed ) {

							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						} else {

							// Lazy-add the new callbacks in a way that preserves old ones
							for ( code in map ) {
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR );

		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || location.href ) + "" )
			.replace( rprotocol, location.protocol + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

		// A cross-domain request is in order when the origin doesn't match the current origin.
		if ( s.crossDomain == null ) {
			urlAnchor = document.createElement( "a" );

			// Support: IE <=8 - 11, Edge 12 - 15
			// IE throws exception on accessing the href property if url is malformed,
			// e.g. http://example.com:80x/
			try {
				urlAnchor.href = s.url;

				// Support: IE <=8 - 11 only
				// Anchor's host property isn't correctly set when s.url is relative
				urlAnchor.href = urlAnchor.href;
				s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
					urlAnchor.protocol + "//" + urlAnchor.host;
			} catch ( e ) {

				// If there is an error parsing the URL, assume it is crossDomain,
				// it can be rejected by the transport if it is invalid
				s.crossDomain = true;
			}
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( completed ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		// Remove hash to simplify url manipulation
		cacheURL = s.url.replace( rhash, "" );

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// Remember the hash so we can put it back
			uncached = s.url.slice( cacheURL.length );

			// If data is available and should be processed, append data to url
			if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
				cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add or update anti-cache param if needed
			if ( s.cache === false ) {
				cacheURL = cacheURL.replace( rantiCache, "$1" );
				uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce++ ) + uncached;
			}

			// Put hash and anti-cache on the URL that will be requested (gh-1732)
			s.url = cacheURL + uncached;

		// Change '%20' to '+' if this is encoded form body content (gh-2658)
		} else if ( s.data && s.processData &&
			( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
			s.data = s.data.replace( r20, "+" );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
				s.accepts[ s.dataTypes[ 0 ] ] +
					( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend &&
			( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		completeDeferred.add( s.complete );
		jqXHR.done( s.success );
		jqXHR.fail( s.error );

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}

			// If request was aborted inside ajaxSend, stop there
			if ( completed ) {
				return jqXHR;
			}

			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = window.setTimeout( function() {
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				completed = false;
				transport.send( requestHeaders, done );
			} catch ( e ) {

				// Rethrow post-completion exceptions
				if ( completed ) {
					throw e;
				}

				// Propagate others as results
				done( -1, e );
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Ignore repeat invocations
			if ( completed ) {
				return;
			}

			completed = true;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				window.clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader( "Last-Modified" );
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader( "etag" );
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {

				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
} );

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {

		// Shift arguments if data argument was omitted
		if ( isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		// The url can be an options object (which then must have .url)
		return jQuery.ajax( jQuery.extend( {
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		}, jQuery.isPlainObject( url ) && url ) );
	};
} );


jQuery._evalUrl = function( url, options ) {
	return jQuery.ajax( {
		url: url,

		// Make this explicit, since user can override this through ajaxSetup (#11264)
		type: "GET",
		dataType: "script",
		cache: true,
		async: false,
		global: false,

		// Only evaluate the response if it is successful (gh-4126)
		// dataFilter is not invoked for failure responses, so using it instead
		// of the default converter is kludgy but it works.
		converters: {
			"text script": function() {}
		},
		dataFilter: function( response ) {
			jQuery.globalEval( response, options );
		}
	} );
};


jQuery.fn.extend( {
	wrapAll: function( html ) {
		var wrap;

		if ( this[ 0 ] ) {
			if ( isFunction( html ) ) {
				html = html.call( this[ 0 ] );
			}

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map( function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			} ).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( isFunction( html ) ) {
			return this.each( function( i ) {
				jQuery( this ).wrapInner( html.call( this, i ) );
			} );
		}

		return this.each( function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		} );
	},

	wrap: function( html ) {
		var htmlIsFunction = isFunction( html );

		return this.each( function( i ) {
			jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
		} );
	},

	unwrap: function( selector ) {
		this.parent( selector ).not( "body" ).each( function() {
			jQuery( this ).replaceWith( this.childNodes );
		} );
		return this;
	}
} );


jQuery.expr.pseudos.hidden = function( elem ) {
	return !jQuery.expr.pseudos.visible( elem );
};
jQuery.expr.pseudos.visible = function( elem ) {
	return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
};




jQuery.ajaxSettings.xhr = function() {
	try {
		return new window.XMLHttpRequest();
	} catch ( e ) {}
};

var xhrSuccessStatus = {

		// File protocol always yields status code 0, assume 200
		0: 200,

		// Support: IE <=9 only
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport( function( options ) {
	var callback, errorCallback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr();

				xhr.open(
					options.type,
					options.url,
					options.async,
					options.username,
					options.password
				);

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
					headers[ "X-Requested-With" ] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							callback = errorCallback = xhr.onload =
								xhr.onerror = xhr.onabort = xhr.ontimeout =
									xhr.onreadystatechange = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {

								// Support: IE <=9 only
								// On a manual native abort, IE9 throws
								// errors on any property access that is not readyState
								if ( typeof xhr.status !== "number" ) {
									complete( 0, "error" );
								} else {
									complete(

										// File: protocol always yields status 0; see #8605, #14207
										xhr.status,
										xhr.statusText
									);
								}
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,

									// Support: IE <=9 only
									// IE9 has no XHR2 but throws on binary (trac-11426)
									// For XHR2 non-text, let the caller handle it (gh-2498)
									( xhr.responseType || "text" ) !== "text"  ||
									typeof xhr.responseText !== "string" ?
										{ binary: xhr.response } :
										{ text: xhr.responseText },
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

				// Support: IE 9 only
				// Use onreadystatechange to replace onabort
				// to handle uncaught aborts
				if ( xhr.onabort !== undefined ) {
					xhr.onabort = errorCallback;
				} else {
					xhr.onreadystatechange = function() {

						// Check readyState before timeout as it changes
						if ( xhr.readyState === 4 ) {

							// Allow onerror to be called first,
							// but that will not handle a native abort
							// Also, save errorCallback to a variable
							// as xhr.onerror cannot be accessed
							window.setTimeout( function() {
								if ( callback ) {
									errorCallback();
								}
							} );
						}
					};
				}

				// Create the abort callback
				callback = callback( "abort" );

				try {

					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {

					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
jQuery.ajaxPrefilter( function( s ) {
	if ( s.crossDomain ) {
		s.contents.script = false;
	}
} );

// Install script dataType
jQuery.ajaxSetup( {
	accepts: {
		script: "text/javascript, application/javascript, " +
			"application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /\b(?:java|ecma)script\b/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
} );

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
} );

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {

	// This transport only deals with cross domain or forced-by-attrs requests
	if ( s.crossDomain || s.scriptAttrs ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery( "<script>" )
					.attr( s.scriptAttrs || {} )
					.prop( { charset: s.scriptCharset, src: s.url } )
					.on( "load error", callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					} );

				// Use native DOM manipulation to avoid our domManip AJAX trickery
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
} );




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup( {
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
} );

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" &&
				( s.contentType || "" )
					.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
				rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters[ "script json" ] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// Force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always( function() {

			// If previous value didn't exist - remove it
			if ( overwritten === undefined ) {
				jQuery( window ).removeProp( callbackName );

			// Otherwise restore preexisting value
			} else {
				window[ callbackName ] = overwritten;
			}

			// Save back as free
			if ( s[ callbackName ] ) {

				// Make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// Save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		} );

		// Delegate to script
		return "script";
	}
} );




// Support: Safari 8 only
// In Safari 8 documents created via document.implementation.createHTMLDocument
// collapse sibling forms: the second one becomes a child of the first one.
// Because of that, this security measure has to be disabled in Safari 8.
// https://bugs.webkit.org/show_bug.cgi?id=137337
support.createHTMLDocument = ( function() {
	var body = document.implementation.createHTMLDocument( "" ).body;
	body.innerHTML = "<form></form><form></form>";
	return body.childNodes.length === 2;
} )();


// Argument "data" should be string of html
// context (optional): If specified, the fragment will be created in this context,
// defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( typeof data !== "string" ) {
		return [];
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}

	var base, parsed, scripts;

	if ( !context ) {

		// Stop scripts or inline event handlers from being executed immediately
		// by using document.implementation
		if ( support.createHTMLDocument ) {
			context = document.implementation.createHTMLDocument( "" );

			// Set the base href for the created document
			// so any parsed elements with URLs
			// are based on the document's URL (gh-2965)
			base = context.createElement( "base" );
			base.href = document.location.href;
			context.head.appendChild( base );
		} else {
			context = document;
		}
	}

	parsed = rsingleTag.exec( data );
	scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[ 1 ] ) ];
	}

	parsed = buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	var selector, type, response,
		self = this,
		off = url.indexOf( " " );

	if ( off > -1 ) {
		selector = stripAndCollapse( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax( {
			url: url,

			// If "type" variable is undefined, then "GET" method will be used.
			// Make value of this field explicit since
			// user can override it through ajaxSetup method
			type: type || "GET",
			dataType: "html",
			data: params
		} ).done( function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		// If the request succeeds, this function gets "data", "status", "jqXHR"
		// but they are ignored because response was set above.
		// If it fails, this function gets "jqXHR", "status", "error"
		} ).always( callback && function( jqXHR, status ) {
			self.each( function() {
				callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
			} );
		} );
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [
	"ajaxStart",
	"ajaxStop",
	"ajaxComplete",
	"ajaxError",
	"ajaxSuccess",
	"ajaxSend"
], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
} );




jQuery.expr.pseudos.animated = function( elem ) {
	return jQuery.grep( jQuery.timers, function( fn ) {
		return elem === fn.elem;
	} ).length;
};




jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( isFunction( options ) ) {

			// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
			options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend( {

	// offset() relates an element's border box to the document origin
	offset: function( options ) {

		// Preserve chaining for setter
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each( function( i ) {
					jQuery.offset.setOffset( this, options, i );
				} );
		}

		var rect, win,
			elem = this[ 0 ];

		if ( !elem ) {
			return;
		}

		// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
		// Support: IE <=11 only
		// Running getBoundingClientRect on a
		// disconnected node in IE throws an error
		if ( !elem.getClientRects().length ) {
			return { top: 0, left: 0 };
		}

		// Get document-relative position by adding viewport scroll to viewport-relative gBCR
		rect = elem.getBoundingClientRect();
		win = elem.ownerDocument.defaultView;
		return {
			top: rect.top + win.pageYOffset,
			left: rect.left + win.pageXOffset
		};
	},

	// position() relates an element's margin box to its offset parent's padding box
	// This corresponds to the behavior of CSS absolute positioning
	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset, doc,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// position:fixed elements are offset from the viewport, which itself always has zero offset
		if ( jQuery.css( elem, "position" ) === "fixed" ) {

			// Assume position:fixed implies availability of getBoundingClientRect
			offset = elem.getBoundingClientRect();

		} else {
			offset = this.offset();

			// Account for the *real* offset parent, which can be the document or its root element
			// when a statically positioned element is identified
			doc = elem.ownerDocument;
			offsetParent = elem.offsetParent || doc.documentElement;
			while ( offsetParent &&
				( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
				jQuery.css( offsetParent, "position" ) === "static" ) {

				offsetParent = offsetParent.parentNode;
			}
			if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

				// Incorporate borders into its offset, since they are outside its content origin
				parentOffset = jQuery( offsetParent ).offset();
				parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
				parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
			}
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	// This method will return documentElement in the following cases:
	// 1) For the element inside the iframe without offsetParent, this method will return
	//    documentElement of the parent window
	// 2) For the hidden or detached element
	// 3) For body or html element, i.e. in case of the html node - it will return itself
	//
	// but those exceptions were never presented as a real life use-cases
	// and might be considered as more preferable results.
	//
	// This logic, however, is not guaranteed and can change at any point in the future
	offsetParent: function() {
		return this.map( function() {
			var offsetParent = this.offsetParent;

			while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || documentElement;
		} );
	}
} );

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {

			// Coalesce documents and windows
			var win;
			if ( isWindow( elem ) ) {
				win = elem;
			} else if ( elem.nodeType === 9 ) {
				win = elem.defaultView;
			}

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : win.pageXOffset,
					top ? val : win.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length );
	};
} );

// Support: Safari <=7 - 9.1, Chrome <=37 - 49
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );

				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
} );


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name },
		function( defaultExtra, funcName ) {

		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( isWindow( elem ) ) {

					// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
					return funcName.indexOf( "outer" ) === 0 ?
						elem[ "inner" + name ] :
						elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?

					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable );
		};
	} );
} );


jQuery.each( ( "blur focus focusin focusout resize scroll click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup contextmenu" ).split( " " ),
	function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
} );

jQuery.fn.extend( {
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
} );




jQuery.fn.extend( {

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {

		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ?
			this.off( selector, "**" ) :
			this.off( types, selector || "**", fn );
	}
} );

// Bind a function to a context, optionally partially applying any
// arguments.
// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
// However, it is not slated for removal any time soon
jQuery.proxy = function( fn, context ) {
	var tmp, args, proxy;

	if ( typeof context === "string" ) {
		tmp = fn[ context ];
		context = fn;
		fn = tmp;
	}

	// Quick check to determine if target is callable, in the spec
	// this throws a TypeError, but we will just return undefined.
	if ( !isFunction( fn ) ) {
		return undefined;
	}

	// Simulated bind
	args = slice.call( arguments, 2 );
	proxy = function() {
		return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
	};

	// Set the guid of unique handler to the same of original handler, so it can be removed
	proxy.guid = fn.guid = fn.guid || jQuery.guid++;

	return proxy;
};

jQuery.holdReady = function( hold ) {
	if ( hold ) {
		jQuery.readyWait++;
	} else {
		jQuery.ready( true );
	}
};
jQuery.isArray = Array.isArray;
jQuery.parseJSON = JSON.parse;
jQuery.nodeName = nodeName;
jQuery.isFunction = isFunction;
jQuery.isWindow = isWindow;
jQuery.camelCase = camelCase;
jQuery.type = toType;

jQuery.now = Date.now;

jQuery.isNumeric = function( obj ) {

	// As of jQuery 3.0, isNumeric is limited to
	// strings and numbers (primitives or objects)
	// that can be coerced to finite numbers (gh-2662)
	var type = jQuery.type( obj );
	return ( type === "number" || type === "string" ) &&

		// parseFloat NaNs numeric-cast false positives ("")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		!isNaN( obj - parseFloat( obj ) );
};




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	} );
}




var

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( !noGlobal ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;
} );

},{}],29:[function(require,module,exports){
const LocatorBuilder = require("./locatorBuilders").LocatorBuilders;

class ElementUtil {
  static generateKeyFor(element) {
    var indexObtained = false;
    for (
      var segs = [];
      element && element.nodeType == 1;
      element = element.parentNode
    ) {
      if (!indexObtained) {
        for (
          var i = 1, sib = element.previousSibling;
          sib;
          sib = sib.previousSibling
        ) {
          if (sib.nodeName == element.nodeName) i++;
        }
        segs.unshift(element.nodeName.toLowerCase() + "[" + i + "]");
        indexObtained = true;
      } else segs.unshift(element.nodeName.toLowerCase());
    }
    return segs.length ? "/" + segs.join("/") : null;
  }

  static mapDOMForRecord(action, element, currentWindow) {
    var treeObject = {};

    // If string convert to document Node
    if (typeof element === "string") {
      if (window.DOMParser) {
        parser = new DOMParser();
        docNode = parser.parseFromString(element, "text/xml");
      } else {
        // Microsoft strikes again
        docNode = new ActiveXObject("Microsoft.XMLDOM");
        docNode.async = false;
        docNode.loadXML(element);
      }
      element = docNode.firstChild;
    }

    ElementUtil.treeHTMLForRecord(action, element, treeObject, currentWindow);
    return treeObject;
  }

  static treeHTMLForRecord(action, element, object, currentWindow) {
    if (!element) {
      return;
    }
    ElementUtil.treeHTML(element, object, currentWindow);
    object["action"] = action;

    var nodeList = element.childNodes;
    if (nodeList != null && nodeList.length) {
      object["content"] = [];
      for (var i = 0; i < nodeList.length; i++) {
        if (nodeList[i].nodeType == 3) {
          object["content"].push(nodeList[i].value);
        }
      }
    }
  }

  static treeHTML(element, object, currentWindow) {
    if (!element) {
      return;
    }
    object["unique_identifier"] = ElementUtil.generateKeyFor(element);
    object["type"] = element.nodeName.toLowerCase();
    object["attributes"] = {};
    if (element.attributes != null && element.attributes.length) {
      for (var i = 0; i < element.attributes.length; i++) {
        var elementAttribute = element.attributes[i];
        var elementAttributeValue = elementAttribute.value;
        if (
          elementAttributeValue !== "" &&
          elementAttributeValue != null &&
          elementAttributeValue !== "null"
        ) {
          object["attributes"][elementAttribute.nodeName] =
            elementAttribute.value;
        }
      }
    }
    var text = element.textContent || element.innerText;
    if (text !== "") {
      object["attributes"]["text"] = text;
    }
    var xpaths = new LocatorBuilder(window).buildAll(element);
    object["xpaths"] = {};
    for (var key in xpaths) {
      if (xpaths.hasOwnProperty(key)) {
        object["xpaths"][key] = xpaths[key];
      }
    }

    if (window.location === window.parent.location) {
      object["page"] = {};
      object["page"]["url"] = currentWindow.document.URL;
      object["page"]["title"] = currentWindow.document.title;
    }
  }
}

module.exports.ElementUtil = ElementUtil;

},{"./locatorBuilders":30}],30:[function(require,module,exports){
const NeighborLocatorsGenerator = require("./neighborLocatorsGenerator")
  .NeighborLocatorsGenerator;
const MozillaBrowserBot = require("./selenium-browserbot").MozillaBrowserBot;

//only implement if no native implementation is available
if (!Array.isArray) {
  Array.isArray = function(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
}

function LocatorBuilders(window) {
  this.window = window;
  //this.log = new Log("LocatorBuilders");
}

LocatorBuilders.prototype.detach = function() {
  if (this.window._locator_pageBot) {
    //this.log.debug(this.window);
    this.window._locator_pageBot = undefined;
    // Firefox 3 (beta 5) throws "Security Manager vetoed action" when we use delete operator like this:
    // delete this.window._locator_pageBot;
  }
};

LocatorBuilders.prototype.pageBot = function() {
  var pageBot = this.window._locator_pageBot;
  if (pageBot == null) {
    //pageBot = BrowserBot.createForWindow(this.window);
    pageBot = new MozillaBrowserBot(this.window);
    var self = this;
    pageBot.getCurrentWindow = function() {
      return self.window;
    };
    this.window._locator_pageBot = pageBot;
  }
  return pageBot;
};

LocatorBuilders.prototype.buildWith = function(name, e, opt_contextNode) {
  return LocatorBuilders.builderMap[name].call(this, e, opt_contextNode);
};

LocatorBuilders.prototype.build = function(e) {
  var locators = this.buildAll(e);
  if (locators.length > 0) {
    return locators[0][0];
  } else {
    return "LOCATOR_DETECTION_FAILED";
  }
};

LocatorBuilders.prototype.buildAll = function(el) {
  var e = el;
  var xpathLevel = 0;
  var maxLevel = 10;
  var buildWithResults;
  var locators = {};
  //this.log.debug("getLocator for element " + e);
  for (var i = 0; i < LocatorBuilders.order.length; i++) {
    var finderName = LocatorBuilders.order[i];
    var locatorResults = []; // Array to hold buildWith results
    //this.log.debug("trying " + finderName);
    try {
      buildWithResults = this.buildWith(finderName, e);
      // If locator is an array then dump its element in a new array
      if (Array.isArray(buildWithResults)) {
        for (var j = 0; j < buildWithResults.length; j++) {
          locatorResults.push(buildWithResults[j]);
        }
      } else {
        locatorResults.push(buildWithResults);
      }
      for (var j = 0; j < locatorResults.length; j++) {
        var thisLocator = locatorResults[j];
        if (thisLocator) {
          thisLocator = String(thisLocator);
          if (finderName != "tac") {
            var fe = this.findElement(thisLocator);
            if (e == fe) {
              if (!locators[finderName]) {
                locators[finderName] = [];
              }
              locators[finderName].push(thisLocator);
            }
          }
        }
      }
    } catch (e) {
      // TODO ignore the buggy locator builder for now
      //this.log.debug("locator exception: " + e);
    }
  }
  return locators;
};

LocatorBuilders.prototype.findElement = function(locator) {
  try {
    return this.pageBot().findElement(locator);
  } catch (error) {
    //this.log.debug("findElement failed: " + error + ", locator=" + locator);
    return null;
  }
};

/*
 * Class methods
 */

LocatorBuilders.order = [];

LocatorBuilders.builderMap = {};
LocatorBuilders._preferredOrder = [];

// NOTE: for some reasons we does not use this part
// classObservable(LocatorBuilders);

LocatorBuilders.add = function(name, finder) {
  if (this.order.indexOf(name) < 0) {
    this.order.push(name);
  }
  this.builderMap[name] = finder;
};

/*
 * Utility function: Encode XPath attribute value.
 */
LocatorBuilders.prototype.attributeValue = function(value) {
  if (value.indexOf("'") < 0) {
    return "'" + value + "'";
  } else if (value.indexOf('"') < 0) {
    return '"' + value + '"';
  } else {
    var result = "concat(";
    var part = "";
    while (true) {
      var apos = value.indexOf("'");
      var quot = value.indexOf('"');
      if (apos < 0) {
        result += "'" + value + "'";
        break;
      } else if (quot < 0) {
        result += '"' + value + '"';
        break;
      } else if (quot < apos) {
        part = value.substring(0, apos);
        result += "'" + part + "'";
        value = value.substring(part.length);
      } else {
        part = value.substring(0, quot);
        result += '"' + part + '"';
        value = value.substring(part.length);
      }
      result += ",";
    }
    result += ")";
    return result;
  }
};

LocatorBuilders.prototype.xpathHtmlElement = function(name) {
  if (this.window.document.contentType == "application/xhtml+xml") {
    // "x:" prefix is required when testing XHTML pages
    return "x:" + name;
  } else {
    return name;
  }
};

LocatorBuilders.prototype.relativeXPathFromParent = function(current) {
  var index = this.getNodeNbr(current);
  var currentPath = "/" + this.xpathHtmlElement(current.nodeName.toLowerCase());
  if (index > 0) {
    currentPath += "[" + (index + 1) + "]";
  }
  return currentPath;
};

LocatorBuilders.prototype.getNodeNbr = function(current) {
  var childNodes = current.parentNode.childNodes;
  var total = 0;
  var index = -1;
  for (var i = 0; i < childNodes.length; i++) {
    var child = childNodes[i];
    if (child.nodeName == current.nodeName) {
      if (child == current) {
        index = total;
      }
      total++;
    }
  }
  return index;
};

LocatorBuilders.prototype.getCSSSubPath = function(e) {
  var css_attributes = ["id", "name", "class", "type", "alt", "title", "value"];
  for (var i = 0; i < css_attributes.length; i++) {
    var attr = css_attributes[i];
    var value = e.getAttribute(attr);
    if (value) {
      if (attr == "id") return "#" + value;
      if (attr == "class")
        return (
          e.nodeName.toLowerCase() +
          "." +
          value.replace(/\s+/g, ".").replace("..", ".")
        );
      return e.nodeName.toLowerCase() + "[" + attr + '="' + value + '"]';
    }
  }
  if (this.getNodeNbr(e))
    return (
      e.nodeName.toLowerCase() + ":nth-of-type(" + this.getNodeNbr(e) + ")"
    );
  else return e.nodeName.toLowerCase();
};

LocatorBuilders.prototype.preciseXPath = function(xpath, e) {
  //only create more precise xpath if needed
  if (this.findElement(xpath) != e) {
    var result = e.ownerDocument.evaluate(
      xpath,
      e.ownerDocument,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    //skip first element (result:0 xpath index:1)
    for (var i = 0, len = result.snapshotLength; i < len; i++) {
      var newPath = "xpath=(" + xpath + ")[" + (i + 1) + "]";
      if (this.findElement(newPath) == e) {
        return newPath;
      }
    }
  }
  return xpath;
};

/*
 * ===== builders =====
 */

LocatorBuilders.add("ui", function(pageElement) {
  return UIMap.getInstance().getUISpecifierString(
    pageElement,
    this.window.document
  );
});

LocatorBuilders.add("id", function(e) {
  if (e.id) {
    return "id=" + e.id;
  }
  return null;
});

LocatorBuilders.add("link", function(e) {
  if (e.nodeName == "A") {
    var text = e.textContent;
    if (!text.match(/^\s*$/)) {
      return (
        "link=" +
        exactMatchPattern(
          text.replace(/\xA0/g, " ").replace(/^\s*(.*?)\s*$/, "$1")
        )
      );
    }
  }
  return null;
});

LocatorBuilders.add("name", function(e) {
  if (e.name) {
    return "name=" + e.name;
  }
  return null;
});

/*
 * This function is called from DOM locatorBuilders
 */
LocatorBuilders.prototype.findDomFormLocator = function(form) {
  if (form.hasAttribute("name")) {
    var name = form.getAttribute("name");
    var locator = "document." + name;
    if (this.findElement(locator) == form) {
      return locator;
    }
    locator = "document.forms['" + name + "']";
    if (this.findElement(locator) == form) {
      return locator;
    }
  }
  var forms = this.window.document.forms;
  for (var i = 0; i < forms.length; i++) {
    if (form == forms[i]) {
      return "document.forms[" + i + "]";
    }
  }
  return null;
};

LocatorBuilders.add("dom:name", function(e) {
  if (e.form && e.name) {
    var formLocator = this.findDomFormLocator(e.form);
    if (formLocator) {
      var candidates = [
        formLocator + "." + e.name,
        formLocator + ".elements['" + e.name + "']"
      ];
      for (var c = 0; c < candidates.length; c++) {
        var locator = candidates[c];
        var found = this.findElement(locator);
        if (found) {
          if (found == e) {
            return locator;
          } else if (found instanceof NodeList) {
            // multiple elements with same name
            for (var i = 0; i < found.length; i++) {
              if (found[i] == e) {
                return locator + "[" + i + "]";
              }
            }
          }
        }
      }
    }
  }
  return null;
});

LocatorBuilders.add("xpath:link", function(e) {
  if (e.nodeName == "A") {
    var text = e.textContent;
    if (!text.match(/^\s*$/)) {
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("a") +
          "[contains(text(),'" +
          text.replace(/^\s+/, "").replace(/\s+$/, "") +
          "')]",
        e
      );
    }
  }
  return null;
});

LocatorBuilders.add("xpath:img", function(e) {
  if (e.nodeName == "IMG") {
    if (e.alt != "") {
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("img") +
          "[@alt=" +
          this.attributeValue(e.alt) +
          "]",
        e
      );
    } else if (e.title != "") {
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("img") +
          "[@title=" +
          this.attributeValue(e.title) +
          "]",
        e
      );
    } else if (e.src != "") {
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("img") +
          "[contains(@src," +
          this.attributeValue(e.src) +
          ")]",
        e
      );
    }
  }
  return null;
});

LocatorBuilders.add("xpath:attributes", function(e) {
  const PREFERRED_ATTRIBUTES = [
    "id",
    "name",
    "value",
    "type",
    "action",
    "onclick"
  ];
  var i = 0;

  function attributesXPath(name, attNames, attributes) {
    var locator = "//" + this.xpathHtmlElement(name) + "[";
    for (i = 0; i < attNames.length; i++) {
      if (i > 0) {
        locator += " and ";
      }
      var attName = attNames[i];
      locator += "@" + attName + "=" + this.attributeValue(attributes[attName]);
    }
    locator += "]";
    return this.preciseXPath(locator, e);
  }

  if (e.attributes) {
    var atts = e.attributes;
    var attsMap = {};
    for (i = 0; i < atts.length; i++) {
      var att = atts[i];
      attsMap[att.name] = att.value;
    }
    var names = [];
    // try preferred attributes
    for (i = 0; i < PREFERRED_ATTRIBUTES.length; i++) {
      var name = PREFERRED_ATTRIBUTES[i];
      if (attsMap[name] != null) {
        names.push(name);
        var locator = attributesXPath.call(
          this,
          e.nodeName.toLowerCase(),
          names,
          attsMap
        );
        if (e == this.findElement(locator)) {
          return locator;
        }
      }
    }
  }
  return null;
});

LocatorBuilders.add("xpath:idRelative", function(e) {
  var path = "";
  var current = e;
  while (current != null) {
    if (current.parentNode != null) {
      path = this.relativeXPathFromParent(current) + path;
      if (
        1 == current.parentNode.nodeType && // ELEMENT_NODE
        current.parentNode.getAttribute("id")
      ) {
        return this.preciseXPath(
          "//" +
            this.xpathHtmlElement(current.parentNode.nodeName.toLowerCase()) +
            "[@id=" +
            this.attributeValue(current.parentNode.getAttribute("id")) +
            "]" +
            path,
          e
        );
      }
    } else {
      return null;
    }
    current = current.parentNode;
  }
  return null;
});

LocatorBuilders.add("xpath:href", function(e) {
  if (e.attributes && e.hasAttribute("href")) {
    href = e.getAttribute("href");
    if (href.search(/^http?:\/\//) >= 0) {
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("a") +
          "[@href=" +
          this.attributeValue(href) +
          "]",
        e
      );
    } else {
      // use contains(), because in IE getAttribute("href") will return absolute path
      return this.preciseXPath(
        "//" +
          this.xpathHtmlElement("a") +
          "[contains(@href, " +
          this.attributeValue(href) +
          ")]",
        e
      );
    }
  }
  return null;
});

LocatorBuilders.add("dom:index", function(e) {
  if (e.form) {
    var formLocator = this.findDomFormLocator(e.form);
    if (formLocator) {
      var elements = e.form.elements;
      for (var i = 0; i < elements.length; i++) {
        if (elements[i] == e) {
          return formLocator + ".elements[" + i + "]";
        }
      }
    }
  }
  return null;
});

LocatorBuilders.add("xpath:position", function(e, opt_contextNode) {
  //this.log.debug("positionXPath: e=" + e);
  var path = "";
  var current = e;
  while (current != null && current != opt_contextNode) {
    var currentPath;
    if (current.parentNode != null) {
      currentPath = this.relativeXPathFromParent(current);
    } else {
      currentPath = "/" + this.xpathHtmlElement(current.nodeName.toLowerCase());
    }
    path = currentPath + path;
    var locator = "/" + path;
    if (e == this.findElement(locator)) {
      return locator;
    }
    current = current.parentNode;
    //this.log.debug("positionXPath: current=" + current);
  }
  return null;
});

LocatorBuilders.add("css", function(e) {
  var current = e;
  var sub_path = this.getCSSSubPath(e);
  while (
    this.findElement("css=" + sub_path) != e &&
    current.nodeName.toLowerCase() != "html"
  ) {
    sub_path = this.getCSSSubPath(current.parentNode) + " > " + sub_path;
    current = current.parentNode;
  }
  return "css=" + sub_path;
});

LocatorBuilders.add("xpath:neighbor", function(e) {
  return new NeighborLocatorsGenerator().getXpathsByNeighbors(e, true);
});

module.exports.LocatorBuilders = LocatorBuilders;

},{"./neighborLocatorsGenerator":31,"./selenium-browserbot":33}],31:[function(require,module,exports){
var $ = require("jquery");
class NeighborLocatorsGenerator {
  // Tags that we consider 'useless'
  excludedTags = [
    "main",
    "noscript",
    "script",
    "style",
    "header",
    "head",
    "footer",
    "meta",
    "body",
    "title",
    "ul",
    "iframe",
    "link",
    "svg",
    "path",
    "nav",
    "p",
    "option",
    "br"
  ];

  constructor() {}

  /*
    Methods
*/

  /**
   * @param: DOM element
   * @param: boolean
   * @return: xpaths starting from a preceding and following neighbors( concatenated with xpath= (@param2))
   **/

  getXpathsByNeighbors(clickedElement, xpathPrefix) {
    // Get useful elements surrounding clicked element, with the amount
    // specified by neighborXpath.beforeEle and neighborXpath.afterEle
    var usefulNeighbors = this.getUsefulNeighbors(clickedElement, 2, 2);
    var newXpaths = [];
    // Generate new xpath for the neighbors above
    for (var i = 0; i < usefulNeighbors.length; i++) {
      var thisUsefulNeighbor = usefulNeighbors[i];
      var partialPathToGetTagOffset;
      var correctPrefix;
      var correctOffsetByTagName;
      var newXPath;

      // Retrieve any element that:
      //              - Has text nodes that are not just blank spaces in disguise ( This removes bounding parents )
      //              - The over all string matches the neighbor's text ( This selects the correct element )
      var thisUsefulNeighborText = this.getImmediateText(thisUsefulNeighbor);
      var partialPathToGetTextOffset =
        "(.//*[normalize-space(text()) and normalize-space(.)=" +
        thisUsefulNeighborText +
        "])";
      var correctOffsetByText = this.getCorrectOffset(
        thisUsefulNeighbor,
        partialPathToGetTextOffset
      );
      var neighborXpath =
        partialPathToGetTextOffset + "[" + correctOffsetByText + "]";

      if (!this.isDescendant(thisUsefulNeighbor, clickedElement)) {
        // If the neighbor is actually the container, then 'preceding' or 'following' would be wrong
        // We have to find inside the container
        correctPrefix = this.getRelativePrefix(
          clickedElement,
          thisUsefulNeighbor
        );
        partialPathToGetTagOffset =
          neighborXpath +
          "/" +
          correctPrefix +
          "::" +
          this.getElementTagNameOrSvgName(clickedElement);
        correctOffsetByTagName = this.getCorrectOffset(
          clickedElement,
          partialPathToGetTagOffset
        );
        newXPath =
          partialPathToGetTagOffset + "[" + correctOffsetByTagName + "]";
      } else {
        // Retrieve any element that:
        //              - 'precede' or 'follow' the neighbor
        //              -  Has the same tag name as the clicked element
        partialPathToGetTagOffset =
          neighborXpath +
          "//" +
          this.getElementTagNameOrSvgName(clickedElement);
        correctOffsetByTagName = this.getCorrectOffset(
          clickedElement,
          partialPathToGetTagOffset
        );
        newXPath =
          partialPathToGetTagOffset + "[" + correctOffsetByTagName + "]";
      }
      if (xpathPrefix) {
        newXpaths.push("xpath=" + newXPath);
      } else {
        newXpaths.push(newXPath);
      }
    }
    if (xpathPrefix) {
      newXpaths.push("xpath=" + this.generateTextLocator(clickedElement));
    } else {
      newXpaths.push(this.generateTextLocator(clickedElement));
    }
    return newXpaths;
  }

  generateTextLocator(element) {
    var current = element;
    if (current.childNodes.length && current.childNodes.length > 0) {
      var firstText = "";
      for (var i = 0; i < current.childNodes.length; i++) {
        var curNode = current.childNodes[i];
        if (curNode.nodeType == 3) {
          firstText = curNode.nodeValue;
          if (!firstText.trim() == "") {
            break;
          }
        }
      }
    } else if (current.nodeType == 3) {
      firstText = current.nodeValue;
    }
    return (
      "//*/text()[normalize-space(.)='" + firstText.trim() + "']/parent::*"
    );
  }

  /**
   * SVG is treated as a special case because it cannot be used as a tag name (makes no sense but whatever)
   */
  getElementTagNameOrSvgName(element) {
    if (element.tagName.toLowerCase() == "svg") {
      return "*[name()='svg']";
    }
    return element.tagName.toLowerCase();
  }

  getUsefulNeighborsText(clickedElement) {
    var usefulNeighbors = this.getUsefulNeighbors(clickedElement, 2, 2);
    var neighborsText = [];
    for (var i = 0; i < usefulNeighbors.length; i++) {
      var thisUsefulNeighbor = usefulNeighbors[i];
      neighborsText.push(this.this.getImmediateText(thisUsefulNeighbor));
    }
    return neighborsText;
  }

  /**
   * @param: DOM element
   * @param: Boolean
   * @return: xpath of label with @for that matches the clicked element's @id ( concatenated with xpath= (@param2))
   **/
  getXpathByLabelFor(clickedElement, xpathPrefix) {
    var clickedElementIDAttrName = clickedElement.getAttribute("id");
    var clickedElementIDAttrValue =
      clickedElementIDAttrName && clickedElementIDAttrName !== ""
        ? clickedElementIDAttrName.attrValue
        : null;
    var newXpath = [];
    // If @id exists then the possibility for a label exists
    if (clickedElementIDAttrValue) {
      // Find an element with @for equals the ID above
      var labelForInputXPath =
        "//label[@for='" + clickedElementIDAttrValue + "']";
      var labelForInput = getElementByXPath(labelForInputXPath);
      // If the label exists
      if (labelForInput) {
        // Use the text of the anchor only, constrainted by 2 conditions ( see getXPathByNeighbor -> partialPathToGetTextOffset )
        var anchorXPath =
          "//label[normalize-space(text()) and normalize-space(.)=" +
          this.getImmediateText(labelForInput) +
          "]";
        // Retrieve the correct offset of label among elements with the same text
        var correctOffsetByText = getCorrectOffset(labelForInput, anchorXPath);
        // Retrieve all elements with @id equals to the value of @for of the anchor
        var newXPath =
          "//*[@id=string(" +
          anchorXPath +
          "[" +
          correctOffsetByText +
          "]" +
          "/@for)]";
        if (xpathPrefix) {
          return newXPath;
        } else {
          return newXPath;
        }
      }
    }
  }

  /**
   * @param: DOM element
   * @param: (optional) number of elements preceding the clicked element to capture
   * @param: (optional) number of elements following the clicked element to capture
   * @return: 2 useful elements surrounding @param1
   **/
  getUsefulNeighbors(
    clickedElement,
    explicitPrecedeLevel,
    explicitFollowLevel
  ) {
    var usefulElements = [];
    var allElements = document.getElementsByTagName("*");
    var precedeCounter = 0;
    var followCounter = 0;

    // If not explicitly stated, get only 1 level each
    var precedeLimit = explicitPrecedeLevel ? explicitPrecedeLevel : 1;
    var followLimit = explicitFollowLevel ? explicitFollowLevel : 1;

    // allElements contain all DOM elements already sorted in order of their apperance in DOM tree
    for (var i = 0; i < allElements.length; i++) {
      var thisElement = allElements[i];
      if (thisElement === clickedElement) {
        // Go to the left and get an element <= remove break and add counter to get more
        for (var j = i - 1; j >= 0; j--) {
          if (allElements[j]) {
            var prevElement = allElements[j];
            if (
              this.usefulElement(prevElement) &&
              precedeCounter < precedeLimit
            ) {
              usefulElements.push(prevElement);
              precedeCounter++;
            }
          } else break;
        }
        // Go to the right and also do the above
        for (var k = i + 1; k < allElements.length; k++) {
          if (allElements[k]) {
            var nextElement = allElements[k];
            if (
              this.usefulElement(nextElement) &&
              followCounter < followLimit
            ) {
              usefulElements.push(nextElement);
              followCounter++;
            }
          } else break;
        }
      }
    }
    return usefulElements;
  }

  /**
   * @param: DOM element ( clicked element )
   * @param: DOM element ( the neighbor )
   * @return: string
   * return either 'preceding' or 'following' depends on wether neighbor appears before or after clicked element
   **/
  getRelativePrefix(clickedElement, neighbor) {
    var elementPath = this.getIndexPath(clickedElement);
    var neighborPath = this.getIndexPath(neighbor);
    for (
      var i = 0;
      i < Math.max(elementPath.length, neighborPath.length);
      i++
    ) {
      if (elementPath[i] != neighborPath[i]) {
        return elementPath[i] - neighborPath[i] < 0 ? "preceding" : "following";
      }
    }
  }

  /**
   * @param: DOM element
   * @param: Path so far
   * @return: Array of index representing the position of the current element
   * among all children of its parent
   **/
  getIndexPath(domNode, bits) {
    bits = bits ? bits : [];
    var c = 0;
    var p = domNode.parentNode;
    if (p) {
      // This is the important difference from getAbsoluteXPath
      var els = p.children;

      if (els.length > 1) {
        while (els[c] !== domNode) c++;
      }

      bits.push(c);
      return this.getIndexPath(p, bits);
    }
    return bits.reverse();
  }

  /**
   * @param: DOM element ( clicked element )
   * @param: string ( xpath )
   * @return: The offset off @param1 among elements retrieved by @param2
   **/
  getCorrectOffset(clickedElement, xpath) {
    var candidates = this.getElementsByXPath(xpath);
    var counter = 0;

    // Special case - if xpath contains 'preceding' then we count from right to left
    if (xpath.includes("preceding")) {
      for (var i = candidates.length - 1; i >= 0; i--) {
        var thisElement = candidates[i];
        if (thisElement === clickedElement) {
          return counter + 1;
        } else {
          counter++;
        }
      }
    } // else the default (xpath contains 'following' or no relative info) is counting from left to right
    else {
      for (var i = 0; i < candidates.length; i++) {
        var thisElement = candidates[i];
        if (thisElement === clickedElement) {
          return counter + 1;
        } else {
          counter++;
        }
      }
    }
    return counter + 1;
  }

  /*
    Utilities
*/

  /**
   * @param: DOM element
   * @return: The text immediately within the element's tag ( not its children )
   * that can be used for xpath (e.g. single quotes, double quotes handled)
   **/
  getImmediateText(element) {
    var textNodePresence = $(element)
      .contents()
      .filter(function() {
        return this.nodeType == Node.TEXT_NODE;
      })
      .text()
      .trim();

    // Replace consecutive white spaces with a single white space
    var text = "";
    var addedSingleSpace = false;
    for (var i = 0; i < element.childNodes.length; i++) {
      if (element.childNodes[i].nodeType == Node.TEXT_NODE) {
        if (
          $(element.childNodes[i])
            .text()
            .trim() == ""
        ) {
          if (addedSingleSpace == false) {
            text += " ";
            addedSingleSpace = true;
          }
        } else {
          text += $(element.childNodes[i])
            .text()
            .trim();
        }
      }
    }

    // Trim away preceding and trailing white spaces ( if any );
    text = text.trim();

    if (textNodePresence) {
      return this.generateConcatForXPath(text);
    }
    return "";
  }

  /**
   * @param: string
   * @return: if the @param1 ontains single quotes or double quotes,
   * the returned string will contain concat function with double quotes bounded by single quotes
   * and single quotes bounded by double quotes
   * Reference: https://examples.javacodegeeks.com/core-java/xml/xpath/xpath-concat-example/
   **/
  generateConcatForXPath(string) {
    var returnString = "";
    var searchString = string.trim();
    var quotePos = this.getQuotePos(searchString);

    if (quotePos == -1) {
      returnString = "'" + searchString + "'";
    } else {
      returnString = "concat(";
      while (quotePos != -1) {
        var subString = searchString.substring(0, quotePos);
        returnString += "'" + subString + "', ";
        //
        if (searchString.substring(quotePos, quotePos + 1) == "'") {
          returnString += '"\'", ';
        } else {
          returnString += "'\"', ";
        }
        searchString = searchString.substring(
          quotePos + 1,
          searchString.length
        );
        quotePos = this.getQuotePos(searchString);
      }
      returnString += "'" + searchString + "')";
    }

    return returnString;
  }

  /**
   *  @param: Xpath - string
   *  @return: the first element that matches the xpath on DOM
   **/
  getElementByXPath(path) {
    return document.evaluate(
      path,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }

  /**
   * @param: XPath - string
   * @return: Array of found DOM elements
   **/
  getElementsByXPath(path) {
    var snapShotItems = document.evaluate(
      path,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    var ret = [];
    for (var i = 0; i < snapShotItems.snapshotLength; i++) {
      ret.push(snapShotItems.snapshotItem(i));
    }
    return ret;
  }

  /**
   * @param: DOM element
   * @return: "true" if an element is useful, "false" otherwise
   **/
  usefulElement(element) {
    var elementXPathText = this.getImmediateText(element);
    // Since neighborXpath.this.getImmediateText() return a string wrapped by single/double quotes, we ignore them
    var boundedQuotesRemoved = elementXPathText.substring(
      1,
      elementXPathText.length - 1
    );

    return (
      element && // it exist
      !this.excludedTags.includes(element.tagName.toLowerCase()) &&
      // Have text
      this.getImmediateText(element) != "" &&
      // Have just enough text
      this.getImmediateText(element).length > 1 &&
      // If a text is not included as a neighbor, chances are it is longer than this threshold
      this.getImmediateText(element).length <= 100 &&
      // Text is not a number since numbers are fragile
      isNaN(parseInt(boundedQuotesRemoved)) &&
      // Not hidden in any kind
      element.getAttribute("type") !== "hidden" &&
      element.getAttribute("style") !== "display:none" &&
      // TODO: make 'aria-hidden' optional - it could be sometimes useless
      element.getAttribute("aria-hidden") !== "true" &&
      // is not there for no reason
      element.getAttribute("href") !== "#" &&
      element.getAttribute("class") !== "hidden"
    );
  }

  /**
   * @param: DOM element
   * @param: The path so far
   * @return: Absolute xpath from root to node
   **/
  getAbsoluteXPath(domNode, bits) {
    bits = bits ? bits : [];
    var c = 0;
    var b = domNode.nodeName;
    var p = domNode.parentNode;

    if (p) {
      var els = p.getElementsByTagName(b);
      if (els.length > 1) {
        while (els[c] !== domNode) c++;
        b += "[" + (c + 1) + "]";
      }
      bits.push(b.toLowerCase());
      return getAbsoluteXPath(p, bits);
    }
    return bits.reverse().join("/");
  }

  /**
   * @param: string
   * @return: A position of the first encountered double or single quotes ( if any )
   **/
  getQuotePos(searchString) {
    var ret1 = searchString.indexOf("'");
    var ret2 = searchString.indexOf('"');
    return ret1 == -1 ? ret2 : ret1;
  }

  isDescendant(parent, child) {
    var node = child.parentNode;
    while (node != null) {
      if (node == parent) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
}

module.exports.NeighborLocatorsGenerator = NeighborLocatorsGenerator;

},{"jquery":28}],32:[function(require,module,exports){
const ElementUtil = require("./common").ElementUtil;
const axios = require("axios");
const LocatorBuilder = require("./locatorBuilders").LocatorBuilders;

class Recorder {
  INPUT_TYPE_INPUT_EVENT = [
    "email",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "url"
  ];
  constructor(window) {
    this.window = window;
    this.attached = false;
    this.eventHandlers = {};
  }

  parseEventKey(eventKey) {
    if (eventKey.match(/^C_/)) {
      return { eventName: eventKey.substring(2), capture: true };
    } else {
      return { eventName: eventKey, capture: false };
    }
  }

  attach() {
    if (this.attached) {
      return;
    }
    var self = this;
    this.elementKeyword = "element";
    this.attached = true;
    this.eventListeners = {};
    for (let eventKey in this.eventHandlers) {
      var eventInfo = this.parseEventKey(eventKey);
      var eventName = eventInfo.eventName;
      var capture = eventInfo.capture;
      function register() {
        var handlers = this.eventHandlers[eventKey];
        var listener = function(event) {
          for (var i = 0; i < handlers.length; i++) {
            handlers[i].call(self, event);
          }
        };
        this.window.document.addEventListener(eventName, listener, capture);
        this.eventListeners[eventKey] = listener;
      }
      register.call(this);
    }

    if (this.window.addEventListener) {
      function register() {
        var listener = function(event) {
          self.rec_receiveMessage.call(self, event);
        };
        this.window.addEventListener("message", listener, false);
      }
      register.call(this);
    } else {
      function register() {
        var listener = function(event) {
          self.rec_receiveMessage.call(self, event);
        };
        this.window.attachEvent("onmessage", listener);
      }
      register.call(this);
    }
  }

  detach() {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    for (let eventKey in this.eventListeners) {
      var eventInfo = this.parseEventKey(eventKey);
      var eventName = eventInfo.eventName;
      var capture = eventInfo.capture;
      this.window.document.removeEventListener(
        eventName,
        this.eventListeners[eventKey],
        capture
      );
    }
    delete this.eventListeners;
    if (this.window.addEventListener) {
      function unregister() {
        var listener = function(event) {
          self.rec_receiveMessage.call(self, event);
        };
        this.window.removeEventListener("message", listener, false);
      }
      unregister.call(this);
    } else {
      function unregister() {
        var listener = function(event) {
          self.rec_receiveMessage.call(self, event);
        };
        this.window.detachEvent("message", listener);
      }
      unregister.call(this);
    }
  }

  rec_receiveMessage(event) {
    var childFrame = null;
    var arrFrames = this.window.document.getElementsByTagName("IFRAME");
    for (var i = 0; i < arrFrames.length; i++) {
      if (arrFrames[i].contentWindow === event.source) {
        childFrame = arrFrames[i];
        break;
      }
    }
    arrFrames = this.window.document.getElementsByTagName("FRAME");
    for (var i = 0; i < arrFrames.length; i++) {
      if (arrFrames[i].contentWindow === event.source) {
        childFrame = arrFrames[i];
        break;
      }
    }
    if (!childFrame) {
      return;
    }

    var object = JSON.parse(event.data);
    var action = {};
    action["actionName"] = "goIntoFrame";
    action["actionData"] = "";
    var json = ElementUtil.mapDOMForRecord(action, childFrame, window);
    if (json) this.rec_setParentJson(object, json);

    this.rec_processObject(object);
  }

  getOnlySelectors(object) {
    var result = [];
    for (var i = 0; i < LocatorBuilder.order.length; i++) {
      var finderName = LocatorBuilder.order[i];
      var value = object["xpaths"][finderName];
      if (value) {
        result.push(...value);
      }
    }
    return result;
  }

  rec_processObject(object) {
    if (this.window.location !== this.window.parent.location) {s
      this.window.parent.postMessage(JSON.stringify(object), "*");
    } else {
      console.log(object);
      const data = {
        keys: [object["unique_identifier"]],
        selectors: this.getOnlySelectors(object)
      };
      axios
        .post("http://localhost:8888/", JSON.stringify(data))
        .catch(error => {
          console.log(error);
        });
    }
  }

  rec_setParentJson(object, parentJson) {
    if ("parent" in object) {
      this.rec_setParentJson(object["parent"], parentJson);
    } else {
      object["parent"] = parentJson;
    }
  }

  // Unused
  rec_postData(url, object) {
    if (!object) {
      return;
    }
    var data = { keyword: this.elementKeyword, obj: object, mode: "RECORD" };
    if (detectChrome()) {
      chromePostData(url, data, function(response) {
        if (response) {
          console.log(response);
          alert(response);
          setTimeout(function() {
            window.focus();
          }, 1);
          return;
        }
        console.log("POST success");
      });
      return;
    }
    if (detectIE() && this.window.httpRequestExtension) {
      var response = this.window.httpRequestExtension.postRequest(data, url);
      if (response === "200") {
        console.log("POST success");
      } else {
        console.log(response);
      }
      return;
    }
    self.port.emit("rec_postData", {
      url: url,
      data: object
    });
  }

  rec_getSelectValues(select) {
    var result = [];
    var options = select && select.options;
    var opt;

    for (var i = 0, iLen = options.length; i < iLen; i++) {
      opt = options[i];
      if (opt.selected) {
        result.push(opt.value || opt.text);
      }
    }
    return result;
  }

  processOnInputChangeTarget(selectedElement) {
    if (!selectedElement) {
      return;
    }
    var elementTagName = selectedElement.tagName.toLowerCase();
    var elementTypeName = selectedElement.type
      ? selectedElement.type.toLowerCase()
      : null;
    var isRecorded =
      (elementTagName === "input" &&
        elementTypeName &&
        INPUT_TYPE_INPUT_EVENT.indexOf(elementTypeName) !== -1) ||
      elementTagName === "textarea";
    if (!isRecorded) {
      return;
    }

    var action = {};
    action["actionName"] = "inputChange";
    action["actionData"] = selectedElement.value;
    this.rec_sendData(action, selectedElement);
  }

  processOnChangeTarget(selectedElement) {
    if (!selectedElement) {
      return;
    }
    var elementTagName = selectedElement.tagName.toLowerCase();
    var elementTypeName = selectedElement.type
      ? selectedElement.type.toLowerCase()
      : null;
    var isRecorded =
      (elementTagName !== "input" && elementTagName !== "textarea") ||
      (elementTagName == "input" &&
        elementTypeName != "radio" &&
        elementTypeName != "checkbox" &&
        elementTypeName &&
        INPUT_TYPE_INPUT_EVENT.indexOf(elementTypeName) !== -1);
    if (!isRecorded) {
      return;
    }

    var action = {};
    action["actionName"] = "inputChange";
    if (selectedElement.tagName.toLowerCase() == "select") {
      action["actionData"] = {};
      action["actionData"]["oldValue"] = selectedElement.oldValue;
      action["actionData"]["newValue"] = this.rec_getSelectValues(
        selectedElement
      );
      selectedElement.oldValue = action["actionData"]["newValue"];
    } else if (
      selectedElement.contentEditable &&
      selectedElement.contentEditable == "true"
    ) {
      action["actionData"] = selectedElement.innerHTML;
    } else {
      action["actionData"] = selectedElement.value;
    }
    this.rec_sendData(action, selectedElement);
  }

  processOnSendKeyTarget(selectedElement) {
    var action = {};
    action["actionName"] = "sendKeys";
    action["actionData"] = 13;
    this.rec_sendData(action, selectedElement);
  }

  rec_isElementMouseUpEventRecordable(selectedElement, clickType) {
    if (clickType != "left") {
      return true;
    }
    var elementTag = selectedElement.tagName.toLowerCase();
    if (elementTag == "input") {
      var elementInputType = selectedElement.type.toLowerCase();
      if (
        elementInputType == "button" ||
        elementInputType == "submit" ||
        elementInputType == "radio" ||
        elementInputType == "image" ||
        elementInputType == "checkbox" ||
        elementInputType == "text"
      ) {
        return true;
      }
      return false;
    }

    if (
      selectedElement.contentEditable &&
      selectedElement.contentEditable == "true"
    ) {
      return false;
    }
    return (
      elementTag != "select" &&
      elementTag != "option" &&
      elementTag != "textarea"
    );
  }

  rec_getMouseButton(e) {
    if (!e) {
      return;
    }
    if (e.which) {
      if (e.which == 3) {
        return "right";
      }
      if (e.which == 2) {
        return "middle";
      }
      return "left";
    }
    if (e.button) {
      if (e.button == 2) {
        return "right";
      }
      if (e.button == 4) {
        return "middle";
      }
      return "left";
    }
  }

  processOnClickTarget(selectedElement, clickType, currentURL) {
    var action = {};
    action["actionName"] = "click";
    action["actionData"] = clickType;
    this.rec_sendData(action, selectedElement);
  }

  processOnDbClickTarget(selectedElement) {
    var action = {};
    action["actionName"] = "doubleClick";
    action["actionData"] = "";
    this.rec_sendData(action, selectedElement);
  }

  rec_sendData(action, element) {
    if (!element) {
      return;
    }
    var jsonObject = ElementUtil.mapDOMForRecord(action, element, window);
    this.rec_processObject(jsonObject);
  }

  rec_windowFocus(selectedElement) {
    if (selectedElement.tagName.toLowerCase() == "select") {
      selectedElement.oldValue = this.rec_getSelectValues(selectedElement);
      selectedElement.onfocus = null;
    }
  }
  addEventHandler = function(handlerName, eventName, handler, options) {
    handler.handlerName = handlerName;
    if (!options) options = false;
    let key = options ? "C_" + eventName : eventName;
    if (!this.eventHandlers[key]) {
      this.eventHandlers[key] = [];
    }
    this.eventHandlers[key].push(handler);
  };
}
module.exports.Recorder = Recorder;

},{"./common":29,"./locatorBuilders":30,"axios":2}],33:[function(require,module,exports){
/*
 * Copyright 2011 Software Freedom Conservancy
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

/*
 * This script provides the Javascript API to drive the test application contained within
 * a Browser Window.
 * TODO:
 *    Add support for more events (keyboard and mouse)
 *    Allow to switch "user-entry" mode from mouse-based to keyboard-based, firing different
 *          events in different modes.
 */

 /*
 * Copyright 2011-2015 Software Freedom Conservancy
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

// This script contains a badly-organised collection of miscellaneous
// functions that really better homes.

//self
function classCreate() {
    return function() {
        this.initialize.apply(this, arguments);
    }
}

//self, browserbot
function objectExtend(destination, source) {
    for (var property in source) {
        destination[property] = source[property];
    }
    return destination;
}


function sel$() {
    var results = [],
        element;
    for (var i = 0; i < arguments.length; i++) {
        element = arguments[i];
        if (typeof element == 'string')
            element = document.getElementById(element);
        results[results.length] = element;
    }
    return results.length < 2 ? results[0] : results;
}

//self
function sel$A(iterable) {
    if (!iterable) return [];
    if (iterable.toArray) {
        return iterable.toArray();
    } else {
        var results = [];
        for (var i = 0; i < iterable.length; i++)
            results.push(iterable[i]);
        return results;
    }
}

//api
function fnBind() {
    var args = sel$A(arguments),
        __method = args.shift(),
        object = args.shift();
    var retval = function() {
        return __method.apply(object, args.concat(sel$A(arguments)));
    }
    retval.__method = __method;
    return retval;
}

/*function fnBindAsEventListener(fn, object) {
  var __method = fn;
  return function(event) {
    return __method.call(object, event || window.event);
  }
}*/

/*function removeClassName(element, name) {
    var re = new RegExp("\\b" + name + "\\b", "g");
    element.className = element.className.replace(re, "");
}

function addClassName(element, name) {
    element.className = element.className + ' ' + name;
}*/

//self
function elementSetStyle(element, style) {
    for (var name in style) {
        var value = style[name];
        if (value == null) value = "";
        element.style[name] = value;
    }
}

//self
function elementGetStyle(element, style) {
    var value = element.style[style];
    if (!value) {
        if (document.defaultView && document.defaultView.getComputedStyle) {
            var css = document.defaultView.getComputedStyle(element, null);
            value = css ? css.getPropertyValue(style) : null;
        } else if (element.currentStyle) {
            value = element.currentStyle[style];
        }
    }

    return value == 'auto' ? null : value;
}

//api
String.prototype.trim = function() {
    var result = this.replace(/^\s+/g, "");
    // strip leading
    return result.replace(/\s+$/g, "");
    // strip trailing
};
String.prototype.lcfirst = function() {
    return this.charAt(0).toLowerCase() + this.substr(1);
};
String.prototype.ucfirst = function() {
    return this.charAt(0).toUpperCase() + this.substr(1);
};
String.prototype.startsWith = function(str) {
    return this.indexOf(str) == 0;
};

/**
 * Given a string literal that would appear in an XPath, puts it in quotes and
 * returns it. Special consideration is given to literals who themselves
 * contain quotes. It's possible for a concat() expression to be returned.
 */
/*String.prototype.quoteForXPath = function()
{
    if (/\'/.test(this)) {
        if (/\"/.test(this)) {
            // concat scenario
            var pieces = [];
            var a = "'", b = '"', c;
            for (var i = 0, j = 0; i < this.length;) {
                if (this.charAt(i) == a) {
                    // encountered a quote that cannot be contained in current
                    // quote, so need to flip-flop quoting scheme
                    if (j < i) {
                        pieces.push(a + this.substring(j, i) + a);
                        j = i;
                    }
                    c = a;
                    a = b;
                    b = c;
                }
                else {
                    ++i;
                }
            }
            pieces.push(a + this.substring(j) + a);
            return 'concat(' + pieces.join(', ') + ')';
        }
        else {
            // quote with doubles
            return '"' + this + '"';
        }
    }
    // quote with singles
    return "'" + this + "'";
};*/

// Returns the text in this element
//self
function getText(element) {
    var text = "";

    var isRecentFirefox = (browserVersion.isFirefox && browserVersion.firefoxVersion >= "1.5");
    if (isRecentFirefox || browserVersion.isKonqueror || browserVersion.isSafari || browserVersion.isOpera) {
        text = getTextContent(element);
    } else if (element.textContent) {
        text = element.textContent;
    } else if (element.innerText) {
        text = element.innerText;
    }

    text = normalizeNewlines(text);
    text = normalizeSpaces(text);

    return text.trim();
}

//self
function getTextContent(element, preformatted) {
    if (element.style && (element.style.visibility == 'hidden' || element.style.display == 'none')) return '';
    if (element.nodeType == 3 /*Node.TEXT_NODE*/ ) {
        var text = element.data;
        if (!preformatted) {
            text = text.replace(/\n|\r|\t/g, " ");
        }
        return text;
    }
    if (element.nodeType == 1 /*Node.ELEMENT_NODE*/ && element.nodeName != 'SCRIPT') {
        var childrenPreformatted = preformatted || (element.tagName == "PRE");
        var text = "";
        for (var i = 0; i < element.childNodes.length; i++) {
            var child = element.childNodes.item(i);
            text += getTextContent(child, childrenPreformatted);
        }
        // Handle block elements that introduce newlines
        // -- From HTML spec:
        //<!ENTITY % block
        //     "P | %heading; | %list; | %preformatted; | DL | DIV | NOSCRIPT |
        //      BLOCKQUOTE | F:wORM | HR | TABLE | FIELDSET | ADDRESS">
        //
        // TODO: should potentially introduce multiple newlines to separate blocks
        if (element.tagName == "P" || element.tagName == "BR" || element.tagName == "HR" || element.tagName == "DIV") {
            text += "\n";
        }
        return text;
    }
    return '';
}

/**
 * Convert all newlines to \n
 */
//self
function normalizeNewlines(text) {
    return text.replace(/\r\n|\r/g, "\n");
}

/**
 * Replace multiple sequential spaces with a single space, and then convert &nbsp; to space.
 */
//self
function normalizeSpaces(text) {
    // IE has already done this conversion, so doing it again will remove multiple nbsp
    if (browserVersion.isIE) {
        return text;
    }

    // Replace multiple spaces with a single space
    // TODO - this shouldn't occur inside PRE elements
    text = text.replace(/\ +/g, " ");

    // Replace &nbsp; with a space
    var nbspPattern = new RegExp(String.fromCharCode(160), "g");
    if (browserVersion.isSafari) {
        return replaceAll(text, String.fromCharCode(160), " ");
    } else {
        return text.replace(nbspPattern, " ");
    }
}
//self
function replaceAll(text, oldText, newText) {
    while (text.indexOf(oldText) != -1) {
        text = text.replace(oldText, newText);
    }
    return text;
}


/*function xmlDecode(text) {
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&apos;/g, "'");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&amp;/g, "&");
    return text;
}*/

// Sets the text in this element
//atom
function setText(element, text) {
    if (element.textContent != null) {
        element.textContent = text;
    } else if (element.innerText != null) {
        element.innerText = text;
    }
}

// Get the value of an <input> element
//api
function getInputValue(inputElement) {
    if (inputElement.type) {
        if (inputElement.type.toUpperCase() == 'CHECKBOX' ||
            inputElement.type.toUpperCase() == 'RADIO') {
            return (inputElement.checked ? 'on' : 'off');
        }
    }
    if (inputElement.value == null) {
        //throw new SeleniumError("This element has no value; is it really a form field?");
    }
    return inputElement.value;
}

//self
function getKeyCodeFromKeySequence(keySequence) {
    var match = /^\\(\d{1,3})$/.exec(keySequence);
    if (match != null) {
        return match[1];
    }
    match = /^.$/.exec(keySequence);
    if (match != null) {
        return match[0].charCodeAt(0);
    }
    // this is for backward compatibility with existing tests
    // 1 digit ascii codes will break however because they are used for the digit chars
    match = /^\d{2,3}$/.exec(keySequence);
    if (match != null) {
        return match[0];
    }
    throw new SeleniumError("invalid keySequence");
}

//atom, api, browserbot
function createEventObject(element, controlKeyDown, altKeyDown, shiftKeyDown, metaKeyDown) {
    var evt = element.ownerDocument.createEventObject();
    evt.shiftKey = shiftKeyDown;
    evt.metaKey = metaKeyDown;
    evt.altKey = altKeyDown;
    evt.ctrlKey = controlKeyDown;
    return evt;
}

//api
function triggerKeyEvent(element, eventType, keySequence, canBubble, controlKeyDown, altKeyDown, shiftKeyDown, metaKeyDown) {
    var keycode = getKeyCodeFromKeySequence(keySequence);
    canBubble = (typeof(canBubble) == undefined) ? true : canBubble;
    if (element.fireEvent && element.ownerDocument && element.ownerDocument.createEventObject) { // IE
        var keyEvent = createEventObject(element, controlKeyDown, altKeyDown, shiftKeyDown, metaKeyDown);
        keyEvent.keyCode = keycode;
        element.fireEvent('on' + eventType, keyEvent);
    } else {
        var evt;
        if (window.KeyEvent) {
            var doc = goog.dom.getOwnerDocument(element);
            var view = goog.dom.getWindow(doc);
            evt = doc.createEvent('KeyEvents');
            evt.initKeyEvent(eventType, true, true, view, controlKeyDown, altKeyDown, shiftKeyDown, metaKeyDown, keycode, keycode);
        } else {
            evt = document.createEvent('UIEvents');

            evt.shiftKey = shiftKeyDown;
            evt.metaKey = metaKeyDown;
            evt.altKey = altKeyDown;
            evt.ctrlKey = controlKeyDown;

            evt.initUIEvent(eventType, true, true, window, 1);
            evt.keyCode = keycode;
            evt.which = keycode;
        }

        element.dispatchEvent(evt);
    }
}

/*function removeLoadListener(element, command) {
    //LOG.debug('Removing loadListenter for ' + element + ', ' + command);
    if (window.removeEventListener)
        element.removeEventListener("load", command, true);
    else if (window.detachEvent)
        element.detachEvent("onload", command);
}
*/
////browserbot
function addLoadListener(element, command) {
    //LOG.debug('Adding loadListenter for ' + element + ', ' + command);
    var augmentedCommand = function() {
        command.call(this, element);
    }
    if (window.addEventListener && !browserVersion.isOpera)
        element.addEventListener("load", augmentedCommand, true);
    else if (window.attachEvent)
        element.attachEvent("onload", augmentedCommand);
}

/**
 * Override the broken getFunctionName() method from JsUnit
 * This file must be loaded _after_ the jsunitCore.js
 */
/*function getFunctionName(aFunction) {
    var regexpResult = aFunction.toString().match(/function (\w*)/);
    if (regexpResult && regexpResult[1]) {
        return regexpResult[1];
    }
    return 'anonymous';
}

function getDocumentBase(doc) {
    var bases = document.getElementsByTagName("base");
    if (bases && bases.length && bases[0].href) {
        return bases[0].href;
    }
    return "";
}*/

//api, browserbot
function getTagName(element) {
    var tagName;
    if (element && element.tagName && element.tagName.toLowerCase) {
        tagName = element.tagName.toLowerCase();
    }
    return tagName;
}

// KAT-BEGIN fix Selenium command execution
function selArrayToString(a) {
    if (isArray(a)) {
        // DGF copying the array, because the array-like object may be a non-modifiable nodelist
        var retval = [];
        for (var i = 0; i < a.length; i++) {
            var item = a[i];
            var replaced = new String(item).replace(/([,\\])/g, '\\$1');
            retval[i] = replaced;
        }
        return retval;
    }
    return new String(a);
}
// KAT-END

//self
function isArray(x) {
    return ((typeof x) == "object") && (x["length"] != null);
}

//browserbot
function absolutify(url, baseUrl) {
    /** returns a relative url in its absolute form, given by baseUrl.
     * 
     * This function is a little odd, because it can take baseUrls that
     * aren't necessarily directories.  It uses the same rules as the HTML 
     * &lt;base&gt; tag; if the baseUrl doesn't end with "/", we'll assume
     * that it points to a file, and strip the filename off to find its
     * base directory.
     *
     * So absolutify("foo", "http://x/bar") will return "http://x/foo" (stripping off bar),
     * whereas absolutify("foo", "http://x/bar/") will return "http://x/bar/foo" (preserving bar).
     * Naturally absolutify("foo", "http://x") will return "http://x/foo", appropriately.
     * 
     * @param url the url to make absolute; if this url is already absolute, we'll just return that, unchanged
     * @param baseUrl the baseUrl from which we'll absolutify, following the rules above.
     * @return 'url' if it was already absolute, or the absolutized version of url if it was not absolute.
     */

    // DGF isn't there some library we could use for this?

    if (/^\w+:/.test(url)) {
        // it's already absolute
        return url;
    }

    var loc;
    try {
        loc = parseUrl(baseUrl);
    } catch (e) {
        // is it an absolute windows file path? let's play the hero in that case
        if (/^\w:\\/.test(baseUrl)) {
            baseUrl = "file:///" + baseUrl.replace(/\\/g, "/");
            loc = parseUrl(baseUrl);
        } else {
            throw new SeleniumError("baseUrl wasn't absolute: " + baseUrl);
        }
    }
    loc.search = null;
    loc.hash = null;

    // if url begins with /, then that's the whole pathname
    if (/^\//.test(url)) {
        loc.pathname = url;
        var result = reassembleLocation(loc);
        return result;
    }

    // if pathname is null, then we'll just append "/" + the url
    if (!loc.pathname) {
        loc.pathname = "/" + url;
        var result = reassembleLocation(loc);
        return result;
    }

    // if pathname ends with /, just append url
    if (/\/$/.test(loc.pathname)) {
        loc.pathname += url;
        var result = reassembleLocation(loc);
        return result;
    }

    // if we're here, then the baseUrl has a pathname, but it doesn't end with /
    // in that case, we replace everything after the final / with the relative url
    loc.pathname = loc.pathname.replace(/[^\/\\]+$/, url);
    var result = reassembleLocation(loc);
    return result;

}

var URL_REGEX = /^((\w+):\/\/)(([^:]+):?([^@]+)?@)?([^\/\?:]*):?(\d+)?(\/?[^\?#]+)?\??([^#]+)?#?(.+)?/;

//browserbot
function parseUrl(url) {
    var fields = ['url', null, 'protocol', null, 'username', 'password', 'host', 'port', 'pathname', 'search', 'hash'];
    var result = URL_REGEX.exec(url);
    if (!result) {
        throw new SeleniumError("Invalid URL: " + url);
    }
    var loc = new Object();
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field == null) {
            continue;
        }
        loc[field] = result[i];
    }
    return loc;
}

//self , browserbot
function reassembleLocation(loc) {
    if (!loc.protocol) {
        throw new Error("Not a valid location object: " + o2s(loc));
    }
    var protocol = loc.protocol;
    protocol = protocol.replace(/:$/, "");
    var url = protocol + "://";
    if (loc.username) {
        url += loc.username;
        if (loc.password) {
            url += ":" + loc.password;
        }
        url += "@";
    }
    if (loc.host) {
        url += loc.host;
    }

    if (loc.port) {
        url += ":" + loc.port;
    }

    if (loc.pathname) {
        url += loc.pathname;
    }

    if (loc.search) {
        url += "?" + loc.search;
    }
    if (loc.hash) {
        var hash = loc.hash;
        hash = loc.hash.replace(/^#/, "");
        url += "#" + hash;
    }
    return url;
}

function canonicalize(url) {
    if (url == "about:blank") {
        return url;
    }
    var tempLink = window.document.createElement("link");
    tempLink.href = url; // this will canonicalize the href on most browsers
    var loc = parseUrl(tempLink.href)
    if (!/\/\.\.\//.test(loc.pathname)) {
        return tempLink.href;
    }
    // didn't work... let's try it the hard way
    var originalParts = loc.pathname.split("/");
    var newParts = [];
    newParts.push(originalParts.shift());
    for (var i = 0; i < originalParts.length; i++) {
        var part = originalParts[i];
        if (".." == part) {
            newParts.pop();
            continue;
        }
        newParts.push(part);
    }
    loc.pathname = newParts.join("/");
    return reassembleLocation(loc);
}

function extractExceptionMessage(ex) {
    if (ex == null) return "null exception";
    if (ex.message != null) return ex.message;
    if (ex.toString && ex.toString() != null) return ex.toString();
}


/*function describe(object, delimiter) {
    var props = new Array();
    for (var prop in object) {
        try {
            props.push(prop + " -> " + object[prop]);
        } catch (e) {
            props.push(prop + " -> [htmlutils: ack! couldn't read this property! (Permission Denied?)]");
        }
    }
    return props.join(delimiter || '\n');
}*/

//api, browserbot
var PatternMatcher = function(pattern) {
    this.selectStrategy(pattern);
};
PatternMatcher.prototype = {

    selectStrategy: function(pattern) {
        this.pattern = pattern;
        var strategyName = 'glob';
        // by default
        if (/^([a-z-]+):(.*)/.test(pattern)) {
            var possibleNewStrategyName = RegExp.$1;
            var possibleNewPattern = RegExp.$2;
            if (PatternMatcher.strategies[possibleNewStrategyName]) {
                strategyName = possibleNewStrategyName;
                pattern = possibleNewPattern;
            }
        }
        var matchStrategy = PatternMatcher.strategies[strategyName];
        if (!matchStrategy) {
            throw new SeleniumError("cannot find PatternMatcher.strategies." + strategyName);
        }
        this.strategy = matchStrategy;
        this.matcher = new matchStrategy(pattern);
    },

    matches: function(actual) {
        return this.matcher.matches(actual + '');
        // Note: appending an empty string avoids a Konqueror bug
    }

};

/**
 * A "static" convenience method for easy matching
 */
PatternMatcher.matches = function(pattern, actual) {
    return new PatternMatcher(pattern).matches(actual);
};

PatternMatcher.strategies = {

    /**
     * Exact matching, e.g. "exact:***"
     */
    exact: function(expected) {
        this.expected = expected;
        this.matches = function(actual) {
            return actual == this.expected;
        };
    },

    /**
     * Match by regular expression, e.g. "regexp:^[0-9]+$"
     */
    regexp: function(regexpString) {
        this.regexp = new RegExp(regexpString);
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    },

    regex: function(regexpString) {
        this.regexp = new RegExp(regexpString);
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    },

    regexpi: function(regexpString) {
        this.regexp = new RegExp(regexpString, "i");
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    },

    regexi: function(regexpString) {
        this.regexp = new RegExp(regexpString, "i");
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    },

    /**
     * "globContains" (aka "wildmat") patterns, e.g. "glob:one,two,*",
     * but don't require a perfect match; instead succeed if actual
     * contains something that matches globString.
     * Making this distinction is motivated by a bug in IE6 which
     * leads to the browser hanging if we implement *TextPresent tests
     * by just matching against a regular expression beginning and
     * ending with ".*".  The globcontains strategy allows us to satisfy
     * the functional needs of the *TextPresent ops more efficiently
     * and so avoid running into this IE6 freeze.
     */
    globContains: function(globString) {
        this.regexp = new RegExp(PatternMatcher.regexpFromGlobContains(globString));
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    },


    /**
     * "glob" (aka "wildmat") patterns, e.g. "glob:one,two,*"
     */
    glob: function(globString) {
        this.regexp = new RegExp(PatternMatcher.regexpFromGlob(globString));
        this.matches = function(actual) {
            return this.regexp.test(actual);
        };
    }

};

PatternMatcher.convertGlobMetaCharsToRegexpMetaChars = function(glob) {
    var re = glob;
    re = re.replace(/([.^$+(){}\[\]\\|])/g, "\\$1");
    re = re.replace(/\?/g, "(.|[\r\n])");
    re = re.replace(/\*/g, "(.|[\r\n])*");
    return re;
};

PatternMatcher.regexpFromGlobContains = function(globContains) {
    return PatternMatcher.convertGlobMetaCharsToRegexpMetaChars(globContains);
};

PatternMatcher.regexpFromGlob = function(glob) {
    return "^" + PatternMatcher.convertGlobMetaCharsToRegexpMetaChars(glob) + "$";
};

if (!this["Assert"]) Assert = {};


Assert.fail = function(message) {
    throw new AssertionFailedError(message);
};

/*
 * Assert.equals(comment?, expected, actual)
 */
Assert.equals = function() {
    var args = new AssertionArguments(arguments);
    if (args.expected === args.actual) {
        return;
    }
    Assert.fail(args.comment +
        "Expected '" + args.expected +
        "' but was '" + args.actual + "'");
};

Assert.assertEquals = Assert.equals;

/*
 * Assert.matches(comment?, pattern, actual)
 */
Assert.matches = function() {
    var args = new AssertionArguments(arguments);
    if (PatternMatcher.matches(args.expected, args.actual)) {
        return;
    }
    Assert.fail(args.comment +
        "Actual value '" + args.actual +
        "' did not match '" + args.expected + "'");
}

/*
 * Assert.notMtches(comment?, pattern, actual)
 */
Assert.notMatches = function() {
    var args = new AssertionArguments(arguments);
    if (!PatternMatcher.matches(args.expected, args.actual)) {
        return;
    }
    Assert.fail(args.comment +
        "Actual value '" + args.actual +
        "' did match '" + args.expected + "'");
}


// Preprocess the arguments to allow for an optional comment.
function AssertionArguments(args) {
    if (args.length == 2) {
        this.comment = "";
        this.expected = args[0];
        this.actual = args[1];
    } else {
        this.comment = args[0] + "; ";
        this.expected = args[1];
        this.actual = args[2];
    }
}

function AssertionFailedError(message) {
    this.isAssertionFailedError = true;
    this.isSeleniumError = true;
    this.message = message;
    this.failureMessage = message;
}

function SeleniumError(message) {
    var error = new Error(message);
    if (typeof(arguments.caller) != 'undefined') { // IE, not ECMA
        var result = '';
        for (var a = arguments.caller; a != null; a = a.caller) {
            result += '> ' + a.callee.toString() + '\n';
            if (a.caller == a) {
                result += '*';
                break;
            }
        }
        error.stack = result;
    }
    error.isSeleniumError = true;
    return error;
}

function highlight(element) {
    var highLightColor = "yellow";
    var outline = "#8f8 solid 1px" //Samit: Enh: Added an outline to simulate the native find button behaviour

    if (element.originalColor == undefined) { // avoid picking up highlight
        element.originalColor = elementGetStyle(element, "background-color");
    }
    if (element.originalOutline == undefined) { // avoid picking up highlight
        element.originalOutline = elementGetStyle(element, "outline");
    }
    elementSetStyle(element, { "backgroundColor": highLightColor });
    elementSetStyle(element, { "outline": outline });
    window.setTimeout(function() {
        try {
            //if element is orphan, probably page of it has already gone, so ignore
            if (!element.parentNode) {
                return;
            }
            elementSetStyle(element, { "backgroundColor": element.originalColor });
            elementSetStyle(element, { "outline": element.originalOutline });
        } catch (e) {} // DGF unhighlighting is very dangerous and low priority
    }, 200);
}



// for use from vs.2003 debugger
function o2s(obj) {
    var s = "";
    for (key in obj) {
        var line = key + "->" + obj[key];
        line.replace("\n", " ");
        s += line + "\n";
    }
    return s;
}

var seenReadyStateWarning = false;

function openSeparateApplicationWindow(url, suppressMozillaWarning) {
    // resize the Selenium window itself
    window.resizeTo(1200, 500);
    window.moveTo(window.screenX, 0);

    var appWindow = window.open(url + '?start=true', 'selenium_main_app_window');
    if (appWindow == null) {
        var errorMessage = "Couldn't open app window; is the pop-up blocker enabled?";
        //LOG.error(errorMessage);
        throw new Error(errorMessage);
    }
    try {
        var windowHeight = 500;
        if (window.outerHeight) {
            windowHeight = window.outerHeight;
        } else if (document.documentElement && document.documentElement.offsetHeight) {
            windowHeight = document.documentElement.offsetHeight;
        }

        if (window.screenLeft && !window.screenX) window.screenX = window.screenLeft;
        if (window.screenTop && !window.screenY) window.screenY = window.screenTop;

        appWindow.resizeTo(1200, screen.availHeight - windowHeight - 60);
        appWindow.moveTo(window.screenX, window.screenY + windowHeight + 25);
    } catch (e) {
        //LOG.error("Couldn't resize app window");
        //LOG.exception(e);
    }


    if (!suppressMozillaWarning && window.document.readyState == null && !seenReadyStateWarning) {
        alert("Beware!  Mozilla bug 300992 means that we can't always reliably detect when a new page has loaded.  Install the Selenium IDE extension or the readyState extension available from selenium.openqa.org to make page load detection more reliable.");
        seenReadyStateWarning = true;
    }

    return appWindow;
}

var URLConfiguration = classCreate();
objectExtend(URLConfiguration.prototype, {
    initialize: function() {},
    _isQueryParameterTrue: function(name) {
        var parameterValue = this._getQueryParameter(name);
        if (parameterValue == null) return false;
        if (parameterValue.toLowerCase() == "true") return true;
        if (parameterValue.toLowerCase() == "on") return true;
        return false;
    },

    _getQueryParameter: function(searchKey) {
        var str = this.queryString
        if (str == null) return null;
        var clauses = str.split('&');
        for (var i = 0; i < clauses.length; i++) {
            var keyValuePair = clauses[i].split('=', 2);
            var key = unescape(keyValuePair[0]);
            if (key == searchKey) {
                return unescape(keyValuePair[1]);
            }
        }
        return null;
    },

    _extractArgs: function() {
        var str = SeleniumHTARunner.commandLine;
        if (str == null || str == "") return new Array();
        var matches = str.match(/(?:\"([^\"]+)\"|(?!\"([^\"]+)\")(\S+))/g);
        // We either want non quote stuff ([^"]+) surrounded by quotes
        // or we want to look-ahead, see that the next character isn't
        // a quoted argument, and then grab all the non-space stuff
        // this will return for the line: "foo" bar
        // the results "\"foo\"" and "bar"

        // So, let's unquote the quoted arguments:
        var args = new Array;
        for (var i = 0; i < matches.length; i++) {
            args[i] = matches[i];
            args[i] = args[i].replace(/^"(.*)"$/, "$1");
        }
        return args;
    },

    isMultiWindowMode: function() {
        return this._isQueryParameterTrue('multiWindow');
    },

    getBaseUrl: function() {
        return this._getQueryParameter('baseUrl');

    }
});


function safeScrollIntoView(element) {
    if (element.scrollIntoView) {
        element.scrollIntoView(false);
        return;
    }
    // TODO: work out how to scroll browsers that don't support
    // scrollIntoView (like Konqueror)
}

/**
 * Returns the absolute time represented as an offset of the current time.
 * Throws a SeleniumException if timeout is invalid.
 *
 * @param timeout  the number of milliseconds from "now" whose absolute time
 *                 to return
 */
function getTimeoutTime(timeout) {
    var now = new Date().getTime();
    var timeoutLength = parseInt(timeout);

    if (isNaN(timeoutLength)) {
        throw new SeleniumError("Timeout is not a number: '" + timeout + "'");
    }

    return now + timeoutLength;
}

/**
 * Returns true iff the current environment is the IDE, and is not the chrome
 * runner launched by the IDE.
 */
function is_IDE() {
    var locstr = window.location.href;

    if (locstr.indexOf('chrome://selenium-ide-testrunner') == 0) {
        return false;
    }

    return (typeof(SeleniumIDE) != 'undefined');
}

/**
 * Logs a message if the Logger exists, and does nothing if it doesn't exist.
 *
 * @param level  the level to log at
 * @param msg    the message to log
 */
function safe_log(level, msg) {
    try {
        //LOG[level](msg);
    } catch (e) {
        // couldn't log!
    }
}

/**
 * Displays a warning message to the user appropriate to the context under
 * which the issue is encountered. This is primarily used to avoid popping up
 * alert dialogs that might pause an automated test suite.
 *
 * @param msg  the warning message to display
 */
function safe_alert(msg) {
    if (is_IDE()) {
        alert(msg);
    }
}

/**
 * Returns true iff the given element represents a link with a javascript
 * href attribute, and does not have an onclick attribute defined.
 *
 * @param element  the element to test
 */
function hasJavascriptHref(element) {
    if (getTagName(element) != 'a') {
        return false;
    }
    if (element.getAttribute('onclick')) {
        return false;
    }
    if (!element.href) {
        return false;
    }
    if (!/\s*javascript:/i.test(element.href)) {
        return false;
    }
    return true;
}

/**
 * Returns the given element, or its nearest ancestor, that satisfies
 * hasJavascriptHref(). Returns null if none is found.
 *
 * @param element  the element whose ancestors to test
 */
function getAncestorOrSelfWithJavascriptHref(element) {
    if (hasJavascriptHref(element)) {
        return element;
    }
    if (element.parentNode == null) {
        return null;
    }
    return getAncestorOrSelfWithJavascriptHref(element.parentNode);
}

//******************************************************************************
// Locator evaluation support

/**
 * Parses a Selenium locator, returning its type and the unprefixed locator
 * string as an object.
 *
 * @param locator  the locator to parse
 */
function parse_locator(locator) {
    if (locator.includes("d-XPath")) {
        return { type: 'tac', string: locator };
    } else {
        var result = locator.match(/^([A-Za-z]+)=.+/);
        if (result) {
            var type = result[1].toLowerCase();
            var actualLocator = locator.substring(type.length + 1);
            return { type: type, string: actualLocator };
        }
        return { type: 'implicit', string: locator };
    }
}

/**
 * An interface definition for XPath engine implementations; an instance of
 * XPathEngine should be their prototype. Sub-implementations need only define
 * overrides of the methods provided here.
 */
function XPathEngine() {
    // public
    this.doc = null;

    /**
     * Returns whether the current runtime environment supports the use of this
     * engine. Needs override.
     */
    this.isAvailable = function() {
        return false;
    };

    /**
     * Sets the document to be used for evaluation. Always returns the current
     * engine object so as to be chainable.
     */
    this.setDocument = function(newDocument) {
        this.doc = newDocument;
        return this;
    };

    /**
     * Returns a possibly-empty list of nodes. Needs override.
     */
    this.selectNodes = function(xpath, contextNode, namespaceResolver) {
        return [];
    };

    /**
     * Returns a single node, or null if no nodes were selected. This default
     * implementation simply returns the first result of selectNodes(), or
     * null.
     */
    this.selectSingleNode = function(xpath, contextNode, namespaceResolver) {
        var nodes = this.selectNodes(xpath, contextNode, namespaceResolver);
        return (nodes.length > 0 ? nodes[0] : null);
    };

    /**
     * Returns the number of matching nodes. This default implementation simply
     * returns the length of the result of selectNodes(), which should be
     * adequate for most sub-implementations.
     */
    this.countNodes = function(xpath, contextNode, namespaceResolver) {
        return this.selectNodes(xpath, contextNode, namespaceResolver).length;
    };

    /**
     * An optimization; likely to be a no-op for many implementations. Always
     * returns the current engine object so as to be chainable.
     */
    this.setIgnoreAttributesWithoutValue = function(ignore) {
        return this;
    };
}

/**
 * Implements XPathEngine.
 */
function NativeEngine() {
    // public
    // Override
    this.isAvailable = function() {
        if (browserVersion && browserVersion.isIE) {
            // javascript-xpath can fake out the check otherwise
            return false;
        }

        return this.doc && this.doc.evaluate;
    };

    // Override
    this.selectNodes = function(xpath, contextNode, namespaceResolver) {
        if (contextNode != this.doc) {
            xpath = '.' + xpath;
        }

        var nodes = [];

        try {
            var xpathResult = this.doc.evaluate(xpath, contextNode,
                namespaceResolver, 0, null);
        } catch (e) {
            var msg = extractExceptionMessage(e);
            throw new SeleniumError("Invalid xpath [1]: " + msg);
        } finally {
            if (xpathResult == null) {
                // If the result is null, we should still throw an Error.
                throw new SeleniumError("Invalid xpath [2]: " + xpath);
            }
        }

        var node = xpathResult.iterateNext();

        while (node) {
            nodes.push(node);
            node = xpathResult.iterateNext();
        }

        return nodes;
    };
}

NativeEngine.prototype = new XPathEngine();

/**
 * Implements XPathEngine.
 */
function AjaxsltEngine() {
    // private
    var ignoreAttributesWithoutValue = false;

    function selectLogic(xpath, contextNode, namespaceResolver, firstMatch) {
        // DGF set xpathdebug = true (using getEval, if you like) to turn on JS
        // XPath debugging
        //xpathdebug = true;
        var context;

        if (contextNode == this.doc) {
            context = new ExprContext(this.doc);
        } else {
            // provide false values to get the default constructor values
            context = new ExprContext(contextNode, false, false,
                contextNode.parentNode);
        }

        context.setCaseInsensitive(true);
        context.setIgnoreAttributesWithoutValue(ignoreAttributesWithoutValue);
        context.setReturnOnFirstMatch(firstMatch);

        try {
            var xpathObj = xpathParse(xpath);
        } catch (e) {
            var msg = extractExceptionMessage(e);
            throw new SeleniumError("Invalid xpath [3]: " + msg);
        }

        var nodes = []
        var xpathResult = xpathObj.evaluate(context);

        if (xpathResult && xpathResult.value) {
            for (var i = 0; i < xpathResult.value.length; ++i) {
                nodes.push(xpathResult.value[i]);
            }
        }

        return nodes;
    }

    // public
    // Override
    this.isAvailable = function() {
        return true;
    };

    // Override
    this.selectNodes = function(xpath, contextNode, namespaceResolver) {
        return selectLogic(xpath, contextNode, namespaceResolver, false);
    };

    // Override
    this.selectSingleNode = function(xpath, contextNode, namespaceResolver) {
        var nodes = selectLogic(xpath, contextNode, namespaceResolver, true);
        return (nodes.length > 0 ? nodes[0] : null);
    };

    // Override
    this.setIgnoreAttributesWithoutValue = function(ignore) {
        ignoreAttributesWithoutValue = ignore;
        return this;
    };
}

AjaxsltEngine.prototype = new XPathEngine();

/**
 * Implements XPathEngine.
 */
function JavascriptXPathEngine() {
    // private
    var engineDoc = document;

    // public
    // Override
    this.isAvailable = function() {
        return true;
    };

    // Override
    this.selectNodes = function(xpath, contextNode, namespaceResolver) {
        if (contextNode != this.doc) {
            // Regarding use of the second argument to document.evaluate():
            // http://groups.google.com/group/comp.lang.javascript/browse_thread/thread/a59ce20639c74ba1/a9d9f53e88e5ebb5
            xpath = '.' + xpath;
        }

        var nodes = [];

        try {
            // When using the new and faster javascript-xpath library, we'll
            // use the TestRunner's document object, not the App-Under-Test's
            // document. The new library only modifies the TestRunner document
            // with the new functionality.
            var xpathResult = engineDoc.evaluate(xpath, contextNode,
                namespaceResolver, 0, null);
        } catch (e) {
            var msg = extractExceptionMessage(e);
            throw new SeleniumError("Invalid xpath [1]: " + msg);
        } finally {
            if (xpathResult == null) {
                // If the result is null, we should still throw an Error.
                throw new SeleniumError("Invalid xpath [2]: " + xpath);
            }
        }

        var node = xpathResult.iterateNext();

        while (node) {
            nodes.push(node);
            node = xpathResult.iterateNext();
        }

        return nodes;
    };
}

JavascriptXPathEngine.prototype = new XPathEngine();

/**
 * Cache class.
 *
 * @param newMaxSize  the maximum number of entries to keep in the cache.
 */
function BoundedCache(newMaxSize) {
    var maxSize = newMaxSize;
    var map = {};
    var size = 0;
    var counter = -1;

    /**
     * Adds a key-value pair to the cache. If the cache is at its size limit,
     * the least-recently used entry is evicted.
     */
    this.put = function(key, value) {
        if (map[key]) {
            // entry already exists
            map[key] = { usage: ++counter, value: value };
        } else {
            map[key] = { usage: ++counter, value: value };
            ++size;

            if (size > maxSize) {
                // remove the least recently used item
                var minUsage = counter;
                var keyToRemove = key;

                for (var key in map) {
                    if (map[key].usage < minUsage) {
                        minUsage = map[key].usage;
                        keyToRemove = key;
                    }
                }

                this.remove(keyToRemove);
            }
        }
    };

    /**
     * Returns a cache item by its key, and updates its use status.
     */
    this.get = function(key) {
        if (map[key]) {
            map[key].usage = ++counter;
            return map[key].value;
        }

        return null;
    };

    /**
     * Removes a cache item by its key.
     */
    this.remove = function(key) {
        if (map[key]) {
            delete map[key];
            --size;

            if (size == 0) {
                counter = -1;
            }
        }
    }

    /**
     * Clears all entries in the cache.
     */
    this.clear = function() {
        map = {};
        size = 0;
        counter = -1;
    };
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Builds and returns closures that take a document and return a node.
 */
function FinderBuilder(newDocument) {
    // private
    var doc = newDocument;

    function buildIdFinder(e) {
        if (e.id) {
            var id = e.id;

            return (function(targetDoc) {
                return targetDoc.getElementById(id);
            });
        }

        return null;
    }

    function buildTagNameFinder(e) {
        var elements = doc.getElementsByTagName(e.tagName);

        for (var i = 0, n = elements.length; i < n; ++i) {
            if (elements[i] === e) {
                // both the descendant axis and getElementsByTagName() should
                // return elements in document order; hence the following index
                // operation is possible
                return (function(targetDoc) {
                    return targetDoc.getElementsByTagName(e.tagName)[i];
                });
            }
        }

        return null;
    }

    // public
    this.setDocument = function(newDocument) {
        doc = newDocument;
        return this;
    };

    this.build = function(e) {
        return (
            buildIdFinder(e) ||
            buildTagNameFinder(e)
        );
    };
}


///////////////////////////////////////////////////////////////////////////////

/**
 * @param newEngine  the XPath engine used to navigate this document
 */
function MirroredDocument() {
    // private
    var originalDoc;
    var reflectionDoc;
    var namespaceResolver;
    var finderBuilder = new FinderBuilder();
    var pastReflections = new BoundedCache(50);
    var jQuery = new JQueryWrapper();

    /**
     * Appends elements represented by the given HTML to the given parent
     * element. All <script> elements are omitted.
     */
    function appendHTML(html, parentNode) {
        var scripts = jQuery.clean([html], null, parentNode);
    }

    function getHeadHtml(doc) {
        return doc.getElementsByTagName('head')[0].innerHTML;
    }

    function getBodyHtml(doc) {
        return doc.body.innerHTML;
    }

    /**
     * Copies the given HTML as the content of the current document's <head>
     * element. If the current document's head already contains identical
     * markup, copying is skipped. <script> elements are omitted.
     */
    function copyHead(headHtml, doc) {
        var head = doc.getElementsByTagName('head')[0];

        if (head.innerHTML == headHtml) {
            // the content is already correct
            return;
        }

        jQuery.init(head).empty();

        appendHTML(headHtml, head);
    }

    /**
     * Copies the given HTML as the content of the current document's <body>
     * element. If the current document's body already contains identical
     * markup, copying is skipped. <script> elements are omitted.
     */
    function copyBody(bodyHtml, doc) {
        if (doc.body.innerHTML == bodyHtml) {
            return;
        }

        jQuery.init(doc.body).empty();

        appendHTML(bodyHtml, doc.body);
    }

    // public
    this.setOriginal = function(newOriginalDoc) {
        originalDoc = newOriginalDoc;
        return this;
    };

    this.getOriginal = function() {
        return originalDoc;
    };

    this.setReflection = function(newReflectionDoc) {
        reflectionDoc = newReflectionDoc;
        return this;
    }

    this.getReflection = function() {
        return reflectionDoc;
    };

    this.setNamespaceResolver = function(newNamespaceResolver) {
        namespaceResolver = newNamespaceResolver;
        return this;
    };

    /**
     * Makes sure the reflected document reflects the original. Returns this
     * object.
     */
    this.reflect = function() {
        if (reflectionDoc == originalDoc) {
            // the reflection and the original are one and the same
            return this;
        }

        var originalHtml = originalDoc.documentElement.innerHTML;
        var pastReflectionHtml = pastReflections.get(originalHtml);

        if (pastReflectionHtml != null &&
            pastReflectionHtml == reflectionDoc.documentElement.innerHTML) {
            // the reflection is already accurate
            return this;
        }

        var headHtml = getHeadHtml(originalDoc);
        var bodyHtml = getBodyHtml(originalDoc);

        try {
            copyHead(headHtml, reflectionDoc);
            copyBody(bodyHtml, reflectionDoc);

            pastReflections.put(originalHtml,
                reflectionDoc.documentElement.innerHTML);
        } catch (e) {
            safe_log('warn', 'Document reflection failed: ' + e.message);
        }

        return this;
    };

    /**
     * Returns the node in the reflection that corresponds to node in the
     * original document. Returns null if the reflected node can't be found.
     */
    this.getReflectedNode = function(originalNode) {
        if (reflectionDoc == originalDoc) {
            // the reflection and the original are one and the same
            return originalNode;
        }

        if (originalNode == originalDoc) {
            return reflectionDoc;
        }

        var finder = finderBuilder.setDocument(originalDoc).build(originalNode);

        return finder(reflectionDoc) || null;
    };
}

///////////////////////////////////////////////////////////////////////////////

function XPathOptimizationCache(newMaxSize) {
    // private
    var cache = new BoundedCache(newMaxSize);

    // public
    /**
     * Returns the optimized item by document markup and XPath, or null if
     * it is not found in the cache. Never calls put() on the underlying cache.
     */
    this.get = function(html, xpath) {
        var byHtml = cache.get(html);

        return byHtml ? byHtml[xpath] : null;
    };

    /**
     * Returns the optimization item by document markup and XPath. Returns an
     * empty map object that has been added to the cache if the item did not
     * exist previously. Never returns null.
     */
    this.getOrCreate = function(html, xpath) {
        var byHtml = cache.get(html);

        if (byHtml == null) {
            var result = {};
            var optimizations = {};

            optimizations[xpath] = result;
            cache.put(html, optimizations);
            return result;
        }

        var item = byHtml[xpath];

        if (item == null) {
            var result = {};

            byHtml[xpath] = result;
            return result;
        }

        return item;
    };
}

///////////////////////////////////////////////////////////////////////////////

function XPathOptimizer(newEngine) {
    // private
    var engine = newEngine;
    var namespaceResolver;
    var mirror = new MirroredDocument(namespaceResolver);
    var finderBuilder = new FinderBuilder();

    // keys are full document HTML strings, and values are mappings from
    // XPath's to objects which the following fields:
    //
    //   - finder       the equivalent finder function for the XPath, for
    //                  single node selection
    //   - nodeCount    the node count for the XPath with respect to the given
    //                  document content
    //   - node         the actual, potentially invalidated, node
    //   - sourceIndex  the value of the sourceIndex attribute of the node at
    //                  time of addition to the cache; this can be used to
    //                  determine if the node has since changed positions
    //
    var knownOptimizations = new XPathOptimizationCache(100);

    /**
     * Returns whether this optimizer is capable of optimizing XPath's for the
     * given node.
     */
    function isOptimizable(node) {
        return (node.nodeType == 1);
    }

    /**
     * Returns whether the given XPath evaluates to the given node in the
     * test document.
     */
    function isXPathValid(xpath, node) {
        var contextNode = mirror.getReflection();
        return (engine.setDocument(mirror.getReflection())
            .selectSingleNode(xpath, contextNode, namespaceResolver) === node);
    }

    // public
    this.setDocument = function(newDocument) {
        mirror.setOriginal(newDocument);
        return this;
    }

    /**
     * Sets the document object that will be used for test XPath evaluation and
     * traversal related to construction of the optimized expression. This
     * document will be modified freely by the optimize() operation.
     */
    this.setTestDocument = function(newTestDocument) {
        mirror.setReflection(newTestDocument);
        return this;
    };

    this.setNamespaceResolver = function(newNamespaceResolver) {
        namespaceResolver = newNamespaceResolver;
        mirror.setNamespaceResolver(newNamespaceResolver);
        return this;
    };

    /**
     * Returns an optimal XPath whose first result is the same as the first
     * result of the given XPath, when evaluated on the currently set document.
     * If optimization fails, returns the original XPath.
     */
    this.getOptimizedFinder = function(xpath, contextNode) {
        var originalHtml = mirror.getOriginal().documentElement.innerHTML;
        var optimization = knownOptimizations.get(originalHtml, xpath);

        if (optimization) {
            var finder = optimization.finder;

            if (finder) {
                // the optimized finder for this document content was found in
                // the cache!
                safe_log('info', 'Found cached optimized finder for ' + xpath);
                return finder;
            }
        }

        mirror.reflect();

        if (contextNode) {
            contextNode = mirror.getReflectedNode(contextNode);
        }

        var firstResult = engine.setDocument(mirror.getReflection())
            .selectSingleNode(xpath, contextNode, namespaceResolver);

        if (!firstResult) {
            // either the element doesn't exist, or there was a failure to
            // reflect the document accurately
            return null;
        }

        if (isOptimizable(firstResult)) {
            var finder = finderBuilder.setDocument(mirror.getReflection())
                .build(firstResult);

            if (finder) {
                safe_log('info', 'Found optimized finder: ' + finder);

                if (!optimization) {
                    optimization = knownOptimizations
                        .getOrCreate(originalHtml, xpath);
                }

                optimization.finder = finder;

                return finder;
            }
        }

        return null;
    };

    this.countNodes = function(xpath, contextNode) {
        var originalHtml = mirror.getOriginal().documentElement.innerHTML;
        var optimization = knownOptimizations.get(originalHtml, xpath);

        if (optimization) {
            var nodeCount = optimization.nodeCount;

            if (nodeCount != null) {
                // the node count for the XPath for this document content was
                // found in the cache!
                safe_log('info', 'Found cached node count for ' + xpath);
                return nodeCount;
            }
        }

        mirror.reflect();

        if (contextNode) {
            contextNode = mirror.getReflectedNode(contextNode);
        }

        // count the nodes using the test document, and circumvent
        // window RPC altogether
        var nodeCount = engine.setDocument(mirror.getReflection())
            .countNodes(xpath, contextNode, namespaceResolver);

        if (!optimization) {
            optimization = knownOptimizations.getOrCreate(originalHtml, xpath);
        }

        optimization.nodeCount = nodeCount;

        return nodeCount;
    };

    this.getKnownOptimizations = function() {
        return knownOptimizations;
    };
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Implements XPathEngine.
 *
 * A non-native XPathEngine that tries to avoid inter-window RPC calls, which
 * are very expensive for IE. It does this by cloning the document from a
 * "remote" window to a "local" window, and performing operations on the local
 * clone where possible. The selectSingleNode() and countNodes() methods may
 * benefit from optimization, while selectNodes() currently will not.
 *
 * @param newFrameName       the name of the DOM window frame whose document
 *                           to use exclusively for XPath optimization
 * @param newDelegateEngine  the underlying engine delegate used to evaluate
 *                           XPath's. Defaults to a JavascriptXPathEngine
 *                           instance.
 */
function MultiWindowRPCOptimizingEngine(newFrameName, newDelegateEngine) {
    // private
    var NO_RESULT = '__NO_NODE_RESULT';

    var frameName = newFrameName;
    var engine = newDelegateEngine || new JavascriptXPathEngine();
    var optimizer = new XPathOptimizer(engine);

    function createTestDocument() {
        if (!window.frames[frameName]) {
            var iframe = document.createElement('iframe');

            iframe.id = frameName;
            iframe.name = frameName;
            iframe.width = 0;
            iframe.height = 0;

            document.body.appendChild(iframe);
        }
    }

    function isMultiWindowMode() {
        return (typeof(runOptions) != 'undefined' &&
            runOptions &&
            runOptions.isMultiWindowMode());
    };

    /**
     * Returns whether a node is detached from any live documents. Detached
     * nodes should be considered invalidated and evicted from any caches.
     */
    function isDetached(node) {
        while (node = node.parentNode) {
            if (node.nodeType == 11) {
                // it's a document fragment; we're detached (IE)
                return true;
            } else if (node.nodeType == 9) {
                // it's a normal document; we're attached
                return false;
            }
        }

        // we didn't find a document; we're detached (most other browsers)
        return true;
    }

    // public
    // Override
    this.isAvailable = function() {
        // though currently it only makes sense to use this engine for IE, we
        // do not impose that restriction here.
        return engine.isAvailable();
    };

    // Override
    this.setDocument = function(newDocument) {
        this.doc = newDocument;
        engine.setDocument(newDocument);
        optimizer.setDocument(newDocument);
        return this;
    };

    /**
     * No optimization performed for multi-node selections. This is because the
     * optimizer only works for single node results.
     */
    // Override
    this.selectNodes = function(xpath, contextNode, namespaceResolver) {
        return engine.selectNodes(xpath, contextNode, namespaceResolver);
    };

    // Override
    this.selectSingleNode = function(xpath, contextNode, namespaceResolver) {
        var html = this.doc.documentElement.innerHTML;
        var knownOptimizations = optimizer.getKnownOptimizations();
        var optimization = knownOptimizations.get(html, xpath);

        if (optimization) {
            var node = optimization.node;
            var sourceIndex = optimization.sourceIndex;

            if (node == NO_RESULT) {
                return null;
            }

            // node is still valid? (test ok even if sourceIndex is null)
            if (!isDetached(node) && node.sourceIndex == sourceIndex) {
                safe_log('info', 'Found cached node for ' + xpath);
                return node;
            }
        }

        var node;
        var finder = optimizer.setNamespaceResolver(namespaceResolver)
            .setTestDocument(this.getTestDocument())
            .getOptimizedFinder(xpath, contextNode);

        if (finder) {
            node = finder(this.doc);
        } else {
            node = engine.selectSingleNode(xpath, contextNode,
                namespaceResolver);
        }

        if (!optimization) {
            optimization = knownOptimizations.getOrCreate(html, xpath);
        }

        if (node) {
            optimization.node = node;
            optimization.sourceIndex = node.sourceIndex;
        } else {
            optimization.node = NO_RESULT;
        }

        return node;
    };

    // Override
    this.countNodes = function(xpath, contextNode, namespaceResolver) {
        return optimizer.setNamespaceResolver(namespaceResolver)
            .setTestDocument(this.getTestDocument())
            .countNodes(xpath, contextNode);
    };

    // Override
    this.setIgnoreAttributesWithoutValue = function(ignore) {
        engine.setIgnoreAttributesWithoutValue(ignore);
        return this;
    };

    /**
     * Returns the "local" document as a frame in the Selenium runner document.
     */
    this.getTestDocument = function() {
        // made this a public method, because apparently private methods can't
        // access "this" of the instance.
        return (isMultiWindowMode() ? window.frames[frameName].document : this.doc);
    };

    // initialization

    // creating the frame and the document it contains is not a synchronous
    // operation (at least not for IE), so we should create it eagerly
    if (isMultiWindowMode()) {
        createTestDocument();
    }
}

MultiWindowRPCOptimizingEngine.prototype = new XPathEngine();

/**
 * An object responsible for handling XPath logic. New XPath engines can be
 * registered to this evaluator on the fly.
 *
 * @param newDefaultEngineName  the name of the default XPath engine. Must be
 *                              a non-native engine that is always available.
 *                              Defaults to 'ajaxslt'.
 */
function XPathEvaluator(newDefaultEngineName) {
    // private
    var nativeEngine = new NativeEngine();
    var defaultEngineName = newDefaultEngineName || 'ajaxslt';
    var engines = {
        'ajaxslt': new AjaxsltEngine(),
        'javascript-xpath': new JavascriptXPathEngine(),
        'rpc-optimizing-ajaxslt': new MultiWindowRPCOptimizingEngine('test-doc-frame', new AjaxsltEngine()),
        'rpc-optimizing-jsxpath': new MultiWindowRPCOptimizingEngine('test-doc-frame', new JavascriptXPathEngine()),
        'native': nativeEngine
    };

    var currentEngineName = defaultEngineName;
    var allowNativeXPath = true;
    var ignoreAttributesWithoutValue = true;

    function preprocess(xpath) {
        // Trim any trailing "/": not valid xpath, and remains from attribute
        // locator.
        if (xpath.charAt(xpath.length - 1) == '/') {
            xpath = xpath.slice(0, -1);
        }
        // HUGE hack - remove namespace from xpath for IE
        if (browserVersion && browserVersion.isIE) {
            xpath = xpath.replace(/x:/g, '')
        }

        return xpath;
    }

    /** 
     * Returns the most sensible engine given the settings and the document
     * object.
     */
    function getEngineFor(inDocument) {
        if (allowNativeXPath &&
            nativeEngine.setDocument(inDocument).isAvailable()) {
            return nativeEngine;
        }

        var currentEngine = engines[currentEngineName];

        if (currentEngine &&
            currentEngine.setDocument(inDocument).isAvailable()) {
            return currentEngine;
        }

        return engines[defaultEngineName].setDocument(inDocument);
    }

    /**
     * Dispatches an XPath evaluation method on the relevant engine for the
     * given document, and returns the result
     */
    function dispatch(methodName, inDocument, xpath, contextNode, namespaceResolver) {
        xpath = preprocess(xpath);

        if (!contextNode) {
            contextNode = inDocument;
        }

        var result = getEngineFor(inDocument)
            .setIgnoreAttributesWithoutValue(ignoreAttributesWithoutValue)[methodName](xpath, contextNode, namespaceResolver);

        return result;
    }

    // public
    /**
     * Registers a new engine by name, and returns whether the registration was
     * successful. Each registered engine must be an instance of XPathEngine.
     * The engines registered by default - "ajaxslt", "javascript-xpath",
     * "native", and "default" - can't be overwritten.
     */
    this.registerEngine = function(name, engine) {
        // can't overwrite one of these
        if (name == 'ajaxslt' ||
            name == 'javascript-xpath' ||
            name == 'native' ||
            name == 'default') {
            return false;
        }

        if (!(engine instanceof XPathEngine)) {
            return false;
        }

        engines[name] = engine;
        return true;
    };

    this.getRegisteredEngine = function(name) {
        return engines[name];
    };

    this.setCurrentEngine = function(name) {
        if (name == 'default') {
            currentEngineName = defaultEngineName;
        } else if (!engines[name]) {
            return;
        } else {
            currentEngineName = name;
        }
    };

    this.getCurrentEngine = function() {
        return currentEngineName || defaultEngineName;
    };

    this.setAllowNativeXPath = function(allow) {
        allowNativeXPath = allow;
    };

    this.isAllowNativeXPath = function() {
        return allowNativeXPath;
    };

    this.setIgnoreAttributesWithoutValue = function(ignore) {
        ignoreAttributesWithoutValue = ignore;
    };

    this.isIgnoreAttributesWithoutValue = function() {
        return ignoreAttributesWithoutValue;
    };

    this.selectNodes = function(inDocument, xpath, contextNode, namespaceResolver) {
        return dispatch('selectNodes', inDocument, xpath, contextNode,
            namespaceResolver);
    };

    this.selectSingleNode = function(inDocument, xpath, contextNode, namespaceResolver) {
        return dispatch('selectSingleNode', inDocument, xpath, contextNode,
            namespaceResolver);
    };

    this.countNodes = function(inDocument, xpath, contextNode, namespaceResolver) {
        return dispatch('countNodes', inDocument, xpath, contextNode,
            namespaceResolver);
    };

    // initialization
    this.init();
};

/**
 * Gives the user an overridable hook for registering new XPath engines, for
 * example from user extensions.
 */
XPathEvaluator.prototype.init = function() {};

/**
 * Evaluates an xpath on a document, and returns a list containing nodes in the
 * resulting nodeset. The browserbot xpath methods are now backed by this
 * function. A context node may optionally be provided, and the xpath will be
 * evaluated from that context.
 *
 * @param xpath       the xpath to evaluate
 * @param inDocument  the document in which to evaluate the xpath.
 * @param opts        (optional) An object containing various flags that can
 *                    modify how the xpath is evaluated. Here's a listing of
 *                    the meaningful keys:
 *
 *                     contextNode: 
 *                       the context node from which to evaluate the xpath. If
 *                       unspecified, the context will be the root document
 *                       element.
 *
 *                     namespaceResolver:
 *                       the namespace resolver function. Defaults to null.
 *
 *                     xpathLibrary:
 *                       the javascript library to use for XPath. "ajaxslt" is
 *                       the default. "javascript-xpath" is newer and faster,
 *                       but needs more testing.
 *
 *                     allowNativeXpath:
 *                       whether to allow native evaluate(). Defaults to true.
 *
 *                     ignoreAttributesWithoutValue:
 *                       whether it's ok to ignore attributes without value
 *                       when evaluating the xpath. This can greatly improve
 *                       performance in IE; however, if your xpaths depend on
 *                       such attributes, you can't ignore them! Defaults to
 *                       true.
 *
 *                     returnOnFirstMatch:
 *                       whether to optimize the XPath evaluation to only
 *                       return the first match. The match, if any, will still
 *                       be returned in a list. Defaults to false.
 */
function eval_xpath(xpath, inDocument, opts) {
    if (!opts) {
        var opts = {};
    }

    var contextNode = opts.contextNode ? opts.contextNode : inDocument;
    var namespaceResolver = opts.namespaceResolver ? opts.namespaceResolver : null;
    var xpathLibrary = opts.xpathLibrary ? opts.xpathLibrary : null;
    var allowNativeXpath = (opts.allowNativeXpath != undefined) ? opts.allowNativeXpath : true;
    var ignoreAttributesWithoutValue = (opts.ignoreAttributesWithoutValue != undefined) ? opts.ignoreAttributesWithoutValue : true;
    var returnOnFirstMatch = (opts.returnOnFirstMatch != undefined) ? opts.returnOnFirstMatch : false;

    if (!eval_xpath.xpathEvaluator) {
        eval_xpath.xpathEvaluator = new XPathEvaluator();
    }

    var xpathEvaluator = eval_xpath.xpathEvaluator;

    xpathEvaluator.setCurrentEngine(xpathLibrary);
    xpathEvaluator.setAllowNativeXPath(allowNativeXpath);
    xpathEvaluator.setIgnoreAttributesWithoutValue(ignoreAttributesWithoutValue);

    if (returnOnFirstMatch) {
        var singleNode = xpathEvaluator.selectSingleNode(inDocument, xpath,
            contextNode, namespaceResolver);

        var results = (singleNode ? [singleNode] : []);
    } else {
        var results = xpathEvaluator.selectNodes(inDocument, xpath, contextNode,
            namespaceResolver);
    }

    return results;
}

/**
 * Returns the full resultset of a CSS selector evaluation.
 */
function eval_css(locator, inDocument) {
    var results = [];
    try {
        Sizzle(locator, inDocument, results);
    } catch (ignored) {
        // Presumably poor formatting
    }
    //console.log(results);
    return results;
}

/**
 * This function duplicates part of BrowserBot.findElement() to open up locator
 * evaluation on arbitrary documents. It returns a plain old array of located
 * elements found by using a Selenium locator.
 * 
 * Multiple results may be generated for xpath and CSS locators. Even though a
 * list could potentially be generated for other locator types, such as link,
 * we don't try for them, because they aren't very expressive location
 * strategies; if you want a list, use xpath or CSS. Furthermore, strategies
 * for these locators have been optimized to only return the first result. For
 * these types of locators, performance is more important than ideal behavior.
 * 
 * @param locator          a locator string
 * @param inDocument       the document in which to apply the locator
 * @param opt_contextNode  the context within which to evaluate the locator
 *
 * @return  a list of result elements
 */
function eval_locator(locator, inDocument, opt_contextNode) {
    locator = parse_locator(locator);

    var pageBot;
    if (typeof(selenium) != 'undefined' && selenium != undefined) {
        if (typeof(editor) == 'undefined' || editor.state == 'playing') {
            safe_log('info', 'Trying [' + locator.type + ']: ' + locator.string);
        }
        pageBot = selenium.browserbot;
    } else {
        if (!UI_GLOBAL.mozillaBrowserBot) {
            // create a browser bot to evaluate the locator. Hand it the IDE
            // window as a dummy window, and cache it for future use.
            UI_GLOBAL.mozillaBrowserBot = new MozillaBrowserBot(window)
        }
        pageBot = UI_GLOBAL.mozillaBrowserBot;
    }

    var results = [];

    if (locator.type == 'xpath' || (locator.string.charAt(0) == '/' &&
            locator.type == 'implicit')) {
        results = eval_xpath(locator.string, inDocument, { contextNode: opt_contextNode });
    } else if (locator.type == 'css') {
        results = eval_css(locator.string, inDocument);
    } else {
        var element = pageBot
            .findElementBy(locator.type, locator.string, inDocument);
        if (element != null) {
            results.push(element);
        }
    }

    // Unwrap each of the elements in the result
    for (var i = 0; i < results.length; i++) {
        results[i] = results[i];
    }
    return results;
}

//******************************************************************************
// UI-Element

/**
 * Escapes the special regular expression characters in a string intended to be
 * used as a regular expression.
 *
 * Based on: http://simonwillison.net/2006/Jan/20/escape/
 */
RegExp.escape = (function() {
    var specials = [
        '/', '.', '*', '+', '?', '|', '^', '$',
        '(', ')', '[', ']', '{', '}', '\\'
    ];

    var sRE = new RegExp(
        '(\\' + specials.join('|\\') + ')', 'g'
    );

    return function(text) {
        return text.replace(sRE, '\\$1');
    }
})();

/**
 * Returns true if two arrays are identical, and false otherwise.
 *
 * @param a1  the first array, may only contain simple values (strings or
 *            numbers)
 * @param a2  the second array, same restricts on data as for a1
 * @return    true if the arrays are equivalent, false otherwise.
 */
function are_equal(a1, a2) {
    if (typeof(a1) != typeof(a2))
        return false;

    switch (typeof(a1)) {
        case 'object':
            // arrays
            if (a1.length) {
                if (a1.length != a2.length)
                    return false;
                for (var i = 0; i < a1.length; ++i) {
                    if (!are_equal(a1[i], a2[i]))
                        return false
                }
            }
            // associative arrays
            else {
                var keys = {};
                for (var key in a1) {
                    keys[key] = true;
                }
                for (var key in a2) {
                    keys[key] = true;
                }
                for (var key in keys) {
                    if (!are_equal(a1[key], a2[key]))
                        return false;
                }
            }
            return true;

        default:
            return a1 == a2;
    }
}


/**
 * Create a clone of an object and return it. This is a deep copy of everything
 * but functions, whose references are copied. You shouldn't expect a deep copy
 * of functions anyway.
 *
 * @param orig  the original object to copy
 * @return      a deep copy of the original object. Any functions attached,
 *              however, will have their references copied only.
 */
function clone(orig) {
    var copy;
    switch (typeof(orig)) {
        case 'object':
            copy = (orig.length) ? [] : {};
            for (var attr in orig) {
                copy[attr] = clone(orig[attr]);
            }
            break;
        default:
            copy = orig;
            break;
    }
    return copy;
}

/**
 * Emulates php's print_r() functionality. Returns a nicely formatted string
 * representation of an object. Very useful for debugging.
 *
 * @param object    the object to dump
 * @param maxDepth  the maximum depth to recurse into the object. Ellipses will
 *                  be shown for objects whose depth exceeds the maximum.
 * @param indent    the string to use for indenting progressively deeper levels
 *                  of the dump.
 * @return          a string representing a dump of the object
 */
function print_r(object, maxDepth, indent) {
    var parentIndent, attr, str = "";
    if (arguments.length == 1) {
        var maxDepth = Number.MAX_VALUE;
    } else {
        maxDepth--;
    }
    if (arguments.length < 3) {
        parentIndent = ''
        var indent = '    ';
    } else {
        parentIndent = indent;
        indent += '    ';
    }

    switch (typeof(object)) {
        case 'object':
            if (object.length != undefined) {
                if (object.length == 0) {
                    str += "Array ()\r\n";
                } else {
                    str += "Array (\r\n";
                    for (var i = 0; i < object.length; ++i) {
                        str += indent + '[' + i + '] => ';
                        if (maxDepth == 0)
                            str += "...\r\n";
                        else
                            str += print_r(object[i], maxDepth, indent);
                    }
                    str += parentIndent + ")\r\n";
                }
            } else {
                str += "Object (\r\n";
                for (attr in object) {
                    str += indent + "[" + attr + "] => ";
                    if (maxDepth == 0)
                        str += "...\r\n";
                    else
                        str += print_r(object[attr], maxDepth, indent);
                }
                str += parentIndent + ")\r\n";
            }
            break;
        case 'boolean':
            str += (object ? 'true' : 'false') + "\r\n";
            break;
        case 'function':
            str += "Function\r\n";
            break;
        default:
            str += object + "\r\n";
            break;

    }
    return str;
}

/**
 * Return an array containing all properties of an object. Perl-style.
 *
 * @param object  the object whose keys to return
 * @return        array of object keys, as strings
 */
function keys(object) {
    var keys = [];
    for (var k in object) {
        keys.push(k);
    }
    return keys;
}

/**
 * Emulates python's range() built-in. Returns an array of integers, counting
 * up (or down) from start to end. Note that the range returned is up to, but
 * NOT INCLUDING, end.
 *.
 * @param start  integer from which to start counting. If the end parameter is
 *               not provided, this value is considered the end and start will
 *               be zero.
 * @param end    integer to which to count. If omitted, the function will count
 *               up from zero to the value of the start parameter. Note that
 *               the array returned will count up to but will not include this
 *               value.
 * @return       an array of consecutive integers. 
 */
function range(start, end) {
    if (arguments.length == 1) {
        var end = start;
        start = 0;
    }

    var r = [];
    if (start < end) {
        while (start != end)
            r.push(start++);
    } else {
        while (start != end)
            r.push(start--);
    }
    return r;
}

/**
 * Parses a python-style keyword arguments string and returns the pairs in a
 * new object.
 *
 * @param  kwargs  a string representing a set of keyword arguments. It should
 *                 look like <tt>keyword1=value1, keyword2=value2, ...</tt>
 * @return         an object mapping strings to strings
 */
function parse_kwargs(kwargs) {
    var args = new Object();
    var pairs = kwargs.split(/,/);
    for (var i = 0; i < pairs.length;) {
        if (i > 0 && pairs[i].indexOf('=') == -1) {
            // the value string contained a comma. Glue the parts back together.
            pairs[i - 1] += ',' + pairs.splice(i, 1)[0];
        } else {
            ++i;
        }
    }
    for (var i = 0; i < pairs.length; ++i) {
        var splits = pairs[i].split(/=/);
        if (splits.length == 1) {
            continue;
        }
        var key = splits.shift();
        var value = splits.join('=');
        args[key.trim()] = value.trim();
    }
    return args;
}

/**
 * Creates a python-style keyword arguments string from an object.
 *
 * @param args        an associative array mapping strings to strings
 * @param sortedKeys  (optional) a list of keys of the args parameter that
 *                    specifies the order in which the arguments will appear in
 *                    the returned kwargs string
 *
 * @return            a kwarg string representation of args
 */
function to_kwargs(args, sortedKeys) {
    var s = '';
    if (!sortedKeys) {
        var sortedKeys = keys(args).sort();
    }
    for (var i = 0; i < sortedKeys.length; ++i) {
        var k = sortedKeys[i];
        if (args[k] != undefined) {
            if (s) {
                s += ', ';
            }
            s += k + '=' + args[k];
        }
    }
    return s;
}

/**
 * Returns true if a node is an ancestor node of a target node, and false
 * otherwise.
 *
 * @param node    the node being compared to the target node
 * @param target  the target node
 * @return        true if node is an ancestor node of target, false otherwise.
 */
function is_ancestor(node, target) {
    while (target.parentNode) {
        target = target.parentNode;
        if (node == target)
            return true;
    }
    return false;
}

//******************************************************************************
// parseUri 1.2.1
// MIT License

/*
Copyright (c) 2007 Steven Levithan <stevenlevithan.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
*/

function parseUri(str) {
    var o = parseUri.options,
        m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
        uri = {},
        i = 14;

    while (i--) uri[o.key[i]] = m[i] || "";

    uri[o.q.name] = {};
    uri[o.key[12]].replace(o.q.parser, function($0, $1, $2) {
        if ($1) uri[o.q.name][$1] = $2;
    });

    return uri;
};

parseUri.options = {
    strictMode: false,
    key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
    q: {
        name: "queryKey",
        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
    },
    parser: {
        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
        loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*):?([^:@]*))?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
    }
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// jQuery 1.4.1 is a dependency

/*!
 * jQuery JavaScript Library v1.4.1
 * http://jquery.com/
 *
 * Copyright 2010, John Resig
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://jquery.org/license
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 * Copyright 2010, The Dojo Foundation
 * Released under the MIT, BSD, and GPL Licenses.
 *
 * Date: Mon Jan 25 19:43:33 2010 -0500
 */
(function(window, undefined) {

    // Define a local copy of jQuery
    var jQuery = function(selector, context) {
            // The jQuery object is actually just the init constructor 'enhanced'
            return new jQuery.fn.init(selector, context);
        },

        // Map over jQuery in case of overwrite
        _jQuery = window.jQuery,

        // Map over the $ in case of overwrite
        _$ = window.$,

        // Use the correct document accordingly with window argument (sandbox)
        document = window.document,

        // A central reference to the root jQuery(document)
        rootjQuery,

        // A simple way to check for HTML strings or ID strings
        // (both of which we optimize for)
        quickExpr = /^[^<]*(<[\w\W]+>)[^>]*$|^#([\w-]+)$/,

        // Is it a simple selector
        isSimple = /^.[^:#\[\.,]*$/,

        // Check if a string has a non-whitespace character in it
        rnotwhite = /\S/,

        // Used for trimming whitespace
        rtrim = /^(\s|\u00A0)+|(\s|\u00A0)+$/g,

        // Match a standalone tag
        rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>)?$/,

        // Keep a UserAgent string for use with jQuery.browser
        userAgent = navigator.userAgent,

        // For matching the engine and version of the browser
        browserMatch,

        // Has the ready events already been bound?
        readyBound = false,

        // The functions to execute on DOM ready
        readyList = [],

        // The ready event handler
        DOMContentLoaded,

        // Save a reference to some core methods
        toString = Object.prototype.toString,
        hasOwnProperty = Object.prototype.hasOwnProperty,
        push = Array.prototype.push,
        slice = Array.prototype.slice,
        indexOf = Array.prototype.indexOf;

    jQuery.fn = jQuery.prototype = {
        init: function(selector, context) {
            var match, elem, ret, doc;

            // Handle $(""), $(null), or $(undefined)
            if (!selector) {
                return this;
            }

            // Handle $(DOMElement)
            if (selector.nodeType) {
                this.context = this[0] = selector;
                this.length = 1;
                return this;
            }

            // Handle HTML strings
            if (typeof selector === "string") {
                // Are we dealing with HTML string or an ID?
                match = quickExpr.exec(selector);

                // Verify a match, and that no context was specified for #id
                if (match && (match[1] || !context)) {

                    // HANDLE: $(html) -> $(array)
                    if (match[1]) {
                        doc = (context ? context.ownerDocument || context : document);

                        // If a single string is passed in and it's a single tag
                        // just do a createElement and skip the rest
                        ret = rsingleTag.exec(selector);

                        if (ret) {
                            if (jQuery.isPlainObject(context)) {
                                selector = [document.createElement(ret[1])];
                                jQuery.fn.attr.call(selector, context, true);

                            } else {
                                selector = [doc.createElement(ret[1])];
                            }

                        } else {
                            ret = buildFragment([match[1]], [doc]);
                            selector = (ret.cacheable ? ret.fragment.cloneNode(true) : ret.fragment).childNodes;
                        }

                        // HANDLE: $("#id")
                    } else {
                        elem = document.getElementById(match[2]);

                        if (elem) {
                            // Handle the case where IE and Opera return items
                            // by name instead of ID
                            if (elem.id !== match[2]) {
                                return rootjQuery.find(selector);
                            }

                            // Otherwise, we inject the element directly into the jQuery object
                            this.length = 1;
                            this[0] = elem;
                        }

                        this.context = document;
                        this.selector = selector;
                        return this;
                    }

                    // HANDLE: $("TAG")
                } else if (!context && /^\w+$/.test(selector)) {
                    this.selector = selector;
                    this.context = document;
                    selector = document.getElementsByTagName(selector);

                    // HANDLE: $(expr, $(...))
                } else if (!context || context.jquery) {
                    return (context || rootjQuery).find(selector);

                    // HANDLE: $(expr, context)
                    // (which is just equivalent to: $(context).find(expr)
                } else {
                    return jQuery(context).find(selector);
                }

                // HANDLE: $(function)
                // Shortcut for document ready
            } else if (jQuery.isFunction(selector)) {
                return rootjQuery.ready(selector);
            }

            if (selector.selector !== undefined) {
                this.selector = selector.selector;
                this.context = selector.context;
            }

            return jQuery.isArray(selector) ?
                this.setArray(selector) :
                jQuery.makeArray(selector, this);
        },

        // Start with an empty selector
        selector: "",

        // The current version of jQuery being used
        jquery: "1.4.1",

        // The default length of a jQuery object is 0
        length: 0,

        // The number of elements contained in the matched element set
        size: function() {
            return this.length;
        },

        toArray: function() {
            return slice.call(this, 0);
        },

        // Get the Nth element in the matched element set OR
        // Get the whole matched element set as a clean array
        get: function(num) {
            return num == null ?

                // Return a 'clean' array
                this.toArray() :

                // Return just the object
                (num < 0 ? this.slice(num)[0] : this[num]);
        },

        // Take an array of elements and push it onto the stack
        // (returning the new matched element set)
        pushStack: function(elems, name, selector) {
            // Build a new jQuery matched element set
            var ret = jQuery(elems || null);

            // Add the old object onto the stack (as a reference)
            ret.prevObject = this;

            ret.context = this.context;

            if (name === "find") {
                ret.selector = this.selector + (this.selector ? " " : "") + selector;
            } else if (name) {
                ret.selector = this.selector + "." + name + "(" + selector + ")";
            }

            // Return the newly-formed element set
            return ret;
        },

        // Force the current matched set of elements to become
        // the specified array of elements (destroying the stack in the process)
        // You should use pushStack() in order to do this, but maintain the stack
        setArray: function(elems) {
            // Resetting the length to 0, then using the native Array push
            // is a super-fast way to populate an object with array-like properties
            this.length = 0;
            push.apply(this, elems);

            return this;
        },

        // Execute a callback for every element in the matched set.
        // (You can seed the arguments with an array of args, but this is
        // only used internally.)
        each: function(callback, args) {
            return jQuery.each(this, callback, args);
        },

        ready: function(fn) {
            // Attach the listeners
            jQuery.bindReady();

            // If the DOM is already ready
            if (jQuery.isReady) {
                // Execute the function immediately
                fn.call(document, jQuery);

                // Otherwise, remember the function for later
            } else if (readyList) {
                // Add the function to the wait list
                readyList.push(fn);
            }

            return this;
        },

        eq: function(i) {
            return i === -1 ?
                this.slice(i) :
                this.slice(i, +i + 1);
        },

        first: function() {
            return this.eq(0);
        },

        last: function() {
            return this.eq(-1);
        },

        slice: function() {
            return this.pushStack(slice.apply(this, arguments),
                "slice", slice.call(arguments).join(","));
        },

        map: function(callback) {
            return this.pushStack(jQuery.map(this, function(elem, i) {
                return callback.call(elem, i, elem);
            }));
        },

        end: function() {
            return this.prevObject || jQuery(null);
        },

        // For internal use only.
        // Behaves like an Array's method, not like a jQuery method.
        push: push,
        sort: [].sort,
        splice: [].splice
    };

    // Give the init function the jQuery prototype for later instantiation
    jQuery.fn.init.prototype = jQuery.fn;

    jQuery.extend = jQuery.fn.extend = function() {
        // copy reference to target object
        var target = arguments[0] || {},
            i = 1,
            length = arguments.length,
            deep = false,
            options, name, src, copy;

        // Handle a deep copy situation
        if (typeof target === "boolean") {
            deep = target;
            target = arguments[1] || {};
            // skip the boolean and the target
            i = 2;
        }

        // Handle case when target is a string or something (possible in deep copy)
        if (typeof target !== "object" && !jQuery.isFunction(target)) {
            target = {};
        }

        // extend jQuery itself if only one argument is passed
        if (length === i) {
            target = this;
            --i;
        }

        for (; i < length; i++) {
            // Only deal with non-null/undefined values
            if ((options = arguments[i]) != null) {
                // Extend the base object
                for (name in options) {
                    src = target[name];
                    copy = options[name];

                    // Prevent never-ending loop
                    if (target === copy) {
                        continue;
                    }

                    // Recurse if we're merging object literal values or arrays
                    if (deep && copy && (jQuery.isPlainObject(copy) || jQuery.isArray(copy))) {
                        var clone = src && (jQuery.isPlainObject(src) || jQuery.isArray(src)) ? src : jQuery.isArray(copy) ? [] : {};

                        // Never move original objects, clone them
                        target[name] = jQuery.extend(deep, clone, copy);

                        // Don't bring in undefined values
                    } else if (copy !== undefined) {
                        target[name] = copy;
                    }
                }
            }
        }

        // Return the modified object
        return target;
    };

    jQuery.extend({
        noConflict: function(deep) {
            window.$ = _$;

            if (deep) {
                window.jQuery = _jQuery;
            }

            return jQuery;
        },

        // Is the DOM ready to be used? Set to true once it occurs.
        isReady: false,

        // Handle when the DOM is ready
        ready: function() {
            // Make sure that the DOM is not already loaded
            if (!jQuery.isReady) {
                // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
                if (!document.body) {
                    return setTimeout(jQuery.ready, 13);
                }

                // Remember that the DOM is ready
                jQuery.isReady = true;

                // If there are functions bound, to execute
                if (readyList) {
                    // Execute all of them
                    var fn, i = 0;
                    while ((fn = readyList[i++])) {
                        fn.call(document, jQuery);
                    }

                    // Reset the list of functions
                    readyList = null;
                }

                // Trigger any bound ready events
                if (jQuery.fn.triggerHandler) {
                    jQuery(document).triggerHandler("ready");
                }
            }
        },

        bindReady: function() {
            if (readyBound) {
                return;
            }

            readyBound = true;

            // Catch cases where $(document).ready() is called after the
            // browser event has already occurred.
            if (document.readyState === "complete") {
                return jQuery.ready();
            }

            // Mozilla, Opera and webkit nightlies currently support this event
            if (document.addEventListener) {
                // Use the handy event callback
                document.addEventListener("DOMContentLoaded", DOMContentLoaded, false);

                // A fallback to window.onload, that will always work
                window.addEventListener("load", jQuery.ready, false);

                // If IE event model is used
            } else if (document.attachEvent) {
                // ensure firing before onload,
                // maybe late but safe also for iframes
                document.attachEvent("onreadystatechange", DOMContentLoaded);

                // A fallback to window.onload, that will always work
                window.attachEvent("onload", jQuery.ready);

                // If IE and not a frame
                // continually check to see if the document is ready
                var toplevel = false;

                try {
                    toplevel = window.frameElement == null;
                } catch (e) {}

                if (document.documentElement.doScroll && toplevel) {
                    doScrollCheck();
                }
            }
        },

        // See test/unit/core.js for details concerning isFunction.
        // Since version 1.3, DOM methods and functions like alert
        // aren't supported. They return false on IE (#2968).
        isFunction: function(obj) {
            return toString.call(obj) === "[object Function]";
        },

        isArray: function(obj) {
            return toString.call(obj) === "[object Array]";
        },

        isPlainObject: function(obj) {
            // Must be an Object.
            // Because of IE, we also have to check the presence of the constructor property.
            // Make sure that DOM nodes and window objects don't pass through, as well
            if (!obj || toString.call(obj) !== "[object Object]" || obj.nodeType || obj.setInterval) {
                return false;
            }

            // Not own constructor property must be Object
            if (obj.constructor && !hasOwnProperty.call(obj, "constructor") && !hasOwnProperty.call(obj.constructor.prototype, "isPrototypeOf")) {
                return false;
            }

            // Own properties are enumerated firstly, so to speed up,
            // if last one is own, then all properties are own.

            var key;
            for (key in obj) {}

            return key === undefined || hasOwnProperty.call(obj, key);
        },

        isEmptyObject: function(obj) {
            for (var name in obj) {
                return false;
            }
            return true;
        },

        error: function(msg) {
            throw msg;
        },

        parseJSON: function(data) {
            if (typeof data !== "string" || !data) {
                return null;
            }

            // Make sure the incoming data is actual JSON
            // Logic borrowed from http://json.org/json2.js
            if (/^[\],:{}\s]*$/.test(data.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
                    .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
                    .replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {

                // Try to use the native JSON parser first
                return window.JSON && window.JSON.parse ?
                    window.JSON.parse(data) :
                    (new Function("return " + data))();

            } else {
                jQuery.error("Invalid JSON: " + data);
            }
        },

        noop: function() {},

        // Evalulates a script in a global context
        globalEval: function(data) {
            if (data && rnotwhite.test(data)) {
                // Inspired by code by Andrea Giammarchi
                // http://webreflection.blogspot.com/2007/08/global-scope-evaluation-and-dom.html
                var head = document.getElementsByTagName("head")[0] || document.documentElement,
                    script = document.createElement("script");

                script.type = "text/javascript";

                if (jQuery.support.scriptEval) {
                    script.appendChild(document.createTextNode(data));
                } else {
                    script.text = data;
                }

                // Use insertBefore instead of appendChild to circumvent an IE6 bug.
                // This arises when a base node is used (#2709).
                head.insertBefore(script, head.firstChild);
                head.removeChild(script);
            }
        },

        nodeName: function(elem, name) {
            return elem.nodeName && elem.nodeName.toUpperCase() === name.toUpperCase();
        },

        // args is for internal usage only
        each: function(object, callback, args) {
            var name, i = 0,
                length = object.length,
                isObj = length === undefined || jQuery.isFunction(object);

            if (args) {
                if (isObj) {
                    for (name in object) {
                        if (callback.apply(object[name], args) === false) {
                            break;
                        }
                    }
                } else {
                    for (; i < length;) {
                        if (callback.apply(object[i++], args) === false) {
                            break;
                        }
                    }
                }

                // A special, fast, case for the most common use of each
            } else {
                if (isObj) {
                    for (name in object) {
                        if (callback.call(object[name], name, object[name]) === false) {
                            break;
                        }
                    }
                } else {
                    for (var value = object[0]; i < length && callback.call(value, i, value) !== false; value = object[++i]) {}
                }
            }

            return object;
        },

        trim: function(text) {
            return (text || "").replace(rtrim, "");
        },

        // results is for internal usage only
        makeArray: function(array, results) {
            var ret = results || [];

            if (array != null) {
                // The window, strings (and functions) also have 'length'
                // The extra typeof function check is to prevent crashes
                // in Safari 2 (See: #3039)
                if (array.length == null || typeof array === "string" || jQuery.isFunction(array) || (typeof array !== "function" && array.setInterval)) {
                    push.call(ret, array);
                } else {
                    jQuery.merge(ret, array);
                }
            }

            return ret;
        },

        inArray: function(elem, array) {
            if (array.indexOf) {
                return array.indexOf(elem);
            }

            for (var i = 0, length = array.length; i < length; i++) {
                if (array[i] === elem) {
                    return i;
                }
            }

            return -1;
        },

        merge: function(first, second) {
            var i = first.length,
                j = 0;

            if (typeof second.length === "number") {
                for (var l = second.length; j < l; j++) {
                    first[i++] = second[j];
                }
            } else {
                while (second[j] !== undefined) {
                    first[i++] = second[j++];
                }
            }

            first.length = i;

            return first;
        },

        grep: function(elems, callback, inv) {
            var ret = [];

            // Go through the array, only saving the items
            // that pass the validator function
            for (var i = 0, length = elems.length; i < length; i++) {
                if (!inv !== !callback(elems[i], i)) {
                    ret.push(elems[i]);
                }
            }

            return ret;
        },

        // arg is for internal usage only
        map: function(elems, callback, arg) {
            var ret = [],
                value;

            // Go through the array, translating each of the items to their
            // new value (or values).
            for (var i = 0, length = elems.length; i < length; i++) {
                value = callback(elems[i], i, arg);

                if (value != null) {
                    ret[ret.length] = value;
                }
            }

            return ret.concat.apply([], ret);
        },

        // A global GUID counter for objects
        guid: 1,

        proxy: function(fn, proxy, thisObject) {
            if (arguments.length === 2) {
                if (typeof proxy === "string") {
                    thisObject = fn;
                    fn = thisObject[proxy];
                    proxy = undefined;

                } else if (proxy && !jQuery.isFunction(proxy)) {
                    thisObject = proxy;
                    proxy = undefined;
                }
            }

            if (!proxy && fn) {
                proxy = function() {
                    return fn.apply(thisObject || this, arguments);
                };
            }

            // Set the guid of unique handler to the same of original handler, so it can be removed
            if (fn) {
                proxy.guid = fn.guid = fn.guid || proxy.guid || jQuery.guid++;
            }

            // So proxy can be declared as an argument
            return proxy;
        },

        // Use of jQuery.browser is frowned upon.
        // More details: http://docs.jquery.com/Utilities/jQuery.browser
        uaMatch: function(ua) {
            ua = ua.toLowerCase();

            var match = /(webkit)[ \/]([\w.]+)/.exec(ua) ||
                /(msie) ([\w.]+)/.exec(ua) ||
                !/compatible/.test(ua) && /(mozilla)(?:.*? rv:([\w.]+))?/.exec(ua) || [];

            return { browser: match[1] || "", version: match[2] || "0" };
        },

        browser: {}
    });

    browserMatch = jQuery.uaMatch(userAgent);
    if (browserMatch.browser) {
        jQuery.browser[browserMatch.browser] = true;
        jQuery.browser.version = browserMatch.version;
    }

    // Deprecated, use jQuery.browser.webkit instead
    if (jQuery.browser.webkit) {
        jQuery.browser.safari = true;
    }

    if (indexOf) {
        jQuery.inArray = function(elem, array) {
            return indexOf.call(array, elem);
        };
    }

    // All jQuery objects should point back to these
    rootjQuery = jQuery(document);

    // Cleanup functions for the document ready method
    if (document.addEventListener) {
        DOMContentLoaded = function() {
            document.removeEventListener("DOMContentLoaded", DOMContentLoaded, false);
            jQuery.ready();
        };

    } else if (document.attachEvent) {
        DOMContentLoaded = function() {
            // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
            if (document.readyState === "complete") {
                document.detachEvent("onreadystatechange", DOMContentLoaded);
                jQuery.ready();
            }
        };
    }

    // The DOM ready check for Internet Explorer
    function doScrollCheck() {
        if (jQuery.isReady) {
            return;
        }

        try {
            // If IE is used, use the trick by Diego Perini
            // http://javascript.nwbox.com/IEContentLoaded/
            document.documentElement.doScroll("left");
        } catch (error) {
            setTimeout(doScrollCheck, 1);
            return;
        }

        // and execute any waiting functions
        jQuery.ready();
    }

    function evalScript(i, elem) {
        if (elem.src) {
            jQuery.ajax({
                url: elem.src,
                async: false,
                dataType: "script"
            });
        } else {
            jQuery.globalEval(elem.text || elem.textContent || elem.innerHTML || "");
        }

        if (elem.parentNode) {
            elem.parentNode.removeChild(elem);
        }
    }

    // Mutifunctional method to get and set values to a collection
    // The value/s can be optionally by executed if its a function
    function access(elems, key, value, exec, fn, pass) {
        var length = elems.length;

        // Setting many attributes
        if (typeof key === "object") {
            for (var k in key) {
                access(elems, k, key[k], exec, fn, value);
            }
            return elems;
        }

        // Setting one attribute
        if (value !== undefined) {
            // Optionally, function values get executed if exec is true
            exec = !pass && exec && jQuery.isFunction(value);

            for (var i = 0; i < length; i++) {
                fn(elems[i], key, exec ? value.call(elems[i], i, fn(elems[i], key)) : value, pass);
            }

            return elems;
        }

        // Getting an attribute
        return length ? fn(elems[0], key) : null;
    }

    function now() {
        return (new Date).getTime();
    }
    (function() {

        jQuery.support = {};

        var root = document.documentElement,
            script = document.createElement("script"),
            div = document.createElement("div"),
            id = "script" + now();

        div.style.display = "none";
        div.innerHTML = "   <link/><table></table><a href='/a' style='color:red;float:left;opacity:.55;'>a</a><input type='checkbox'/>";

        var all = div.getElementsByTagName("*"),
            a = div.getElementsByTagName("a")[0];

        // Can't get basic test support
        if (!all || !all.length || !a) {
            return;
        }

        jQuery.support = {
            // IE strips leading whitespace when .innerHTML is used
            leadingWhitespace: div.firstChild.nodeType === 3,

            // Make sure that tbody elements aren't automatically inserted
            // IE will insert them into empty tables
            tbody: !div.getElementsByTagName("tbody").length,

            // Make sure that link elements get serialized correctly by innerHTML
            // This requires a wrapper element in IE
            htmlSerialize: !!div.getElementsByTagName("link").length,

            // Get the style information from getAttribute
            // (IE uses .cssText insted)
            style: /red/.test(a.getAttribute("style")),

            // Make sure that URLs aren't manipulated
            // (IE normalizes it by default)
            hrefNormalized: a.getAttribute("href") === "/a",

            // Make sure that element opacity exists
            // (IE uses filter instead)
            // Use a regex to work around a WebKit issue. See #5145
            opacity: /^0.55$/.test(a.style.opacity),

            // Verify style float existence
            // (IE uses styleFloat instead of cssFloat)
            cssFloat: !!a.style.cssFloat,

            // Make sure that if no value is specified for a checkbox
            // that it defaults to "on".
            // (WebKit defaults to "" instead)
            checkOn: div.getElementsByTagName("input")[0].value === "on",

            // Make sure that a selected-by-default option has a working selected property.
            // (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
            optSelected: document.createElement("select").appendChild(document.createElement("option")).selected,

            // Will be defined later
            checkClone: false,
            scriptEval: false,
            noCloneEvent: true,
            boxModel: null
        };

        script.type = "text/javascript";
        try {
            script.appendChild(document.createTextNode("window." + id + "=1;"));
        } catch (e) {}

        root.insertBefore(script, root.firstChild);

        // Make sure that the execution of code works by injecting a script
        // tag with appendChild/createTextNode
        // (IE doesn't support this, fails, and uses .text instead)
        if (window[id]) {
            jQuery.support.scriptEval = true;
            delete window[id];
        }

        root.removeChild(script);

        if (div.attachEvent && div.fireEvent) {
            div.attachEvent("onclick", function click() {
                // Cloning a node shouldn't copy over any
                // bound event handlers (IE does this)
                jQuery.support.noCloneEvent = false;
                div.detachEvent("onclick", click);
            });
            div.cloneNode(true).fireEvent("onclick");
        }

        div = document.createElement("div");
        div.innerHTML = "<input type='radio' name='radiotest' checked='checked'/>";

        var fragment = document.createDocumentFragment();
        fragment.appendChild(div.firstChild);

        // WebKit doesn't clone checked state correctly in fragments
        jQuery.support.checkClone = fragment.cloneNode(true).cloneNode(true).lastChild.checked;

        // Figure out if the W3C box model works as expected
        // document.body must exist before we can do this
        jQuery(function() {
            var div = document.createElement("div");
            div.style.width = div.style.paddingLeft = "1px";

            document.body.appendChild(div);
            jQuery.boxModel = jQuery.support.boxModel = div.offsetWidth === 2;
            document.body.removeChild(div).style.display = 'none';
            div = null;
        });

        // Technique from Juriy Zaytsev
        // http://thinkweb2.com/projects/prototype/detecting-event-support-without-browser-sniffing/
        var eventSupported = function(eventName) {
            var el = document.createElement("div");
            eventName = "on" + eventName;

            var isSupported = (eventName in el);
            if (!isSupported) {
                el.setAttribute(eventName, "return;");
                isSupported = typeof el[eventName] === "function";
            }
            el = null;

            return isSupported;
        };

        jQuery.support.submitBubbles = eventSupported("submit");
        jQuery.support.changeBubbles = eventSupported("change");

        // release memory in IE
        root = script = div = all = a = null;
    })();

    jQuery.props = {
        "for": "htmlFor",
        "class": "className",
        readonly: "readOnly",
        maxlength: "maxLength",
        cellspacing: "cellSpacing",
        rowspan: "rowSpan",
        colspan: "colSpan",
        tabindex: "tabIndex",
        usemap: "useMap",
        frameborder: "frameBorder"
    };
    var expando = "jQuery" + now(),
        uuid = 0,
        windowData = {};
    var emptyObject = {};

    jQuery.extend({
        cache: {},

        expando: expando,

        // The following elements throw uncatchable exceptions if you
        // attempt to add expando properties to them.
        noData: {
            "embed": true,
            "object": true,
            "applet": true
        },

        data: function(elem, name, data) {
            if (elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()]) {
                return;
            }

            elem = elem == window ?
                windowData :
                elem;

            var id = elem[expando],
                cache = jQuery.cache,
                thisCache;

            // Handle the case where there's no name immediately
            if (!name && !id) {
                return null;
            }

            // Compute a unique ID for the element
            if (!id) {
                id = ++uuid;
            }

            // Avoid generating a new cache unless none exists and we
            // want to manipulate it.
            if (typeof name === "object") {
                elem[expando] = id;
                thisCache = cache[id] = jQuery.extend(true, {}, name);
            } else if (cache[id]) {
                thisCache = cache[id];
            } else if (typeof data === "undefined") {
                thisCache = emptyObject;
            } else {
                thisCache = cache[id] = {};
            }

            // Prevent overriding the named cache with undefined values
            if (data !== undefined) {
                elem[expando] = id;
                thisCache[name] = data;
            }

            return typeof name === "string" ? thisCache[name] : thisCache;
        },

        removeData: function(elem, name) {
            if (elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()]) {
                return;
            }

            elem = elem == window ?
                windowData :
                elem;

            var id = elem[expando],
                cache = jQuery.cache,
                thisCache = cache[id];

            // If we want to remove a specific section of the element's data
            if (name) {
                if (thisCache) {
                    // Remove the section of cache data
                    delete thisCache[name];

                    // If we've removed all the data, remove the element's cache
                    if (jQuery.isEmptyObject(thisCache)) {
                        jQuery.removeData(elem);
                    }
                }

                // Otherwise, we want to remove all of the element's data
            } else {
                // Clean up the element expando
                try {
                    delete elem[expando];
                } catch (e) {
                    // IE has trouble directly removing the expando
                    // but it's ok with using removeAttribute
                    if (elem.removeAttribute) {
                        elem.removeAttribute(expando);
                    }
                }

                // Completely remove the data cache
                delete cache[id];
            }
        }
    });

    jQuery.fn.extend({
        data: function(key, value) {
            if (typeof key === "undefined" && this.length) {
                return jQuery.data(this[0]);

            } else if (typeof key === "object") {
                return this.each(function() {
                    jQuery.data(this, key);
                });
            }

            var parts = key.split(".");
            parts[1] = parts[1] ? "." + parts[1] : "";

            if (value === undefined) {
                var data = this.triggerHandler("getData" + parts[1] + "!", [parts[0]]);

                if (data === undefined && this.length) {
                    data = jQuery.data(this[0], key);
                }
                return data === undefined && parts[1] ?
                    this.data(parts[0]) :
                    data;
            } else {
                return this.trigger("setData" + parts[1] + "!", [parts[0], value]).each(function() {
                    jQuery.data(this, key, value);
                });
            }
        },

        removeData: function(key) {
            return this.each(function() {
                jQuery.removeData(this, key);
            });
        }
    });
    jQuery.extend({
        queue: function(elem, type, data) {
            if (!elem) {
                return;
            }

            type = (type || "fx") + "queue";
            var q = jQuery.data(elem, type);

            // Speed up dequeue by getting out quickly if this is just a lookup
            if (!data) {
                return q || [];
            }

            if (!q || jQuery.isArray(data)) {
                q = jQuery.data(elem, type, jQuery.makeArray(data));

            } else {
                q.push(data);
            }

            return q;
        },

        dequeue: function(elem, type) {
            type = type || "fx";

            var queue = jQuery.queue(elem, type),
                fn = queue.shift();

            // If the fx queue is dequeued, always remove the progress sentinel
            if (fn === "inprogress") {
                fn = queue.shift();
            }

            if (fn) {
                // Add a progress sentinel to prevent the fx queue from being
                // automatically dequeued
                if (type === "fx") {
                    queue.unshift("inprogress");
                }

                fn.call(elem, function() {
                    jQuery.dequeue(elem, type);
                });
            }
        }
    });

    jQuery.fn.extend({
        queue: function(type, data) {
            if (typeof type !== "string") {
                data = type;
                type = "fx";
            }

            if (data === undefined) {
                return jQuery.queue(this[0], type);
            }
            return this.each(function(i, elem) {
                var queue = jQuery.queue(this, type, data);

                if (type === "fx" && queue[0] !== "inprogress") {
                    jQuery.dequeue(this, type);
                }
            });
        },
        dequeue: function(type) {
            return this.each(function() {
                jQuery.dequeue(this, type);
            });
        },

        // Based off of the plugin by Clint Helfers, with permission.
        // http://blindsignals.com/index.php/2009/07/jquery-delay/
        delay: function(time, type) {
            time = jQuery.fx ? jQuery.fx.speeds[time] || time : time;
            type = type || "fx";

            return this.queue(type, function() {
                var elem = this;
                setTimeout(function() {
                    jQuery.dequeue(elem, type);
                }, time);
            });
        },

        clearQueue: function(type) {
            return this.queue(type || "fx", []);
        }
    });
    var rclass = /[\n\t]/g,
        rspace = /\s+/,
        rreturn = /\r/g,
        rspecialurl = /href|src|style/,
        rtype = /(button|input)/i,
        rfocusable = /(button|input|object|select|textarea)/i,
        rclickable = /^(a|area)$/i,
        rradiocheck = /radio|checkbox/;

    jQuery.fn.extend({
        attr: function(name, value) {
            return access(this, name, value, true, jQuery.attr);
        },

        removeAttr: function(name, fn) {
            return this.each(function() {
                jQuery.attr(this, name, "");
                if (this.nodeType === 1) {
                    this.removeAttribute(name);
                }
            });
        },

        addClass: function(value) {
            if (jQuery.isFunction(value)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    self.addClass(value.call(this, i, self.attr("class")));
                });
            }

            if (value && typeof value === "string") {
                var classNames = (value || "").split(rspace);

                for (var i = 0, l = this.length; i < l; i++) {
                    var elem = this[i];

                    if (elem.nodeType === 1) {
                        if (!elem.className) {
                            elem.className = value;

                        } else {
                            var className = " " + elem.className + " ";
                            for (var c = 0, cl = classNames.length; c < cl; c++) {
                                if (className.indexOf(" " + classNames[c] + " ") < 0) {
                                    elem.className += " " + classNames[c];
                                }
                            }
                        }
                    }
                }
            }

            return this;
        },

        removeClass: function(value) {
            if (jQuery.isFunction(value)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    self.removeClass(value.call(this, i, self.attr("class")));
                });
            }

            if ((value && typeof value === "string") || value === undefined) {
                var classNames = (value || "").split(rspace);

                for (var i = 0, l = this.length; i < l; i++) {
                    var elem = this[i];

                    if (elem.nodeType === 1 && elem.className) {
                        if (value) {
                            var className = (" " + elem.className + " ").replace(rclass, " ");
                            for (var c = 0, cl = classNames.length; c < cl; c++) {
                                className = className.replace(" " + classNames[c] + " ", " ");
                            }
                            elem.className = className.substring(1, className.length - 1);

                        } else {
                            elem.className = "";
                        }
                    }
                }
            }

            return this;
        },

        toggleClass: function(value, stateVal) {
            var type = typeof value,
                isBool = typeof stateVal === "boolean";

            if (jQuery.isFunction(value)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    self.toggleClass(value.call(this, i, self.attr("class"), stateVal), stateVal);
                });
            }

            return this.each(function() {
                if (type === "string") {
                    // toggle individual class names
                    var className, i = 0,
                        self = jQuery(this),
                        state = stateVal,
                        classNames = value.split(rspace);

                    while ((className = classNames[i++])) {
                        // check each className given, space seperated list
                        state = isBool ? state : !self.hasClass(className);
                        self[state ? "addClass" : "removeClass"](className);
                    }

                } else if (type === "undefined" || type === "boolean") {
                    if (this.className) {
                        // store className if set
                        jQuery.data(this, "__className__", this.className);
                    }

                    // toggle whole className
                    this.className = this.className || value === false ? "" : jQuery.data(this, "__className__") || "";
                }
            });
        },

        hasClass: function(selector) {
            var className = " " + selector + " ";
            for (var i = 0, l = this.length; i < l; i++) {
                if ((" " + this[i].className + " ").replace(rclass, " ").indexOf(className) > -1) {
                    return true;
                }
            }

            return false;
        },

        val: function(value) {
            if (value === undefined) {
                var elem = this[0];

                if (elem) {
                    if (jQuery.nodeName(elem, "option")) {
                        return (elem.attributes.value || {}).specified ? elem.value : elem.text;
                    }

                    // We need to handle select boxes special
                    if (jQuery.nodeName(elem, "select")) {
                        var index = elem.selectedIndex,
                            values = [],
                            options = elem.options,
                            one = elem.type === "select-one";

                        // Nothing was selected
                        if (index < 0) {
                            return null;
                        }

                        // Loop through all the selected options
                        for (var i = one ? index : 0, max = one ? index + 1 : options.length; i < max; i++) {
                            var option = options[i];

                            if (option.selected) {
                                // Get the specifc value for the option
                                value = jQuery(option).val();

                                // We don't need an array for one selects
                                if (one) {
                                    return value;
                                }

                                // Multi-Selects return an array
                                values.push(value);
                            }
                        }

                        return values;
                    }

                    // Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
                    if (rradiocheck.test(elem.type) && !jQuery.support.checkOn) {
                        return elem.getAttribute("value") === null ? "on" : elem.value;
                    }


                    // Everything else, we just grab the value
                    return (elem.value || "").replace(rreturn, "");

                }

                return undefined;
            }

            var isFunction = jQuery.isFunction(value);

            return this.each(function(i) {
                var self = jQuery(this),
                    val = value;

                if (this.nodeType !== 1) {
                    return;
                }

                if (isFunction) {
                    val = value.call(this, i, self.val());
                }

                // Typecast each time if the value is a Function and the appended
                // value is therefore different each time.
                if (typeof val === "number") {
                    val += "";
                }

                if (jQuery.isArray(val) && rradiocheck.test(this.type)) {
                    this.checked = jQuery.inArray(self.val(), val) >= 0;

                } else if (jQuery.nodeName(this, "select")) {
                    var values = jQuery.makeArray(val);

                    jQuery("option", this).each(function() {
                        this.selected = jQuery.inArray(jQuery(this).val(), values) >= 0;
                    });

                    if (!values.length) {
                        this.selectedIndex = -1;
                    }

                } else {
                    this.value = val;
                }
            });
        }
    });

    jQuery.extend({
        attrFn: {
            val: true,
            css: true,
            html: true,
            text: true,
            data: true,
            width: true,
            height: true,
            offset: true
        },

        attr: function(elem, name, value, pass) {
            // don't set attributes on text and comment nodes
            if (!elem || elem.nodeType === 3 || elem.nodeType === 8) {
                return undefined;
            }

            if (pass && name in jQuery.attrFn) {
                return jQuery(elem)[name](value);
            }

            var notxml = elem.nodeType !== 1 || !jQuery.isXMLDoc(elem),
                // Whether we are setting (or getting)
                set = value !== undefined;

            // Try to normalize/fix the name
            name = notxml && jQuery.props[name] || name;

            // Only do all the following if this is a node (faster for style)
            if (elem.nodeType === 1) {
                // These attributes require special treatment
                var special = rspecialurl.test(name);

                // Safari mis-reports the default selected property of an option
                // Accessing the parent's selectedIndex property fixes it
                if (name === "selected" && !jQuery.support.optSelected) {
                    var parent = elem.parentNode;
                    if (parent) {
                        parent.selectedIndex;

                        // Make sure that it also works with optgroups, see #5701
                        if (parent.parentNode) {
                            parent.parentNode.selectedIndex;
                        }
                    }
                }

                // If applicable, access the attribute via the DOM 0 way
                if (name in elem && notxml && !special) {
                    if (set) {
                        // We can't allow the type property to be changed (since it causes problems in IE)
                        if (name === "type" && rtype.test(elem.nodeName) && elem.parentNode) {
                            jQuery.error("type property can't be changed");
                        }

                        elem[name] = value;
                    }

                    // browsers index elements by id/name on forms, give priority to attributes.
                    if (jQuery.nodeName(elem, "form") && elem.getAttributeNode(name)) {
                        return elem.getAttributeNode(name).nodeValue;
                    }

                    // elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
                    // http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
                    if (name === "tabIndex") {
                        var attributeNode = elem.getAttributeNode("tabIndex");

                        return attributeNode && attributeNode.specified ?
                            attributeNode.value :
                            rfocusable.test(elem.nodeName) || rclickable.test(elem.nodeName) && elem.href ?
                            0 :
                            undefined;
                    }

                    return elem[name];
                }

                if (!jQuery.support.style && notxml && name === "style") {
                    if (set) {
                        elem.style.cssText = "" + value;
                    }

                    return elem.style.cssText;
                }

                if (set) {
                    // convert the value to a string (all browsers do this but IE) see #1070
                    elem.setAttribute(name, "" + value);
                }

                var attr = !jQuery.support.hrefNormalized && notxml && special ?
                    // Some attributes require a special call on IE
                    elem.getAttribute(name, 2) :
                    elem.getAttribute(name);

                // Non-existent attributes return null, we normalize to undefined
                return attr === null ? undefined : attr;
            }

            // elem is actually elem.style ... set the style
            // Using attr for specific style information is now deprecated. Use style insead.
            return jQuery.style(elem, name, value);
        }
    });
    var fcleanup = function(nm) {
        return nm.replace(/[^\w\s\.\|`]/g, function(ch) {
            return "\\" + ch;
        });
    };

    /*
     * A number of helper functions used for managing events.
     * Many of the ideas behind this code originated from
     * Dean Edwards' addEvent library.
     */
    jQuery.event = {

        // Bind an event to an element
        // Original by Dean Edwards
        add: function(elem, types, handler, data) {
            if (elem.nodeType === 3 || elem.nodeType === 8) {
                return;
            }

            // For whatever reason, IE has trouble passing the window object
            // around, causing it to be cloned in the process
            if (elem.setInterval && (elem !== window && !elem.frameElement)) {
                elem = window;
            }

            // Make sure that the function being executed has a unique ID
            if (!handler.guid) {
                handler.guid = jQuery.guid++;
            }

            // if data is passed, bind to handler
            if (data !== undefined) {
                // Create temporary function pointer to original handler
                var fn = handler;

                // Create unique handler function, wrapped around original handler
                handler = jQuery.proxy(fn);

                // Store data in unique handler
                handler.data = data;
            }

            // Init the element's event structure
            var events = jQuery.data(elem, "events") || jQuery.data(elem, "events", {}),
                handle = jQuery.data(elem, "handle"),
                eventHandle;

            if (!handle) {
                eventHandle = function() {
                    // Handle the second event of a trigger and when
                    // an event is called after a page has unloaded
                    return typeof jQuery !== "undefined" && !jQuery.event.triggered ?
                        jQuery.event.handle.apply(eventHandle.elem, arguments) :
                        undefined;
                };

                handle = jQuery.data(elem, "handle", eventHandle);
            }

            // If no handle is found then we must be trying to bind to one of the
            // banned noData elements
            if (!handle) {
                return;
            }

            // Add elem as a property of the handle function
            // This is to prevent a memory leak with non-native
            // event in IE.
            handle.elem = elem;

            // Handle multiple events separated by a space
            // jQuery(...).bind("mouseover mouseout", fn);
            types = types.split(/\s+/);

            var type, i = 0;

            while ((type = types[i++])) {
                // Namespaced event handlers
                var namespaces = type.split(".");
                type = namespaces.shift();

                if (i > 1) {
                    handler = jQuery.proxy(handler);

                    if (data !== undefined) {
                        handler.data = data;
                    }
                }

                handler.type = namespaces.slice(0).sort().join(".");

                // Get the current list of functions bound to this event
                var handlers = events[type],
                    special = this.special[type] || {};

                // Init the event handler queue
                if (!handlers) {
                    handlers = events[type] = {};

                    // Check for a special event handler
                    // Only use addEventListener/attachEvent if the special
                    // events handler returns false
                    if (!special.setup || special.setup.call(elem, data, namespaces, handler) === false) {
                        // Bind the global event handler to the element
                        if (elem.addEventListener) {
                            elem.addEventListener(type, handle, false);
                        } else if (elem.attachEvent) {
                            elem.attachEvent("on" + type, handle);
                        }
                    }
                }

                if (special.add) {
                    var modifiedHandler = special.add.call(elem, handler, data, namespaces, handlers);
                    if (modifiedHandler && jQuery.isFunction(modifiedHandler)) {
                        modifiedHandler.guid = modifiedHandler.guid || handler.guid;
                        modifiedHandler.data = modifiedHandler.data || handler.data;
                        modifiedHandler.type = modifiedHandler.type || handler.type;
                        handler = modifiedHandler;
                    }
                }

                // Add the function to the element's handler list
                handlers[handler.guid] = handler;

                // Keep track of which events have been used, for global triggering
                this.global[type] = true;
            }

            // Nullify elem to prevent memory leaks in IE
            elem = null;
        },

        global: {},

        // Detach an event or set of events from an element
        remove: function(elem, types, handler) {
            // don't do events on text and comment nodes
            if (elem.nodeType === 3 || elem.nodeType === 8) {
                return;
            }

            var events = jQuery.data(elem, "events"),
                ret, type, fn;

            if (events) {
                // Unbind all events for the element
                if (types === undefined || (typeof types === "string" && types.charAt(0) === ".")) {
                    for (type in events) {
                        this.remove(elem, type + (types || ""));
                    }
                } else {
                    // types is actually an event object here
                    if (types.type) {
                        handler = types.handler;
                        types = types.type;
                    }

                    // Handle multiple events separated by a space
                    // jQuery(...).unbind("mouseover mouseout", fn);
                    types = types.split(/\s+/);
                    var i = 0;
                    while ((type = types[i++])) {
                        // Namespaced event handlers
                        var namespaces = type.split(".");
                        type = namespaces.shift();
                        var all = !namespaces.length,
                            cleaned = jQuery.map(namespaces.slice(0).sort(), fcleanup),
                            namespace = new RegExp("(^|\\.)" + cleaned.join("\\.(?:.*\\.)?") + "(\\.|$)"),
                            special = this.special[type] || {};

                        if (events[type]) {
                            // remove the given handler for the given type
                            if (handler) {
                                fn = events[type][handler.guid];
                                delete events[type][handler.guid];

                                // remove all handlers for the given type
                            } else {
                                for (var handle in events[type]) {
                                    // Handle the removal of namespaced events
                                    if (all || namespace.test(events[type][handle].type)) {
                                        delete events[type][handle];
                                    }
                                }
                            }

                            if (special.remove) {
                                special.remove.call(elem, namespaces, fn);
                            }

                            // remove generic event handler if no more handlers exist
                            for (ret in events[type]) {
                                break;
                            }
                            if (!ret) {
                                if (!special.teardown || special.teardown.call(elem, namespaces) === false) {
                                    if (elem.removeEventListener) {
                                        elem.removeEventListener(type, jQuery.data(elem, "handle"), false);
                                    } else if (elem.detachEvent) {
                                        elem.detachEvent("on" + type, jQuery.data(elem, "handle"));
                                    }
                                }
                                ret = null;
                                delete events[type];
                            }
                        }
                    }
                }

                // Remove the expando if it's no longer used
                for (ret in events) {
                    break;
                }
                if (!ret) {
                    var handle = jQuery.data(elem, "handle");
                    if (handle) {
                        handle.elem = null;
                    }
                    jQuery.removeData(elem, "events");
                    jQuery.removeData(elem, "handle");
                }
            }
        },

        // bubbling is internal
        trigger: function(event, data, elem /*, bubbling */ ) {
            // Event object or event type
            var type = event.type || event,
                bubbling = arguments[3];

            if (!bubbling) {
                event = typeof event === "object" ?
                    // jQuery.Event object
                    event[expando] ? event :
                    // Object literal
                    jQuery.extend(jQuery.Event(type), event) :
                    // Just the event type (string)
                    jQuery.Event(type);

                if (type.indexOf("!") >= 0) {
                    event.type = type = type.slice(0, -1);
                    event.exclusive = true;
                }

                // Handle a global trigger
                if (!elem) {
                    // Don't bubble custom events when global (to avoid too much overhead)
                    event.stopPropagation();

                    // Only trigger if we've ever bound an event for it
                    if (this.global[type]) {
                        jQuery.each(jQuery.cache, function() {
                            if (this.events && this.events[type]) {
                                jQuery.event.trigger(event, data, this.handle.elem);
                            }
                        });
                    }
                }

                // Handle triggering a single element

                // don't do events on text and comment nodes
                if (!elem || elem.nodeType === 3 || elem.nodeType === 8) {
                    return undefined;
                }

                // Clean up in case it is reused
                event.result = undefined;
                event.target = elem;

                // Clone the incoming data, if any
                data = jQuery.makeArray(data);
                data.unshift(event);
            }

            event.currentTarget = elem;

            // Trigger the event, it is assumed that "handle" is a function
            var handle = jQuery.data(elem, "handle");
            if (handle) {
                handle.apply(elem, data);
            }

            var parent = elem.parentNode || elem.ownerDocument;

            // Trigger an inline bound script
            try {
                if (!(elem && elem.nodeName && jQuery.noData[elem.nodeName.toLowerCase()])) {
                    if (elem["on" + type] && elem["on" + type].apply(elem, data) === false) {
                        event.result = false;
                    }
                }

                // prevent IE from throwing an error for some elements with some event types, see #3533
            } catch (e) {}

            if (!event.isPropagationStopped() && parent) {
                jQuery.event.trigger(event, data, parent, true);

            } else if (!event.isDefaultPrevented()) {
                var target = event.target,
                    old,
                    isClick = jQuery.nodeName(target, "a") && type === "click";

                if (!isClick && !(target && target.nodeName && jQuery.noData[target.nodeName.toLowerCase()])) {
                    try {
                        if (target[type]) {
                            // Make sure that we don't accidentally re-trigger the onFOO events
                            old = target["on" + type];

                            if (old) {
                                target["on" + type] = null;
                            }

                            this.triggered = true;
                            target[type]();
                        }

                        // prevent IE from throwing an error for some elements with some event types, see #3533
                    } catch (e) {}

                    if (old) {
                        target["on" + type] = old;
                    }

                    this.triggered = false;
                }
            }
        },

        handle: function(event) {
            // returned undefined or false
            var all, handlers;

            event = arguments[0] = jQuery.event.fix(event || window.event);
            event.currentTarget = this;

            // Namespaced event handlers
            var namespaces = event.type.split(".");
            event.type = namespaces.shift();

            // Cache this now, all = true means, any handler
            all = !namespaces.length && !event.exclusive;

            var namespace = new RegExp("(^|\\.)" + namespaces.slice(0).sort().join("\\.(?:.*\\.)?") + "(\\.|$)");

            handlers = (jQuery.data(this, "events") || {})[event.type];

            for (var j in handlers) {
                var handler = handlers[j];

                // Filter the functions by class
                if (all || namespace.test(handler.type)) {
                    // Pass in a reference to the handler function itself
                    // So that we can later remove it
                    event.handler = handler;
                    event.data = handler.data;

                    var ret = handler.apply(this, arguments);

                    if (ret !== undefined) {
                        event.result = ret;
                        if (ret === false) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }

                    if (event.isImmediatePropagationStopped()) {
                        break;
                    }

                }
            }

            return event.result;
        },

        props: "altKey attrChange attrName bubbles button cancelable charCode clientX clientY ctrlKey currentTarget data detail eventPhase fromElement handler keyCode layerX layerY metaKey newValue offsetX offsetY originalTarget pageX pageY prevValue relatedNode relatedTarget screenX screenY shiftKey srcElement target toElement view wheelDelta which".split(" "),

        fix: function(event) {
            if (event[expando]) {
                return event;
            }

            // store a copy of the original event object
            // and "clone" to set read-only properties
            var originalEvent = event;
            event = jQuery.Event(originalEvent);

            for (var i = this.props.length, prop; i;) {
                prop = this.props[--i];
                event[prop] = originalEvent[prop];
            }

            // Fix target property, if necessary
            if (!event.target) {
                event.target = event.srcElement || document; // Fixes #1925 where srcElement might not be defined either
            }

            // check if target is a textnode (safari)
            if (event.target.nodeType === 3) {
                event.target = event.target.parentNode;
            }

            // Add relatedTarget, if necessary
            if (!event.relatedTarget && event.fromElement) {
                event.relatedTarget = event.fromElement === event.target ? event.toElement : event.fromElement;
            }

            // Calculate pageX/Y if missing and clientX/Y available
            if (event.pageX == null && event.clientX != null) {
                var doc = document.documentElement,
                    body = document.body;
                event.pageX = event.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
                event.pageY = event.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc && doc.clientTop || body && body.clientTop || 0);
            }

            // Add which for key events
            if (!event.which && ((event.charCode || event.charCode === 0) ? event.charCode : event.keyCode)) {
                event.which = event.charCode || event.keyCode;
            }

            // Add metaKey to non-Mac browsers (use ctrl for PC's and Meta for Macs)
            if (!event.metaKey && event.ctrlKey) {
                event.metaKey = event.ctrlKey;
            }

            // Add which for click: 1 === left; 2 === middle; 3 === right
            // Note: button is not normalized, so don't use it
            if (!event.which && event.button !== undefined) {
                event.which = (event.button & 1 ? 1 : (event.button & 2 ? 3 : (event.button & 4 ? 2 : 0)));
            }

            return event;
        },

        // Deprecated, use jQuery.guid instead
        guid: 1E8,

        // Deprecated, use jQuery.proxy instead
        proxy: jQuery.proxy,

        special: {
            ready: {
                // Make sure the ready event is setup
                setup: jQuery.bindReady,
                teardown: jQuery.noop
            },

            live: {
                add: function(proxy, data, namespaces, live) {
                    jQuery.extend(proxy, data || {});

                    proxy.guid += data.selector + data.live;
                    data.liveProxy = proxy;

                    jQuery.event.add(this, data.live, liveHandler, data);

                },

                remove: function(namespaces) {
                    if (namespaces.length) {
                        var remove = 0,
                            name = new RegExp("(^|\\.)" + namespaces[0] + "(\\.|$)");

                        jQuery.each((jQuery.data(this, "events").live || {}), function() {
                            if (name.test(this.type)) {
                                remove++;
                            }
                        });

                        if (remove < 1) {
                            jQuery.event.remove(this, namespaces[0], liveHandler);
                        }
                    }
                },
                special: {}
            },
            beforeunload: {
                setup: function(data, namespaces, fn) {
                    // We only want to do this special case on windows
                    if (this.setInterval) {
                        this.onbeforeunload = fn;
                    }

                    return false;
                },
                teardown: function(namespaces, fn) {
                    if (this.onbeforeunload === fn) {
                        this.onbeforeunload = null;
                    }
                }
            }
        }
    };

    jQuery.Event = function(src) {
        // Allow instantiation without the 'new' keyword
        if (!this.preventDefault) {
            return new jQuery.Event(src);
        }

        // Event object
        if (src && src.type) {
            this.originalEvent = src;
            this.type = src.type;
            // Event type
        } else {
            this.type = src;
        }

        // timeStamp is buggy for some events on Firefox(#3843)
        // So we won't rely on the native value
        this.timeStamp = now();

        // Mark it as fixed
        this[expando] = true;
    };

    function returnFalse() {
        return false;
    }

    function returnTrue() {
        return true;
    }

    // jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
    // http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
    jQuery.Event.prototype = {
        preventDefault: function() {
            this.isDefaultPrevented = returnTrue;

            var e = this.originalEvent;
            if (!e) {
                return;
            }

            // if preventDefault exists run it on the original event
            if (e.preventDefault) {
                e.preventDefault();
            }
            // otherwise set the returnValue property of the original event to false (IE)
            e.returnValue = false;
        },
        stopPropagation: function() {
            this.isPropagationStopped = returnTrue;

            var e = this.originalEvent;
            if (!e) {
                return;
            }
            // if stopPropagation exists run it on the original event
            if (e.stopPropagation) {
                e.stopPropagation();
            }
            // otherwise set the cancelBubble property of the original event to true (IE)
            e.cancelBubble = true;
        },
        stopImmediatePropagation: function() {
            this.isImmediatePropagationStopped = returnTrue;
            this.stopPropagation();
        },
        isDefaultPrevented: returnFalse,
        isPropagationStopped: returnFalse,
        isImmediatePropagationStopped: returnFalse
    };

    // Checks if an event happened on an element within another element
    // Used in jQuery.event.special.mouseenter and mouseleave handlers
    var withinElement = function(event) {
            // Check if mouse(over|out) are still within the same parent element
            var parent = event.relatedTarget;

            // Traverse up the tree
            while (parent && parent !== this) {
                // Firefox sometimes assigns relatedTarget a XUL element
                // which we cannot access the parentNode property of
                try {
                    parent = parent.parentNode;

                    // assuming we've left the element since we most likely mousedover a xul element
                } catch (e) {
                    break;
                }
            }

            if (parent !== this) {
                // set the correct event type
                event.type = event.data;

                // handle event if we actually just moused on to a non sub-element
                jQuery.event.handle.apply(this, arguments);
            }

        },

        // In case of event delegation, we only need to rename the event.type,
        // liveHandler will take care of the rest.
        delegate = function(event) {
            event.type = event.data;
            jQuery.event.handle.apply(this, arguments);
        };

    // Create mouseenter and mouseleave events
    jQuery.each({
        mouseenter: "mouseover",
        mouseleave: "mouseout"
    }, function(orig, fix) {
        jQuery.event.special[orig] = {
            setup: function(data) {
                jQuery.event.add(this, fix, data && data.selector ? delegate : withinElement, orig);
            },
            teardown: function(data) {
                jQuery.event.remove(this, fix, data && data.selector ? delegate : withinElement);
            }
        };
    });

    // submit delegation
    if (!jQuery.support.submitBubbles) {

        jQuery.event.special.submit = {
            setup: function(data, namespaces, fn) {
                if (this.nodeName.toLowerCase() !== "form") {
                    jQuery.event.add(this, "click.specialSubmit." + fn.guid, function(e) {
                        var elem = e.target,
                            type = elem.type;

                        if ((type === "submit" || type === "image") && jQuery(elem).closest("form").length) {
                            return trigger("submit", this, arguments);
                        }
                    });

                    jQuery.event.add(this, "keypress.specialSubmit." + fn.guid, function(e) {
                        var elem = e.target,
                            type = elem.type;

                        if ((type === "text" || type === "password") && jQuery(elem).closest("form").length && e.keyCode === 13) {
                            return trigger("submit", this, arguments);
                        }
                    });

                } else {
                    return false;
                }
            },

            remove: function(namespaces, fn) {
                jQuery.event.remove(this, "click.specialSubmit" + (fn ? "." + fn.guid : ""));
                jQuery.event.remove(this, "keypress.specialSubmit" + (fn ? "." + fn.guid : ""));
            }
        };

    }

    // change delegation, happens here so we have bind.
    if (!jQuery.support.changeBubbles) {

        var formElems = /textarea|input|select/i;

        function getVal(elem) {
            var type = elem.type,
                val = elem.value;

            if (type === "radio" || type === "checkbox") {
                val = elem.checked;

            } else if (type === "select-multiple") {
                val = elem.selectedIndex > -1 ?
                    jQuery.map(elem.options, function(elem) {
                        return elem.selected;
                    }).join("-") :
                    "";

            } else if (elem.nodeName.toLowerCase() === "select") {
                val = elem.selectedIndex;
            }

            return val;
        }

        function testChange(e) {
            var elem = e.target,
                data, val;

            if (!formElems.test(elem.nodeName) || elem.readOnly) {
                return;
            }

            data = jQuery.data(elem, "_change_data");
            val = getVal(elem);

            // the current data will be also retrieved by beforeactivate
            if (e.type !== "focusout" || elem.type !== "radio") {
                jQuery.data(elem, "_change_data", val);
            }

            if (data === undefined || val === data) {
                return;
            }

            if (data != null || val) {
                e.type = "change";
                return jQuery.event.trigger(e, arguments[1], elem);
            }
        }

        jQuery.event.special.change = {
            filters: {
                focusout: testChange,

                click: function(e) {
                    var elem = e.target,
                        type = elem.type;

                    if (type === "radio" || type === "checkbox" || elem.nodeName.toLowerCase() === "select") {
                        return testChange.call(this, e);
                    }
                },

                // Change has to be called before submit
                // Keydown will be called before keypress, which is used in submit-event delegation
                keydown: function(e) {
                    var elem = e.target,
                        type = elem.type;

                    if ((e.keyCode === 13 && elem.nodeName.toLowerCase() !== "textarea") ||
                        (e.keyCode === 32 && (type === "checkbox" || type === "radio")) ||
                        type === "select-multiple") {
                        return testChange.call(this, e);
                    }
                },

                // Beforeactivate happens also before the previous element is blurred
                // with this event you can't trigger a change event, but you can store
                // information/focus[in] is not needed anymore
                beforeactivate: function(e) {
                    var elem = e.target;

                    if (elem.nodeName.toLowerCase() === "input" && elem.type === "radio") {
                        jQuery.data(elem, "_change_data", getVal(elem));
                    }
                }
            },
            setup: function(data, namespaces, fn) {
                for (var type in changeFilters) {
                    jQuery.event.add(this, type + ".specialChange." + fn.guid, changeFilters[type]);
                }

                return formElems.test(this.nodeName);
            },
            remove: function(namespaces, fn) {
                for (var type in changeFilters) {
                    jQuery.event.remove(this, type + ".specialChange" + (fn ? "." + fn.guid : ""), changeFilters[type]);
                }

                return formElems.test(this.nodeName);
            }
        };

        var changeFilters = jQuery.event.special.change.filters;

    }

    function trigger(type, elem, args) {
        args[0].type = type;
        return jQuery.event.handle.apply(elem, args);
    }

    // Create "bubbling" focus and blur events
    if (document.addEventListener) {
        jQuery.each({ focus: "focusin", blur: "focusout" }, function(orig, fix) {
            jQuery.event.special[fix] = {
                setup: function() {
                    this.addEventListener(orig, handler, true);
                },
                teardown: function() {
                    this.removeEventListener(orig, handler, true);
                }
            };

            function handler(e) {
                e = jQuery.event.fix(e);
                e.type = fix;
                return jQuery.event.handle.call(this, e);
            }
        });
    }

    jQuery.each(["bind", "one"], function(i, name) {
        jQuery.fn[name] = function(type, data, fn) {
            // Handle object literals
            if (typeof type === "object") {
                for (var key in type) {
                    this[name](key, data, type[key], fn);
                }
                return this;
            }

            if (jQuery.isFunction(data)) {
                fn = data;
                data = undefined;
            }

            var handler = name === "one" ? jQuery.proxy(fn, function(event) {
                jQuery(this).unbind(event, handler);
                return fn.apply(this, arguments);
            }) : fn;

            return type === "unload" && name !== "one" ?
                this.one(type, data, fn) :
                this.each(function() {
                    jQuery.event.add(this, type, handler, data);
                });
        };
    });

    jQuery.fn.extend({
        unbind: function(type, fn) {
            // Handle object literals
            if (typeof type === "object" && !type.preventDefault) {
                for (var key in type) {
                    this.unbind(key, type[key]);
                }
                return this;
            }

            return this.each(function() {
                jQuery.event.remove(this, type, fn);
            });
        },
        trigger: function(type, data) {
            return this.each(function() {
                jQuery.event.trigger(type, data, this);
            });
        },

        triggerHandler: function(type, data) {
            if (this[0]) {
                var event = jQuery.Event(type);
                event.preventDefault();
                event.stopPropagation();
                jQuery.event.trigger(event, data, this[0]);
                return event.result;
            }
        },

        toggle: function(fn) {
            // Save reference to arguments for access in closure
            var args = arguments,
                i = 1;

            // link all the functions, so any of them can unbind this click handler
            while (i < args.length) {
                jQuery.proxy(fn, args[i++]);
            }

            return this.click(jQuery.proxy(fn, function(event) {
                // Figure out which function to execute
                var lastToggle = (jQuery.data(this, "lastToggle" + fn.guid) || 0) % i;
                jQuery.data(this, "lastToggle" + fn.guid, lastToggle + 1);

                // Make sure that clicks stop
                event.preventDefault();

                // and execute the function
                return args[lastToggle].apply(this, arguments) || false;
            }));
        },

        hover: function(fnOver, fnOut) {
            return this.mouseenter(fnOver).mouseleave(fnOut || fnOver);
        }
    });

    jQuery.each(["live", "die"], function(i, name) {
        jQuery.fn[name] = function(types, data, fn) {
            var type, i = 0;

            if (jQuery.isFunction(data)) {
                fn = data;
                data = undefined;
            }

            types = (types || "").split(/\s+/);

            while ((type = types[i++]) != null) {
                type = type === "focus" ? "focusin" : // focus --> focusin
                    type === "blur" ? "focusout" : // blur --> focusout
                    type === "hover" ? types.push("mouseleave") && "mouseenter" : // hover support
                    type;

                if (name === "live") {
                    // bind live handler
                    jQuery(this.context).bind(liveConvert(type, this.selector), {
                        data: data,
                        selector: this.selector,
                        live: type
                    }, fn);

                } else {
                    // unbind live handler
                    jQuery(this.context).unbind(liveConvert(type, this.selector), fn ? { guid: fn.guid + this.selector + type } : null);
                }
            }

            return this;
        }
    });

    function liveHandler(event) {
        var stop, elems = [],
            selectors = [],
            args = arguments,
            related, match, fn, elem, j, i, l, data,
            live = jQuery.extend({}, jQuery.data(this, "events").live);

        // Make sure we avoid non-left-click bubbling in Firefox (#3861)
        if (event.button && event.type === "click") {
            return;
        }

        for (j in live) {
            fn = live[j];
            if (fn.live === event.type ||
                fn.altLive && jQuery.inArray(event.type, fn.altLive) > -1) {

                data = fn.data;
                if (!(data.beforeFilter && data.beforeFilter[event.type] &&
                        !data.beforeFilter[event.type](event))) {
                    selectors.push(fn.selector);
                }
            } else {
                delete live[j];
            }
        }

        match = jQuery(event.target).closest(selectors, event.currentTarget);

        for (i = 0, l = match.length; i < l; i++) {
            for (j in live) {
                fn = live[j];
                elem = match[i].elem;
                related = null;

                if (match[i].selector === fn.selector) {
                    // Those two events require additional checking
                    if (fn.live === "mouseenter" || fn.live === "mouseleave") {
                        related = jQuery(event.relatedTarget).closest(fn.selector)[0];
                    }

                    if (!related || related !== elem) {
                        elems.push({ elem: elem, fn: fn });
                    }
                }
            }
        }

        for (i = 0, l = elems.length; i < l; i++) {
            match = elems[i];
            event.currentTarget = match.elem;
            event.data = match.fn.data;
            if (match.fn.apply(match.elem, args) === false) {
                stop = false;
                break;
            }
        }

        return stop;
    }

    function liveConvert(type, selector) {
        return "live." + (type ? type + "." : "") + selector.replace(/\./g, "`").replace(/ /g, "&");
    }

    jQuery.each(("blur focus focusin focusout load resize scroll unload click dblclick " +
        "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
        "change select submit keydown keypress keyup error").split(" "), function(i, name) {

        // Handle event binding
        jQuery.fn[name] = function(fn) {
            return fn ? this.bind(name, fn) : this.trigger(name);
        };

        if (jQuery.attrFn) {
            jQuery.attrFn[name] = true;
        }
    });

    // Prevent memory leaks in IE
    // Window isn't included so as not to unbind existing unload events
    // More info:
    //  - http://isaacschlueter.com/2006/10/msie-memory-leaks/
    if (window.attachEvent && !window.addEventListener) {
        window.attachEvent("onunload", function() {
            for (var id in jQuery.cache) {
                if (jQuery.cache[id].handle) {
                    // Try/Catch is to handle iframes being unloaded, see #4280
                    try {
                        jQuery.event.remove(jQuery.cache[id].handle.elem);
                    } catch (e) {}
                }
            }
        });
    }
    /*!
     * Sizzle CSS Selector Engine - v1.0
     *  Copyright 2009, The Dojo Foundation
     *  Released under the MIT, BSD, and GPL Licenses.
     *  More information: http://sizzlejs.com/
     */
    (function() {

        var chunker = /((?:\((?:\([^()]+\)|[^()]+)+\)|\[(?:\[[^[\]]*\]|['"][^'"]*['"]|[^[\]'"]+)+\]|\\.|[^ >+~,(\[\\]+)+|[>+~])(\s*,\s*)?((?:.|\r|\n)*)/g,
            done = 0,
            toString = Object.prototype.toString,
            hasDuplicate = false,
            baseHasDuplicate = true;

        // Here we check if the JavaScript engine is using some sort of
        // optimization where it does not always call our comparision
        // function. If that is the case, discard the hasDuplicate value.
        //   Thus far that includes Google Chrome.
        [0, 0].sort(function() {
            baseHasDuplicate = false;
            return 0;
        });

        var Sizzle = function(selector, context, results, seed) {
            results = results || [];
            var origContext = context = context || document;

            if (context.nodeType !== 1 && context.nodeType !== 9) {
                return [];
            }

            if (!selector || typeof selector !== "string") {
                return results;
            }

            var parts = [],
                m, set, checkSet, extra, prune = true,
                contextXML = isXML(context),
                soFar = selector;

            // Reset the position of the chunker regexp (start from head)
            while ((chunker.exec(""), m = chunker.exec(soFar)) !== null) {
                soFar = m[3];

                parts.push(m[1]);

                if (m[2]) {
                    extra = m[3];
                    break;
                }
            }

            if (parts.length > 1 && origPOS.exec(selector)) {
                if (parts.length === 2 && Expr.relative[parts[0]]) {
                    set = posProcess(parts[0] + parts[1], context);
                } else {
                    set = Expr.relative[parts[0]] ? [context] :
                        Sizzle(parts.shift(), context);

                    while (parts.length) {
                        selector = parts.shift();

                        if (Expr.relative[selector]) {
                            selector += parts.shift();
                        }

                        set = posProcess(selector, set);
                    }
                }
            } else {
                // Take a shortcut and set the context if the root selector is an ID
                // (but not if it'll be faster if the inner selector is an ID)
                if (!seed && parts.length > 1 && context.nodeType === 9 && !contextXML &&
                    Expr.match.ID.test(parts[0]) && !Expr.match.ID.test(parts[parts.length - 1])) {
                    var ret = Sizzle.find(parts.shift(), context, contextXML);
                    context = ret.expr ? Sizzle.filter(ret.expr, ret.set)[0] : ret.set[0];
                }

                if (context) {
                    var ret = seed ? { expr: parts.pop(), set: makeArray(seed) } :
                        Sizzle.find(parts.pop(), parts.length === 1 && (parts[0] === "~" || parts[0] === "+") && context.parentNode ? context.parentNode : context, contextXML);
                    set = ret.expr ? Sizzle.filter(ret.expr, ret.set) : ret.set;

                    if (parts.length > 0) {
                        checkSet = makeArray(set);
                    } else {
                        prune = false;
                    }

                    while (parts.length) {
                        var cur = parts.pop(),
                            pop = cur;

                        if (!Expr.relative[cur]) {
                            cur = "";
                        } else {
                            pop = parts.pop();
                        }

                        if (pop == null) {
                            pop = context;
                        }

                        Expr.relative[cur](checkSet, pop, contextXML);
                    }
                } else {
                    checkSet = parts = [];
                }
            }

            if (!checkSet) {
                checkSet = set;
            }

            if (!checkSet) {
                Sizzle.error(cur || selector);
            }

            if (toString.call(checkSet) === "[object Array]") {
                if (!prune) {
                    results.push.apply(results, checkSet);
                } else if (context && context.nodeType === 1) {
                    for (var i = 0; checkSet[i] != null; i++) {
                        if (checkSet[i] && (checkSet[i] === true || checkSet[i].nodeType === 1 && contains(context, checkSet[i]))) {
                            results.push(set[i]);
                        }
                    }
                } else {
                    for (var i = 0; checkSet[i] != null; i++) {
                        if (checkSet[i] && checkSet[i].nodeType === 1) {
                            results.push(set[i]);
                        }
                    }
                }
            } else {
                makeArray(checkSet, results);
            }

            if (extra) {
                Sizzle(extra, origContext, results, seed);
                Sizzle.uniqueSort(results);
            }

            return results;
        };

        Sizzle.uniqueSort = function(results) {
            if (sortOrder) {
                hasDuplicate = baseHasDuplicate;
                results.sort(sortOrder);

                if (hasDuplicate) {
                    for (var i = 1; i < results.length; i++) {
                        if (results[i] === results[i - 1]) {
                            results.splice(i--, 1);
                        }
                    }
                }
            }

            return results;
        };

        Sizzle.matches = function(expr, set) {
            return Sizzle(expr, null, null, set);
        };

        Sizzle.find = function(expr, context, isXML) {
            var set, match;

            if (!expr) {
                return [];
            }

            for (var i = 0, l = Expr.order.length; i < l; i++) {
                var type = Expr.order[i],
                    match;

                if ((match = Expr.leftMatch[type].exec(expr))) {
                    var left = match[1];
                    match.splice(1, 1);

                    if (left.substr(left.length - 1) !== "\\") {
                        match[1] = (match[1] || "").replace(/\\/g, "");
                        set = Expr.find[type](match, context, isXML);
                        if (set != null) {
                            expr = expr.replace(Expr.match[type], "");
                            break;
                        }
                    }
                }
            }

            if (!set) {
                set = context.getElementsByTagName("*");
            }

            return { set: set, expr: expr };
        };

        Sizzle.filter = function(expr, set, inplace, not) {
            var old = expr,
                result = [],
                curLoop = set,
                match, anyFound,
                isXMLFilter = set && set[0] && isXML(set[0]);

            while (expr && set.length) {
                for (var type in Expr.filter) {
                    if ((match = Expr.leftMatch[type].exec(expr)) != null && match[2]) {
                        var filter = Expr.filter[type],
                            found, item, left = match[1];
                        anyFound = false;

                        match.splice(1, 1);

                        if (left.substr(left.length - 1) === "\\") {
                            continue;
                        }

                        if (curLoop === result) {
                            result = [];
                        }

                        if (Expr.preFilter[type]) {
                            match = Expr.preFilter[type](match, curLoop, inplace, result, not, isXMLFilter);

                            if (!match) {
                                anyFound = found = true;
                            } else if (match === true) {
                                continue;
                            }
                        }

                        if (match) {
                            for (var i = 0;
                                (item = curLoop[i]) != null; i++) {
                                if (item) {
                                    found = filter(item, match, i, curLoop);
                                    var pass = not ^ !!found;

                                    if (inplace && found != null) {
                                        if (pass) {
                                            anyFound = true;
                                        } else {
                                            curLoop[i] = false;
                                        }
                                    } else if (pass) {
                                        result.push(item);
                                        anyFound = true;
                                    }
                                }
                            }
                        }

                        if (found !== undefined) {
                            if (!inplace) {
                                curLoop = result;
                            }

                            expr = expr.replace(Expr.match[type], "");

                            if (!anyFound) {
                                return [];
                            }

                            break;
                        }
                    }
                }

                // Improper expression
                if (expr === old) {
                    if (anyFound == null) {
                        Sizzle.error(expr);
                    } else {
                        break;
                    }
                }

                old = expr;
            }

            return curLoop;
        };

        Sizzle.error = function(msg) {
            throw "Syntax error, unrecognized expression: " + msg;
        };

        var Expr = Sizzle.selectors = {
            order: ["ID", "NAME", "TAG"],
            match: {
                ID: /#((?:[\w\u00c0-\uFFFF-]|\\.)+)/,
                CLASS: /\.((?:[\w\u00c0-\uFFFF-]|\\.)+)/,
                NAME: /\[name=['"]*((?:[\w\u00c0-\uFFFF-]|\\.)+)['"]*\]/,
                ATTR: /\[\s*((?:[\w\u00c0-\uFFFF-]|\\.)+)\s*(?:(\S?=)\s*(['"]*)(.*?)\3|)\s*\]/,
                TAG: /^((?:[\w\u00c0-\uFFFF\*-]|\\.)+)/,
                CHILD: /:(only|nth|last|first)-child(?:\((even|odd|[\dn+-]*)\))?/,
                POS: /:(nth|eq|gt|lt|first|last|even|odd)(?:\((\d*)\))?(?=[^-]|$)/,
                PSEUDO: /:((?:[\w\u00c0-\uFFFF-]|\\.)+)(?:\((['"]?)((?:\([^\)]+\)|[^\(\)]*)+)\2\))?/
            },
            leftMatch: {},
            attrMap: {
                "class": "className",
                "for": "htmlFor"
            },
            attrHandle: {
                href: function(elem) {
                    return elem.getAttribute("href");
                }
            },
            relative: {
                "+": function(checkSet, part) {
                    var isPartStr = typeof part === "string",
                        isTag = isPartStr && !/\W/.test(part),
                        isPartStrNotTag = isPartStr && !isTag;

                    if (isTag) {
                        part = part.toLowerCase();
                    }

                    for (var i = 0, l = checkSet.length, elem; i < l; i++) {
                        if ((elem = checkSet[i])) {
                            while ((elem = elem.previousSibling) && elem.nodeType !== 1) {}

                            checkSet[i] = isPartStrNotTag || elem && elem.nodeName.toLowerCase() === part ?
                                elem || false :
                                elem === part;
                        }
                    }

                    if (isPartStrNotTag) {
                        Sizzle.filter(part, checkSet, true);
                    }
                },
                ">": function(checkSet, part) {
                    var isPartStr = typeof part === "string";

                    if (isPartStr && !/\W/.test(part)) {
                        part = part.toLowerCase();

                        for (var i = 0, l = checkSet.length; i < l; i++) {
                            var elem = checkSet[i];
                            if (elem) {
                                var parent = elem.parentNode;
                                checkSet[i] = parent.nodeName.toLowerCase() === part ? parent : false;
                            }
                        }
                    } else {
                        for (var i = 0, l = checkSet.length; i < l; i++) {
                            var elem = checkSet[i];
                            if (elem) {
                                checkSet[i] = isPartStr ?
                                    elem.parentNode :
                                    elem.parentNode === part;
                            }
                        }

                        if (isPartStr) {
                            Sizzle.filter(part, checkSet, true);
                        }
                    }
                },
                "": function(checkSet, part, isXML) {
                    var doneName = done++,
                        checkFn = dirCheck;

                    if (typeof part === "string" && !/\W/.test(part)) {
                        var nodeCheck = part = part.toLowerCase();
                        checkFn = dirNodeCheck;
                    }

                    checkFn("parentNode", part, doneName, checkSet, nodeCheck, isXML);
                },
                "~": function(checkSet, part, isXML) {
                    var doneName = done++,
                        checkFn = dirCheck;

                    if (typeof part === "string" && !/\W/.test(part)) {
                        var nodeCheck = part = part.toLowerCase();
                        checkFn = dirNodeCheck;
                    }

                    checkFn("previousSibling", part, doneName, checkSet, nodeCheck, isXML);
                }
            },
            find: {
                ID: function(match, context, isXML) {
                    if (typeof context.getElementById !== "undefined" && !isXML) {
                        var m = context.getElementById(match[1]);
                        return m ? [m] : [];
                    }
                },
                NAME: function(match, context) {
                    if (typeof context.getElementsByName !== "undefined") {
                        var ret = [],
                            results = context.getElementsByName(match[1]);

                        for (var i = 0, l = results.length; i < l; i++) {
                            if (results[i].getAttribute("name") === match[1]) {
                                ret.push(results[i]);
                            }
                        }

                        return ret.length === 0 ? null : ret;
                    }
                },
                TAG: function(match, context) {
                    return context.getElementsByTagName(match[1]);
                }
            },
            preFilter: {
                CLASS: function(match, curLoop, inplace, result, not, isXML) {
                    match = " " + match[1].replace(/\\/g, "") + " ";

                    if (isXML) {
                        return match;
                    }

                    for (var i = 0, elem;
                        (elem = curLoop[i]) != null; i++) {
                        if (elem) {
                            if (not ^ (elem.className && (" " + elem.className + " ").replace(/[\t\n]/g, " ").indexOf(match) >= 0)) {
                                if (!inplace) {
                                    result.push(elem);
                                }
                            } else if (inplace) {
                                curLoop[i] = false;
                            }
                        }
                    }

                    return false;
                },
                ID: function(match) {
                    return match[1].replace(/\\/g, "");
                },
                TAG: function(match, curLoop) {
                    return match[1].toLowerCase();
                },
                CHILD: function(match) {
                    if (match[1] === "nth") {
                        // parse equations like 'even', 'odd', '5', '2n', '3n+2', '4n-1', '-n+6'
                        var test = /(-?)(\d*)n((?:\+|-)?\d*)/.exec(
                            match[2] === "even" && "2n" || match[2] === "odd" && "2n+1" ||
                            !/\D/.test(match[2]) && "0n+" + match[2] || match[2]);

                        // calculate the numbers (first)n+(last) including if they are negative
                        match[2] = (test[1] + (test[2] || 1)) - 0;
                        match[3] = test[3] - 0;
                    }

                    // TODO: Move to normal caching system
                    match[0] = done++;

                    return match;
                },
                ATTR: function(match, curLoop, inplace, result, not, isXML) {
                    var name = match[1].replace(/\\/g, "");

                    if (!isXML && Expr.attrMap[name]) {
                        match[1] = Expr.attrMap[name];
                    }

                    if (match[2] === "~=") {
                        match[4] = " " + match[4] + " ";
                    }

                    return match;
                },
                PSEUDO: function(match, curLoop, inplace, result, not) {
                    if (match[1] === "not") {
                        // If we're dealing with a complex expression, or a simple one
                        if ((chunker.exec(match[3]) || "").length > 1 || /^\w/.test(match[3])) {
                            match[3] = Sizzle(match[3], null, null, curLoop);
                        } else {
                            var ret = Sizzle.filter(match[3], curLoop, inplace, true ^ not);
                            if (!inplace) {
                                result.push.apply(result, ret);
                            }
                            return false;
                        }
                    } else if (Expr.match.POS.test(match[0]) || Expr.match.CHILD.test(match[0])) {
                        return true;
                    }

                    return match;
                },
                POS: function(match) {
                    match.unshift(true);
                    return match;
                }
            },
            filters: {
                enabled: function(elem) {
                    return elem.disabled === false && elem.type !== "hidden";
                },
                disabled: function(elem) {
                    return elem.disabled === true;
                },
                checked: function(elem) {
                    return elem.checked === true;
                },
                selected: function(elem) {
                    // Accessing this property makes selected-by-default
                    // options in Safari work properly
                    elem.parentNode.selectedIndex;
                    return elem.selected === true;
                },
                parent: function(elem) {
                    return !!elem.firstChild;
                },
                empty: function(elem) {
                    return !elem.firstChild;
                },
                has: function(elem, i, match) {
                    return !!Sizzle(match[3], elem).length;
                },
                header: function(elem) {
                    return /h\d/i.test(elem.nodeName);
                },
                text: function(elem) {
                    return "text" === elem.type;
                },
                radio: function(elem) {
                    return "radio" === elem.type;
                },
                checkbox: function(elem) {
                    return "checkbox" === elem.type;
                },
                file: function(elem) {
                    return "file" === elem.type;
                },
                password: function(elem) {
                    return "password" === elem.type;
                },
                submit: function(elem) {
                    return "submit" === elem.type;
                },
                image: function(elem) {
                    return "image" === elem.type;
                },
                reset: function(elem) {
                    return "reset" === elem.type;
                },
                button: function(elem) {
                    return "button" === elem.type || elem.nodeName.toLowerCase() === "button";
                },
                input: function(elem) {
                    return /input|select|textarea|button/i.test(elem.nodeName);
                }
            },
            setFilters: {
                first: function(elem, i) {
                    return i === 0;
                },
                last: function(elem, i, match, array) {
                    return i === array.length - 1;
                },
                even: function(elem, i) {
                    return i % 2 === 0;
                },
                odd: function(elem, i) {
                    return i % 2 === 1;
                },
                lt: function(elem, i, match) {
                    return i < match[3] - 0;
                },
                gt: function(elem, i, match) {
                    return i > match[3] - 0;
                },
                nth: function(elem, i, match) {
                    return match[3] - 0 === i;
                },
                eq: function(elem, i, match) {
                    return match[3] - 0 === i;
                }
            },
            filter: {
                PSEUDO: function(elem, match, i, array) {
                    var name = match[1],
                        filter = Expr.filters[name];

                    if (filter) {
                        return filter(elem, i, match, array);
                    } else if (name === "contains") {
                        return (elem.textContent || elem.innerText || getText([elem]) || "").indexOf(match[3]) >= 0;
                    } else if (name === "not") {
                        var not = match[3];

                        for (var i = 0, l = not.length; i < l; i++) {
                            if (not[i] === elem) {
                                return false;
                            }
                        }

                        return true;
                    } else {
                        Sizzle.error("Syntax error, unrecognized expression: " + name);
                    }
                },
                CHILD: function(elem, match) {
                    var type = match[1],
                        node = elem;
                    switch (type) {
                        case 'only':
                        case 'first':
                            while ((node = node.previousSibling)) {
                                if (node.nodeType === 1) {
                                    return false;
                                }
                            }
                            if (type === "first") {
                                return true;
                            }
                            node = elem;
                        case 'last':
                            while ((node = node.nextSibling)) {
                                if (node.nodeType === 1) {
                                    return false;
                                }
                            }
                            return true;
                        case 'nth':
                            var first = match[2],
                                last = match[3];

                            if (first === 1 && last === 0) {
                                return true;
                            }

                            var doneName = match[0],
                                parent = elem.parentNode;

                            if (parent && (parent.sizcache !== doneName || !elem.nodeIndex)) {
                                var count = 0;
                                for (node = parent.firstChild; node; node = node.nextSibling) {
                                    if (node.nodeType === 1) {
                                        node.nodeIndex = ++count;
                                    }
                                }
                                parent.sizcache = doneName;
                            }

                            var diff = elem.nodeIndex - last;
                            if (first === 0) {
                                return diff === 0;
                            } else {
                                return (diff % first === 0 && diff / first >= 0);
                            }
                    }
                },
                ID: function(elem, match) {
                    return elem.nodeType === 1 && elem.getAttribute("id") === match;
                },
                TAG: function(elem, match) {
                    return (match === "*" && elem.nodeType === 1) || elem.nodeName.toLowerCase() === match;
                },
                CLASS: function(elem, match) {
                    return (" " + (elem.className || elem.getAttribute("class")) + " ")
                        .indexOf(match) > -1;
                },
                ATTR: function(elem, match) {
                    var name = match[1],
                        result = Expr.attrHandle[name] ?
                        Expr.attrHandle[name](elem) :
                        elem[name] != null ?
                        elem[name] :
                        elem.getAttribute(name),
                        value = result + "",
                        type = match[2],
                        check = match[4];

                    return result == null ?
                        type === "!=" :
                        type === "=" ?
                        value === check :
                        type === "*=" ?
                        value.indexOf(check) >= 0 :
                        type === "~=" ?
                        (" " + value + " ").indexOf(check) >= 0 :
                        !check ?
                        value && result !== false :
                        type === "!=" ?
                        value !== check :
                        type === "^=" ?
                        value.indexOf(check) === 0 :
                        type === "$=" ?
                        value.substr(value.length - check.length) === check :
                        type === "|=" ?
                        value === check || value.substr(0, check.length + 1) === check + "-" :
                        false;
                },
                POS: function(elem, match, i, array) {
                    var name = match[2],
                        filter = Expr.setFilters[name];

                    if (filter) {
                        return filter(elem, i, match, array);
                    }
                }
            }
        };

        var origPOS = Expr.match.POS;

        for (var type in Expr.match) {
            Expr.match[type] = new RegExp(Expr.match[type].source + /(?![^\[]*\])(?![^\(]*\))/.source);
            Expr.leftMatch[type] = new RegExp(/(^(?:.|\r|\n)*?)/.source + Expr.match[type].source.replace(/\\(\d+)/g, function(all, num) {
                return "\\" + (num - 0 + 1);
            }));
        }

        var makeArray = function(array, results) {
            array = Array.prototype.slice.call(array, 0);

            if (results) {
                results.push.apply(results, array);
                return results;
            }

            return array;
        };

        // Perform a simple check to determine if the browser is capable of
        // converting a NodeList to an array using builtin methods.
        try {
            Array.prototype.slice.call(document.documentElement.childNodes, 0);

            // Provide a fallback method if it does not work
        } catch (e) {
            makeArray = function(array, results) {
                var ret = results || [];

                if (toString.call(array) === "[object Array]") {
                    Array.prototype.push.apply(ret, array);
                } else {
                    if (typeof array.length === "number") {
                        for (var i = 0, l = array.length; i < l; i++) {
                            ret.push(array[i]);
                        }
                    } else {
                        for (var i = 0; array[i]; i++) {
                            ret.push(array[i]);
                        }
                    }
                }

                return ret;
            };
        }

        var sortOrder;

        if (document.documentElement.compareDocumentPosition) {
            sortOrder = function(a, b) {
                if (!a.compareDocumentPosition || !b.compareDocumentPosition) {
                    if (a == b) {
                        hasDuplicate = true;
                    }
                    return a.compareDocumentPosition ? -1 : 1;
                }

                var ret = a.compareDocumentPosition(b) & 4 ? -1 : a === b ? 0 : 1;
                if (ret === 0) {
                    hasDuplicate = true;
                }
                return ret;
            };
        } else if ("sourceIndex" in document.documentElement) {
            sortOrder = function(a, b) {
                if (!a.sourceIndex || !b.sourceIndex) {
                    if (a == b) {
                        hasDuplicate = true;
                    }
                    return a.sourceIndex ? -1 : 1;
                }

                var ret = a.sourceIndex - b.sourceIndex;
                if (ret === 0) {
                    hasDuplicate = true;
                }
                return ret;
            };
        } else if (document.createRange) {
            sortOrder = function(a, b) {
                if (!a.ownerDocument || !b.ownerDocument) {
                    if (a == b) {
                        hasDuplicate = true;
                    }
                    return a.ownerDocument ? -1 : 1;
                }

                var aRange = a.ownerDocument.createRange(),
                    bRange = b.ownerDocument.createRange();
                aRange.setStart(a, 0);
                aRange.setEnd(a, 0);
                bRange.setStart(b, 0);
                bRange.setEnd(b, 0);
                var ret = aRange.compareBoundaryPoints(Range.START_TO_END, bRange);
                if (ret === 0) {
                    hasDuplicate = true;
                }
                return ret;
            };
        }

        // Utility function for retreiving the text value of an array of DOM nodes
        function getText(elems) {
            var ret = "",
                elem;

            for (var i = 0; elems[i]; i++) {
                elem = elems[i];

                // Get the text from text nodes and CDATA nodes
                if (elem.nodeType === 3 || elem.nodeType === 4) {
                    ret += elem.nodeValue;

                    // Traverse everything else, except comment nodes
                } else if (elem.nodeType !== 8) {
                    ret += getText(elem.childNodes);
                }
            }

            return ret;
        }

        // Check to see if the browser returns elements by name when
        // querying by getElementById (and provide a workaround)
        (function() {
            // We're going to inject a fake input element with a specified name
            var form = document.createElement("div"),
                id = "script" + (new Date).getTime();
            form.innerHTML = "<a name='" + id + "'/>";

            // Inject it into the root element, check its status, and remove it quickly
            var root = document.documentElement;
            root.insertBefore(form, root.firstChild);

            // The workaround has to do additional checks after a getElementById
            // Which slows things down for other browsers (hence the branching)
            if (document.getElementById(id)) {
                Expr.find.ID = function(match, context, isXML) {
                    if (typeof context.getElementById !== "undefined" && !isXML) {
                        var m = context.getElementById(match[1]);
                        return m ? m.id === match[1] || typeof m.getAttributeNode !== "undefined" && m.getAttributeNode("id").nodeValue === match[1] ? [m] : undefined : [];
                    }
                };

                Expr.filter.ID = function(elem, match) {
                    var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
                    return elem.nodeType === 1 && node && node.nodeValue === match;
                };
            }

            root.removeChild(form);
            root = form = null; // release memory in IE
        })();

        (function() {
            // Check to see if the browser returns only elements
            // when doing getElementsByTagName("*")

            // Create a fake element
            var div = document.createElement("div");
            div.appendChild(document.createComment(""));

            // Make sure no comments are found
            if (div.getElementsByTagName("*").length > 0) {
                Expr.find.TAG = function(match, context) {
                    var results = context.getElementsByTagName(match[1]);

                    // Filter out possible comments
                    if (match[1] === "*") {
                        var tmp = [];

                        for (var i = 0; results[i]; i++) {
                            if (results[i].nodeType === 1) {
                                tmp.push(results[i]);
                            }
                        }

                        results = tmp;
                    }

                    return results;
                };
            }

            // Check to see if an attribute returns normalized href attributes
            div.innerHTML = "<a href='#'></a>";
            if (div.firstChild && typeof div.firstChild.getAttribute !== "undefined" &&
                div.firstChild.getAttribute("href") !== "#") {
                Expr.attrHandle.href = function(elem) {
                    return elem.getAttribute("href", 2);
                };
            }

            div = null; // release memory in IE
        })();

        if (document.querySelectorAll) {
            (function() {
                var oldSizzle = Sizzle,
                    div = document.createElement("div");
                div.innerHTML = "<p class='TEST'></p>";

                // Safari can't handle uppercase or unicode characters when
                // in quirks mode.
                if (div.querySelectorAll && div.querySelectorAll(".TEST").length === 0) {
                    return;
                }

                Sizzle = function(query, context, extra, seed) {
                    context = context || document;

                    // Only use querySelectorAll on non-XML documents
                    // (ID selectors don't work in non-HTML documents)
                    if (!seed && context.nodeType === 9 && !isXML(context)) {
                        try {
                            return makeArray(context.querySelectorAll(query), extra);
                        } catch (e) {}
                    }

                    return oldSizzle(query, context, extra, seed);
                };

                for (var prop in oldSizzle) {
                    Sizzle[prop] = oldSizzle[prop];
                }

                div = null; // release memory in IE
            })();
        }

        (function() {
            var div = document.createElement("div");

            div.innerHTML = "<div class='test e'></div><div class='test'></div>";

            // Opera can't find a second classname (in 9.6)
            // Also, make sure that getElementsByClassName actually exists
            if (!div.getElementsByClassName || div.getElementsByClassName("e").length === 0) {
                return;
            }

            // Safari caches class attributes, doesn't catch changes (in 3.2)
            div.lastChild.className = "e";

            if (div.getElementsByClassName("e").length === 1) {
                return;
            }

            Expr.order.splice(1, 0, "CLASS");
            Expr.find.CLASS = function(match, context, isXML) {
                if (typeof context.getElementsByClassName !== "undefined" && !isXML) {
                    return context.getElementsByClassName(match[1]);
                }
            };

            div = null; // release memory in IE
        })();

        function dirNodeCheck(dir, cur, doneName, checkSet, nodeCheck, isXML) {
            for (var i = 0, l = checkSet.length; i < l; i++) {
                var elem = checkSet[i];
                if (elem) {
                    elem = elem[dir];
                    var match = false;

                    while (elem) {
                        if (elem.sizcache === doneName) {
                            match = checkSet[elem.sizset];
                            break;
                        }

                        if (elem.nodeType === 1 && !isXML) {
                            elem.sizcache = doneName;
                            elem.sizset = i;
                        }

                        if (elem.nodeName.toLowerCase() === cur) {
                            match = elem;
                            break;
                        }

                        elem = elem[dir];
                    }

                    checkSet[i] = match;
                }
            }
        }

        function dirCheck(dir, cur, doneName, checkSet, nodeCheck, isXML) {
            for (var i = 0, l = checkSet.length; i < l; i++) {
                var elem = checkSet[i];
                if (elem) {
                    elem = elem[dir];
                    var match = false;

                    while (elem) {
                        if (elem.sizcache === doneName) {
                            match = checkSet[elem.sizset];
                            break;
                        }

                        if (elem.nodeType === 1) {
                            if (!isXML) {
                                elem.sizcache = doneName;
                                elem.sizset = i;
                            }
                            if (typeof cur !== "string") {
                                if (elem === cur) {
                                    match = true;
                                    break;
                                }

                            } else if (Sizzle.filter(cur, [elem]).length > 0) {
                                match = elem;
                                break;
                            }
                        }

                        elem = elem[dir];
                    }

                    checkSet[i] = match;
                }
            }
        }

        var contains = document.compareDocumentPosition ? function(a, b) {
            return a.compareDocumentPosition(b) & 16;
        } : function(a, b) {
            return a !== b && (a.contains ? a.contains(b) : true);
        };

        var isXML = function(elem) {
            // documentElement is verified for cases where it doesn't yet exist
            // (such as loading iframes in IE - #4833) 
            var documentElement = (elem ? elem.ownerDocument || elem : 0).documentElement;
            return documentElement ? documentElement.nodeName !== "HTML" : false;
        };

        var posProcess = function(selector, context) {
            var tmpSet = [],
                later = "",
                match,
                root = context.nodeType ? [context] : context;

            // Position selectors must be done after the filter
            // And so must :not(positional) so we move all PSEUDOs to the end
            while ((match = Expr.match.PSEUDO.exec(selector))) {
                later += match[0];
                selector = selector.replace(Expr.match.PSEUDO, "");
            }

            selector = Expr.relative[selector] ? selector + "*" : selector;

            for (var i = 0, l = root.length; i < l; i++) {
                Sizzle(selector, root[i], tmpSet);
            }

            return Sizzle.filter(later, tmpSet);
        };

        // EXPOSE
        jQuery.find = Sizzle;
        jQuery.expr = Sizzle.selectors;
        jQuery.expr[":"] = jQuery.expr.filters;
        jQuery.unique = Sizzle.uniqueSort;
        jQuery.getText = getText;
        jQuery.isXMLDoc = isXML;
        jQuery.contains = contains;

        return;

        window.Sizzle = Sizzle;

    })();
    var runtil = /Until$/,
        rparentsprev = /^(?:parents|prevUntil|prevAll)/,
        // Note: This RegExp should be improved, or likely pulled from Sizzle
        rmultiselector = /,/,
        slice = Array.prototype.slice;

    // Implement the identical functionality for filter and not
    var winnow = function(elements, qualifier, keep) {
        if (jQuery.isFunction(qualifier)) {
            return jQuery.grep(elements, function(elem, i) {
                return !!qualifier.call(elem, i, elem) === keep;
            });

        } else if (qualifier.nodeType) {
            return jQuery.grep(elements, function(elem, i) {
                return (elem === qualifier) === keep;
            });

        } else if (typeof qualifier === "string") {
            var filtered = jQuery.grep(elements, function(elem) {
                return elem.nodeType === 1;
            });

            if (isSimple.test(qualifier)) {
                return jQuery.filter(qualifier, filtered, !keep);
            } else {
                qualifier = jQuery.filter(qualifier, filtered);
            }
        }

        return jQuery.grep(elements, function(elem, i) {
            return (jQuery.inArray(elem, qualifier) >= 0) === keep;
        });
    };

    jQuery.fn.extend({
        find: function(selector) {
            var ret = this.pushStack("", "find", selector),
                length = 0;

            for (var i = 0, l = this.length; i < l; i++) {
                length = ret.length;
                jQuery.find(selector, this[i], ret);

                if (i > 0) {
                    // Make sure that the results are unique
                    for (var n = length; n < ret.length; n++) {
                        for (var r = 0; r < length; r++) {
                            if (ret[r] === ret[n]) {
                                ret.splice(n--, 1);
                                break;
                            }
                        }
                    }
                }
            }

            return ret;
        },

        has: function(target) {
            var targets = jQuery(target);
            return this.filter(function() {
                for (var i = 0, l = targets.length; i < l; i++) {
                    if (jQuery.contains(this, targets[i])) {
                        return true;
                    }
                }
            });
        },

        not: function(selector) {
            return this.pushStack(winnow(this, selector, false), "not", selector);
        },

        filter: function(selector) {
            return this.pushStack(winnow(this, selector, true), "filter", selector);
        },

        is: function(selector) {
            return !!selector && jQuery.filter(selector, this).length > 0;
        },

        closest: function(selectors, context) {
            if (jQuery.isArray(selectors)) {
                var ret = [],
                    cur = this[0],
                    match, matches = {},
                    selector;

                if (cur && selectors.length) {
                    for (var i = 0, l = selectors.length; i < l; i++) {
                        selector = selectors[i];

                        if (!matches[selector]) {
                            matches[selector] = jQuery.expr.match.POS.test(selector) ?
                                jQuery(selector, context || this.context) :
                                selector;
                        }
                    }

                    while (cur && cur.ownerDocument && cur !== context) {
                        for (selector in matches) {
                            match = matches[selector];

                            if (match.jquery ? match.index(cur) > -1 : jQuery(cur).is(match)) {
                                ret.push({ selector: selector, elem: cur });
                                delete matches[selector];
                            }
                        }
                        cur = cur.parentNode;
                    }
                }

                return ret;
            }

            var pos = jQuery.expr.match.POS.test(selectors) ?
                jQuery(selectors, context || this.context) : null;

            return this.map(function(i, cur) {
                while (cur && cur.ownerDocument && cur !== context) {
                    if (pos ? pos.index(cur) > -1 : jQuery(cur).is(selectors)) {
                        return cur;
                    }
                    cur = cur.parentNode;
                }
                return null;
            });
        },

        // Determine the position of an element within
        // the matched set of elements
        index: function(elem) {
            if (!elem || typeof elem === "string") {
                return jQuery.inArray(this[0],
                    // If it receives a string, the selector is used
                    // If it receives nothing, the siblings are used
                    elem ? jQuery(elem) : this.parent().children());
            }
            // Locate the position of the desired element
            return jQuery.inArray(
                // If it receives a jQuery object, the first element is used
                elem.jquery ? elem[0] : elem, this);
        },

        add: function(selector, context) {
            var set = typeof selector === "string" ?
                jQuery(selector, context || this.context) :
                jQuery.makeArray(selector),
                all = jQuery.merge(this.get(), set);

            return this.pushStack(isDisconnected(set[0]) || isDisconnected(all[0]) ?
                all :
                jQuery.unique(all));
        },

        andSelf: function() {
            return this.add(this.prevObject);
        }
    });

    // A painfully simple check to see if an element is disconnected
    // from a document (should be improved, where feasible).
    function isDisconnected(node) {
        return !node || !node.parentNode || node.parentNode.nodeType === 11;
    }

    jQuery.each({
        parent: function(elem) {
            var parent = elem.parentNode;
            return parent && parent.nodeType !== 11 ? parent : null;
        },
        parents: function(elem) {
            return jQuery.dir(elem, "parentNode");
        },
        parentsUntil: function(elem, i, until) {
            return jQuery.dir(elem, "parentNode", until);
        },
        next: function(elem) {
            return jQuery.nth(elem, 2, "nextSibling");
        },
        prev: function(elem) {
            return jQuery.nth(elem, 2, "previousSibling");
        },
        nextAll: function(elem) {
            return jQuery.dir(elem, "nextSibling");
        },
        prevAll: function(elem) {
            return jQuery.dir(elem, "previousSibling");
        },
        nextUntil: function(elem, i, until) {
            return jQuery.dir(elem, "nextSibling", until);
        },
        prevUntil: function(elem, i, until) {
            return jQuery.dir(elem, "previousSibling", until);
        },
        siblings: function(elem) {
            return jQuery.sibling(elem.parentNode.firstChild, elem);
        },
        children: function(elem) {
            return jQuery.sibling(elem.firstChild);
        },
        contents: function(elem) {
            return jQuery.nodeName(elem, "iframe") ?
                elem.contentDocument || elem.contentWindow.document :
                jQuery.makeArray(elem.childNodes);
        }
    }, function(name, fn) {
        jQuery.fn[name] = function(until, selector) {
            var ret = jQuery.map(this, fn, until);

            if (!runtil.test(name)) {
                selector = until;
            }

            if (selector && typeof selector === "string") {
                ret = jQuery.filter(selector, ret);
            }

            ret = this.length > 1 ? jQuery.unique(ret) : ret;

            if ((this.length > 1 || rmultiselector.test(selector)) && rparentsprev.test(name)) {
                ret = ret.reverse();
            }

            return this.pushStack(ret, name, slice.call(arguments).join(","));
        };
    });

    jQuery.extend({
        filter: function(expr, elems, not) {
            if (not) {
                expr = ":not(" + expr + ")";
            }

            return jQuery.find.matches(expr, elems);
        },

        dir: function(elem, dir, until) {
            var matched = [],
                cur = elem[dir];
            while (cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery(cur).is(until))) {
                if (cur.nodeType === 1) {
                    matched.push(cur);
                }
                cur = cur[dir];
            }
            return matched;
        },

        nth: function(cur, result, dir, elem) {
            result = result || 1;
            var num = 0;

            for (; cur; cur = cur[dir]) {
                if (cur.nodeType === 1 && ++num === result) {
                    break;
                }
            }

            return cur;
        },

        sibling: function(n, elem) {
            var r = [];

            for (; n; n = n.nextSibling) {
                if (n.nodeType === 1 && n !== elem) {
                    r.push(n);
                }
            }

            return r;
        }
    });
    var rinlinejQuery = / jQuery\d+="(?:\d+|null)"/g,
        rleadingWhitespace = /^\s+/,
        rxhtmlTag = /(<([\w:]+)[^>]*?)\/>/g,
        rselfClosing = /^(?:area|br|col|embed|hr|img|input|link|meta|param)$/i,
        rtagName = /<([\w:]+)/,
        rtbody = /<tbody/i,
        rhtml = /<|&\w+;/,
        rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i, // checked="checked" or checked (html5)
        fcloseTag = function(all, front, tag) {
            return rselfClosing.test(tag) ?
                all :
                front + "></" + tag + ">";
        },
        wrapMap = {
            option: [1, "<select multiple='multiple'>", "</select>"],
            legend: [1, "<fieldset>", "</fieldset>"],
            thead: [1, "<table>", "</table>"],
            tr: [2, "<table><tbody>", "</tbody></table>"],
            td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
            col: [2, "<table><tbody></tbody><colgroup>", "</colgroup></table>"],
            area: [1, "<map>", "</map>"],
            _default: [0, "", ""]
        };

    wrapMap.optgroup = wrapMap.option;
    wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
    wrapMap.th = wrapMap.td;

    // IE can't serialize <link> and <script> tags normally
    if (!jQuery.support.htmlSerialize) {
        wrapMap._default = [1, "div<div>", "</div>"];
    }

    jQuery.fn.extend({
        text: function(text) {
            if (jQuery.isFunction(text)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    self.text(text.call(this, i, self.text()));
                });
            }

            if (typeof text !== "object" && text !== undefined) {
                return this.empty().append((this[0] && this[0].ownerDocument || document).createTextNode(text));
            }

            return jQuery.getText(this);
        },

        wrapAll: function(html) {
            if (jQuery.isFunction(html)) {
                return this.each(function(i) {
                    jQuery(this).wrapAll(html.call(this, i));
                });
            }

            if (this[0]) {
                // The elements to wrap the target around
                var wrap = jQuery(html, this[0].ownerDocument).eq(0).clone(true);

                if (this[0].parentNode) {
                    wrap.insertBefore(this[0]);
                }

                wrap.map(function() {
                    var elem = this;

                    while (elem.firstChild && elem.firstChild.nodeType === 1) {
                        elem = elem.firstChild;
                    }

                    return elem;
                }).append(this);
            }

            return this;
        },

        wrapInner: function(html) {
            if (jQuery.isFunction(html)) {
                return this.each(function(i) {
                    jQuery(this).wrapInner(html.call(this, i));
                });
            }

            return this.each(function() {
                var self = jQuery(this),
                    contents = self.contents();

                if (contents.length) {
                    contents.wrapAll(html);

                } else {
                    self.append(html);
                }
            });
        },

        wrap: function(html) {
            return this.each(function() {
                jQuery(this).wrapAll(html);
            });
        },

        unwrap: function() {
            return this.parent().each(function() {
                if (!jQuery.nodeName(this, "body")) {
                    jQuery(this).replaceWith(this.childNodes);
                }
            }).end();
        },

        append: function() {
            return this.domManip(arguments, true, function(elem) {
                if (this.nodeType === 1) {
                    this.appendChild(elem);
                }
            });
        },

        prepend: function() {
            return this.domManip(arguments, true, function(elem) {
                if (this.nodeType === 1) {
                    this.insertBefore(elem, this.firstChild);
                }
            });
        },

        before: function() {
            if (this[0] && this[0].parentNode) {
                return this.domManip(arguments, false, function(elem) {
                    this.parentNode.insertBefore(elem, this);
                });
            } else if (arguments.length) {
                var set = jQuery(arguments[0]);
                set.push.apply(set, this.toArray());
                return this.pushStack(set, "before", arguments);
            }
        },

        after: function() {
            if (this[0] && this[0].parentNode) {
                return this.domManip(arguments, false, function(elem) {
                    this.parentNode.insertBefore(elem, this.nextSibling);
                });
            } else if (arguments.length) {
                var set = this.pushStack(this, "after", arguments);
                set.push.apply(set, jQuery(arguments[0]).toArray());
                return set;
            }
        },

        clone: function(events) {
            // Do the clone
            var ret = this.map(function() {
                if (!jQuery.support.noCloneEvent && !jQuery.isXMLDoc(this)) {
                    // IE copies events bound via attachEvent when
                    // using cloneNode. Calling detachEvent on the
                    // clone will also remove the events from the orignal
                    // In order to get around this, we use innerHTML.
                    // Unfortunately, this means some modifications to
                    // attributes in IE that are actually only stored
                    // as properties will not be copied (such as the
                    // the name attribute on an input).
                    var html = this.outerHTML,
                        ownerDocument = this.ownerDocument;
                    if (!html) {
                        var div = ownerDocument.createElement("div");
                        div.appendChild(this.cloneNode(true));
                        html = div.innerHTML;
                    }

                    return jQuery.clean([html.replace(rinlinejQuery, "")
                        .replace(rleadingWhitespace, "")
                    ], ownerDocument)[0];
                } else {
                    return this.cloneNode(true);
                }
            });

            // Copy the events from the original to the clone
            if (events === true) {
                cloneCopyEvent(this, ret);
                cloneCopyEvent(this.find("*"), ret.find("*"));
            }

            // Return the cloned set
            return ret;
        },

        html: function(value) {
            if (value === undefined) {
                return this[0] && this[0].nodeType === 1 ?
                    this[0].innerHTML.replace(rinlinejQuery, "") :
                    null;

                // See if we can take a shortcut and just use innerHTML
            } else if (typeof value === "string" && !/<script/i.test(value) &&
                (jQuery.support.leadingWhitespace || !rleadingWhitespace.test(value)) &&
                !wrapMap[(rtagName.exec(value) || ["", ""])[1].toLowerCase()]) {

                value = value.replace(rxhtmlTag, fcloseTag);

                try {
                    for (var i = 0, l = this.length; i < l; i++) {
                        // Remove element nodes and prevent memory leaks
                        if (this[i].nodeType === 1) {
                            jQuery.cleanData(this[i].getElementsByTagName("*"));
                            this[i].innerHTML = value;
                        }
                    }

                    // If using innerHTML throws an exception, use the fallback method
                } catch (e) {
                    this.empty().append(value);
                }

            } else if (jQuery.isFunction(value)) {
                this.each(function(i) {
                    var self = jQuery(this),
                        old = self.html();
                    self.empty().append(function() {
                        return value.call(this, i, old);
                    });
                });

            } else {
                this.empty().append(value);
            }

            return this;
        },

        replaceWith: function(value) {
            if (this[0] && this[0].parentNode) {
                // Make sure that the elements are removed from the DOM before they are inserted
                // this can help fix replacing a parent with child elements
                if (!jQuery.isFunction(value)) {
                    value = jQuery(value).detach();

                } else {
                    return this.each(function(i) {
                        var self = jQuery(this),
                            old = self.html();
                        self.replaceWith(value.call(this, i, old));
                    });
                }

                return this.each(function() {
                    var next = this.nextSibling,
                        parent = this.parentNode;

                    jQuery(this).remove();

                    if (next) {
                        jQuery(next).before(value);
                    } else {
                        jQuery(parent).append(value);
                    }
                });
            } else {
                return this.pushStack(jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value);
            }
        },

        detach: function(selector) {
            return this.remove(selector, true);
        },

        domManip: function(args, table, callback) {
            var results, first, value = args[0],
                scripts = [];

            // We can't cloneNode fragments that contain checked, in WebKit
            if (!jQuery.support.checkClone && arguments.length === 3 && typeof value === "string" && rchecked.test(value)) {
                return this.each(function() {
                    jQuery(this).domManip(args, table, callback, true);
                });
            }

            if (jQuery.isFunction(value)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    args[0] = value.call(this, i, table ? self.html() : undefined);
                    self.domManip(args, table, callback);
                });
            }

            if (this[0]) {
                // If we're in a fragment, just use that instead of building a new one
                if (args[0] && args[0].parentNode && args[0].parentNode.nodeType === 11) {
                    results = { fragment: args[0].parentNode };
                } else {
                    results = buildFragment(args, this, scripts);
                }

                first = results.fragment.firstChild;

                if (first) {
                    table = table && jQuery.nodeName(first, "tr");

                    for (var i = 0, l = this.length; i < l; i++) {
                        callback.call(
                            table ?
                            root(this[i], first) :
                            this[i],
                            results.cacheable || this.length > 1 || i > 0 ?
                            results.fragment.cloneNode(true) :
                            results.fragment
                        );
                    }
                }

                if (scripts) {
                    jQuery.each(scripts, evalScript);
                }
            }

            return this;

            function root(elem, cur) {
                return jQuery.nodeName(elem, "table") ?
                    (elem.getElementsByTagName("tbody")[0] ||
                        elem.appendChild(elem.ownerDocument.createElement("tbody"))) :
                    elem;
            }
        }
    });

    function cloneCopyEvent(orig, ret) {
        var i = 0;

        ret.each(function() {
            if (this.nodeName !== (orig[i] && orig[i].nodeName)) {
                return;
            }

            var oldData = jQuery.data(orig[i++]),
                curData = jQuery.data(this, oldData),
                events = oldData && oldData.events;

            if (events) {
                delete curData.handle;
                curData.events = {};

                for (var type in events) {
                    for (var handler in events[type]) {
                        jQuery.event.add(this, type, events[type][handler], events[type][handler].data);
                    }
                }
            }
        });
    }

    function buildFragment(args, nodes, scripts) {
        var fragment, cacheable, cacheresults, doc;

        // webkit does not clone 'checked' attribute of radio inputs on cloneNode, so don't cache if string has a checked
        if (args.length === 1 && typeof args[0] === "string" && args[0].length < 512 && args[0].indexOf("<option") < 0 && (jQuery.support.checkClone || !rchecked.test(args[0]))) {
            cacheable = true;
            cacheresults = jQuery.fragments[args[0]];
            if (cacheresults) {
                if (cacheresults !== 1) {
                    fragment = cacheresults;
                }
            }
        }

        if (!fragment) {
            doc = (nodes && nodes[0] ? nodes[0].ownerDocument || nodes[0] : document);
            fragment = doc.createDocumentFragment();
            jQuery.clean(args, doc, fragment, scripts);
        }

        if (cacheable) {
            jQuery.fragments[args[0]] = cacheresults ? fragment : 1;
        }

        return { fragment: fragment, cacheable: cacheable };
    }

    jQuery.fragments = {};

    jQuery.each({
        appendTo: "append",
        prependTo: "prepend",
        insertBefore: "before",
        insertAfter: "after",
        replaceAll: "replaceWith"
    }, function(name, original) {
        jQuery.fn[name] = function(selector) {
            var ret = [],
                insert = jQuery(selector);

            for (var i = 0, l = insert.length; i < l; i++) {
                var elems = (i > 0 ? this.clone(true) : this).get();
                jQuery.fn[original].apply(jQuery(insert[i]), elems);
                ret = ret.concat(elems);
            }
            return this.pushStack(ret, name, insert.selector);
        };
    });

    jQuery.each({
        // keepData is for internal use only--do not document
        remove: function(selector, keepData) {
            if (!selector || jQuery.filter(selector, [this]).length) {
                if (!keepData && this.nodeType === 1) {
                    jQuery.cleanData(this.getElementsByTagName("*"));
                    jQuery.cleanData([this]);
                }

                if (this.parentNode) {
                    this.parentNode.removeChild(this);
                }
            }
        },

        empty: function() {
            // Remove element nodes and prevent memory leaks
            if (this.nodeType === 1) {
                jQuery.cleanData(this.getElementsByTagName("*"));
            }

            // Remove any remaining nodes
            while (this.firstChild) {
                this.removeChild(this.firstChild);
            }
        }
    }, function(name, fn) {
        jQuery.fn[name] = function() {
            return this.each(fn, arguments);
        };
    });

    jQuery.extend({
        clean: function(elems, context, fragment, scripts) {
            context = context || document;

            // !context.createElement fails in IE with an error but returns typeof 'object'
            if (typeof context.createElement === "undefined") {
                context = context.ownerDocument || context[0] && context[0].ownerDocument || document;
            }

            var ret = [];

            jQuery.each(elems, function(i, elem) {
                if (typeof elem === "number") {
                    elem += "";
                }

                if (!elem) {
                    return;
                }

                // Convert html string into DOM nodes
                if (typeof elem === "string" && !rhtml.test(elem)) {
                    elem = context.createTextNode(elem);

                } else if (typeof elem === "string") {
                    // Fix "XHTML"-style tags in all browsers
                    elem = elem.replace(rxhtmlTag, fcloseTag);

                    // Trim whitespace, otherwise indexOf won't work as expected
                    var tag = (rtagName.exec(elem) || ["", ""])[1].toLowerCase(),
                        wrap = wrapMap[tag] || wrapMap._default,
                        depth = wrap[0],
                        div = context.createElement("div");

                    // Go to html and back, then peel off extra wrappers
                    div.innerHTML = wrap[1] + elem + wrap[2];

                    // Move to the right depth
                    while (depth--) {
                        div = div.lastChild;
                    }

                    // Remove IE's autoinserted <tbody> from table fragments
                    if (!jQuery.support.tbody) {

                        // String was a <table>, *may* have spurious <tbody>
                        var hasBody = rtbody.test(elem),
                            tbody = tag === "table" && !hasBody ?
                            div.firstChild && div.firstChild.childNodes :

                            // String was a bare <thead> or <tfoot>
                            wrap[1] === "<table>" && !hasBody ?
                            div.childNodes : [];

                        for (var j = tbody.length - 1; j >= 0; --j) {
                            if (jQuery.nodeName(tbody[j], "tbody") && !tbody[j].childNodes.length) {
                                tbody[j].parentNode.removeChild(tbody[j]);
                            }
                        }

                    }

                    // IE completely kills leading whitespace when innerHTML is used
                    if (!jQuery.support.leadingWhitespace && rleadingWhitespace.test(elem)) {
                        div.insertBefore(context.createTextNode(rleadingWhitespace.exec(elem)[0]), div.firstChild);
                    }

                    elem = jQuery.makeArray(div.childNodes);
                }

                if (elem.nodeType) {
                    ret.push(elem);
                } else {
                    ret = jQuery.merge(ret, elem);
                }

            });

            if (fragment) {
                for (var i = 0; ret[i]; i++) {
                    if (scripts && jQuery.nodeName(ret[i], "script") && (!ret[i].type || ret[i].type.toLowerCase() === "text/javascript")) {
                        scripts.push(ret[i].parentNode ? ret[i].parentNode.removeChild(ret[i]) : ret[i]);
                    } else {
                        if (ret[i].nodeType === 1) {
                            ret.splice.apply(ret, [i + 1, 0].concat(jQuery.makeArray(ret[i].getElementsByTagName("script"))));
                        }
                        fragment.appendChild(ret[i]);
                    }
                }
            }

            return ret;
        },

        cleanData: function(elems) {
            for (var i = 0, elem, id;
                (elem = elems[i]) != null; i++) {
                jQuery.event.remove(elem);
                jQuery.removeData(elem);
            }
        }
    });
    // exclude the following css properties to add px
    var rexclude = /z-?index|font-?weight|opacity|zoom|line-?height/i,
        ralpha = /alpha\([^)]*\)/,
        ropacity = /opacity=([^)]*)/,
        rfloat = /float/i,
        rdashAlpha = /-([a-z])/ig,
        rupper = /([A-Z])/g,
        rnumpx = /^-?\d+(?:px)?$/i,
        rnum = /^-?\d/,

        cssShow = { position: "absolute", visibility: "hidden", display: "block" },
        cssWidth = ["Left", "Right"],
        cssHeight = ["Top", "Bottom"],

        // cache check for defaultView.getComputedStyle
        getComputedStyle = document.defaultView && document.defaultView.getComputedStyle,
        // normalize float css property
        styleFloat = jQuery.support.cssFloat ? "cssFloat" : "styleFloat",
        fcamelCase = function(all, letter) {
            return letter.toUpperCase();
        };

    jQuery.fn.css = function(name, value) {
        return access(this, name, value, true, function(elem, name, value) {
            if (value === undefined) {
                return jQuery.curCSS(elem, name);
            }

            if (typeof value === "number" && !rexclude.test(name)) {
                value += "px";
            }

            jQuery.style(elem, name, value);
        });
    };

    jQuery.extend({
        style: function(elem, name, value) {
            // don't set styles on text and comment nodes
            if (!elem || elem.nodeType === 3 || elem.nodeType === 8) {
                return undefined;
            }

            // ignore negative width and height values #1599
            if ((name === "width" || name === "height") && parseFloat(value) < 0) {
                value = undefined;
            }

            var style = elem.style || elem,
                set = value !== undefined;

            // IE uses filters for opacity
            if (!jQuery.support.opacity && name === "opacity") {
                if (set) {
                    // IE has trouble with opacity if it does not have layout
                    // Force it by setting the zoom level
                    style.zoom = 1;

                    // Set the alpha filter to set the opacity
                    var opacity = parseInt(value, 10) + "" === "NaN" ? "" : "alpha(opacity=" + value * 100 + ")";
                    var filter = style.filter || jQuery.curCSS(elem, "filter") || "";
                    style.filter = ralpha.test(filter) ? filter.replace(ralpha, opacity) : opacity;
                }

                return style.filter && style.filter.indexOf("opacity=") >= 0 ?
                    (parseFloat(ropacity.exec(style.filter)[1]) / 100) + "" :
                    "";
            }

            // Make sure we're using the right name for getting the float value
            if (rfloat.test(name)) {
                name = styleFloat;
            }

            name = name.replace(rdashAlpha, fcamelCase);

            if (set) {
                style[name] = value;
            }

            return style[name];
        },

        css: function(elem, name, force, extra) {
            if (name === "width" || name === "height") {
                var val, props = cssShow,
                    which = name === "width" ? cssWidth : cssHeight;

                function getWH() {
                    val = name === "width" ? elem.offsetWidth : elem.offsetHeight;

                    if (extra === "border") {
                        return;
                    }

                    jQuery.each(which, function() {
                        if (!extra) {
                            val -= parseFloat(jQuery.curCSS(elem, "padding" + this, true)) || 0;
                        }

                        if (extra === "margin") {
                            val += parseFloat(jQuery.curCSS(elem, "margin" + this, true)) || 0;
                        } else {
                            val -= parseFloat(jQuery.curCSS(elem, "border" + this + "Width", true)) || 0;
                        }
                    });
                }

                if (elem.offsetWidth !== 0) {
                    getWH();
                } else {
                    jQuery.swap(elem, props, getWH);
                }

                return Math.max(0, Math.round(val));
            }

            return jQuery.curCSS(elem, name, force);
        },

        curCSS: function(elem, name, force) {
            var ret, style = elem.style,
                filter;

            // IE uses filters for opacity
            if (!jQuery.support.opacity && name === "opacity" && elem.currentStyle) {
                ret = ropacity.test(elem.currentStyle.filter || "") ?
                    (parseFloat(RegExp.$1) / 100) + "" :
                    "";

                return ret === "" ?
                    "1" :
                    ret;
            }

            // Make sure we're using the right name for getting the float value
            if (rfloat.test(name)) {
                name = styleFloat;
            }

            if (!force && style && style[name]) {
                ret = style[name];

            } else if (getComputedStyle) {

                // Only "float" is needed here
                if (rfloat.test(name)) {
                    name = "float";
                }

                name = name.replace(rupper, "-$1").toLowerCase();

                var defaultView = elem.ownerDocument.defaultView;

                if (!defaultView) {
                    return null;
                }

                var computedStyle = defaultView.getComputedStyle(elem, null);

                if (computedStyle) {
                    ret = computedStyle.getPropertyValue(name);
                }

                // We should always get a number back from opacity
                if (name === "opacity" && ret === "") {
                    ret = "1";
                }

            } else if (elem.currentStyle) {
                var camelCase = name.replace(rdashAlpha, fcamelCase);

                ret = elem.currentStyle[name] || elem.currentStyle[camelCase];

                // From the awesome hack by Dean Edwards
                // http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

                // If we're not dealing with a regular pixel number
                // but a number that has a weird ending, we need to convert it to pixels
                if (!rnumpx.test(ret) && rnum.test(ret)) {
                    // Remember the original values
                    var left = style.left,
                        rsLeft = elem.runtimeStyle.left;

                    // Put in the new values to get a computed value out
                    elem.runtimeStyle.left = elem.currentStyle.left;
                    style.left = camelCase === "fontSize" ? "1em" : (ret || 0);
                    ret = style.pixelLeft + "px";

                    // Revert the changed values
                    style.left = left;
                    elem.runtimeStyle.left = rsLeft;
                }
            }

            return ret;
        },

        // A method for quickly swapping in/out CSS properties to get correct calculations
        swap: function(elem, options, callback) {
            var old = {};

            // Remember the old values, and insert the new ones
            for (var name in options) {
                old[name] = elem.style[name];
                elem.style[name] = options[name];
            }

            callback.call(elem);

            // Revert the old values
            for (var name in options) {
                elem.style[name] = old[name];
            }
        }
    });

    if (jQuery.expr && jQuery.expr.filters) {
        jQuery.expr.filters.hidden = function(elem) {
            var width = elem.offsetWidth,
                height = elem.offsetHeight,
                skip = elem.nodeName.toLowerCase() === "tr";

            return width === 0 && height === 0 && !skip ?
                true :
                width > 0 && height > 0 && !skip ?
                false :
                jQuery.curCSS(elem, "display") === "none";
        };

        jQuery.expr.filters.visible = function(elem) {
            return !jQuery.expr.filters.hidden(elem);
        };
    }
    var jsc = now(),
        rscript = /<script(.|\s)*?\/script>/gi,
        rselectTextarea = /select|textarea/i,
        rinput = /color|date|datetime|email|hidden|month|number|password|range|search|tel|text|time|url|week/i,
        jsre = /=\?(&|$)/,
        rquery = /\?/,
        rts = /(\?|&)_=.*?(&|$)/,
        rurl = /^(\w+:)?\/\/([^\/?#]+)/,
        r20 = /%20/g;

    jQuery.fn.extend({
        // Keep a copy of the old load
        _load: jQuery.fn.load,

        load: function(url, params, callback) {
            if (typeof url !== "string") {
                return this._load(url);

                // Don't do a request if no elements are being requested
            } else if (!this.length) {
                return this;
            }

            var off = url.indexOf(" ");
            if (off >= 0) {
                var selector = url.slice(off, url.length);
                url = url.slice(0, off);
            }

            // Default to a GET request
            var type = "GET";

            // If the second parameter was provided
            if (params) {
                // If it's a function
                if (jQuery.isFunction(params)) {
                    // We assume that it's the callback
                    callback = params;
                    params = null;

                    // Otherwise, build a param string
                } else if (typeof params === "object") {
                    params = jQuery.param(params, jQuery.ajaxSettings.traditional);
                    type = "POST";
                }
            }

            var self = this;

            // Request the remote document
            jQuery.ajax({
                url: url,
                type: type,
                dataType: "html",
                data: params,
                complete: function(res, status) {
                    // If successful, inject the HTML into all the matched elements
                    if (status === "success" || status === "notmodified") {
                        // See if a selector was specified
                        self.html(selector ?
                            // Create a dummy div to hold the results
                            jQuery("<div />")
                            // inject the contents of the document in, removing the scripts
                            // to avoid any 'Permission Denied' errors in IE
                            .append(res.responseText.replace(rscript, ""))

                            // Locate the specified elements
                            .find(selector) :

                            // If not, just inject the full result
                            res.responseText);
                    }

                    if (callback) {
                        self.each(callback, [res.responseText, status, res]);
                    }
                }
            });

            return this;
        },

        serialize: function() {
            return jQuery.param(this.serializeArray());
        },
        serializeArray: function() {
            return this.map(function() {
                    return this.elements ? jQuery.makeArray(this.elements) : this;
                })
                .filter(function() {
                    return this.name && !this.disabled &&
                        (this.checked || rselectTextarea.test(this.nodeName) ||
                            rinput.test(this.type));
                })
                .map(function(i, elem) {
                    var val = jQuery(this).val();

                    return val == null ?
                        null :
                        jQuery.isArray(val) ?
                        jQuery.map(val, function(val, i) {
                            return { name: elem.name, value: val };
                        }) : { name: elem.name, value: val };
                }).get();
        }
    });

    // Attach a bunch of functions for handling common AJAX events
    jQuery.each("ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split(" "), function(i, o) {
        jQuery.fn[o] = function(f) {
            return this.bind(o, f);
        };
    });

    jQuery.extend({

        get: function(url, data, callback, type) {
            // shift arguments if data argument was omited
            if (jQuery.isFunction(data)) {
                type = type || callback;
                callback = data;
                data = null;
            }

            return jQuery.ajax({
                type: "GET",
                url: url,
                data: data,
                success: callback,
                dataType: type
            });
        },

        getScript: function(url, callback) {
            return jQuery.get(url, null, callback, "script");
        },

        getJSON: function(url, data, callback) {
            return jQuery.get(url, data, callback, "json");
        },

        post: function(url, data, callback, type) {
            // shift arguments if data argument was omited
            if (jQuery.isFunction(data)) {
                type = type || callback;
                callback = data;
                data = {};
            }

            return jQuery.ajax({
                type: "POST",
                url: url,
                data: data,
                success: callback,
                dataType: type
            });
        },

        ajaxSetup: function(settings) {
            jQuery.extend(jQuery.ajaxSettings, settings);
        },

        ajaxSettings: {
            url: location.href,
            global: true,
            type: "GET",
            contentType: "application/x-www-form-urlencoded",
            processData: true,
            async: true,
            /*
            timeout: 0,
            data: null,
            username: null,
            password: null,
            traditional: false,
            */
            // Create the request object; Microsoft failed to properly
            // implement the XMLHttpRequest in IE7 (can't request local files),
            // so we use the ActiveXObject when it is available
            // This function can be overriden by calling jQuery.ajaxSetup
            xhr: window.XMLHttpRequest && (window.location.protocol !== "file:" || !window.ActiveXObject) ?
                function() {
                    return new window.XMLHttpRequest();
                } : function() {
                    try {
                        return new window.ActiveXObject("Microsoft.XMLHTTP");
                    } catch (e) {}
                },
            accepts: {
                xml: "application/xml, text/xml",
                html: "text/html",
                script: "text/javascript, application/javascript",
                json: "application/json, text/javascript",
                text: "text/plain",
                _default: "*/*"
            }
        },

        // Last-Modified header cache for next request
        lastModified: {},
        etag: {},

        ajax: function(origSettings) {
            var s = jQuery.extend(true, {}, jQuery.ajaxSettings, origSettings);

            var jsonp, status, data,
                callbackContext = origSettings && origSettings.context || s,
                type = s.type.toUpperCase();

            // convert data if not already a string
            if (s.data && s.processData && typeof s.data !== "string") {
                s.data = jQuery.param(s.data, s.traditional);
            }

            // Handle JSONP Parameter Callbacks
            if (s.dataType === "jsonp") {
                if (type === "GET") {
                    if (!jsre.test(s.url)) {
                        s.url += (rquery.test(s.url) ? "&" : "?") + (s.jsonp || "callback") + "=?";
                    }
                } else if (!s.data || !jsre.test(s.data)) {
                    s.data = (s.data ? s.data + "&" : "") + (s.jsonp || "callback") + "=?";
                }
                s.dataType = "json";
            }

            // Build temporary JSONP function
            if (s.dataType === "json" && (s.data && jsre.test(s.data) || jsre.test(s.url))) {
                jsonp = s.jsonpCallback || ("jsonp" + jsc++);

                // Replace the =? sequence both in the query string and the data
                if (s.data) {
                    s.data = (s.data + "").replace(jsre, "=" + jsonp + "$1");
                }

                s.url = s.url.replace(jsre, "=" + jsonp + "$1");

                // We need to make sure
                // that a JSONP style response is executed properly
                s.dataType = "script";

                // Handle JSONP-style loading
                window[jsonp] = window[jsonp] || function(tmp) {
                    data = tmp;
                    success();
                    complete();
                    // Garbage collect
                    window[jsonp] = undefined;

                    try {
                        delete window[jsonp];
                    } catch (e) {}

                    if (head) {
                        head.removeChild(script);
                    }
                };
            }

            if (s.dataType === "script" && s.cache === null) {
                s.cache = false;
            }

            if (s.cache === false && type === "GET") {
                var ts = now();

                // try replacing _= if it is there
                var ret = s.url.replace(rts, "$1_=" + ts + "$2");

                // if nothing was replaced, add timestamp to the end
                s.url = ret + ((ret === s.url) ? (rquery.test(s.url) ? "&" : "?") + "_=" + ts : "");
            }

            // If data is available, append data to url for get requests
            if (s.data && type === "GET") {
                s.url += (rquery.test(s.url) ? "&" : "?") + s.data;
            }

            // Watch for a new set of requests
            if (s.global && !jQuery.active++) {
                jQuery.event.trigger("ajaxStart");
            }

            // Matches an absolute URL, and saves the domain
            var parts = rurl.exec(s.url),
                remote = parts && (parts[1] && parts[1] !== location.protocol || parts[2] !== location.host);

            // If we're requesting a remote document
            // and trying to load JSON or Script with a GET
            if (s.dataType === "script" && type === "GET" && remote) {
                var head = document.getElementsByTagName("head")[0] || document.documentElement;
                var script = document.createElement("script");
                script.src = s.url;
                if (s.scriptCharset) {
                    script.charset = s.scriptCharset;
                }

                // Handle Script loading
                if (!jsonp) {
                    var done = false;

                    // Attach handlers for all browsers
                    script.onload = script.onreadystatechange = function() {
                        if (!done && (!this.readyState ||
                                this.readyState === "loaded" || this.readyState === "complete")) {
                            done = true;
                            success();
                            complete();

                            // Handle memory leak in IE
                            script.onload = script.onreadystatechange = null;
                            if (head && script.parentNode) {
                                head.removeChild(script);
                            }
                        }
                    };
                }

                // Use insertBefore instead of appendChild  to circumvent an IE6 bug.
                // This arises when a base node is used (#2709 and #4378).
                head.insertBefore(script, head.firstChild);

                // We handle everything using the script element injection
                return undefined;
            }

            var requestDone = false;

            // Create the request object
            var xhr = s.xhr();

            if (!xhr) {
                return;
            }

            // Open the socket
            // Passing null username, generates a login popup on Opera (#2865)
            if (s.username) {
                xhr.open(type, s.url, s.async, s.username, s.password);
            } else {
                xhr.open(type, s.url, s.async);
            }

            // Need an extra try/catch for cross domain requests in Firefox 3
            try {
                // Set the correct header, if data is being sent
                if (s.data || origSettings && origSettings.contentType) {
                    xhr.setRequestHeader("Content-Type", s.contentType);
                }

                // Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
                if (s.ifModified) {
                    if (jQuery.lastModified[s.url]) {
                        xhr.setRequestHeader("If-Modified-Since", jQuery.lastModified[s.url]);
                    }

                    if (jQuery.etag[s.url]) {
                        xhr.setRequestHeader("If-None-Match", jQuery.etag[s.url]);
                    }
                }

                // Set header so the called script knows that it's an XMLHttpRequest
                // Only send the header if it's not a remote XHR
                if (!remote) {
                    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
                }

                // Set the Accepts header for the server, depending on the dataType
                xhr.setRequestHeader("Accept", s.dataType && s.accepts[s.dataType] ?
                    s.accepts[s.dataType] + ", */*" :
                    s.accepts._default);
            } catch (e) {}

            // Allow custom headers/mimetypes and early abort
            if (s.beforeSend && s.beforeSend.call(callbackContext, xhr, s) === false) {
                // Handle the global AJAX counter
                if (s.global && !--jQuery.active) {
                    jQuery.event.trigger("ajaxStop");
                }

                // close opended socket
                xhr.abort();
                return false;
            }

            if (s.global) {
                trigger("ajaxSend", [xhr, s]);
            }

            // Wait for a response to come back
            var onreadystatechange = xhr.onreadystatechange = function(isTimeout) {
                // The request was aborted
                if (!xhr || xhr.readyState === 0 || isTimeout === "abort") {
                    // Opera doesn't call onreadystatechange before this point
                    // so we simulate the call
                    if (!requestDone) {
                        complete();
                    }

                    requestDone = true;
                    if (xhr) {
                        xhr.onreadystatechange = jQuery.noop;
                    }

                    // The transfer is complete and the data is available, or the request timed out
                } else if (!requestDone && xhr && (xhr.readyState === 4 || isTimeout === "timeout")) {
                    requestDone = true;
                    xhr.onreadystatechange = jQuery.noop;

                    status = isTimeout === "timeout" ?
                        "timeout" :
                        !jQuery.httpSuccess(xhr) ?
                        "error" :
                        s.ifModified && jQuery.httpNotModified(xhr, s.url) ?
                        "notmodified" :
                        "success";

                    var errMsg;

                    if (status === "success") {
                        // Watch for, and catch, XML document parse errors
                        try {
                            // process the data (runs the xml through httpData regardless of callback)
                            data = jQuery.httpData(xhr, s.dataType, s);
                        } catch (err) {
                            status = "parsererror";
                            errMsg = err;
                        }
                    }

                    // Make sure that the request was successful or notmodified
                    if (status === "success" || status === "notmodified") {
                        // JSONP handles its own success callback
                        if (!jsonp) {
                            success();
                        }
                    } else {
                        jQuery.handleError(s, xhr, status, errMsg);
                    }

                    // Fire the complete handlers
                    complete();

                    if (isTimeout === "timeout") {
                        xhr.abort();
                    }

                    // Stop memory leaks
                    if (s.async) {
                        xhr = null;
                    }
                }
            };

            // Override the abort handler, if we can (IE doesn't allow it, but that's OK)
            // Opera doesn't fire onreadystatechange at all on abort
            try {
                var oldAbort = xhr.abort;
                xhr.abort = function() {
                    if (xhr) {
                        oldAbort.call(xhr);
                    }

                    onreadystatechange("abort");
                };
            } catch (e) {}

            // Timeout checker
            if (s.async && s.timeout > 0) {
                setTimeout(function() {
                    // Check to see if the request is still happening
                    if (xhr && !requestDone) {
                        onreadystatechange("timeout");
                    }
                }, s.timeout);
            }

            // Send the data
            try {
                xhr.send(type === "POST" || type === "PUT" || type === "DELETE" ? s.data : null);
            } catch (e) {
                jQuery.handleError(s, xhr, null, e);
                // Fire the complete handlers
                complete();
            }

            // firefox 1.5 doesn't fire statechange for sync requests
            if (!s.async) {
                onreadystatechange();
            }

            function success() {
                // If a local callback was specified, fire it and pass it the data
                if (s.success) {
                    s.success.call(callbackContext, data, status, xhr);
                }

                // Fire the global callback
                if (s.global) {
                    trigger("ajaxSuccess", [xhr, s]);
                }
            }

            function complete() {
                // Process result
                if (s.complete) {
                    s.complete.call(callbackContext, xhr, status);
                }

                // The request was completed
                if (s.global) {
                    trigger("ajaxComplete", [xhr, s]);
                }

                // Handle the global AJAX counter
                if (s.global && !--jQuery.active) {
                    jQuery.event.trigger("ajaxStop");
                }
            }

            function trigger(type, args) {
                (s.context ? jQuery(s.context) : jQuery.event).trigger(type, args);
            }

            // return XMLHttpRequest to allow aborting the request etc.
            return xhr;
        },

        handleError: function(s, xhr, status, e) {
            // If a local callback was specified, fire it
            if (s.error) {
                s.error.call(s.context || s, xhr, status, e);
            }

            // Fire the global callback
            if (s.global) {
                (s.context ? jQuery(s.context) : jQuery.event).trigger("ajaxError", [xhr, s, e]);
            }
        },

        // Counter for holding the number of active queries
        active: 0,

        // Determines if an XMLHttpRequest was successful or not
        httpSuccess: function(xhr) {
            try {
                // IE error sometimes returns 1223 when it should be 204 so treat it as success, see #1450
                return !xhr.status && location.protocol === "file:" ||
                    // Opera returns 0 when status is 304
                    (xhr.status >= 200 && xhr.status < 300) ||
                    xhr.status === 304 || xhr.status === 1223 || xhr.status === 0;
            } catch (e) {}

            return false;
        },

        // Determines if an XMLHttpRequest returns NotModified
        httpNotModified: function(xhr, url) {
            var lastModified = xhr.getResponseHeader("Last-Modified"),
                etag = xhr.getResponseHeader("Etag");

            if (lastModified) {
                jQuery.lastModified[url] = lastModified;
            }

            if (etag) {
                jQuery.etag[url] = etag;
            }

            // Opera returns 0 when status is 304
            return xhr.status === 304 || xhr.status === 0;
        },

        httpData: function(xhr, type, s) {
            var ct = xhr.getResponseHeader("content-type") || "",
                xml = type === "xml" || !type && ct.indexOf("xml") >= 0,
                data = xml ? xhr.responseXML : xhr.responseText;

            if (xml && data.documentElement.nodeName === "parsererror") {
                jQuery.error("parsererror");
            }

            // Allow a pre-filtering function to sanitize the response
            // s is checked to keep backwards compatibility
            if (s && s.dataFilter) {
                data = s.dataFilter(data, type);
            }

            // The filter can actually parse the response
            if (typeof data === "string") {
                // Get the JavaScript object, if JSON is used.
                if (type === "json" || !type && ct.indexOf("json") >= 0) {
                    data = jQuery.parseJSON(data);

                    // If the type is "script", eval it in global context
                } else if (type === "script" || !type && ct.indexOf("javascript") >= 0) {
                    jQuery.globalEval(data);
                }
            }

            return data;
        },

        // Serialize an array of form elements or a set of
        // key/values into a query string
        param: function(a, traditional) {
            var s = [];

            // Set traditional to true for jQuery <= 1.3.2 behavior.
            if (traditional === undefined) {
                traditional = jQuery.ajaxSettings.traditional;
            }

            // If an array was passed in, assume that it is an array of form elements.
            if (jQuery.isArray(a) || a.jquery) {
                // Serialize the form elements
                jQuery.each(a, function() {
                    add(this.name, this.value);
                });

            } else {
                // If traditional, encode the "old" way (the way 1.3.2 or older
                // did it), otherwise encode params recursively.
                for (var prefix in a) {
                    buildParams(prefix, a[prefix]);
                }
            }

            // Return the resulting serialization
            return s.join("&").replace(r20, "+");

            function buildParams(prefix, obj) {
                if (jQuery.isArray(obj)) {
                    // Serialize array item.
                    jQuery.each(obj, function(i, v) {
                        if (traditional) {
                            // Treat each array item as a scalar.
                            add(prefix, v);
                        } else {
                            // If array item is non-scalar (array or object), encode its
                            // numeric index to resolve deserialization ambiguity issues.
                            // Note that rack (as of 1.0.0) can't currently deserialize
                            // nested arrays properly, and attempting to do so may cause
                            // a server error. Possible fixes are to modify rack's
                            // deserialization algorithm or to provide an option or flag
                            // to force array serialization to be shallow.
                            buildParams(prefix + "[" + (typeof v === "object" || jQuery.isArray(v) ? i : "") + "]", v);
                        }
                    });

                } else if (!traditional && obj != null && typeof obj === "object") {
                    // Serialize object item.
                    jQuery.each(obj, function(k, v) {
                        buildParams(prefix + "[" + k + "]", v);
                    });

                } else {
                    // Serialize scalar item.
                    add(prefix, obj);
                }
            }

            function add(key, value) {
                // If value is a function, invoke it and return its value
                value = jQuery.isFunction(value) ? value() : value;
                s[s.length] = encodeURIComponent(key) + "=" + encodeURIComponent(value);
            }
        }
    });
    var elemdisplay = {},
        rfxtypes = /toggle|show|hide/,
        rfxnum = /^([+-]=)?([\d+-.]+)(.*)$/,
        timerId,
        fxAttrs = [
            // height animations
            ["height", "marginTop", "marginBottom", "paddingTop", "paddingBottom"],
            // width animations
            ["width", "marginLeft", "marginRight", "paddingLeft", "paddingRight"],
            // opacity animations
            ["opacity"]
        ];

    jQuery.fn.extend({
        show: function(speed, callback) {
            if (speed || speed === 0) {
                return this.animate(genFx("show", 3), speed, callback);

            } else {
                for (var i = 0, l = this.length; i < l; i++) {
                    var old = jQuery.data(this[i], "olddisplay");

                    this[i].style.display = old || "";

                    if (jQuery.css(this[i], "display") === "none") {
                        var nodeName = this[i].nodeName,
                            display;

                        if (elemdisplay[nodeName]) {
                            display = elemdisplay[nodeName];

                        } else {
                            var elem = jQuery("<" + nodeName + " />").appendTo("body");

                            display = elem.css("display");

                            if (display === "none") {
                                display = "block";
                            }

                            elem.remove();

                            elemdisplay[nodeName] = display;
                        }

                        jQuery.data(this[i], "olddisplay", display);
                    }
                }

                // Set the display of the elements in a second loop
                // to avoid the constant reflow
                for (var j = 0, k = this.length; j < k; j++) {
                    this[j].style.display = jQuery.data(this[j], "olddisplay") || "";
                }

                return this;
            }
        },

        hide: function(speed, callback) {
            if (speed || speed === 0) {
                return this.animate(genFx("hide", 3), speed, callback);

            } else {
                for (var i = 0, l = this.length; i < l; i++) {
                    var old = jQuery.data(this[i], "olddisplay");
                    if (!old && old !== "none") {
                        jQuery.data(this[i], "olddisplay", jQuery.css(this[i], "display"));
                    }
                }

                // Set the display of the elements in a second loop
                // to avoid the constant reflow
                for (var j = 0, k = this.length; j < k; j++) {
                    this[j].style.display = "none";
                }

                return this;
            }
        },

        // Save the old toggle function
        _toggle: jQuery.fn.toggle,

        toggle: function(fn, fn2) {
            var bool = typeof fn === "boolean";

            if (jQuery.isFunction(fn) && jQuery.isFunction(fn2)) {
                this._toggle.apply(this, arguments);

            } else if (fn == null || bool) {
                this.each(function() {
                    var state = bool ? fn : jQuery(this).is(":hidden");
                    jQuery(this)[state ? "show" : "hide"]();
                });

            } else {
                this.animate(genFx("toggle", 3), fn, fn2);
            }

            return this;
        },

        fadeTo: function(speed, to, callback) {
            return this.filter(":hidden").css("opacity", 0).show().end()
                .animate({ opacity: to }, speed, callback);
        },

        animate: function(prop, speed, easing, callback) {
            var optall = jQuery.speed(speed, easing, callback);

            if (jQuery.isEmptyObject(prop)) {
                return this.each(optall.complete);
            }

            return this[optall.queue === false ? "each" : "queue"](function() {
                var opt = jQuery.extend({}, optall),
                    p,
                    hidden = this.nodeType === 1 && jQuery(this).is(":hidden"),
                    self = this;

                for (p in prop) {
                    var name = p.replace(rdashAlpha, fcamelCase);

                    if (p !== name) {
                        prop[name] = prop[p];
                        delete prop[p];
                        p = name;
                    }

                    if (prop[p] === "hide" && hidden || prop[p] === "show" && !hidden) {
                        return opt.complete.call(this);
                    }

                    if ((p === "height" || p === "width") && this.style) {
                        // Store display property
                        opt.display = jQuery.css(this, "display");

                        // Make sure that nothing sneaks out
                        opt.overflow = this.style.overflow;
                    }

                    if (jQuery.isArray(prop[p])) {
                        // Create (if needed) and add to specialEasing
                        (opt.specialEasing = opt.specialEasing || {})[p] = prop[p][1];
                        prop[p] = prop[p][0];
                    }
                }

                if (opt.overflow != null) {
                    this.style.overflow = "hidden";
                }

                opt.curAnim = jQuery.extend({}, prop);

                jQuery.each(prop, function(name, val) {
                    var e = new jQuery.fx(self, opt, name);

                    if (rfxtypes.test(val)) {
                        e[val === "toggle" ? hidden ? "show" : "hide" : val](prop);

                    } else {
                        var parts = rfxnum.exec(val),
                            start = e.cur(true) || 0;

                        if (parts) {
                            var end = parseFloat(parts[2]),
                                unit = parts[3] || "px";

                            // We need to compute starting value
                            if (unit !== "px") {
                                self.style[name] = (end || 1) + unit;
                                start = ((end || 1) / e.cur(true)) * start;
                                self.style[name] = start + unit;
                            }

                            // If a +=/-= token was provided, we're doing a relative animation
                            if (parts[1]) {
                                end = ((parts[1] === "-=" ? -1 : 1) * end) + start;
                            }

                            e.custom(start, end, unit);

                        } else {
                            e.custom(start, val, "");
                        }
                    }
                });

                // For JS strict compliance
                return true;
            });
        },

        stop: function(clearQueue, gotoEnd) {
            var timers = jQuery.timers;

            if (clearQueue) {
                this.queue([]);
            }

            this.each(function() {
                // go in reverse order so anything added to the queue during the loop is ignored
                for (var i = timers.length - 1; i >= 0; i--) {
                    if (timers[i].elem === this) {
                        if (gotoEnd) {
                            // force the next step to be the last
                            timers[i](true);
                        }

                        timers.splice(i, 1);
                    }
                }
            });

            // start the next in the queue if the last step wasn't forced
            if (!gotoEnd) {
                this.dequeue();
            }

            return this;
        }

    });

    // Generate shortcuts for custom animations
    jQuery.each({
        slideDown: genFx("show", 1),
        slideUp: genFx("hide", 1),
        slideToggle: genFx("toggle", 1),
        fadeIn: { opacity: "show" },
        fadeOut: { opacity: "hide" }
    }, function(name, props) {
        jQuery.fn[name] = function(speed, callback) {
            return this.animate(props, speed, callback);
        };
    });

    jQuery.extend({
        speed: function(speed, easing, fn) {
            var opt = speed && typeof speed === "object" ? speed : {
                complete: fn || !fn && easing ||
                    jQuery.isFunction(speed) && speed,
                duration: speed,
                easing: fn && easing || easing && !jQuery.isFunction(easing) && easing
            };

            opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
                jQuery.fx.speeds[opt.duration] || jQuery.fx.speeds._default;

            // Queueing
            opt.old = opt.complete;
            opt.complete = function() {
                if (opt.queue !== false) {
                    jQuery(this).dequeue();
                }
                if (jQuery.isFunction(opt.old)) {
                    opt.old.call(this);
                }
            };

            return opt;
        },

        easing: {
            linear: function(p, n, firstNum, diff) {
                return firstNum + diff * p;
            },
            swing: function(p, n, firstNum, diff) {
                return ((-Math.cos(p * Math.PI) / 2) + 0.5) * diff + firstNum;
            }
        },

        timers: [],

        fx: function(elem, options, prop) {
            this.options = options;
            this.elem = elem;
            this.prop = prop;

            if (!options.orig) {
                options.orig = {};
            }
        }

    });

    jQuery.fx.prototype = {
        // Simple function for setting a style value
        update: function() {
            if (this.options.step) {
                this.options.step.call(this.elem, this.now, this);
            }

            (jQuery.fx.step[this.prop] || jQuery.fx.step._default)(this);

            // Set display property to block for height/width animations
            if ((this.prop === "height" || this.prop === "width") && this.elem.style) {
                this.elem.style.display = "block";
            }
        },

        // Get the current size
        cur: function(force) {
            if (this.elem[this.prop] != null && (!this.elem.style || this.elem.style[this.prop] == null)) {
                return this.elem[this.prop];
            }

            var r = parseFloat(jQuery.css(this.elem, this.prop, force));
            return r && r > -10000 ? r : parseFloat(jQuery.curCSS(this.elem, this.prop)) || 0;
        },

        // Start an animation from one number to another
        custom: function(from, to, unit) {
            this.startTime = now();
            this.start = from;
            this.end = to;
            this.unit = unit || this.unit || "px";
            this.now = this.start;
            this.pos = this.state = 0;

            var self = this;

            function t(gotoEnd) {
                return self.step(gotoEnd);
            }

            t.elem = this.elem;

            if (t() && jQuery.timers.push(t) && !timerId) {
                timerId = setInterval(jQuery.fx.tick, 13);
            }
        },

        // Simple 'show' function
        show: function() {
            // Remember where we started, so that we can go back to it later
            this.options.orig[this.prop] = jQuery.style(this.elem, this.prop);
            this.options.show = true;

            // Begin the animation
            // Make sure that we start at a small width/height to avoid any
            // flash of content
            this.custom(this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur());

            // Start by showing the element
            jQuery(this.elem).show();
        },

        // Simple 'hide' function
        hide: function() {
            // Remember where we started, so that we can go back to it later
            this.options.orig[this.prop] = jQuery.style(this.elem, this.prop);
            this.options.hide = true;

            // Begin the animation
            this.custom(this.cur(), 0);
        },

        // Each step of an animation
        step: function(gotoEnd) {
            var t = now(),
                done = true;

            if (gotoEnd || t >= this.options.duration + this.startTime) {
                this.now = this.end;
                this.pos = this.state = 1;
                this.update();

                this.options.curAnim[this.prop] = true;

                for (var i in this.options.curAnim) {
                    if (this.options.curAnim[i] !== true) {
                        done = false;
                    }
                }

                if (done) {
                    if (this.options.display != null) {
                        // Reset the overflow
                        this.elem.style.overflow = this.options.overflow;

                        // Reset the display
                        var old = jQuery.data(this.elem, "olddisplay");
                        this.elem.style.display = old ? old : this.options.display;

                        if (jQuery.css(this.elem, "display") === "none") {
                            this.elem.style.display = "block";
                        }
                    }

                    // Hide the element if the "hide" operation was done
                    if (this.options.hide) {
                        jQuery(this.elem).hide();
                    }

                    // Reset the properties, if the item has been hidden or shown
                    if (this.options.hide || this.options.show) {
                        for (var p in this.options.curAnim) {
                            jQuery.style(this.elem, p, this.options.orig[p]);
                        }
                    }

                    // Execute the complete function
                    this.options.complete.call(this.elem);
                }

                return false;

            } else {
                var n = t - this.startTime;
                this.state = n / this.options.duration;

                // Perform the easing function, defaults to swing
                var specialEasing = this.options.specialEasing && this.options.specialEasing[this.prop];
                var defaultEasing = this.options.easing || (jQuery.easing.swing ? "swing" : "linear");
                this.pos = jQuery.easing[specialEasing || defaultEasing](this.state, n, 0, 1, this.options.duration);
                this.now = this.start + ((this.end - this.start) * this.pos);

                // Perform the next step of the animation
                this.update();
            }

            return true;
        }
    };

    jQuery.extend(jQuery.fx, {
        tick: function() {
            var timers = jQuery.timers;

            for (var i = 0; i < timers.length; i++) {
                if (!timers[i]()) {
                    timers.splice(i--, 1);
                }
            }

            if (!timers.length) {
                jQuery.fx.stop();
            }
        },

        stop: function() {
            clearInterval(timerId);
            timerId = null;
        },

        speeds: {
            slow: 600,
            fast: 200,
            // Default speed
            _default: 400
        },

        step: {
            opacity: function(fx) {
                jQuery.style(fx.elem, "opacity", fx.now);
            },

            _default: function(fx) {
                if (fx.elem.style && fx.elem.style[fx.prop] != null) {
                    fx.elem.style[fx.prop] = (fx.prop === "width" || fx.prop === "height" ? Math.max(0, fx.now) : fx.now) + fx.unit;
                } else {
                    fx.elem[fx.prop] = fx.now;
                }
            }
        }
    });

    if (jQuery.expr && jQuery.expr.filters) {
        jQuery.expr.filters.animated = function(elem) {
            return jQuery.grep(jQuery.timers, function(fn) {
                return elem === fn.elem;
            }).length;
        };
    }

    function genFx(type, num) {
        var obj = {};

        jQuery.each(fxAttrs.concat.apply([], fxAttrs.slice(0, num)), function() {
            obj[this] = type;
        });

        return obj;
    }
    if ("getBoundingClientRect" in document.documentElement) {
        jQuery.fn.offset = function(options) {
            var elem = this[0];

            if (options) {
                return this.each(function(i) {
                    jQuery.offset.setOffset(this, options, i);
                });
            }

            if (!elem || !elem.ownerDocument) {
                return null;
            }

            if (elem === elem.ownerDocument.body) {
                return jQuery.offset.bodyOffset(elem);
            }

            var box = elem.getBoundingClientRect(),
                doc = elem.ownerDocument,
                body = doc.body,
                docElem = doc.documentElement,
                clientTop = docElem.clientTop || body.clientTop || 0,
                clientLeft = docElem.clientLeft || body.clientLeft || 0,
                top = box.top + (self.pageYOffset || jQuery.support.boxModel && docElem.scrollTop || body.scrollTop) - clientTop,
                left = box.left + (self.pageXOffset || jQuery.support.boxModel && docElem.scrollLeft || body.scrollLeft) - clientLeft;

            return { top: top, left: left };
        };

    } else {
        jQuery.fn.offset = function(options) {
            var elem = this[0];

            if (options) {
                return this.each(function(i) {
                    jQuery.offset.setOffset(this, options, i);
                });
            }

            if (!elem || !elem.ownerDocument) {
                return null;
            }

            if (elem === elem.ownerDocument.body) {
                return jQuery.offset.bodyOffset(elem);
            }

            jQuery.offset.initialize();

            var offsetParent = elem.offsetParent,
                prevOffsetParent = elem,
                doc = elem.ownerDocument,
                computedStyle, docElem = doc.documentElement,
                body = doc.body,
                defaultView = doc.defaultView,
                prevComputedStyle = defaultView ? defaultView.getComputedStyle(elem, null) : elem.currentStyle,
                top = elem.offsetTop,
                left = elem.offsetLeft;

            while ((elem = elem.parentNode) && elem !== body && elem !== docElem) {
                if (jQuery.offset.supportsFixedPosition && prevComputedStyle.position === "fixed") {
                    break;
                }

                computedStyle = defaultView ? defaultView.getComputedStyle(elem, null) : elem.currentStyle;
                top -= elem.scrollTop;
                left -= elem.scrollLeft;

                if (elem === offsetParent) {
                    top += elem.offsetTop;
                    left += elem.offsetLeft;

                    if (jQuery.offset.doesNotAddBorder && !(jQuery.offset.doesAddBorderForTableAndCells && /^t(able|d|h)$/i.test(elem.nodeName))) {
                        top += parseFloat(computedStyle.borderTopWidth) || 0;
                        left += parseFloat(computedStyle.borderLeftWidth) || 0;
                    }

                    prevOffsetParent = offsetParent, offsetParent = elem.offsetParent;
                }

                if (jQuery.offset.subtractsBorderForOverflowNotVisible && computedStyle.overflow !== "visible") {
                    top += parseFloat(computedStyle.borderTopWidth) || 0;
                    left += parseFloat(computedStyle.borderLeftWidth) || 0;
                }

                prevComputedStyle = computedStyle;
            }

            if (prevComputedStyle.position === "relative" || prevComputedStyle.position === "static") {
                top += body.offsetTop;
                left += body.offsetLeft;
            }

            if (jQuery.offset.supportsFixedPosition && prevComputedStyle.position === "fixed") {
                top += Math.max(docElem.scrollTop, body.scrollTop);
                left += Math.max(docElem.scrollLeft, body.scrollLeft);
            }

            return { top: top, left: left };
        };
    }

    jQuery.offset = {
        initialize: function() {
            var body = document.body,
                container = document.createElement("div"),
                innerDiv, checkDiv, table, td, bodyMarginTop = parseFloat(jQuery.curCSS(body, "marginTop", true)) || 0,
                html = "<div style='position:absolute;top:0;left:0;margin:0;border:5px solid #000;padding:0;width:1px;height:1px;'><div></div></div><table style='position:absolute;top:0;left:0;margin:0;border:5px solid #000;padding:0;width:1px;height:1px;' cellpadding='0' cellspacing='0'><tr><td></td></tr></table>";

            jQuery.extend(container.style, { position: "absolute", top: 0, left: 0, margin: 0, border: 0, width: "1px", height: "1px", visibility: "hidden" });

            container.innerHTML = html;
            body.insertBefore(container, body.firstChild);
            innerDiv = container.firstChild;
            checkDiv = innerDiv.firstChild;
            td = innerDiv.nextSibling.firstChild.firstChild;

            this.doesNotAddBorder = (checkDiv.offsetTop !== 5);
            this.doesAddBorderForTableAndCells = (td.offsetTop === 5);

            checkDiv.style.position = "fixed", checkDiv.style.top = "20px";
            // safari subtracts parent border width here which is 5px
            this.supportsFixedPosition = (checkDiv.offsetTop === 20 || checkDiv.offsetTop === 15);
            checkDiv.style.position = checkDiv.style.top = "";

            innerDiv.style.overflow = "hidden", innerDiv.style.position = "relative";
            this.subtractsBorderForOverflowNotVisible = (checkDiv.offsetTop === -5);

            this.doesNotIncludeMarginInBodyOffset = (body.offsetTop !== bodyMarginTop);

            body.removeChild(container);
            body = container = innerDiv = checkDiv = table = td = null;
            jQuery.offset.initialize = jQuery.noop;
        },

        bodyOffset: function(body) {
            var top = body.offsetTop,
                left = body.offsetLeft;

            jQuery.offset.initialize();

            if (jQuery.offset.doesNotIncludeMarginInBodyOffset) {
                top += parseFloat(jQuery.curCSS(body, "marginTop", true)) || 0;
                left += parseFloat(jQuery.curCSS(body, "marginLeft", true)) || 0;
            }

            return { top: top, left: left };
        },

        setOffset: function(elem, options, i) {
            // set position first, in-case top/left are set even on static elem
            if (/static/.test(jQuery.curCSS(elem, "position"))) {
                elem.style.position = "relative";
            }
            var curElem = jQuery(elem),
                curOffset = curElem.offset(),
                curTop = parseInt(jQuery.curCSS(elem, "top", true), 10) || 0,
                curLeft = parseInt(jQuery.curCSS(elem, "left", true), 10) || 0;

            if (jQuery.isFunction(options)) {
                options = options.call(elem, i, curOffset);
            }

            var props = {
                top: (options.top - curOffset.top) + curTop,
                left: (options.left - curOffset.left) + curLeft
            };

            if ("using" in options) {
                options.using.call(elem, props);
            } else {
                curElem.css(props);
            }
        }
    };


    jQuery.fn.extend({
        position: function() {
            if (!this[0]) {
                return null;
            }

            var elem = this[0],

                // Get *real* offsetParent
                offsetParent = this.offsetParent(),

                // Get correct offsets
                offset = this.offset(),
                parentOffset = /^body|html$/i.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

            // Subtract element margins
            // note: when an element has margin: auto the offsetLeft and marginLeft
            // are the same in Safari causing offset.left to incorrectly be 0
            offset.top -= parseFloat(jQuery.curCSS(elem, "marginTop", true)) || 0;
            offset.left -= parseFloat(jQuery.curCSS(elem, "marginLeft", true)) || 0;

            // Add offsetParent borders
            parentOffset.top += parseFloat(jQuery.curCSS(offsetParent[0], "borderTopWidth", true)) || 0;
            parentOffset.left += parseFloat(jQuery.curCSS(offsetParent[0], "borderLeftWidth", true)) || 0;

            // Subtract the two offsets
            return {
                top: offset.top - parentOffset.top,
                left: offset.left - parentOffset.left
            };
        },

        offsetParent: function() {
            return this.map(function() {
                var offsetParent = this.offsetParent || document.body;
                while (offsetParent && (!/^body|html$/i.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static")) {
                    offsetParent = offsetParent.offsetParent;
                }
                return offsetParent;
            });
        }
    });


    // Create scrollLeft and scrollTop methods
    jQuery.each(["Left", "Top"], function(i, name) {
        var method = "scroll" + name;

        jQuery.fn[method] = function(val) {
            var elem = this[0],
                win;

            if (!elem) {
                return null;
            }

            if (val !== undefined) {
                // Set the scroll offset
                return this.each(function() {
                    win = getWindow(this);

                    if (win) {
                        win.scrollTo(!i ? val : jQuery(win).scrollLeft(),
                            i ? val : jQuery(win).scrollTop()
                        );

                    } else {
                        this[method] = val;
                    }
                });
            } else {
                win = getWindow(elem);

                // Return the scroll offset
                return win ? ("pageXOffset" in win) ? win[i ? "pageYOffset" : "pageXOffset"] :
                    jQuery.support.boxModel && win.document.documentElement[method] ||
                    win.document.body[method] :
                    elem[method];
            }
        };
    });

    function getWindow(elem) {
        return ("scrollTo" in elem && elem.document) ?
            elem :
            elem.nodeType === 9 ?
            elem.defaultView || elem.parentWindow :
            false;
    }
    // Create innerHeight, innerWidth, outerHeight and outerWidth methods
    jQuery.each(["Height", "Width"], function(i, name) {

        var type = name.toLowerCase();

        // innerHeight and innerWidth
        jQuery.fn["inner" + name] = function() {
            return this[0] ?
                jQuery.css(this[0], type, false, "padding") :
                null;
        };

        // outerHeight and outerWidth
        jQuery.fn["outer" + name] = function(margin) {
            return this[0] ?
                jQuery.css(this[0], type, false, margin ? "margin" : "border") :
                null;
        };

        jQuery.fn[type] = function(size) {
            // Get window width or height
            var elem = this[0];
            if (!elem) {
                return size == null ? null : this;
            }

            if (jQuery.isFunction(size)) {
                return this.each(function(i) {
                    var self = jQuery(this);
                    self[type](size.call(this, i, self[type]()));
                });
            }

            return ("scrollTo" in elem && elem.document) ? // does it walk and quack like a window?
                // Everyone else use document.documentElement or document.body depending on Quirks vs Standards mode
                elem.document.compatMode === "CSS1Compat" && elem.document.documentElement["client" + name] ||
                elem.document.body["client" + name] :

                // Get document width or height
                (elem.nodeType === 9) ? // is it a document
                // Either scroll[Width/Height] or offset[Width/Height], whichever is greater
                Math.max(
                    elem.documentElement["client" + name],
                    elem.body["scroll" + name], elem.documentElement["scroll" + name],
                    elem.body["offset" + name], elem.documentElement["offset" + name]
                ) :

                // Get or set width or height on the element
                size === undefined ?
                // Get width or height on the element
                jQuery.css(elem, type) :

                // Set the width or height on the element (default to pixels if value is unitless)
                this.css(type, typeof size === "string" ? size : size + "px");
        };

    });
    // Expose jQuery to the global object
    window.jQuery = window.$ = jQuery;

})(window);

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// make jQuery play nice

function JQueryWrapper() {
    // public
    /**
     * The wrapper is an object, so it can't act like a function. We supply
     * an explicit init() method to be used where jQuery() previously applied.
     */
    this.init = function(selector, context) {
        return new this.jQuery.fn.init(selector, context);
    };

    this.clean = function(elems, context, fragment) {
        return this.jQuery.clean(elems, context, fragment);
    };
}

JQueryWrapper.prototype.jQuery = jQuery;

jQuery.noConflict(true); // extreme - bye bye window.jQuery

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////


/*  find_matching_child  */

//Used by atom browserbot
ELEMENT_NODE_TYPE = 1;
elementFindFirstMatchingChild = function(element, selector) {

    var childCount = element.childNodes.length;
    for (var i = 0; i < childCount; i++) {
        var child = element.childNodes[i];
        if (child.nodeType == ELEMENT_NODE_TYPE) {
            if (selector(child)) {
                return child;
            }
            result = elementFindFirstMatchingChild(child, selector);
            if (result) {
                return result;
            }
        }
    }
    return null;
}


/*  tools  */

//Used by locatorbuilder
function exactMatchPattern(string) {
    if (string != null && (string.match(/^\w*:/) || string.indexOf('?') >= 0 || string.indexOf('*') >= 0)) {
        return "exact:" + string;
    } else {
        return string;
    }
}

//Used by locatorbuilder
function classObservable(clazz) {
    clazz.addObserver = function(observer) {
        if (!this.observers) this.observers = [];
        this.observers.push(observer);
    };

    clazz.removeObserver = function(observer) {
        if (!this.observers) return;
        this.observers["delete"](observer);
    };

    clazz.notify = function(event) {
        if (this.log) {
            this.log.debug("notify " + event);
        }
        if (!this.observers) return;
        var args = [];
        for (var i = 1; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        for (var i = 0; i < this.observers.length; i++) {
            var observer = this.observers[i];
            if (observer[event]) {
                try {
                    observer[event].apply(observer, args);
                } catch (e) {
                    //continue with the rest even if one observer fails
                }
            }
        }
    };
}


/*  selenium-browserdetect  */

//Used by htmlutil, api, browserbot
var BrowserVersion = function() {
    this.name = navigator.appName;

    if (navigator.userAgent.indexOf('Mac OS X') != -1) {
        this.isOSX = true;
    }

    if (navigator.userAgent.indexOf('Windows NT 6') != -1) {
        this.isVista = true;
    }

    var _getQueryParameter = function(searchKey) {
        var str = location.search.substr(1);
        if (str == null) return null;
        var clauses = str.split('&');
        for (var i = 0; i < clauses.length; i++) {
            var keyValuePair = clauses[i].split('=', 2);
            var key = unescape(keyValuePair[0]);
            if (key == searchKey) {
                return unescape(keyValuePair[1]);
            }
        }
        return null;
    };

    var self = this;

    var checkChrome = function() {
        var loc = window.document.location.href;
        try {
            loc = window.top.document.location.href;
            if (/^chrome:\/\//.test(loc)) {
                self.isChrome = true;
            } else {
                self.isChrome = false;
            }
        } catch (e) {
            // can't see the top (that means we might be chrome, but it's impossible to be sure)
            self.isChromeDetectable = "no, top location couldn't be read in this window";
            if (_getQueryParameter('thisIsChrome')) {
                self.isChrome = true;
            } else {
                self.isChrome = false;
            }
        }


    };



    if (this.name == "Microsoft Internet Explorer") {
        this.browser = BrowserVersion.IE;
        this.isIE = true;
        try {
            if (window.top.SeleniumHTARunner && window.top.document.location.pathname.match(/.hta$/i)) {
                this.isHTA = true;
            }
        } catch (e) {
            this.isHTADetectable = "no, top location couldn't be read in this window";
            if (_getQueryParameter('thisIsHTA')) {
                self.isHTA = true;
            } else {
                self.isHTA = false;
            }
        }
        if (navigator.appVersion.match(/MSIE 6.0/)) {
            this.isIE6 = true;
        }
        if ("0" == navigator.appMinorVersion) {
            this.preSV1 = true;
            if (this.isIE6) {
                this.appearsToBeBrokenInitialIE6 = true;
            }
        }
        return;
    }

    // google chrome has both 'safari' and 'gecko' in the user agent so
    // it has to go before them - see http://www.google.com/chrome/intl/en/webmasters-faq.html#useragent
    if (navigator.userAgent.indexOf('Chrome/') != -1) {
        this.browser = BrowserVersion.GOOGLECHROME;
        this.isGoogleChrome = true;
        this.isGecko = true;
        this.khtml = true;
        return;
    }

    if (navigator.userAgent.indexOf('Safari') != -1) {
        this.browser = BrowserVersion.SAFARI;
        this.isSafari = true;
        this.khtml = true;
        return;
    }

    if (navigator.userAgent.indexOf('Konqueror') != -1) {
        this.browser = BrowserVersion.KONQUEROR;
        this.isKonqueror = true;
        this.khtml = true;
        return;
    }

    if (navigator.userAgent.indexOf('Firefox') != -1 ||
        navigator.userAgent.indexOf('Namoroka') != -1 ||
        navigator.userAgent.indexOf('Shiretoko') != -1) {
        this.browser = BrowserVersion.FIREFOX;
        this.isFirefox = true;
        this.isGecko = true;
        var result = /.*[Firefox|Namoroka|Shiretoko]\/([\d\.]+).*/.exec(navigator.userAgent);
        if (result) {
            this.firefoxVersion = result[1];
        }
        checkChrome();
        return;
    }

    if (navigator.userAgent.indexOf('Gecko') != -1) {
        this.browser = BrowserVersion.MOZILLA;
        this.isMozilla = true;
        this.isGecko = true;
        checkChrome();
        return;
    }

    this.browser = BrowserVersion.UNKNOWN;
};

BrowserVersion.IE = "IE";
BrowserVersion.KONQUEROR = "Konqueror";
BrowserVersion.SAFARI = "Safari";
BrowserVersion.FIREFOX = "Firefox";
BrowserVersion.MOZILLA = "Mozilla";
BrowserVersion.GOOGLECHROME = "Google Chrome";
BrowserVersion.UNKNOWN = "Unknown";

var browserVersion = new BrowserVersion();



/*  Sideex  */

//Chi-En Huang, SELAB, CSIE, NCKU, 2016/12/28
function Sideex(ox, od, nd) {
    var op = new DOMParser();
    this.od = od;
    this.odre = op.parseFromString(this.od, "text/html");

    var np = new DOMParser();
    this.nd = nd;
    this.ndre = np.parseFromString(this.nd, "text/html");

    this.ox = ox;
    var r = this.odre.evaluate(this.ox, this.odre, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    this.oe = r.singleNodeValue;

    this.tdt = null;
    this.adt = null;
}

Sideex.prototype.l = function() {
    if (this.tdt == null) {
        this.tdt = this.gtdt();
    }
    if (this.adt == null) {
        this.adt = this.gadt();
    }
    this.umtr();

    var mse = this.gmse();
    var nx = this.gex(mse);

    return nx;
};

Sideex.prototype.gtdt = function() {
    var otc = new Map();
    var otdt = new Map();
    var oae = this.odre.getElementsByTagName("*");

    for (var i = 0, oaes = oae.length; i < oaes; i++) {
        var tn = oae[i].tagName;
        var c = 0;

        if (otdt.has(tn)) {
            c = otdt.get(tn);
        }
        otdt.set(tn, c + 1);
    }

    for (var tn of otdt.keys()) {
        var tc = otdt.get(tn);
        var dv = 1.0 / tc;

        otc.set(tn, tc);
        otdt.set(tn, dv);
    }


    var ntc = new Map();
    var ntdt = new Map();
    var nae = this.ndre.getElementsByTagName("*");

    for (var i = 0, naes = nae.length; i < naes; i++) {
        var tn = nae[i].tagName;
        var c = 0;

        if (ntdt.has(tn)) {
            c = ntdt.get(tn);
        }
        ntdt.set(tn, c + 1);
    }

    for (var tn of ntdt.keys()) {
        var tc = ntdt.get(tn);
        var dv = 1.0 / tc;

        ntc.set(tn, tc);
        ntdt.set(tn, dv);
    }

    var atdt = new Map();

    for (var otn of otdt.keys()) {
        var tc = otdt.get(otn) / 2.0;

        atdt.set(otn, tc);
    }

    for (var ntn of ntdt.keys()) {
        if (atdt.has(ntn)) {
            var tc = atdt.get(ntn) + (ntdt.get(ntn) / 2.0);

            atdt.set(ntn, tc);
        } else {
            var tc = ntdt.get(ntn) / 2.0;

            atdt.set(ntn, tc);
        };
    }

    return atdt;
};

Sideex.prototype.gadt = function() {
    var oac = new Map();
    var oadt = new Map();
    var oavdt = new Map();
    var oae = this.odre.getElementsByTagName("*");

    for (var i = 0, oaes = oae.length; i < oaes; i++) {
        var ano = oae[i].attributes.length;

        for (var j = 0; j < ano; j++) {
            var an = oae[i].attributes[j].name;
            var av = oae[i].attributes[j].value;
            var c = 0;

            if (oadt.has(an)) {
                c = oadt.get(an);
            }
            oadt.set(an, c + 1);


            var cvnos = new Set();

            if (oavdt.has(an)) {
                cvnos = oavdt.get(an);
            }
            cvnos.add(av);
            oavdt.set(an, cvnos);
        };
    }

    for (var an of oadt.keys()) {
        var ac = oadt.get(an);
        var avc = oavdt.get(an).size();
        var dv = avc / ac;

        oac.set(an, ac);
        oadt.set(an, dv);
    }


    var nac = new Map();
    var nadt = new Map();
    var navdt = new Map();
    var nae = this.ndre.getElementsByTagName("*");

    for (var i = 0, naes = nae.length; i < naes; i++) {
        var ano = nae[i].attributes.length;

        for (var j = 0; j < ano; j++) {
            var an = nae[i].attributes[j].name;
            var av = nae[i].attributes[j].value;
            var c = 0;

            if (nadt.has(an)) {
                c = nadt.get(an);
            }
            nadt.set(an, c + 1);


            var cvnos = new Set();
            if (navdt.has(an)) {
                cvnos = navdt.get(an);
            }
            cvnos.add(av);
            navdt.set(an, cvnos);
        };
    }

    for (var an of nadt.keys()) {
        var ac = nadt.get(an);
        var avc = navdt.get(an).size();
        var dv = avc / ac;

        nac.set(an, ac);
        nadt.set(an, dv);
    }


    var aadt = new Map();

    for (var oan of oadt.keys()) {
        var ac = oadt.get(oan) / 2.0;

        aadt.set(oan, ac);
    }

    for (var nan of nadt.keys()) {
        if (aadt.has(nan)) {
            var ac = aadt.get(nan) + (nadt.get(nan) / 2.0);

            aadt.set(nan, ac);
        } else {
            var ac = nadt.get(nan) / 2.0;

            aadt.set(nan, ac);
        };
    }

    return aadt;
};

Sideex.prototype.gmse = function() {
    var ms = 0.0;
    var me = null;
    var ae = this.ndre.getElementsByTagName("*");

    for (var c = 0, aes = ae.length; c < aes; c++) {
        if (ae[c] == null) {
            continue;
        }

        var s = this.gtes(this.oe, ae[c]);
        if (s > ms) {
            ms = s;
            me = ae[c];
        } else if (s == ms) {
            if (this.gex(ae[c]) == this.gex(this.oe)) {
                ms = s;
                me = ae[c];
            }
        }
    }

    return me;
};

Sideex.prototype.gtes = function(oe, ne) {
    var ts = this.gts(oe, ne);
    var as = this.gas(oe, ne);
    var cpas = this.gcpas(oe, ne);
    var cprs = this.gcprs(oe, ne);
    var cns = this.gcns(oe, ne);
    var ccs = this.gccs(oe, ne);
    var r = this.gr(oe, ne);
    var w = this.gw(r);
    var v = Array(ts, as, cpas, cprs, cns, ccs);
    var tv = this.gtv(w, v);

    return tv;
};

Sideex.prototype.gts = function(oe, ne) {
    var ot = oe.textContent.toLowerCase();
    var nt = ne.textContent.toLowerCase();

    if (ot.length > 100) {
        ot = ot.substring(0, 100);
    }
    if (nt.length > 100) {
        nt = nt.substring(0, 100);
    }


    var ml = Math.max(ot.length, nt.length);
    var ed = this.ged(ot, nt);

    if (ml < 1) {
        ml = 1;
    }

    return (1.0 - (ed / ml));
};

Sideex.prototype.ged = function(t1, t2) {
    if (t1.length === 0) {
        return t2.length;
    }
    if (t2.length === 0) {
        return t1.length;
    }

    var m = [];

    for (var i = 0; i <= t2.length; i++) {
        m[i] = [i];
    }

    for (var j = 0; j <= t1.length; j++) {
        m[0][j] = j;
    }

    for (var i = 1; i <= t2.length; i++) {
        for (var j = 1; j <= t1.length; j++) {
            if (t2.charAt(i - 1) == t1.charAt(j - 1)) {
                m[i][j] = m[i - 1][j - 1];
            } else {
                m[i][j] = Math.min(m[i - 1][j - 1] + 1,
                    Math.min(m[i][j - 1] + 1,
                        m[i - 1][j] + 1));
            };
        }
    }

    return m[t2.length][t1.length];
};

Sideex.prototype.gas = function(oe, ne) {
    if (oe == null && ne == null) {
        return 1.0;
    }
    if (oe == null || ne == null) {
        return 0.0;
    }


    var oeas = oe.attributes;
    var ota = document.createAttribute("taaNaaa");
    ota.value = oe.tagName;
    oeas.setNamedItem(ota);

    var neas = ne.attributes;
    var nta = document.createAttribute("taaNaaa");
    nta.value = ne.tagName;
    neas.setNamedItem(nta);

    var asm = new Map();

    for (var i = 0; i < oeas.length; i++) {
        if (neas.getNamedItem(oeas[i].name) != null) {
            var sv = 0;

            if (oeas[i].value == neas.getNamedItem(oeas[i].name).value) {
                sv = 1;
            }

            if (oeas[i].name == "taaNaaa") {
                asm.set(oeas[i].name + oeas[i].value, sv);
            } else {
                asm.set(oeas[i].name, sv);
            }
        } else if (oeas[i].name == "taaNaaa") {
            var sv = 0;

            if (oe.tagName == ne.tagName) {
                sv = 1;
            }

            asm.set(oeas[i].name + oeas[i].value, sv);
        }
    }

    var dp = this.gdp(asm);
    var an = this.gan(oeas, neas);
    var cs = 1.0;

    if (dp / an < 1) {
        cs = dp / an;
    }

    return cs;
};

Sideex.prototype.gdp = function(asm) {
    var s = 0.0;

    for (var an of asm.keys()) {
        var sv = asm.get(an);
        var w = 0.0;

        if (an.length > 7 && an.substring(0, 7) == "taaNaaa") {
            w = this.tdt.get(an.substring(7));
        } else {
            w = this.adt.get(an);
        }
        s += w * w * sv;
    }

    return s;
};

Sideex.prototype.gan = function(a1, a2) {
    var s = 0.0;

    for (var i = 0; i < a1.length; i++) {
        var w = 0.0;

        if (a1[i].name == "taaNaaa") {
            w = this.tdt.get(a1[i].value);
        } else {
            w = this.adt.get(a1[i].name);
        }
        s += w * w;
    }

    for (var i = 0; i < a2.length; i++) {
        if (a2.getNamedItem(a1.name) != null) {
            var w = 0.0;

            if (a2[i].name == "taaNaaa") {
                w = this.tdt.get(a2[i].value);
            } else {
                w = this.adt.get(a2[i].name);
            }
            s += w * w;
        }
    }

    return s;
};

Sideex.prototype.gcpas = function(oe, ne) {
    var opae = oe.parentElement;
    var npae = ne.parentElement;
    var pas = this.gas(opae, npae);

    return pas;
};

Sideex.prototype.gcprs = function(oe, ne) {
    var opre = oe.previousElementSibling;
    var npre = ne.previousElementSibling;
    var prs = this.gas(opre, npre);

    return prs;
};

Sideex.prototype.gcns = function(oe, ne) {
    var one = oe.nextElementSibling;
    var nne = ne.nextElementSibling;
    var ns = this.gas(one, nne);

    return ns;
};

Sideex.prototype.gccs = function(oe, ne) {
    var oce = oe.children;
    var nce = ne.children;
    var oces = oce.length;
    var nces = nce.length;

    if (oces == 0 && nces == 0) {
        return 1.0;
    }
    if (oces == 0 || nces == 0) {
        return 0.0;
    }


    var mces = Math.min(oces, nces);
    var cs = 0.0;

    for (var i = 0; i < mces; i++) {
        cs += this.gas(oce[i], nce[i]);
    }

    cs /= (Math.sqrt(oces) * Math.sqrt(nces));
    if (cs > 1) {
        cs = 1.0;
    }

    return cs;
};

Sideex.prototype.gr = function(oe, ne) {
    var ra = new Array(6);

    var otlr = oe.textContent.length;
    ra[0] = this.lo(otlr, 1.0 / 3.0);

    ra[1] = this.lo((oe.attributes.length + ne.attributes.length) / 2.0, 1.0);

    var opae = oe.parentElement;
    var npae = ne.parentElement;
    var opaeal = 0;
    var npaeal = 0;
    if (opae != null) {
        opaeal = opae.attributes.length;
    }
    if (npae != null) {
        npaeal = npae.attributes.length;
    }
    ra[2] = this.lo((opaeal + npaeal) / 2.0, 1.0);

    var opre = oe.previousElementSibling;
    var npre = ne.previousElementSibling;
    var opreal = 0;
    var npreal = 0;
    if (opre != null) {
        opreal = opre.attributes.length;
    }
    if (npre != null) {
        npreal = npre.attributes.length;
    }
    ra[3] = this.lo((opreal + npreal) / 2.0, 1.0);

    var one = oe.nextElementSibling;
    var nne = ne.nextElementSibling;
    var oneal = 0;
    var nneal = 0;
    if (one != null) {
        oneal = one.attributes.length;
    }
    if (nne != null) {
        nneal = nne.attributes.length;
    }
    ra[4] = this.lo((oneal + nneal) / 2.0, 1.0);

    ra[5] = this.lo((oe.children.length + ne.children.length) / 2.0, 1.0);

    return ra;
};

Sideex.prototype.lo = function(x, k) {
    return (2.0 / (1.0 + Math.exp(-x * k))) - 1.0;
};

Sideex.prototype.gw = function(r) {
    var wa = new Array(6);
    var s = 0.0;

    r[0] *= 0.35;
    r[1] *= 0.35;
    r[2] *= 0.05;
    r[3] *= 0.25;
    r[4] *= 0.25;
    r[5] *= 0.75;
    for (var i = 0; i < r.length; i++) {
        s += r[i];
    }

    for (var i = 0; i < r.length; i++) {
        wa[i] = r[i] / s;
    }

    return wa;
};

Sideex.prototype.gtv = function(w, v) {
    var fv = 0.0;

    for (var i = 0; i < v.length; i++) {
        fv += v[i] * w[i];
    }

    return fv;
};

Sideex.prototype.gex = function(e) {
    if (e == null) {
        return "null";
    }
    if (e.parentElement == null) {
        return "/" + e.tagName;
    }


    var se = e.parentElement.children;
    var tc = 0;
    var ttc = 0;
    var ifd = false;

    for (var i = 0; i < se.length; i++) {
        if (se[i].tagName == e.tagName && !ifd) {
            tc++;
            ttc++;
        } else if (se[i].tagName == e.tagName) {
            ttc++;
        }
        if (se[i] == e) {
            ifd = true;
        }
    }

    if (ttc > 1) {
        return this.gex(e.parentElement) + "/" + e.tagName + "[" + tc + "]";
    }

    return this.gex(e.parentElement) + "/" + e.tagName;
};

Sideex.prototype.umtr = function() {
    var oae = this.odre.getElementsByTagName("*");
    var nae = this.ndre.getElementsByTagName("*");

    for (var c = 0, oaes = oae.length; c < oaes; c++) {
        if (oae[c] == null) {
            continue;
        }
        if (oae[c].childNodes.length != 0) {
            if (oae[c].firstChild.nodeType != 3) {
                continue;
            }
        }

        var ot = "";
        if (oae[c].childNodes.length == 0) {
            ot = oae[c].textContent;
        } else {
            ot = oae[c].firstChild.nodeValue.trim();
        }
        if (ot == "") {
            if (oae[c].tagName == "input" && oae[c].hasAttribute("type") && ((oae[c].getAttribute("type") == "submit") || (oae[c].getAttribute("type") == "button")) && oae[c].hasAttribute("value")) {
                if (oae[c].childNodes.length == 0) {
                    oae[c].textContent = oae[c].getAttribute("value");
                    ot = oae[c].textContent;
                } else {
                    oae[c].firstChild.nodeValue = oae[c].getAttribute("value");
                    ot = oae[c].firstChild.nodeValue;
                }
                oae[c].removeAttribute("value");
            }
            if (ot == "" && oae[c].hasAttribute("title")) {
                if (oae[c].childNodes.length == 0) {
                    oae[c].textContent = oae[c].getAttribute("title");
                    ot = oae[c].textContent;
                } else {
                    oae[c].firstChild.nodeValue = oae[c].getAttribute("title");
                    ot = oae[c].firstChild.nodeValue;
                }
                oae[c].removeAttribute("title");
            }
            if (ot == "" && oae[c].hasAttribute("alt")) {
                if (oae[c].childNodes.length == 0) {
                    oae[c].textContent = oae[c].getAttribute("alt");
                    ot = oae[c].textContent;
                } else {
                    oae[c].firstChild.nodeValue = oae[c].getAttribute("alt");
                    ot = oae[c].firstChild.nodeValue;
                }
                oae[c].removeAttribute("alt");
            }
        }
    }

    for (var c = 0, naes = nae.length; c < naes; c++) {
        if (nae[c] == null) {
            continue;
        }
        if (nae[c].childNodes.length != 0) {
            if (nae[c].firstChild.nodeType != 3) {
                continue;
            }
        }

        var nt = "";
        if (nae[c].childNodes.length == 0) {
            nt = nae[c].textContent;
        } else {
            nt = nae[c].firstChild.nodeValue.trim();
        }
        if (nt == "") {
            if (nae[c].tagName == "input" && nae[c].hasAttribute("type") && ((nae[c].getAttribute("type") == "submit") || (nae[c].getAttribute("type") == "button")) && nae[c].hasAttribute("value")) {
                if (nae[c].childNodes.length == 0) {
                    nae[c].textContent = nae[c].getAttribute("value");
                    nt = nae[c].textContent;
                } else {
                    nae[c].firstChild.nodeValue = nae[c].getAttribute("value");
                    nt = nae[c].firstChild.nodeValue;
                }
                nae[c].removeAttribute("value");
            }
            if (nt == "" && nae[c].hasAttribute("title")) {
                if (nae[c].childNodes.length == 0) {
                    nae[c].textContent = nae[c].getAttribute("title");
                    nt = nae[c].textContent;
                } else {
                    nae[c].firstChild.nodeValue = nae[c].getAttribute("title");
                    nt = nae[c].firstChild.nodeValue;
                }
                nae[c].removeAttribute("title");
            }
            if (nt == "" && nae[c].hasAttribute("alt")) {
                if (nae[c].childNodes.length == 0) {
                    nae[c].textContent = nae[c].getAttribute("alt");
                    nt = nae[c].textContent;
                } else {
                    nae[c].firstChild.nodeValue = nae[c].getAttribute("alt");
                    nt = nae[c].firstChild.nodeValue;
                }
                nae[c].removeAttribute("alt");
            }
        }
    }
};


//self, browserbot
function objectExtend(destination, source) {
    for (var property in source) {
        destination[property] = source[property];
    }
    return destination;
}


/**
 * Parses a Selenium locator, returning its type and the unprefixed locator
 * string as an object.
 *
 * @param locator  the locator to parse
 */
function parse_locator(locator) {
    if (locator.includes("d-XPath")) {
        return { type: 'tac', string: locator };
    } else {
        var result = locator.match(/^([A-Za-z]+)=.+/);
        if (result) {
            var type = result[1].toLowerCase();
            var actualLocator = locator.substring(type.length + 1);
            return { type: type, string: actualLocator };
        }
        return { type: 'implicit', string: locator };
    }
}

// The window to which the commands will be sent.  For example, to click on a
// popup window, first select that window, and then do a normal click command.
var BrowserBot = function(topLevelApplicationWindow) {
    this.topWindow = topLevelApplicationWindow;
    this.topFrame = this.topWindow;
    this.baseUrl = window.location.href;

    // © Jie-Lin You, SideeX Team
    this.count = 1;
    // END

    // the buttonWindow is the Selenium window
    // it contains the Run/Pause buttons... this should *not* be the AUT window
    this.buttonWindow = window;
    this.currentWindow = this.topWindow;
    this.currentWindowName = null;
    this.allowNativeXpath = true;
    this.xpathEvaluator = new XPathEvaluator('ajaxslt'); // change to "javascript-xpath" for the newer, faster engine

    // We need to know this in advance, in case the frame closes unexpectedly
    this.isSubFrameSelected = false;

    this.altKeyDown = false;
    this.controlKeyDown = false;
    this.shiftKeyDown = false;
    this.metaKeyDown = false;

    this.modalDialogTest = null;
    this.recordedAlerts = new Array();
    this.recordedConfirmations = new Array();
    this.recordedPrompts = new Array();
    this.openedWindows = {};
    // © Jie-Lin You, SideeX Team
    this.openedWindows["win_ser_local"] = this.topWindow;
    // END

    this.nextConfirmResult = true;
    this.nextPromptResult = '';
    this.newPageLoaded = false;
    this.pageLoadError = null;

    this.ignoreResponseCode = false;
    this.xhr = null;
    this.abortXhr = false;
    this.isXhrSent = false;
    this.isXhrDone = false;
    this.xhrOpenLocation = null;
    this.xhrResponseCode = null;
    this.xhrStatusText = null;

    this.shouldHighlightLocatedElement = false;

    this.uniqueId = "seleniumMarker" + new Date().getTime();
    this.pollingForLoad = new Object();
    this.permDeniedCount = new Object();
    this.windowPollers = new Array();
    // DGF for backwards compatibility
    this.browserbot = this;

    var self = this;

    objectExtend(this, PageBot.prototype);
    this._registerAllLocatorFunctions();

    this.recordPageLoad = function(elementOrWindow) {
        try {
            if (elementOrWindow.location && elementOrWindow.location.href) {
            } else if (elementOrWindow.contentWindow && elementOrWindow.contentWindow.location && elementOrWindow.contentWindow.location.href) {
            } else {
            }
        } catch (e) {
            self.pageLoadError = e;
            return;
        }
        self.newPageLoaded = true;
    };

    this.isNewPageLoaded = function() {
        var e;

        if (this.pageLoadError) {
            if (this.pageLoadError.stack) {
            }
            e = this.pageLoadError;
            this.pageLoadError = null;
            throw e;
        }

        if (self.ignoreResponseCode) {
            return self.newPageLoaded;
        } else {
            if (self.isXhrSent && self.isXhrDone) {
                if (!((self.xhrResponseCode >= 200 && self.xhrResponseCode <= 399) || self.xhrResponseCode == 0)) {
                    // TODO: for IE status like: 12002, 12007, ... provide corresponding statusText messages also.
                    e = "XHR ERROR: URL = " + self.xhrOpenLocation + " Response_Code = " + self.xhrResponseCode + " Error_Message = " + self.xhrStatusText;
                    self.abortXhr = false;
                    self.isXhrSent = false;
                    self.isXhrDone = false;
                    self.xhrResponseCode = null;
                    self.xhrStatusText = null;
                    throw new SeleniumError(e);
                }
            }
            return self.newPageLoaded && (self.isXhrSent ? (self.abortXhr || self.isXhrDone) : true);
        }
    };

    this.setAllowNativeXPath = function(allow) {
        this.xpathEvaluator.setAllowNativeXPath(allow);
    };

    this.setIgnoreAttributesWithoutValue = function(ignore) {
        this.xpathEvaluator.setIgnoreAttributesWithoutValue(ignore);
    };

    this.setXPathEngine = function(engineName) {
        this.xpathEvaluator.setCurrentEngine(engineName);
    };

    this.getXPathEngine = function() {
        return this.xpathEvaluator.getCurrentEngine();
    };
};

// DGF PageBot exists for backwards compatibility with old user-extensions
var PageBot = function() {};

BrowserBot.createForWindow = function(window, proxyInjectionMode) {
    var browserbot;
    if (browserVersion.isIE) {
        browserbot = new IEBrowserBot(window);
    } else if (browserVersion.isKonqueror) {
        browserbot = new KonquerorBrowserBot(window);
    } else if (browserVersion.isOpera) {
        browserbot = new OperaBrowserBot(window);
    } else if (browserVersion.isSafari) {
        browserbot = new SafariBrowserBot(window);
    } else {
        // Use mozilla by default
        browserbot = new MozillaBrowserBot(window);
    }
    // getCurrentWindow has the side effect of modifying it to handle page loads etc
    browserbot.proxyInjectionMode = proxyInjectionMode;
    browserbot.getCurrentWindow(); // for modifyWindow side effect.  This is not a transparent style
    return browserbot;
};

// todo: rename?  This doesn't actually "do" anything.
BrowserBot.prototype.doModalDialogTest = function(test) {
    this.modalDialogTest = test;
};

BrowserBot.prototype.cancelNextConfirmation = function(result) {
    this.nextConfirmResult = result;
};

//BrowserBot.prototype.setNextPromptResult = function(result) {
    //this.nextResult = result;
//};

BrowserBot.prototype.hasAlerts = function() {
    return (this.recordedAlerts.length > 0);
};

BrowserBot.prototype.relayBotToRC = function(s) {
    // DGF need to do this funny trick to see if we're in PI mode, because
    // "this" might be the window, rather than the browserbot (e.g. during window.alert) 
    var piMode = this.proxyInjectionMode;
    if (!piMode) {
        if (typeof(selenium) != "undefined") {
            piMode = selenium.browserbot && selenium.browserbot.proxyInjectionMode;
        }
    }
    if (piMode) {
        this.relayToRC("selenium." + s);
    }
};

BrowserBot.prototype.relayToRC = function(name) {
    //Evalinsandbox
    var mySandbox = new Components.utils.Sandbox(this.currentWindow.location.href);
    mySandbox.name = name;
    var object = Components.utils.evalInSandbox(name, mySandbox);
    //var object = eval(name);
    var s = 'state:' + serializeObject(name, object) + "\n";
    sendToRC(s, "state=true");
};

BrowserBot.prototype.resetPopups = function() {
    this.recordedAlerts = [];
    this.recordedConfirmations = [];
    this.recordedPrompts = [];
};

BrowserBot.prototype.getNextAlert = function() {
    var t = this.recordedAlerts.shift();
    if (t) {
        t = t.replace(/\n/g, " "); // because Selenese loses \n's when retrieving text from HTML table
    }
    this.relayBotToRC("browserbot.recordedAlerts");
    return t;
};

BrowserBot.prototype.hasConfirmations = function() {
    return (this.recordedConfirmations.length > 0);
};

BrowserBot.prototype.getNextConfirmation = function() {
    var t = this.recordedConfirmations.shift();
    this.relayBotToRC("browserbot.recordedConfirmations");
    return t;
};

BrowserBot.prototype.hasPrompts = function() {
    return (this.recordedPrompts.length > 0);
};

BrowserBot.prototype.getNextPrompt = function() {
    var t = this.recordedPrompts.shift();
    this.relayBotToRC("browserbot.recordedPrompts");
    return t;
};

/* Fire a mouse event in a browser-compatible manner */

BrowserBot.prototype.triggerMouseEvent = function(element, eventType, canBubble, clientX, clientY, button) {
    clientX = clientX ? clientX : 0;
    clientY = clientY ? clientY : 0;

    //LOG.debug("triggerMouseEvent assumes setting screenX and screenY to 0 is ok");
    var screenX = 0;
    var screenY = 0;

    canBubble = (typeof(canBubble) == undefined) ? true : canBubble;
    var evt;
    if (element.fireEvent && element.ownerDocument && element.ownerDocument.createEventObject) { //IE
        evt = createEventObject(element, this.controlKeyDown, this.altKeyDown, this.shiftKeyDown, this.metaKeyDown);
        evt.detail = 0;
        evt.button = button ? button : 1; // default will be the left mouse click ( http://www.javascriptkit.com/jsref/event.shtml )
        evt.relatedTarget = null;
        if (!screenX && !screenY && !clientX && !clientY && !this.controlKeyDown && !this.altKeyDown && !this.shiftKeyDown && !this.metaKeyDown) {
            element.fireEvent('on' + eventType);
        } else {
            evt.screenX = screenX;
            evt.screenY = screenY;
            evt.clientX = clientX;
            evt.clientY = clientY;

            // when we go this route, window.event is never set to contain the event we have just created.
            // ideally we could just slide it in as follows in the try-block below, but this normally
            // doesn't work.  This is why I try to avoid this code path, which is only required if we need to
            // set attributes on the event (e.g., clientX).
            try {
                window.event = evt;
            } catch (e) {
                // getting an "Object does not support this action or property" error.  Save the event away
                // for future reference.
                // TODO: is there a way to update window.event?

                // work around for http://jira.openqa.org/browse/SEL-280 -- make the event available somewhere:
                selenium.browserbot.getCurrentWindow().selenium_event = evt;
            }
            element.fireEvent('on' + eventType, evt);
        }
    } else {
        var doc = goog.dom.getOwnerDocument(element);
        var view = goog.dom.getWindow(doc);

        evt = doc.createEvent('MouseEvents');
        if (evt.initMouseEvent) {
            // see http://developer.mozilla.org/en/docs/DOM:event.button and
            // http://developer.mozilla.org/en/docs/DOM:event.initMouseEvent for button ternary logic logic
            //Safari
            evt.initMouseEvent(eventType, canBubble, true, view, 1, screenX, screenY, clientX, clientY,
                this.controlKeyDown, this.altKeyDown, this.shiftKeyDown, this.metaKeyDown, button ? button : 0, null);
        } else {
            //LOG.warn("element doesn't have initMouseEvent; firing an event which should -- but doesn't -- have other mouse-event related attributes here, as well as controlKeyDown, altKeyDown, shiftKeyDown, metaKeyDown");
            evt.initEvent(eventType, canBubble, true);

            evt.shiftKey = this.shiftKeyDown;
            evt.metaKey = this.metaKeyDown;
            evt.altKey = this.altKeyDown;
            evt.ctrlKey = this.controlKeyDown;
            if (button) {
                evt.button = button;
            }
        }
        element.dispatchEvent(evt);
    }
};

// © Shuo-Heng Shih, SideeX Team
BrowserBot.prototype.triggerDragEvent = function(element, target) {
    var getXpathOfElement = function(element) {
        if (element == null) {
            return "null";
        }
        if (element.parentElement == null) {
            return "/" + element.tagName;
        }


        var siblingElement = element.parentElement.children;
        var tagCount = 0;
        var totalTagCount = 0;
        var isFound = false;

        for (var i = 0; i < siblingElement.length; i++) {
            if (siblingElement[i].tagName == element.tagName && !isFound) {
                tagCount++;
                totalTagCount++;
            } else if (siblingElement[i].tagName == element.tagName) {
                totalTagCount++;
            }
            if (siblingElement[i] == element) {
                isFound = true;
            }
        }

        if (totalTagCount > 1) {
            return getXpathOfElement(element.parentElement) + "/" + element.tagName + "[" + tagCount + "]";
        }

        return getXpathOfElement(element.parentElement) + "/" + element.tagName;
    };
    var script = "                                              \
        function simulateDragDrop(sourceNode, destinationNode){\
        function createCustomEvent(type) {                     \
            var event = new CustomEvent('CustomEvent');        \
            event.initCustomEvent(type, true, true, null);     \
            event.dataTransfer = {                             \
                data: {                                        \
                },                                             \
                setData: function(type, val) {                 \
                    this.data[type] = val;                     \
                },                                             \
                getData: function(type) {                      \
                    return this.data[type];                    \
                }                                              \
            };                                                 \
            return event;                                      \
        }                                                      \
        function dispatchEvent(node, type, event) {            \
            if (node.dispatchEvent) {                          \
                return node.dispatchEvent(event);              \
            }                                                  \
            if (node.fireEvent) {                              \
                return node.fireEvent('on' + type, event);     \
            }                                                  \
        }                                                      \
        var event = createCustomEvent('dragstart');            \
        dispatchEvent(sourceNode, 'dragstart', event);         \
                                                               \
        var dropEvent = createCustomEvent('drop');             \
        dropEvent.dataTransfer = event.dataTransfer;           \
        dispatchEvent(destinationNode, 'drop', dropEvent);     \
                                                               \
        var dragEndEvent = createCustomEvent('dragend');       \
        dragEndEvent.dataTransfer = event.dataTransfer;        \
        dispatchEvent(sourceNode, 'dragend', dragEndEvent);    \
    }                                                          \
    simulateDragDrop(document.evaluate('" + getXpathOfElement(element) + "', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue, document.evaluate('" + getXpathOfElement(target) + "', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue);\
    ";
    var win = this.browserbot.getCurrentWindow();
    var doc = win.document;
    var scriptTag = doc.createElement("script");
    scriptTag.type = "text/javascript";
    scriptTag.text = script;
    doc.body.appendChild(scriptTag);
};
// END

BrowserBot.prototype._windowClosed = function(win) {
    try {
        var c = win.closed;
        if (c == null) return true;
        return c;
    } catch (ignored) {
        // Firefox 15+ may already have marked the win dead. Accessing it
        // causes an exception to be thrown. That exception tells us the window
        // is closed.
        return true;
    }
};

BrowserBot.uniqueKey = 1;

BrowserBot.prototype._modifyWindow = function(win) {
    // In proxyInjectionMode, have to suppress //LOG calls in _modifyWindow to avoid an infinite loop
    if (this._windowClosed(win)) {
        if (!this.proxyInjectionMode) {
            //LOG.error("modifyWindow: Window was closed!");
        }
        return null;
    }
    if (!this.proxyInjectionMode) {
        //LOG.debug('modifyWindow ' + this.uniqueId + ":" + win[this.uniqueId]);
    }

    // Assign a unique label for this window. We set this on a known attribute so we can reliably
    // find it later. This is slightly different from uniqueId.
    win.seleniumKey = BrowserBot.uniqueKey++;

    this.modifyWindowToRecordPopUpDialogs(win, this);

    //Commenting out for issue 1854
    //win[this.uniqueId] = 1;

    // In proxyInjection mode, we have our own mechanism for detecting page loads
    if (!this.proxyInjectionMode) {
        this.modifySeparateTestWindowToDetectPageLoads(win);
    }
    if (win.frames && win.frames.length && win.frames.length > 0) {
        for (var i = 0; i < win.frames.length; i++) {
            try {
                this._modifyWindow(win.frames[i]);
            } catch (e) {} // we're just trying to be opportunistic; don't worry if this doesn't work out
        }
    }
    return win;
};

BrowserBot.prototype.selectWindow = function(target) {
    if (!target || target == "null") {
        this._selectTopWindow();
        return;
    }
    var result = target.match(/^([a-zA-Z]+)=(.*)/);
    if (!result) {
        this._selectWindowByWindowId(target);
        return;
    }
    locatorType = result[1];
    locatorValue = result[2];
    if (locatorType == "title") {
        this._selectWindowByTitle(locatorValue);
    }
    // TODO separate name and var into separate functions
    else if (locatorType == "name") {
        this._selectWindowByName(locatorValue);
    } else if (locatorType == "var") {
        var win = this.getCurrentWindow().eval(locatorValue);
        if (win) {
            this._selectWindowByName(win.name);
        } else {
            throw new SeleniumError("Window not found by var: " + locatorValue);
        }
    } else {
        throw new SeleniumError("Window locator not recognized: " + locatorType);
    }
};

BrowserBot.prototype.selectPopUp = function(windowId) {
    if (!windowId || windowId == 'null') {
        this._selectFirstNonTopWindow();
    } else {
        this._selectWindowByWindowId(windowId);
    }
};

BrowserBot.prototype._selectTopWindow = function() {
    this.currentWindowName = null;
    this.currentWindow = this.topWindow;
    this.topFrame = this.topWindow;
    this.isSubFrameSelected = false;
};

BrowserBot.prototype._selectWindowByWindowId = function(windowId) {
    try {
        this._selectWindowByName(windowId);
    } catch (e) {
        this._selectWindowByTitle(windowId);
    }
};

BrowserBot.prototype._selectWindowByName = function(target) {
    this.currentWindow = this.getWindowByName(target, false);
    this.topFrame = this.currentWindow;
    this.currentWindowName = target;
    this.isSubFrameSelected = false;
};

BrowserBot.prototype._selectWindowByTitle = function(target) {
    var windowName = this.getWindowNameByTitle(target);
    if (!windowName) {
        this._selectTopWindow();
    } else {
        this._selectWindowByName(windowName);
    }
};

BrowserBot.prototype._selectFirstNonTopWindow = function() {
    var names = this.getNonTopWindowNames();
    if (names.length) {
        this._selectWindowByName(names[0]);
    }
};

BrowserBot.prototype.selectFrame = function(target) {
    var frame;

    if (target.indexOf("index=") == 0) {
        target = target.substr(6);
        frame = this.getCurrentWindow().frames[target];
        if (frame == null) {
            throw new SeleniumError("Not found: frames[" + target + "]");
        }
        if (!frame.document) {
            throw new SeleniumError("frames[" + target + "] is not a frame");
        }
        this.currentWindow = frame;
        this.isSubFrameSelected = true;
    } else if (target == "relative=up" || target == "relative=parent") {
        this.currentWindow = this.getCurrentWindow().parent;
        this.isSubFrameSelected = (this._getFrameElement(this.currentWindow) != null);
    } else if (target == "relative=top") {
        this.currentWindow = this.topFrame;
        this.isSubFrameSelected = false;
    } else {
        frame = this.findElement(target);
        if (frame == null) {
            throw new SeleniumError("Not found: " + target);
        }
        // now, did they give us a frame or a frame ELEMENT?
        var match = false;
        if (frame.contentWindow) {
            // this must be a frame element
            if (browserVersion.isHTA) {
                // stupid HTA bug; can't get in the front door
                target = frame.contentWindow.name;
            } else {
                this.currentWindow = frame.contentWindow;
                this.isSubFrameSelected = true;
                match = true;
            }
        } else if (frame.document && frame.location) {
            // must be an actual window frame
            this.currentWindow = frame;
            this.isSubFrameSelected = true;
            match = true;
        }

        if (!match) {
            // neither, let's loop through the frame names
            var win = this.getCurrentWindow();

            if (win && win.frames && win.frames.length) {
                for (var i = 0; i < win.frames.length; i++) {
                    if (win.frames[i].name == target) {
                        this.currentWindow = win.frames[i];
                        this.isSubFrameSelected = true;
                        match = true;
                        break;
                    }
                }
            }
            if (!match) {
                throw new SeleniumError("Not a frame: " + target);
            }
        }
    }
    // modifies the window
    this.getCurrentWindow();
};

BrowserBot.prototype.doesThisFrameMatchFrameExpression = function(currentFrameString, target) {
    var isDom = false;
    if (target.indexOf("dom=") == 0) {
        target = target.substr(4);
        isDom = true;
    } else if (target.indexOf("index=") == 0) {
        target = "frames[" + target.substr(6) + "]";
        isDom = true;
    }
    var t;
    //Evalinsandbox
    var mySandbox = new Components.utils.Sandbox(this.currentWindow.location.href);
    mySandbox.currentFrameString = currentFrameString;
    mySandbox.target = target;
    try {
        t = Components.utils.evalInSandbox(currentFrameString + "." + target, mySandbox);
        //eval("t=" + currentFrameString + "." + target);
    } catch (e) {}
    var autWindow = this.browserbot.getCurrentWindow();
    if (t != null) {
        try {
            if (t.window == autWindow) {
                return true;
            }
            if (t.window.uniqueId == autWindow.uniqueId) {
                return true;
            }
            return false;
        } catch (permDenied) {
            // DGF if the windows are incomparable, they're probably not the same...
        }
    }
    if (isDom) {
        return false;
    }
    var currentFrame = Components.utils.evalInSandbox(currentFrameString, mySandbox);
    //var currentFrame;
    //eval("currentFrame=" + currentFrameString);
    if (target == "relative=up") {
        if (currentFrame.window.parent == autWindow) {
            return true;
        }
        return false;
    }
    if (target == "relative=top") {
        if (currentFrame.window.top == autWindow) {
            return true;
        }
        return false;
    }
    if (currentFrame.window == autWindow.parent) {
        if (autWindow.name == target) {
            return true;
        }
        try {
            var element = this.findElement(target, currentFrame.window);
            if (element.contentWindow == autWindow) {
                return true;
            }
        } catch (e) {}
    }
    return false;
};

BrowserBot.prototype.abortXhrRequest = function() {
    if (this.ignoreResponseCode) {
        //LOG.debug("XHR response code being ignored. Nothing to abort.");
    } else {
        if (this.abortXhr == false && this.isXhrSent && !this.isXhrDone) {
            //LOG.info("abortXhrRequest(): aborting request");
            this.abortXhr = true;
            this.xhr.abort();
        }
    }
};

BrowserBot.prototype.onXhrStateChange = function(method) {
    //LOG.info("onXhrStateChange(): xhr.readyState = " + this.xhr.readyState + " method = " + method + " time = " + new Date().getTime());
    if (this.xhr.readyState == 4) {

        // check if the request got aborted.
        if (this.abortXhr == true) {
            this.xhrResponseCode = 0;
            this.xhrStatusText = "Request Aborted";
            this.isXhrDone = true;
            return;
        }

        try {
            if (method == "HEAD" && (this.xhr.status == 501 || this.xhr.status == 405)) {
                //LOG.info("onXhrStateChange(): HEAD ajax returned 501 or 405, retrying with GET");
                // handle 501 response code from servers that do not support 'HEAD' method.
                // send GET ajax request with range 0-1.
                this.xhr = XmlHttp.create();
                this.xhr.onreadystatechange = this.onXhrStateChange.bind(this, "GET");
                this.xhr.open("GET", this.xhrOpenLocation, true);
                this.xhr.setRequestHeader("Range", "bytes:0-1");
                this.xhr.send("");
                this.isXhrSent = true;
                return;
            }
            this.xhrResponseCode = this.xhr.status;
            this.xhrStatusText = this.xhr.statusText;
        } catch (ex) {
            //LOG.info("encountered exception while reading xhrResponseCode." + ex.message);
            this.xhrResponseCode = -1;
            this.xhrStatusText = "Request Error";
        }

        this.isXhrDone = true;
    }
};

BrowserBot.prototype.checkedOpen = function(target) {
    var url = absolutify(target, this.baseUrl);
    //LOG.debug("checkedOpen(): url = " + url);
    this.isXhrDone = false;
    this.abortXhr = false;
    this.xhrResponseCode = null;
    this.xhrOpenLocation = url;
    try {
        this.xhr = XmlHttp.create();
    } catch (ex) {
        //LOG.error("Your browser doesnt support Xml Http Request");
        return;
    }
    this.xhr.onreadystatechange = this.onXhrStateChange.bind(this, "HEAD");
    this.xhr.open("HEAD", url, true);
    this.xhr.send("");
    this.isXhrSent = true;
};

BrowserBot.prototype.openLocation = function(target) {
    // We're moving to a new page - clear the current one
    var win = this.getCurrentWindow();
    //LOG.debug("openLocation newPageLoaded = false");
    this.newPageLoaded = false;
    if (!this.ignoreResponseCode) {
        this.checkedOpen(target);
    }
    this.setOpenLocation(win, target);
};

BrowserBot.prototype.openWindow = function(url, windowID) {
    if (url != "") {
        // KAT-BEGIN change to katalon url
        // url = "https://www.google.com";
        url = "https://www.katalon.com";
    }
    if (browserVersion.isHTA) {
        // in HTA mode, calling .open on the window interprets the url relative to that window
        // we need to absolute-ize the URL to make it consistent
        var child = this.getCurrentWindow().open(url, windowID, 'resizable=yes');
        selenium.browserbot.openedWindows[windowID] = child;
    } else {
        this.getCurrentWindow().open(url, windowID, 'resizable=yes');
    }
};

BrowserBot.prototype.setIFrameLocation = function(iframe, location) {
    iframe.src = location;
};

BrowserBot.prototype.setOpenLocation = function(win, loc) {
    loc = absolutify(loc, this.baseUrl);
    if (browserVersion.isHTA) {
        var oldHref = win.location.href;
        win.location.href = loc;
        var marker = null;
        try {
            marker = this.isPollingForLoad(win);
            if (marker && win.location[marker]) {
                win.location[marker] = false;
            }
        } catch (e) {} // DGF don't know why, but this often fails
    } else {
        try {
            // © Yu-Xian Chen, SideeX Team
            // window.location.href = window.location.href will not reload the page if there's an anchor (#) in the URL
            if (win.location.href === loc) {
                win.location.reload();
            } else {
                win.location.href = loc;
            }
            // END
        } catch (err) {
            //Samit: Fix: SeleniumIDE under Firefox 4 breaks if you try to open chrome URL on (XPCNativeWrapper) unwrapped window objects
            if (err.name && err.name == "NS_ERROR_FAILURE") {
                ////LOG.debug("wrapping and retrying");
                try {
                    XPCNativeWrapper(win).location.href = loc; //wrap it and try again
                } catch (e) {
                    throw err; //throw the original error, not this one
                }
            } else {
                throw err; //throw the original error, since we cannot fix it
            }
        }
    }
};

BrowserBot.prototype.getCurrentPage = function() {
    return this;
};


BrowserBot.prototype.windowNeedsModifying = function(win, uniqueId) {
    // On anything but Firefox, checking the unique id is enough.
    // Firefox 4 introduces a race condition which selenium regularly loses.

    try {
        var appInfo = Components.classes['@mozilla.org/xre/app-info;1'].
        getService(Components.interfaces.nsIXULAppInfo);
        var versionChecker = Components.
        classes['@mozilla.org/xpcom/version-comparator;1'].
        getService(Components.interfaces.nsIVersionComparator);

        if (versionChecker.compare(appInfo.version, '4.0b1') >= 0) {
            return win.alert.toString().indexOf("native code") != -1;
        }
    } catch (ignored) {}
    return !win[uniqueId];
};


BrowserBot.prototype.modifyWindowToRecordPopUpDialogs = function(originalWindow, browserBot) {
    var self = this;

    // Apparently, Firefox 4 makes it possible to unwrap an object to find that
    // there's nothing in it.
    var windowToModify = originalWindow;
    if (!windowToModify) {
        windowToModify = originalWindow;
    }

    windowToModify.seleniumAlert = windowToModify.alert;

    if (!self.windowNeedsModifying(windowToModify, browserBot.uniqueId)) {
        return;
    }

    windowToModify.alert = function(alert) {
        browserBot.recordedAlerts.push(alert);
        self.relayBotToRC.call(self, "browserbot.recordedAlerts");
    };

    windowToModify.confirm = function(message) {
        browserBot.recordedConfirmations.push(message);
        var result = browserBot.nextConfirmResult;
        browserBot.nextConfirmResult = true;
        self.relayBotToRC.call(self, "browserbot.recordedConfirmations");
        return result;
    };

    windowToModify.prompt = function(message) {
        browserBot.recordedPrompts.push(message);
        var result = !browserBot.nextConfirmResult ? null : browserBot.nextPromptResult;
        browserBot.nextConfirmResult = true;
        browserBot.nextPromptResult = '';
        self.relayBotToRC.call(self, "browserbot.recordedPrompts");
        return result;
    };

    // Keep a reference to all popup windows by name
    // note that in IE the "windowName" argument must be a valid javascript identifier, it seems.
    var originalOpen = windowToModify.open;
    var originalOpenReference;
    if (browserVersion.isHTA) {
        originalOpenReference = 'selenium_originalOpen' + new Date().getTime();
        windowToModify[originalOpenReference] = windowToModify.open;
    }

    var isHTA = browserVersion.isHTA;

    var newOpen = function(url, windowName, windowFeatures, replaceFlag) {
        var myOriginalOpen = originalOpen;
        if (isHTA) {
            myOriginalOpen = this[originalOpenReference];
        }

        // © Jie-Lin You, SideeX Team
        if (windowName == "" || windowName == "_blank" || typeof windowName === "undefined") {
            windowName = "win_ser_" + self.count;
            self.count += 1;
        }
        // END

        var openedWindow = myOriginalOpen(url, windowName, windowFeatures, replaceFlag);
        //LOG.debug("window.open call intercepted; window ID (which you can use with selectWindow()) is \"" +  windowName + "\"");
        if (windowName != null) {
            openedWindow["seleniumWindowName"] = windowName;
        }
        selenium.browserbot.openedWindows[windowName] = openedWindow;
        return openedWindow;
    };

    if (browserVersion.isHTA) {
        originalOpenReference = 'selenium_originalOpen' + new Date().getTime();
        newOpenReference = 'selenium_newOpen' + new Date().getTime();
        var setOriginalRef = "this['" + originalOpenReference + "'] = this.open;";

        if (windowToModify.eval) {
            windowToModify.eval(setOriginalRef);
            windowToModify.open = newOpen;
        } else {
            // DGF why can't I eval here?  Seems like I'm querying the window at a bad time, maybe?
            setOriginalRef += "this.open = this['" + newOpenReference + "'];";
            windowToModify[newOpenReference] = newOpen;
            windowToModify.setTimeout(setOriginalRef, 0);
        }
    } else {
        windowToModify.open = newOpen;
    }
};

/**
 * Call the supplied function when a the current page unloads and a new one loads.
 * This is done by polling continuously until the document changes and is fully loaded.
 */
BrowserBot.prototype.modifySeparateTestWindowToDetectPageLoads = function(windowObject) {
    // Since the unload event doesn't fire in Safari 1.3, we start polling immediately
    if (!windowObject) {
        //LOG.warn("modifySeparateTestWindowToDetectPageLoads: no windowObject!");
        return;
    }
    if (this._windowClosed(windowObject)) {
        //LOG.info("modifySeparateTestWindowToDetectPageLoads: windowObject was closed");
        return;
    }
    var oldMarker = this.isPollingForLoad(windowObject);
    if (oldMarker) {
        //LOG.debug("modifySeparateTestWindowToDetectPageLoads: already polling this window: " + oldMarker);
        return;
    }

    var marker = 'selenium' + new Date().getTime();
    //LOG.debug("Starting pollForLoad (" + marker + "): " + windowObject.location);
    this.pollingForLoad[marker] = true;
    // if this is a frame, add a load listener, otherwise, attach a poller
    var frameElement = this._getFrameElement(windowObject);
    // DGF HTA mode can't attach load listeners to subframes (yuk!)
    var htaSubFrame = this._isHTASubFrame(windowObject);
    if (frameElement && !htaSubFrame) {
        //LOG.debug("modifySeparateTestWindowToDetectPageLoads: this window is a frame; attaching a load listener");
        addLoadListener(frameElement, this.recordPageLoad);
        frameElement[marker] = true;
        frameElement["frame" + this.uniqueId] = marker;
        //LOG.debug("dgf this.uniqueId="+this.uniqueId);
        //LOG.debug("dgf marker="+marker);
        //LOG.debug("dgf frameElement['frame'+this.uniqueId]="+frameElement['frame'+this.uniqueId]);
        frameElement[this.uniqueId] = marker;
        //LOG.debug("dgf frameElement[this.uniqueId]="+frameElement[this.uniqueId]);
    } else {
        windowObject.location[marker] = true;
        windowObject[this.uniqueId] = marker;
        this.pollForLoad(this.recordPageLoad, windowObject, windowObject.document, windowObject.location, windowObject.location.href, marker);
    }
};

BrowserBot.prototype._isHTASubFrame = function(win) {
    if (!browserVersion.isHTA) return false;
    // DGF this is wrong! what if "win" isn't the selected window?
    return this.isSubFrameSelected;
};

BrowserBot.prototype._getFrameElement = function(win) {
    var frameElement = null;
    var caught;
    try {
        frameElement = win.frameElement;
    } catch (e) {
        caught = true;
    }
    if (caught) {
        // on IE, checking frameElement in a pop-up results in a "No such interface supported" exception
        // but it might have a frame element anyway!
        var parentContainsIdenticallyNamedFrame = false;
        try {
            parentContainsIdenticallyNamedFrame = win.parent.frames[win.name];
        } catch (e) {} // this may fail if access is denied to the parent; in that case, assume it's not a pop-up

        if (parentContainsIdenticallyNamedFrame) {
            // it can't be a coincidence that the parent has a frame with the same name as myself!
            var result;
            try {
                result = parentContainsIdenticallyNamedFrame.frameElement;
                if (result) {
                    return result;
                }
            } catch (e) {} // it was worth a try! _getFrameElementsByName is often slow
            result = this._getFrameElementByName(win.name, win.parent.document, win);
            return result;
        }
    }
    //LOG.debug("_getFrameElement: frameElement="+frameElement); 
    if (frameElement) {
        //LOG.debug("frameElement.name="+frameElement.name);
    }
    return frameElement;
};

BrowserBot.prototype._getFrameElementByName = function(name, doc, win) {
    var frames;
    var frame;
    var i;
    frames = doc.getElementsByTagName("iframe");
    for (i = 0; i < frames.length; i++) {
        frame = frames[i];
        if (frame.name === name) {
            return frame;
        }
    }
    frames = doc.getElementsByTagName("frame");
    for (i = 0; i < frames.length; i++) {
        frame = frames[i];
        if (frame.name === name) {
            return frame;
        }
    }
    // DGF weird; we only call this function when we know the doc contains the frame
    //LOG.warn("_getFrameElementByName couldn't find a frame or iframe; checking every element for the name " + name);
    return BrowserBot.prototype.locateElementByName(win.name, win.parent.document);
};


/**
 * Set up a polling timer that will keep checking the readyState of the document until it's complete.
 * Since we might call this before the original page is unloaded, we first check to see that the current location
 * or href is different from the original one.
 */
BrowserBot.prototype.pollForLoad = function(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker) {
    //LOG.debug("pollForLoad original (" + marker + "): " + originalHref);
    try {
        //Samit: Fix: open command sometimes fails if current url is chrome and new is not
        windowObject = windowObject;
        if (this._windowClosed(windowObject)) {
            //LOG.debug("pollForLoad WINDOW CLOSED (" + marker + ")");
            delete this.pollingForLoad[marker];
            return;
        }

        var isSamePage = this._isSamePage(windowObject, originalDocument, originalLocation, originalHref, marker);
        var rs = this.getReadyState(windowObject, windowObject.document);

        if (!isSamePage && rs == 'complete') {
            var currentHref = windowObject.location.href;
            //LOG.debug("pollForLoad FINISHED (" + marker + "): " + rs + " (" + currentHref + ")");
            delete this.pollingForLoad[marker];
            this._modifyWindow(windowObject);
            var newMarker = this.isPollingForLoad(windowObject);
            if (!newMarker) {
                //LOG.debug("modifyWindow didn't start new poller: " + newMarker);
                this.modifySeparateTestWindowToDetectPageLoads(windowObject);
            }
            newMarker = this.isPollingForLoad(windowObject);
            var currentlySelectedWindow;
            var currentlySelectedWindowMarker;
            currentlySelectedWindow = this.getCurrentWindow(true);
            currentlySelectedWindowMarker = currentlySelectedWindow[this.uniqueId];

            //LOG.debug("pollForLoad (" + marker + ") restarting " + newMarker);
            if (/(TestRunner-splash|Blank)\.html\?start=true$/.test(currentHref)) {
                //LOG.debug("pollForLoad Oh, it's just the starting page.  Never mind!");
            } else if (currentlySelectedWindowMarker == newMarker) {
                loadFunction(currentlySelectedWindow);
            } else {
                //LOG.debug("pollForLoad page load detected in non-current window; ignoring (currentlySelected="+currentlySelectedWindowMarker+", detection in "+newMarker+")");
            }
            return;
        }
        //LOG.debug("pollForLoad continue (" + marker + "): " + currentHref);
        this.reschedulePoller(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
    } catch (e) {
        //LOG.debug("Exception during pollForLoad; this should get noticed soon (" + e.message + ")!");
        //DGF this is supposed to get logged later; log it at debug just in case
        ////LOG.exception(e);
        this.pageLoadError = e;
    }
};

BrowserBot.prototype._isSamePage = function(windowObject, originalDocument, originalLocation, originalHref, marker) {
    var currentDocument = windowObject.document;
    var currentLocation = windowObject.location;
    var currentHref = currentLocation.href;

    var sameDoc = this._isSameDocument(originalDocument, currentDocument);

    var sameLoc = (originalLocation === currentLocation);

    // hash marks don't meant the page has loaded, so we need to strip them off if they exist...
    var currentHash = currentHref.indexOf('#');
    if (currentHash > 0) {
        currentHref = currentHref.substring(0, currentHash);
    }
    var originalHash = originalHref.indexOf('#');
    if (originalHash > 0) {
        originalHref = originalHref.substring(0, originalHash);
    }
    //LOG.debug("_isSamePage: currentHref: " + currentHref);
    //LOG.debug("_isSamePage: originalHref: " + originalHref);

    var sameHref = (originalHref === currentHref);
    var markedLoc = currentLocation[marker];

    if (browserVersion.isKonqueror || browserVersion.isSafari) {
        // the mark disappears too early on these browsers
        markedLoc = true;
    }

    // since this is some _very_ important logic, especially for PI and multiWindow mode, we should log all these out
    //LOG.debug("_isSamePage: sameDoc: " + sameDoc);
    //LOG.debug("_isSamePage: sameLoc: " + sameLoc);
    //LOG.debug("_isSamePage: sameHref: " + sameHref);
    //LOG.debug("_isSamePage: markedLoc: " + markedLoc);

    return sameDoc && sameLoc && sameHref && markedLoc;
};

BrowserBot.prototype._isSameDocument = function(originalDocument, currentDocument) {
    return originalDocument === currentDocument;
};


BrowserBot.prototype.getReadyState = function(windowObject, currentDocument) {
    var rs = currentDocument.readyState;
    if (rs == null) {
        if ((this.buttonWindow != null && this.buttonWindow.document.readyState == null) // not proxy injection mode (and therefore buttonWindow isn't null)
            ||
            (top.document.readyState == null)) { // proxy injection mode (and therefore everything's in the top window, but buttonWindow doesn't exist)
            // uh oh!  we're probably on Firefox with no readyState extension installed!
            // We'll have to just take a guess as to when the document is loaded; this guess
            // will never be perfect. :-(
            if (typeof currentDocument.getElementsByTagName != 'undefined' && typeof currentDocument.getElementById != 'undefined' && (currentDocument.getElementsByTagName('body')[0] != null || currentDocument.body != null)) {
                if (windowObject.frameElement && windowObject.location.href == "about:blank" && windowObject.frameElement.src != "about:blank") {
                    //LOG.info("getReadyState not loaded, frame location was about:blank, but frame src = " + windowObject.frameElement.src);
                    return null;
                }
                //LOG.debug("getReadyState = windowObject.frames.length = " + windowObject.frames.length);
                for (var i = 0; i < windowObject.frames.length; i++) {
                    //LOG.debug("i = " + i);
                    if (this.getReadyState(windowObject.frames[i], windowObject.frames[i].document) != 'complete') {
                        //LOG.debug("getReadyState aha! the nested frame " + windowObject.frames[i].name + " wasn't ready!");
                        return null;
                    }
                }

                rs = 'complete';
            } else {
                //LOG.debug("pollForLoad readyState was null and DOM appeared to not be ready yet");
            }
        }
    } else if (rs == "loading" && browserVersion.isIE) {
        //LOG.debug("pageUnloading = true!!!!");
        this.pageUnloading = true;
    }
    //LOG.debug("getReadyState returning " + rs);
    return rs;
};

/** This function isn't used normally, but was the way we used to schedule pollers:
 asynchronously executed autonomous units.  This is deprecated, but remains here
 for future reference.
 */
BrowserBot.prototype.XXXreschedulePoller = function(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker) {
    var self = this;
    window.setTimeout(function() {
        self.pollForLoad(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
    }, 500);
};

/** This function isn't used normally, but is useful for debugging asynchronous pollers
 * To enable it, rename it to "reschedulePoller", so it will override the
 * existing reschedulePoller function
 */
BrowserBot.prototype.XXXreschedulePoller = function(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker) {
    var doc = this.buttonWindow.document;
    var button = doc.createElement("button");
    var buttonName = doc.createTextNode(marker + " - " + windowObject.name);
    button.appendChild(buttonName);
    var tools = doc.getElementById("tools");
    var self = this;
    button.onclick = function() {
        tools.removeChild(button);
        self.pollForLoad(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
    };
    tools.appendChild(button);
    window.setTimeout(button.onclick, 500);
};

BrowserBot.prototype.reschedulePoller = function(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker) {
    var self = this;
    var pollerFunction = function() {
        self.pollForLoad(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
    };
    this.windowPollers.push(pollerFunction);
};

BrowserBot.prototype.runScheduledPollers = function() {
    //LOG.debug("runScheduledPollers");
    var oldPollers = this.windowPollers;
    this.windowPollers = new Array();
    for (var i = 0; i < oldPollers.length; i++) {
        oldPollers[i].call();
    }
    //LOG.debug("runScheduledPollers DONE");
};

BrowserBot.prototype.isPollingForLoad = function(win) {
    var marker;
    var frameElement = this._getFrameElement(win);
    var htaSubFrame = this._isHTASubFrame(win);
    if (frameElement && !htaSubFrame) {
        marker = frameElement["frame" + this.uniqueId];
    } else {
        marker = win[this.uniqueId];
    }
    if (!marker) {
        //LOG.debug("isPollingForLoad false, missing uniqueId " + this.uniqueId + ": " + marker);
        return false;
    }
    if (!this.pollingForLoad[marker]) {
        //LOG.debug("isPollingForLoad false, this.pollingForLoad[" + marker + "]: " + this.pollingForLoad[marker]);
        return false;
    }
    return marker;
};

BrowserBot.prototype.getWindowByName = function(windowName, doNotModify) {
    //LOG.debug("getWindowByName(" + windowName + ")");
    // First look in the map of opened windows
    var targetWindow = this.openedWindows[windowName];
    if (!targetWindow) {
        targetWindow = this.topWindow[windowName];
    }
    if (!targetWindow && windowName == "_blank") {
        for (var winName in this.openedWindows) {
            // _blank can match selenium_blank*, if it looks like it's OK (valid href, not closed)
            if (/^selenium_blank/.test(winName)) {
                targetWindow = this.openedWindows[winName];
                var ok;
                try {
                    if (!this._windowClosed(targetWindow)) {
                        ok = targetWindow.location.href;
                    }
                } catch (e) {}
                if (ok) break;
            }
        }
    }
    if (!targetWindow) {
        throw new SeleniumError("Window does not exist. If this looks like a Selenium bug, make sure to read http://seleniumhq.org/docs/02_selenium_ide.html#alerts-popups-and-multiple-windows for potential workarounds.");
    }
    if (browserVersion.isHTA) {
        try {
            targetWindow.location.href;
        } catch (e) {
            targetWindow = window.open("", targetWindow.name);
            this.openedWindows[targetWindow.name] = targetWindow;
        }
    }
    if (!doNotModify) {
        this._modifyWindow(targetWindow);
    }
    return targetWindow;
};

/**
 * Find a window name from the window title.
 */
BrowserBot.prototype.getWindowNameByTitle = function(windowTitle) {
    //LOG.debug("getWindowNameByTitle(" + windowTitle + ")");

    // First look in the map of opened windows and iterate them
    for (var windowName in this.openedWindows) {
        var targetWindow = this.openedWindows[windowName];

        // If the target window's title is our title
        try {
            // TODO implement Pattern Matching here
            if (!this._windowClosed(targetWindow) &&
                targetWindow.document.title == windowTitle) {
                return windowName;
            }
        } catch (e) {
            // You'll often get Permission Denied errors here in IE
            // eh, if we can't read this window's title,
            // it's probably not available to us right now anyway
        }
    }

    try {
        if (this.topWindow.document.title == windowTitle) {
            return "";
        }
    } catch (e) {} // IE Perm denied

    throw new SeleniumError("Could not find window with title " + windowTitle);
};

BrowserBot.prototype.getNonTopWindowNames = function() {
    var nonTopWindowNames = [];

    for (var windowName in this.openedWindows) {
        var win = this.openedWindows[windowName];
        if (!this._windowClosed(win) && win != this.topWindow) {
            nonTopWindowNames.push(windowName);
        }
    }

    return nonTopWindowNames;
};

BrowserBot.prototype.getCurrentWindow = function(doNotModify) {
    if (this.proxyInjectionMode) {
        return window;
    }
    var testWindow = this.currentWindow;
    if (!doNotModify) {
        this._modifyWindow(testWindow);
        //LOG.debug("getCurrentWindow newPageLoaded = false");
        this.newPageLoaded = false;
    }
    testWindow = this._handleClosedSubFrame(testWindow, doNotModify);
    bot.window_ = testWindow;
    return testWindow;
};

/**
 * Offer a method the end-user can reliably use to retrieve the current window.
 * This should work even for windows with an XPCNativeWrapper. Returns the
 * current window object.
 */
BrowserBot.prototype.getUserWindow = function() {
    var userWindow = this.getCurrentWindow(true);
    return userWindow;
};

BrowserBot.prototype._handleClosedSubFrame = function(testWindow, doNotModify) {
    if (this.proxyInjectionMode) {
        return testWindow;
    }

    if (this.isSubFrameSelected) {
        var missing = true;
        if (testWindow.parent && testWindow.parent.frames && testWindow.parent.frames.length) {
            for (var i = 0; i < testWindow.parent.frames.length; i++) {
                var frame = testWindow.parent.frames[i];
                if (frame == testWindow || frame.seleniumKey == testWindow.seleniumKey) {
                    missing = false;
                    break;
                }
            }
        }
        if (missing) {
            //LOG.warn("Current subframe appears to have closed; selecting top frame");
            this.selectFrame("relative=top");
            return this.getCurrentWindow(doNotModify);
        }
    } else if (this._windowClosed(testWindow)) {
        // © Jie-Lin You, SideeX Team
        /*var closedError = new SeleniumError("Current window or frame is closed!");
        closedError.windowClosed = true;
        throw closedError;*/
        testWindow = this.topWindow; //select live object
        // END
    }
    return testWindow;
};

BrowserBot.prototype.highlight = function(element, force) {
    if (force || this.shouldHighlightLocatedElement) {
        try {
            highlight(element);
        } catch (e) {} // DGF element highlighting is low-priority and possibly dangerous
    }
    return element;
};

BrowserBot.prototype.setShouldHighlightElement = function(shouldHighlight) {
    this.shouldHighlightLocatedElement = shouldHighlight;
};

/*****************************************************************/
/* BROWSER-SPECIFIC FUNCTIONS ONLY AFTER THIS LINE */


BrowserBot.prototype._registerAllLocatorFunctions = function() {
    // TODO - don't do this in the constructor - only needed once ever
    this.locationStrategies = {};
    for (var functionName in this) {
        var result = /^locateElementBy([A-Z].+)$/.exec(functionName);
        if (result != null) {
            var locatorFunction = this[functionName];
            if (typeof(locatorFunction) != 'function') {
                continue;
            }
            // Use a specified prefix in preference to one generated from
            // the function name
            var locatorPrefix = locatorFunction.prefix || result[1].toLowerCase();
            this.locationStrategies[locatorPrefix] = locatorFunction;
        }
    }

    /**
     * Find a locator based on a prefix.
     */
    this.findElementBy = function(locatorType, locator, inDocument, inWindow) {
        var locatorFunction = this.locationStrategies[locatorType];
        if (!locatorFunction) {
            throw new SeleniumError("Unrecognised locator type: '" + locatorType + "'");
        }
        return locatorFunction.call(this, locator, inDocument, inWindow);
    };

    /**
     * The implicit locator, that is used when no prefix is supplied.
     */
    this.locationStrategies['implicit'] = function(locator, inDocument, inWindow) {
        if (locator.startsWith('//')) {
            return this.locateElementByXPath(locator, inDocument, inWindow);
        }
        if (locator.startsWith('document.')) {
            return this.locateElementByDomTraversal(locator, inDocument, inWindow);
        }
        return this.locateElementByIdentifier(locator, inDocument, inWindow);
    };

};

BrowserBot.prototype.getDocument = function() {
    return this.getCurrentWindow().document;
};

BrowserBot.prototype.getTitle = function() {
    var t = this.getDocument().title;
    if (typeof(t) == "string") {
        t = t.trim();
    }
    return t;
};

BrowserBot.prototype.getCookieByName = function(cookieName, doc) {
    if (!doc) doc = this.getDocument();
    var ck = doc.cookie;
    if (!ck) return null;
    var ckPairs = ck.split(/;/);
    for (var i = 0; i < ckPairs.length; i++) {
        var ckPair = ckPairs[i].trim();
        var ckNameValue = ckPair.split(/=/);
        var ckName = decodeURIComponent(ckNameValue[0]);
        if (ckName === cookieName) {
            return decodeURIComponent(ckNameValue.slice(1).join("="));
        }
    }
    return null;
};

BrowserBot.prototype.getAllCookieNames = function(doc) {
    if (!doc) doc = this.getDocument();
    var ck = doc.cookie;
    if (!ck) return [];
    var cookieNames = [];
    var ckPairs = ck.split(/;/);
    for (var i = 0; i < ckPairs.length; i++) {
        var ckPair = ckPairs[i].trim();
        var ckNameValue = ckPair.split(/=/);
        var ckName = decodeURIComponent(ckNameValue[0]);
        cookieNames.push(ckName);
    }
    return cookieNames;
};

BrowserBot.prototype.getAllRawCookieNames = function(doc) {
    if (!doc) doc = this.getDocument();
    var ck = doc.cookie;
    if (!ck) return [];
    var cookieNames = [];
    var ckPairs = ck.split(/;/);
    for (var i = 0; i < ckPairs.length; i++) {
        var ckPair = ckPairs[i].trim();
        var ckNameValue = ckPair.split(/=/);
        var ckName = ckNameValue[0];
        cookieNames.push(ckName);
    }
    return cookieNames;
};

function encodeURIComponentWithASPHack(uri) {
    var regularEncoding = encodeURIComponent(uri);
    var aggressiveEncoding = regularEncoding.replace(".", "%2E");
    aggressiveEncoding = aggressiveEncoding.replace("_", "%5F");
    return aggressiveEncoding;
}

BrowserBot.prototype.deleteCookie = function(cookieName, domain, path, doc) {
    if (!doc) doc = this.getDocument();
    var expireDateInMilliseconds = (new Date()).getTime() + (-1 * 1000);

    // we can't really be sure if we're dealing with encoded or unencoded cookie names
    var _cookieName;
    var rawCookieNames = this.getAllRawCookieNames(doc);
    for (rawCookieNumber in rawCookieNames) {
        if (rawCookieNames[rawCookieNumber] == cookieName) {
            _cookieName = cookieName;
            break;
        } else if (rawCookieNames[rawCookieNumber] == encodeURIComponent(cookieName)) {
            _cookieName = encodeURIComponent(cookieName);
            break;
        } else if (rawCookieNames[rawCookieNumber] == encodeURIComponentWithASPHack(cookieName)) {
            _cookieName = encodeURIComponentWithASPHack(cookieName);
            break;
        }
    }

    var cookie = _cookieName + "=deleted; ";
    if (path) {
        cookie += "path=" + path + "; ";
    }
    if (domain) {
        cookie += "domain=" + domain + "; ";
    }
    cookie += "expires=" + new Date(expireDateInMilliseconds).toGMTString();
    //LOG.debug("Setting cookie to: " + cookie);
    doc.cookie = cookie;
};

/** Try to delete cookie, return false if it didn't work */
BrowserBot.prototype._maybeDeleteCookie = function(cookieName, domain, path, doc) {
    this.deleteCookie(cookieName, domain, path, doc);
    return (!this.getCookieByName(cookieName, doc));
};


BrowserBot.prototype._recursivelyDeleteCookieDomains = function(cookieName, domain, path, doc) {
    var deleted = this._maybeDeleteCookie(cookieName, domain, path, doc);
    if (deleted) return true;
    var dotIndex = domain.indexOf(".");
    if (dotIndex == 0) {
        return this._recursivelyDeleteCookieDomains(cookieName, domain.substring(1), path, doc);
    } else if (dotIndex != -1) {
        return this._recursivelyDeleteCookieDomains(cookieName, domain.substring(dotIndex), path, doc);
    } else {
        // No more dots; try just not passing in a domain at all
        return this._maybeDeleteCookie(cookieName, null, path, doc);
    }
};

BrowserBot.prototype._recursivelyDeleteCookie = function(cookieName, domain, path, doc) {
    var slashIndex = path.lastIndexOf("/");
    var finalIndex = path.length - 1;
    if (slashIndex == finalIndex) {
        slashIndex--;
    }
    if (slashIndex != -1) {
        deleted = this._recursivelyDeleteCookie(cookieName, domain, path.substring(0, slashIndex + 1), doc);
        if (deleted) return true;
    }
    return this._recursivelyDeleteCookieDomains(cookieName, domain, path, doc);
};

BrowserBot.prototype.recursivelyDeleteCookie = function(cookieName, domain, path, win) {
    if (!win) win = this.getCurrentWindow();
    var doc = win.document;
    if (!domain) {
        domain = doc.domain;
    }
    if (!path) {
        path = win.location.pathname;
    }
    var deleted = this._recursivelyDeleteCookie(cookieName, "." + domain, path, doc);
    if (deleted) return;
    // Finally try a null path (Try it last because it's uncommon)
    deleted = this._recursivelyDeleteCookieDomains(cookieName, "." + domain, null, doc);
    if (deleted) return;
    throw new SeleniumError("Couldn't delete cookie " + cookieName);
};

/*
 * Finds an element recursively in frames and nested frames
 * in the specified document, using various lookup protocols
 */
BrowserBot.prototype.findElementRecursive = function(locatorType, locatorString, inDocument, inWindow) {
    var element = this.findElementBy(locatorType, locatorString, inDocument, inWindow);
    if (element != null) {
        return element;
    }

    for (var i = 0; i < inWindow.frames.length; i++) {
        // On some browsers, the document object is undefined for third-party
        // frames.  Make sure the document is valid before continuing.
        try {
            if (inWindow.frames[i].document) {
                element = this.findElementRecursive(locatorType, locatorString, inWindow.frames[i].document, inWindow.frames[i]);
                if (element != null) {
                    return element;
                }
            }
        } catch (e) {
            return null;
        }
    }
};

/*
 * Finds an element on the current page, using various lookup protocols
 */
BrowserBot.prototype.findElementOrNull = function(locator, win) {
    locator = parse_locator(locator);

    if (win == null) {
        win = this.getCurrentWindow();
    }
    // var element = this.findElementRecursive(locator.type, locator.string, win.document, win);
    // NOTE: Because we do go into frame by selectFrame commands, we do not find
    // element go into frame by findElementRecursive operations.
    var element = this.findElementBy(locator.type, locator.string, win.document, win);
    if (element != null) {
        return this.browserbot.highlight(element);
    }

    // Element was not found by any locator function.
    return null;
};

BrowserBot.prototype.findElement = function(locator, win) {
    var element = this.findElementOrNull(locator, win);
    if (element == null) {
        if (locator.includes("d-XPath")) {
            throw new SeleniumError("Element located by TAC not found");
        } else if (locator == "auto-located-by-tac") {
            throw new SeleniumError("The value \"auto-located-by-tac\" only can be automatically generated when recording a command");
        } else throw new SeleniumError("Element " + locator + " not found");
    }
    return element;
};


/**
 * Finds a list of elements using the same mechanism as webdriver.
 *
 * @param {string} how The finding mechanism to use.
 * @param {string} using The selector to use.
 * @param {Document|Element} root The root of the search path.
 */
BrowserBot.prototype.findElementsLikeWebDriver = function(how, using, root) {
    var by = {};
    by[how] = using;

    var all = bot.locators.findElements(by, root);
    var toReturn = '';

    for (var i = 0; i < all.length - 1; i++) {
        toReturn += bot.inject.cache.addElement(all[i]) + ',';
    }
    if (all[all.length - 1]) {
        var last = all[all.length - 1];
        toReturn += bot.inject.cache.addElement(all[all.length - 1]);
    }

    return toReturn;
};

/**
 * In non-IE browsers, getElementById() does not search by name.  Instead, we
 * we search separately by id and name.
 */
BrowserBot.prototype.locateElementByIdentifier = function(identifier, inDocument, inWindow) {
    // HBC - use "this" instead of "BrowserBot.prototype"; otherwise we lose
    // the non-prototype fields of the object!
    return this.locateElementById(identifier, inDocument, inWindow) || BrowserBot.prototype.locateElementByName(identifier, inDocument, inWindow) || null;
};

/**
 * Find the element with id - can't rely on getElementById, coz it returns by name as well in IE..
 */
BrowserBot.prototype.locateElementById = function(identifier, inDocument, inWindow) {
    var element = inDocument.getElementById(identifier);
    if (element && element.getAttribute('id') === identifier) {
        return element;
    } else if (browserVersion.isIE || browserVersion.isOpera) {
        // SEL-484
        var elements = inDocument.getElementsByTagName('*');

        for (var i = 0, n = elements.length; i < n; ++i) {
            element = elements[i];

            if (element.tagName.toLowerCase() == 'form') {
                if (element.attributes['id'].nodeValue == identifier) {
                    return element;
                }
            } else if (element.getAttribute('id') == identifier) {
                return element;
            }
        }

        return null;
    } else {
        return null;
    }
};

/**
 * Find an element by name, refined by (optional) element-filter
 * expressions.
 */
BrowserBot.prototype.locateElementByName = function(locator, document, inWindow) {
    var elements = document.getElementsByTagName("*");
    // © Jie-Lin You, SideeX Team
    /*
        var filters = locator.split(' ');
        filters[0] = 'name=' + filters[0];

        while (filters.length) {
            var filter = filters.shift();
            elements = this.selectElements(filter, elements, 'value');
        }
    */
    // END
    var filter = 'name=' + locator;
    elements = this.selectElements(filter, elements, 'value');

    if (elements.length > 0) {
        return elements[0];
    }
    return null;
};

/**
 * Finds an element using by evaluating the specfied string.
 */
BrowserBot.prototype.locateElementByDomTraversal = function(domTraversal, document, window) {

    var browserbot = this.browserbot;
    var element = null;

    //Evalinsandbox
    var mySandbox = new Components.utils.Sandbox(this.currentWindow.location.href);
    mySandbox.domTraversal = domTraversal;
    try {
        element = Components.utils.evalInSandbox(domTraversal, mySandbox);
        //element = eval(domTraversal);
    } catch (e) {
        return null;
    }

    if (!element) {
        return null;
    }

    return element;
};

BrowserBot.prototype.locateElementByDomTraversal.prefix = "dom";


BrowserBot.prototype.locateElementByStoredReference = function(locator, document, window) {
    try {
        return core.locators.findElement("stored=" + locator);
    } catch (e) {
        return null;
    }
};
BrowserBot.prototype.locateElementByStoredReference.prefix = "stored";


BrowserBot.prototype.locateElementByWebDriver = function(locator, document, window) {
    try {
        return core.locators.findElement("webdriver=" + locator);
    } catch (e) {
        return null;
    }
};
BrowserBot.prototype.locateElementByWebDriver.prefix = "webdriver";

/**
 * Finds an element identified by the xpath expression. Expressions _must_
 * begin with "//".
 */
BrowserBot.prototype.locateElementByXPath = function(xpath, inDocument, inWindow) {
    return this.xpathEvaluator.selectSingleNode(inDocument, xpath, null,
        inDocument.createNSResolver ? inDocument.createNSResolver(inDocument.documentElement) : this._namespaceResolver);
};


/**
 * Find many elements using xpath.
 *
 * @param {string} xpath XPath expression to search for.
 * @param {=Document} inDocument The document to search in.
 * @param {=Window} inWindow The window the document is in.
 */
BrowserBot.prototype.locateElementsByXPath = function(xpath, inDocument, inWindow) {
    return this.xpathEvaluator.selectNodes(inDocument, xpath, null,
        inDocument.createNSResolver ? inDocument.createNSResolver(inDocument.documentElement) : this._namespaceResolver);
};


BrowserBot.prototype._namespaceResolver = function(prefix) {
    if (prefix == 'html' || prefix == 'xhtml' || prefix == 'x') {
        return 'http://www.w3.org/1999/xhtml';
    } else if (prefix == 'mathml') {
        return 'http://www.w3.org/1998/Math/MathML';
    } else if (prefix == 'svg') {
        return 'http://www.w3.org/2000/svg';
    } else {
        throw new Error("Unknown namespace: " + prefix + ".");
    }
};

/**
 * Returns the number of xpath results.
 */
BrowserBot.prototype.evaluateXPathCount = function(selector, inDocument) {
    var locator = parse_locator(selector);
    var opts = {};
    opts['namespaceResolver'] =
        inDocument.createNSResolver ? inDocument.createNSResolver(inDocument.documentElement) : this._namespaceResolver;
    if (locator.type == 'xpath' || locator.type == 'implicit') {
        return eval_xpath(locator.string, inDocument, opts).length;
    } else {
        //LOG.error("Locator does not use XPath strategy: " + selector);
        return 0;
    }
};

/**
 * Returns the number of css results.
 */
BrowserBot.prototype.evaluateCssCount = function(selector, inDocument) {
    var locator = parse_locator(selector);
    if (locator.type == 'css' || locator.type == 'implicit') {
        return eval_css(locator.string, inDocument).length;
    } else {
        //LOG.error("Locator does not use CSS strategy: " + selector);
        return 0;
    }
};

/**
 * Finds a link element with text matching the expression supplied. Expressions must
 * begin with "link:".
 */
BrowserBot.prototype.locateElementByLinkText = function(linkText, inDocument, inWindow) {
    var links = inDocument.getElementsByTagName('a');
    for (var i = 0; i < links.length; i++) {
        var element = links[i];
        if (PatternMatcher.matches(linkText, getText(element))) {
            return element;
        }
    }
    return null;
};

BrowserBot.prototype.locateElementByLinkText.prefix = "link";

/**
 * Returns an attribute based on an attribute locator. This is made up of an element locator
 * suffixed with @attribute-name.
 */
BrowserBot.prototype.findAttribute = function(locator) {
    // Split into locator + attributeName
    var attributePos = locator.lastIndexOf("@");
    var elementLocator = locator.slice(0, attributePos);
    var attributeName = locator.slice(attributePos + 1);

    // Find the element.
    var element = this.findElement(elementLocator);
    var attributeValue = bot.dom.getAttribute(element, attributeName);
    return goog.isDefAndNotNull(attributeValue) ? attributeValue.toString() : null;
};

/*
 * Select the specified option and trigger the relevant events of the element.
 */
BrowserBot.prototype.selectOption = function(element, optionToSelect) {
    bot.events.fire(element, bot.events.EventType.FOCUS);
    var changed = false;
    for (var i = 0; i < element.options.length; i++) {
        var option = element.options[i];
        if (option.selected && option != optionToSelect) {
            option.selected = false;
            changed = true;
        } else if (!option.selected && option == optionToSelect) {
            option.selected = true;
            changed = true;
        }
    }

    if (changed) {
        bot.events.fire(element, bot.events.EventType.CHANGE);
    }
};

/*
 * Select the specified option and trigger the relevant events of the element.
 */
BrowserBot.prototype.addSelection = function(element, option) {
    this.checkMultiselect(element);
    bot.events.fire(element, bot.events.EventType.FOCUS);
    if (!option.selected) {
        option.selected = true;
        bot.events.fire(element, bot.events.EventType.CHANGE);
    }
};

/*
 * Select the specified option and trigger the relevant events of the element.
 */
BrowserBot.prototype.removeSelection = function(element, option) {
    this.checkMultiselect(element);
    bot.events.fire(element, bot.events.EventType.FOCUS);
    if (option.selected) {
        option.selected = false;
        bot.events.fire(element, bot.events.EventType.CHANGE);
    }
};

BrowserBot.prototype.checkMultiselect = function(element) {
    if (!element.multiple) {
        throw new SeleniumError("Not a multi-select");
    }

};

BrowserBot.prototype.replaceText = function(element, stringValue) {
    bot.events.fire(element, bot.events.EventType.FOCUS);
    bot.events.fire(element, bot.events.EventType.SELECT);
    var maxLengthAttr = element.getAttribute("maxLength");
    var actualValue = stringValue;
    if (maxLengthAttr != null) {
        var maxLength = parseInt(maxLengthAttr);
        if (stringValue.length > maxLength) {
            actualValue = stringValue.substr(0, maxLength);
        }
    }

    if (getTagName(element) == "body") {
        if (element.ownerDocument && element.ownerDocument.designMode) {
            var designMode = new String(element.ownerDocument.designMode).toLowerCase();
            if (designMode == "on") {
                // this must be a rich text control!
                element.innerHTML = actualValue;
            }
        }
    } else {
        element.value = actualValue;
    }
    // DGF this used to be skipped in chrome URLs, but no longer.  Is xpcnativewrappers to blame?
    try {
        bot.events.fire(element, bot.events.EventType.CHANGE);
    } catch (e) {}
};

BrowserBot.prototype.submit = function(formElement) {
    var actuallySubmit = true;
    this._modifyElementTarget(formElement);

    if (formElement.onsubmit) {
        if (browserVersion.isHTA) {
            // run the code in the correct window so alerts are handled correctly even in HTA mode
            var win = this.browserbot.getCurrentWindow();
            var now = new Date().getTime();
            var marker = 'marker' + now;
            win[marker] = formElement;
            win.setTimeout("var actuallySubmit = " + marker + ".onsubmit();" +
                "if (actuallySubmit) { " +
                marker + ".submit(); " +
                "if (" + marker + ".target && !/^_/.test(" + marker + ".target)) {" +
                "window.open('', " + marker + ".target);" +
                "}" +
                "};" +
                marker + "=null", 0);
            // pause for up to 2s while this command runs
            var terminationCondition = function() {
                return !win[marker];
            };
            return Selenium.decorateFunctionWithTimeout(terminationCondition, 2000);
        } else {
            actuallySubmit = formElement.onsubmit();
            if (actuallySubmit) {
                formElement.submit();
                if (formElement.target && !/^_/.test(formElement.target)) {
                    this.browserbot.openWindow('', formElement.target);
                }
            }
        }
    } else {
        formElement.submit();
    }
};

BrowserBot.prototype.clickElement = function(element, clientX, clientY) {
    this._fireEventOnElement("click", element, clientX, clientY);
};

BrowserBot.prototype.doubleClickElement = function(element, clientX, clientY) {
    this._fireEventOnElement("dblclick", element, clientX, clientY);
};

// The contextmenu event is fired when the user right-clicks to open the context menu
BrowserBot.prototype.contextMenuOnElement = function(element, clientX, clientY) {
    this._fireEventOnElement("contextmenu", element, clientX, clientY);
};

BrowserBot.prototype._modifyElementTarget = function(e) {
    var element = this.findClickableElement(e) || e;
    if (element.target) {
        if (element.target == "_blank" || /^selenium_blank/.test(element.target)) {
            var tagName = getTagName(element);
            if (tagName == "a" || tagName == "form") {
                // © Jie-Lin You, SideeX Team
                var newTarget = "win_ser_" + this.count;
                this.count += 1;
                // END
                this.browserbot.openWindow('', newTarget);
                element.target = newTarget;
            }
        // © Jie-Lin You, SideeX Team
        } else {
            var newTarget = element.target;
            this.browserbot.openWindow('', newTarget);
            element.target = newTarget;
        }
        // END
    }
};

// © Jie-Lin You, SideeX Team
BrowserBot.prototype.findClickableElement = function(e) {
    if (!e.tagName) return null;
    var tagName = e.tagName.toLowerCase();
    var type = e.type;
    if (e.hasAttribute("onclick") || e.hasAttribute("href") || e.hasAttribute("url") || tagName == "button" ||
        (tagName == "input" &&
            (type == "submit" || type == "button" || type == "image" || type == "radio" || type == "checkbox" || type == "reset"))) {
        return e;
    } else {
        if (e.parentNode != null) {
            return this.findClickableElement(e.parentNode);
        } else {
            return null;
        }
    }
};
// END

BrowserBot.prototype._handleClickingImagesInsideLinks = function(targetWindow, element) {
    var itrElement = element;
    while (itrElement != null) {
        if (itrElement.href) {
            targetWindow.location.href = itrElement.href;
            break;
        }
        itrElement = itrElement.parentNode;
    }
};

BrowserBot.prototype._getTargetWindow = function(element) {
    var targetWindow = element.ownerDocument.defaultView;
    if (element.target) {
        targetWindow = this._getFrameFromGlobal(element.target);
    }
    return targetWindow;
};

BrowserBot.prototype._getFrameFromGlobal = function(target) {

    if (target == "_self") {
        return this.getCurrentWindow();
    }
    if (target == "_top") {
        return this.topFrame;
    } else if (target == "_parent") {
        return this.getCurrentWindow().parent;
    } else if (target == "_blank") {
        // TODO should this set cleverer window defaults?
        return this.getCurrentWindow().open('', '_blank');
    }
    var frameElement = this.findElementBy("implicit", target, this.topFrame.document, this.topFrame);
    if (frameElement) {
        return frameElement.contentWindow;
    }
    var win = this.getWindowByName(target);
    if (win) return win;
    return this.getCurrentWindow().open('', target);
};


BrowserBot.prototype.bodyText = function() {
    if (!this.getDocument().body) {
        throw new SeleniumError("Couldn't access document.body.  Is this HTML page fully loaded?");
    }
    return getText(this.getDocument().body);
};

BrowserBot.prototype.getAllButtons = function() {
    var elements = this.getDocument().getElementsByTagName('input');
    var result = [];

    for (var i = 0; i < elements.length; i++) {
        if (elements[i].type == 'button' || elements[i].type == 'submit' || elements[i].type == 'reset') {
            result.push(elements[i].id);
        }
    }

    return result;
};


BrowserBot.prototype.getAllFields = function() {
    var elements = this.getDocument().getElementsByTagName('input');
    var result = [];

    for (var i = 0; i < elements.length; i++) {
        if (elements[i].type == 'text') {
            result.push(elements[i].id);
        }
    }

    return result;
};

BrowserBot.prototype.getAllLinks = function() {
    var elements = this.getDocument().getElementsByTagName('a');
    var result = [];

    for (var i = 0; i < elements.length; i++) {
        result.push(elements[i].id);
    }

    return result;
};

function isDefined(value) {
    return typeof(value) != undefined;
};

BrowserBot.prototype.goBack = function() {
    this.getCurrentWindow().history.back();
};

BrowserBot.prototype.goForward = function() {
    this.getCurrentWindow().history.forward();
};

BrowserBot.prototype.close = function() {
    if (browserVersion.isIE) {
        // fix "do you want to close this window" warning in IE
        // You can only close windows that you have opened.
        // So, let's "open" it.
        try {
            this.topFrame.name = new Date().getTime();
            window.open("", this.topFrame.name, "");
            this.topFrame.close();
            return;
        } catch (e) {}
    }
    if (browserVersion.isChrome || browserVersion.isSafari || browserVersion.isOpera) {
        this.topFrame.close();
    } else {
        this.getCurrentWindow().eval("window.top.close();");
    }
};

BrowserBot.prototype.refresh = function() {
    this.getCurrentWindow().location.reload(true);
};

/**
 * Refine a list of elements using a filter.
 */
BrowserBot.prototype.selectElementsBy = function(filterType, filter, elements) {
    var filterFunction = BrowserBot.filterFunctions[filterType];
    if (!filterFunction) {
        throw new SeleniumError("Unrecognised element-filter type: '" + filterType + "'");
    }

    return filterFunction(filter, elements);
};

BrowserBot.filterFunctions = {};

BrowserBot.filterFunctions.name = function(name, elements) {
    var selectedElements = [];
    for (var i = 0; i < elements.length; i++) {
        if (elements[i].name === name) {
            selectedElements.push(elements[i]);
        }
    }
    return selectedElements;
};

BrowserBot.filterFunctions.value = function(value, elements) {
    var selectedElements = [];
    for (var i = 0; i < elements.length; i++) {
        if (elements[i].value === value) {
            selectedElements.push(elements[i]);
        }
    }
    return selectedElements;
};

BrowserBot.filterFunctions.index = function(index, elements) {
    index = Number(index);
    if (isNaN(index) || index < 0) {
        throw new SeleniumError("Illegal Index: " + index);
    }
    if (elements.length <= index) {
        throw new SeleniumError("Index out of range: " + index);
    }
    return [elements[index]];
};

BrowserBot.prototype.selectElements = function(filterExpr, elements, defaultFilterType) {

    var filterType = (defaultFilterType || 'value');

    // If there is a filter prefix, use the specified strategy
    var result = filterExpr.match(/^([A-Za-z]+)=(.+)/);
    if (result) {
        filterType = result[1].toLowerCase();
        filterExpr = result[2];
    }

    return this.selectElementsBy(filterType, filterExpr, elements);
};

/**
 * Find an element by class
 */
BrowserBot.prototype.locateElementByClass = function(locator, document) {
    return elementFindFirstMatchingChild(document,
        function(element) {
            return element.className == locator;
        }
    );
};

/**
 * Find an element by alt
 */
BrowserBot.prototype.locateElementByAlt = function(locator, document) {
    return elementFindFirstMatchingChild(document,
        function(element) {
            return element.alt == locator;
        }
    );
};

/**
 * Find an element by css selector
 */
BrowserBot.prototype.locateElementByCss = function(locator, document) {
    var elements = eval_css(locator, document);
    if (elements.length != 0)
        return elements[0];
    return null;
};

/**
 * This function is responsible for mapping a UI specifier string to an element
 * on the page, and returning it. If no element is found, null is returned.
 * Returning null on failure to locate the element is part of the undocumented
 * API for locator strategies.
 */
BrowserBot.prototype.locateElementByUIElement = function(locator, inDocument) {
    // offset locators are delimited by "->", which is much simpler than the
    // previous scheme involving detecting the close-paren.
    var locators = locator.split(/->/, 2);

    var locatedElement = null;
    var pageElements = UIMap.getInstance()
        .getPageElements(locators[0], inDocument);

    if (locators.length > 1) {
        for (var i = 0; i < pageElements.length; ++i) {
            var locatedElements = eval_locator(locators[1], inDocument,
                pageElements[i]);
            if (locatedElements.length) {
                locatedElement = locatedElements[0];
                break;
            }
        }
    } else if (pageElements.length) {
        locatedElement = pageElements[0];
    }

    return locatedElement;
};

BrowserBot.prototype.locateElementByUIElement.prefix = 'ui';

// define a function used to compare the result of a close UI element
// match with the actual interacted element. If they are close enough
// according to the heuristic, consider them a match.
/**
 * A heuristic function for comparing a node with a target node. Typically the
 * node is specified in a UI element definition, while the target node is
 * returned by the recorder as the leaf element which had some event enacted
 * upon it. This particular heuristic covers the case where the anchor element
 * contains other inline tags, such as "em" or "img".
 *
 * @param node    the node being compared to the target node
 * @param target  the target node
 * @return        true if node equals target, or if node is a link
 *                element and target is its descendant, or if node has
 *                an onclick attribute and target is its descendant.
 *                False otherwise.
 */
BrowserBot.prototype.locateElementByUIElement.is_fuzzy_match = function(node, target) {
    try {
        var isMatch = (
            (node == target) ||
            ((node.nodeName == 'A' || node.onclick) && is_ancestor(node, target))
        );
        return isMatch;
    } catch (e) {
        return false;
    }
};

/* prompt */
BrowserBot.prototype.cancelNextPrompt = function() {
    return this.setNextPromptResult(null);
};

BrowserBot.prototype.setNextPromptResult = function(result) {
    this.promptResponse = false;
    let self = this;

    window.postMessage({
        direction: "from-content-script",
        command: "setNextPromptResult",
        target: result
    }, "*");

    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.promptResponse) {
                count++;
                if (count > 60) {
                    reject("No response");
                    clearInterval(interval);
                }
            } else {
                resolve();
                self.promptResponse = false;
                clearInterval(interval);
            }
        }, 500);
    })
    return response;
}

BrowserBot.prototype.getPromptMessage = function() {
    this.promptResponse = false;
    this.promptMessage = null;
    let self = this;
    window.postMessage({
        direction: "from-content-script",
        command: "getPromptMessage",
    }, "*");
    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.promptResponse) {
                count++;
                if (count > 60) {
                    reject("No response");
                    clearInterval(interval);
                }
            } else {
                resolve(self.promptMessage);
                self.promptResponse = false;
                self.promptMessage = null;
                clearInterval(interval);
            }
        }, 500);
    })
    return response;
}

// confirm
BrowserBot.prototype.setNextConfirmationResult = function(result) {
    this.confirmationResponse = false;
    let self = this;
    window.postMessage({
        direction: "from-content-script",
        command: "setNextConfirmationResult",
        target: result
    }, "*");
    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.confirmationResponse) {
                count++;
                if (count > 60) {
                    reject("No response");
                    clearInterval(interval);
                }
            } else {
                resolve();
                self.confirmationResponse = false;
                clearInterval(interval);
            }
        }, 500);
    })
    return response;
}

BrowserBot.prototype.getConfirmationMessage = function() {
    this.confirmationResponse = false;
    this.confirmationMessage = null;
    let self = this;
    window.postMessage({
        direction: "from-content-script",
        command: "getConfirmationMessage",
    }, "*");
    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.confirmationResponse) {
                count++;
                if (count > 60) {
                    reject("No response");
                    clearInterval(interval);
                }
            } else {
                resolve(self.confirmationMessage);
                self.confirmationResponse = false;
                self.confirmationMessage = null;
                clearInterval(interval);
            }
        }, 500);
    })
    return response;
}

BrowserBot.prototype.getAlertMessage = function() {
    let self = this;
    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.alertResponse) {
                count++;
                if (count > 60) {
                    reject("No response!!!!");
                    clearInterval(interval);
                }
            } else {
                resolve(self.alertMessage);
                self.alertResponse = false;
                self.alertMessage = null;
                clearInterval(interval);
            }
        }, 500);
    })
    return response;
}
// © Ming-Hung Hsu, SideeX Team
BrowserBot.prototype.getRunScriptMessage = function() {
    let self = this;
    let response = new Promise(function(resolve, reject) {
        let count = 0;
        let interval = setInterval(function() {
            if (!self.runScriptResponse) {
                count++;
                if (count > 4) {
                    resolve("No error!!!!");
                    clearInterval(interval);
                }
            } else {
                resolve(self.runScriptMessage);
                self.runScriptResponse = false;
                self.runScriptMessage = null;
                clearInterval(interval);
            }
        }, 200);
    })
    return response;
}

/*****************************************************************/
/* BROWSER-SPECIFIC FUNCTIONS ONLY AFTER THIS LINE */

function MozillaBrowserBot(frame) {
    BrowserBot.call(this, frame);
}
objectExtend(MozillaBrowserBot.prototype, BrowserBot.prototype);

function KonquerorBrowserBot(frame) {
    BrowserBot.call(this, frame);
}
objectExtend(KonquerorBrowserBot.prototype, BrowserBot.prototype);

KonquerorBrowserBot.prototype.setIFrameLocation = function(iframe, location) {
    // Window doesn't fire onload event when setting src to the current value,
    // so we set it to blank first.
    iframe.src = "about:blank";
    iframe.src = location;
};

KonquerorBrowserBot.prototype.setOpenLocation = function(win, loc) {
    // Window doesn't fire onload event when setting src to the current value,
    // so we just refresh in that case instead.
    loc = absolutify(loc, this.baseUrl);
    loc = canonicalize(loc);
    var startUrl = win.location.href;
    if ("about:blank" != win.location.href) {
        var startLoc = parseUrl(win.location.href);
        startLoc.hash = null;
        startUrl = reassembleLocation(startLoc);
    }
    //LOG.debug("startUrl="+startUrl);
    //LOG.debug("win.location.href="+win.location.href);
    //LOG.debug("loc="+loc);
    if (startUrl == loc) {
        //LOG.debug("opening exact same location");
        this.refresh();
    } else {
        //LOG.debug("locations differ");
        win.location.href = loc;
    }
    // force the current polling thread to detect a page load
    var marker = this.isPollingForLoad(win);
    if (marker) {
        delete win.location[marker];
    }
};

KonquerorBrowserBot.prototype._isSameDocument = function(originalDocument, currentDocument) {
    // under Konqueror, there may be this case:
    // originalDocument and currentDocument are different objects
    // while their location are same.
    if (originalDocument) {
        return originalDocument.location == currentDocument.location;
    } else {
        return originalDocument === currentDocument;
    }
};

function SafariBrowserBot(frame) {
    BrowserBot.call(this, frame);
}
objectExtend(SafariBrowserBot.prototype, BrowserBot.prototype);

SafariBrowserBot.prototype.setIFrameLocation = KonquerorBrowserBot.prototype.setIFrameLocation;
SafariBrowserBot.prototype.setOpenLocation = KonquerorBrowserBot.prototype.setOpenLocation;


function OperaBrowserBot(frame) {
    BrowserBot.call(this, frame);
};
objectExtend(OperaBrowserBot.prototype, BrowserBot.prototype);
OperaBrowserBot.prototype.setIFrameLocation = function(iframe, location) {
    if (iframe.src == location) {
        iframe.src = location + '?reload';
    } else {
        iframe.src = location;
    }
};

function IEBrowserBot(frame) {
    BrowserBot.call(this, frame);
};
objectExtend(IEBrowserBot.prototype, BrowserBot.prototype);

IEBrowserBot.prototype._handleClosedSubFrame = function(testWindow, doNotModify) {
    if (this.proxyInjectionMode) {
        return testWindow;
    }

    try {
        testWindow.location.href;
        this.permDenied = 0;
    } catch (e) {
        this.permDenied++;
    }
    if (this._windowClosed(testWindow) || this.permDenied > 4) {
        if (this.isSubFrameSelected) {
            //LOG.warn("Current subframe appears to have closed; selecting top frame");
            this.selectFrame("relative=top");
            return this.getCurrentWindow(doNotModify);
        } else {
            var closedError = new SeleniumError("Current window or frame is closed!");
            closedError.windowClosed = true;
            throw closedError;
        }
    }
    return testWindow;
};

IEBrowserBot.prototype.modifyWindowToRecordPopUpDialogs = function(windowToModify, browserBot) {
    BrowserBot.prototype.modifyWindowToRecordPopUpDialogs(windowToModify, browserBot);

    // we will call the previous version of this method from within our own interception
    oldShowModalDialog = windowToModify.showModalDialog;

    windowToModify.showModalDialog = function(url, args, features) {
        // Get relative directory to where TestRunner.html lives
        // A risky assumption is that the user's TestRunner is named TestRunner.html
        var doc_location = document.location.toString();
        var end_of_base_ref = doc_location.indexOf('TestRunner.html');
        var base_ref = doc_location.substring(0, end_of_base_ref);
        var runInterval = '';

        // Only set run interval if options is defined
        if (typeof(window.runOptions) != 'undefined') {
            runInterval = "&runInterval=" + runOptions.runInterval;
        }

        var testRunnerURL = "TestRunner.html?auto=true&singletest=" + escape(browserBot.modalDialogTest) + "&autoURL=" + escape(url) + runInterval;
        var fullURL = base_ref + testRunnerURL;
        browserBot.modalDialogTest = null;

        // If using proxy injection mode
        if (this.proxyInjectionMode) {
            var sessionId = runOptions.getSessionId();
            if (sessionId == undefined) {
                sessionId = injectedSessionId;
            }
            if (sessionId != undefined) {
                //LOG.debug("Invoking showModalDialog and injecting URL " + fullURL);
            }
            fullURL = url;
        }
        var returnValue = oldShowModalDialog(fullURL, args, features);
        return returnValue;
    };
};

IEBrowserBot.prototype.modifySeparateTestWindowToDetectPageLoads = function(windowObject) {
    this.pageUnloading = false;
    var self = this;
    var pageUnloadDetector = function() {
        self.pageUnloading = true;
    };
    if (windowObject.addEventListener) {
        windowObject.addEventListener('beforeunload', pageUnloadDetector, true);
    } else {
        windowObject.attachEvent('onbeforeunload', pageUnloadDetector);
    }
    BrowserBot.prototype.modifySeparateTestWindowToDetectPageLoads.call(this, windowObject);
};

IEBrowserBot.prototype.pollForLoad = function(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker) {
    //LOG.debug("IEBrowserBot.pollForLoad: " + marker);
    if (!this.permDeniedCount[marker]) this.permDeniedCount[marker] = 0;
    BrowserBot.prototype.pollForLoad.call(this, loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
    var self;
    if (this.pageLoadError) {
        if (this.pageUnloading) {
            self = this;
            //LOG.debug("pollForLoad UNLOADING (" + marker + "): caught exception while firing events on unloading page: " + this.pageLoadError.message);
            this.reschedulePoller(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
            this.pageLoadError = null;
            return;
        } else if (((this.pageLoadError.message == "Permission denied") || (/^Access is denied/.test(this.pageLoadError.message))) && this.permDeniedCount[marker]++ < 8) {
            if (this.permDeniedCount[marker] > 4) {
                var canAccessThisWindow;
                var canAccessCurrentlySelectedWindow;
                try {
                    windowObject.location.href;
                    canAccessThisWindow = true;
                } catch (e) {}
                try {
                    this.getCurrentWindow(true).location.href;
                    canAccessCurrentlySelectedWindow = true;
                } catch (e) {}
                if (canAccessCurrentlySelectedWindow & !canAccessThisWindow) {
                    //LOG.debug("pollForLoad (" + marker + ") ABORTING: " + this.pageLoadError.message + " (" + this.permDeniedCount[marker] + "), but the currently selected window is fine");
                    // returning without rescheduling
                    this.pageLoadError = null;
                    return;
                }
            }

            self = this;
            //LOG.debug("pollForLoad (" + marker + "): " + this.pageLoadError.message + " (" + this.permDeniedCount[marker] + "), waiting to see if it goes away");
            this.reschedulePoller(loadFunction, windowObject, originalDocument, originalLocation, originalHref, marker);
            this.pageLoadError = null;
            return;
        }
        //handy for debugging!
        //throw this.pageLoadError;
    }
};

IEBrowserBot.prototype._windowClosed = function(win) {
    try {
        var c = win.closed;
        // frame windows claim to be non-closed when their parents are closed
        // but you can't access their document objects in that case
        if (!c) {
            try {
                win.document;
            } catch (de) {
                if (de.message == "Permission denied") {
                    // the window is probably unloading, which means it's probably not closed yet
                    return false;
                } else if (/^Access is denied/.test(de.message)) {
                    // rare variation on "Permission denied"?
                    //LOG.debug("IEBrowserBot.windowClosed: got " + de.message + " (this.pageUnloading=" + this.pageUnloading + "); assuming window is unloading, probably not closed yet");
                    return false;
                } else {
                    // this is probably one of those frame window situations
                    //LOG.debug("IEBrowserBot.windowClosed: couldn't read win.document, assume closed: " + de.message + " (this.pageUnloading=" + this.pageUnloading + ")");
                    return true;
                }
            }
        }
        if (c == null) {
            //LOG.debug("IEBrowserBot.windowClosed: win.closed was null, assuming closed");
            return true;
        }
        return c;
    } catch (e) {
        //LOG.debug("IEBrowserBot._windowClosed: Got an exception trying to read win.closed; we'll have to take a guess!");

        if (browserVersion.isHTA) {
            if (e.message == "Permission denied") {
                // the window is probably unloading, which means it's not closed yet
                return false;
            } else {
                // there's a good chance that we've lost contact with the window object if it is closed
                return true;
            }
        } else {
            // the window is probably unloading, which means it's not closed yet
            return false;
        }
    }
};

/**
 * In IE, getElementById() also searches by name - this is an optimisation for IE.
 */
IEBrowserBot.prototype.locateElementByIdentifer = function(identifier, inDocument, inWindow) {
    return inDocument.getElementById(identifier);
};

SafariBrowserBot.prototype.modifyWindowToRecordPopUpDialogs = function(windowToModify, browserBot) {
    BrowserBot.prototype.modifyWindowToRecordPopUpDialogs(windowToModify, browserBot);

    var originalOpen = windowToModify.open;
    /*
     * Safari seems to be broken, so that when we manually trigger the onclick method
     * of a button/href, any window.open calls aren't resolved relative to the app location.
     * So here we replace the open() method with one that does resolve the url correctly.
     */
    windowToModify.open = function(url, windowName, windowFeatures, replaceFlag) {

        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) {
            return originalOpen(url, windowName, windowFeatures, replaceFlag);
        }

        // Reduce the current path to the directory
        var currentPath = windowToModify.location.pathname || "/";
        currentPath = currentPath.replace(/\/[^\/]*$/, "/");

        // Remove any leading "./" from the new url.
        url = url.replace(/^\.\//, "");

        newUrl = currentPath + url;

        var openedWindow = originalOpen(newUrl, windowName, windowFeatures, replaceFlag);
        //LOG.debug("window.open call intercepted; window ID (which you can use with selectWindow()) is \"" +  windowName + "\"");
        if (windowName != null) {
            openedWindow["seleniumWindowName"] = windowName;
        }
        return openedWindow;
    };
};

MozillaBrowserBot.prototype._fireEventOnElement = function(eventType, element, clientX, clientY) {
    var win = this.getCurrentWindow();
    bot.events.fire(element, bot.events.EventType.FOCUS);

    // Add an event listener that detects if the default action has been prevented.
    // (This is caused by a javascript onclick handler returning false)
    // we capture the whole event, rather than the getPreventDefault() state at the time,
    // because we need to let the entire event bubbling and capturing to go through
    // before making a decision on whether we should force the href
    var savedEvent = null;

    element.addEventListener(eventType, function(evt) {
        savedEvent = evt;
    }, false);

    //this._modifyElementTarget(element);

    // Trigger the event.
    this.browserbot.triggerMouseEvent(element, eventType, true, clientX, clientY);

    if (this._windowClosed(win)) {
        return;
    }

    // Perform the link action if preventDefault was set.
    // In chrome URL, the link action is already executed by triggerMouseEvent.
    //if (!browserVersion.isChrome && savedEvent != null && savedEvent.getPreventDefault && !savedEvent.getPreventDefault()) {
    /*
    if (!browserVersion.isChrome && savedEvent != null && savedEvent.defaultPrevented && !savedEvent.defaultPrevented()) {
        var targetWindow = this.browserbot._getTargetWindow(element);
        if (element.href) {
            targetWindow.location.href = element.href;
        } else {
            this.browserbot._handleClickingImagesInsideLinks(targetWindow, element);
        }
    }
    */
};


OperaBrowserBot.prototype._fireEventOnElement = function(eventType, element, clientX, clientY) {
    var win = this.getCurrentWindow();
    bot.events.fire(element, bot.events.EventType.FOCUS);

    this._modifyElementTarget(element);

    // Trigger the click event.
    this.browserbot.triggerMouseEvent(element, eventType, true, clientX, clientY);

    if (this._windowClosed(win)) {
        return;
    }

};


KonquerorBrowserBot.prototype._fireEventOnElement = function(eventType, element, clientX, clientY) {
    var win = this.getCurrentWindow();
    bot.events.fire(element, bot.events.EventType.FOCUS);

    this._modifyElementTarget(element);

    if (element[eventType]) {
        element[eventType]();
    } else {
        this.browserbot.triggerMouseEvent(element, eventType, true, clientX, clientY);
    }

    if (this._windowClosed(win)) {
        return;
    }

};

SafariBrowserBot.prototype._fireEventOnElement = function(eventType, element, clientX, clientY) {
    bot.events.fire(element, bot.events.EventType.FOCUS);
    var wasChecked = element.checked;

    this._modifyElementTarget(element);

    // For form element it is simple.
    if (element[eventType]) {
        element[eventType]();
    }
    // For links and other elements, event emulation is required.
    else {
        var targetWindow = this.browserbot._getTargetWindow(element);
        // todo: deal with anchors?
        this.browserbot.triggerMouseEvent(element, eventType, true, clientX, clientY);

    }

};

SafariBrowserBot.prototype.refresh = function() {
    var win = this.getCurrentWindow();
    if (win.location.hash) {
        // DGF Safari refuses to refresh when there's a hash symbol in the URL
        win.location.hash = "";
        var actuallyReload = function() {
            win.location.reload(true);
        };
        window.setTimeout(actuallyReload, 1);
    } else {
        win.location.reload(true);
    }
};

IEBrowserBot.prototype._fireEventOnElement = function(eventType, element, clientX, clientY) {
    var win = this.getCurrentWindow();
    bot.events.fire(element, bot.events.EventType.FOCUS);

    var wasChecked = element.checked;

    // Set a flag that records if the page will unload - this isn't always accurate, because
    // <a href="javascript:alert('foo'):"> triggers the onbeforeunload event, even thought the page won't unload
    var pageUnloading = false;
    var pageUnloadDetector = function() {
        pageUnloading = true;
    };
    if (win.addEventListener) {
        win.addEventListener('beforeunload', pageUnloadDetector, true);
    } else {
        win.attachEvent('onbeforeunload', pageUnloadDetector);
    }
    this._modifyElementTarget(element);
    if (element[eventType]) {
        element[eventType]();
    } else {
        this.browserbot.triggerMouseEvent(element, eventType, true, clientX, clientY);
    }


    // If the page is going to unload - still attempt to fire any subsequent events.
    // However, we can't guarantee that the page won't unload half way through, so we need to handle exceptions.
    try {
        if (win.removeEventListener) {
            win.removeEventListener('onbeforeunload', pageUnloadDetector, true);
        } else {
            win.detachEvent('onbeforeunload', pageUnloadDetector);
        }

        if (this._windowClosed(win)) {
            return;
        }

        // Onchange event is not triggered automatically in IE.
        if (isDefined(element.checked) && wasChecked != element.checked) {
            bot.events.fire(element, bot.events.EventType.CHANGE);
        }

    } catch (e) {
        // If the page is unloading, we may get a "Permission denied" or "Unspecified error".
        // Just ignore it, because the document may have unloaded.
        if (pageUnloading) {
            //LOG.logHook = function() {
            //};
            //LOG.warn("Caught exception when firing events on unloading page: " + e.message);
            return;
        }
        throw e;
    }
};

module.exports.MozillaBrowserBot = MozillaBrowserBot;
},{}],34:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1]);
