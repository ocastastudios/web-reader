var _ = require('underscore');

var Communication = function(opts) {
  var iframeWin = opts.iframeWin;
  var serverUrl = opts.serverUrl;
  var window = opts.window;
  
  /**
   * Send a message to the iframe
   * Communications between the app container (which runs under file://) and the pages in the local server (which runs under http://) can ben done only through window.postMessage (a method that enables cross-origin communication)
   * @param {string} type - Type of the message
   * @param {object} obj - Object to send
   */
  this.sendMessage = function(type, obj) {
    var msg = {
      type: type
    };
    _.extend(msg, obj);
    iframeWin.postMessage(JSON.stringify(msg), serverUrl);
  };

  /**
   * Listener for the postMessages from the iframe
   * @param {function} cb - Callback to run for the message
   */
  this.receiveMessage = function(cb) {
    window.addEventListener('message', function(e) {
      // check that that the messages come from our local server
      if (e.origin !== serverUrl) {
        return false;
      }
      
      var msg;
      try {
        msg = JSON.parse(e.data);
      } catch(err) {
        console.log('error in the received post message');
        return false;
      }

      return cb(msg);
    }, false);
  };
};


module.exports = Communication;