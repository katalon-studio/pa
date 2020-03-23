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
      if (this.rec_isElementMouseUpEventRecordable(target, clickType) && this.rec_isCursorTypePointer(target)) {
        this.processOnClickTarget(target, clickType, currentURL);
      }
    }
  },
  true
);

recorder.attach();

},{"./src/recorder":5}],2:[function(require,module,exports){
const LocatorBuilder = require("./locatorBuilders").LocatorBuilders;

class ElementUtil {
  static getElementByXpath(path) {
    return document.evaluate(
      path,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }

  static generateKeyFor(element) {
    for (
      var segs = [];
      element && element.nodeType == 1;
      element = element.parentNode
    ) {
      for (
        var i = 1, sib = element.previousSibling;
        sib;
        sib = sib.previousSibling
      ) {
        if (sib.nodeName == element.nodeName) i++;
      }
      segs.unshift(element.nodeName.toLowerCase() + "[" + i + "]");
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

},{"./locatorBuilders":3}],3:[function(require,module,exports){
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

},{"./neighborLocatorsGenerator":4}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
const ElementUtil = require("./common").ElementUtil;
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
    if (this.window.location !== this.window.parent.location) {
      s;
      this.window.parent.postMessage(JSON.stringify(object), "*");
    } else {
      const data = {
        keys: [object["unique_identifier"]],
        selectors: this.getOnlySelectors(object)
      };
      console.log(object);
      trackingInteractedElement(
        data.keys,
        data.selectors,
        object.attributes.text
      );
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

  rec_isCursorTypePointer(element) {
    return $(element).css('cursor') == 'pointer';
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

},{"./common":2,"./locatorBuilders":3}]},{},[1]);
