var _ = require('underscore');

/**
 * Send a message to the iframe
 * Communications between the app container (which runs under file://) and the pages in the local server (which runs under http://) can ben done only through window.postMessage (a method that enables cross-origin communication)
 * @param {string} type - Type of the message
 */
var Communication = function(iframeWin, serverUrl) {
  return function(type, obj) {
    var msg = {
      type: type
    };
    _.extend(msg, obj);
    iframeWin.postMessage(JSON.stringify(msg), serverUrl);
  };
};


module.exports = Communication;