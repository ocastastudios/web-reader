var mainFrame = window.document.getElementById('main-iframe');
var iframeWin = mainFrame.contentWindow;

var ui = {
  start: function() {
    mainFrame.classList.add('iframe-loaded');
  },
  load: function(url) {
    mainFrame.setAttribute('src', url);
  },
  iframe: iframeWin
};

module.exports = ui;