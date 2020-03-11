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

},{"./src/recorder":31}],2:[function(require,module,exports){
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
},{"./adapters/http":3,"./adapters/xhr":3,"./helpers/normalizeHeaderName":24,"./utils":27,"_process":32}],18:[function(require,module,exports){
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
const LocatorBuilder = require("./locatorBuilders").LocatorBuilders;

class ElementUtil {
  
  static getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  }

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

},{"./locatorBuilders":29}],29:[function(require,module,exports){
const NeighborLocatorsGenerator = require("./neighborLocatorsGenerator")
  .NeighborLocatorsGenerator;

//only implement if no native implementation is available
if (!Array.isArray) {
  Array.isArray = function(obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };
}

function getElementByXPath(path) {
  return document.evaluate(
    path,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;
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
  var ele;
  try {
    ele = getElementByXPath(locator);
  } catch (error) {
    ele = document.querySelector(locator);
  }
  return ele;
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
    this.findElement(sub_path) != e &&
    current.nodeName.toLowerCase() != "html"
  ) {
    sub_path = this.getCSSSubPath(current.parentNode) + " > " + sub_path;
    current = current.parentNode;
  }
  return sub_path;
});

LocatorBuilders.add("xpath:neighbor", function(e) {
  try {
    var s = new NeighborLocatorsGenerator().getXpathsByNeighbors(e, false);
    return s;
  } catch (e) {
    // console.log('failed to generate neighbor xpath', e);
  }
});

module.exports.LocatorBuilders = LocatorBuilders;

},{"./neighborLocatorsGenerator":30}],30:[function(require,module,exports){
var $ = window.$;

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

},{}],31:[function(require,module,exports){
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

},{"./common":28,"./locatorBuilders":29,"axios":2}],32:[function(require,module,exports){
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
