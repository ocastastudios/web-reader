var Ui = function(opts) {
  var window = opts.window;
  var mainFrame = window.document.getElementById('main-iframe');
  var iframeWin = mainFrame.contentWindow;

  this.start = function() {
    mainFrame.classList.add('iframe-loaded');
  };
  
  this.load = function(url) {
    mainFrame.setAttribute('src', url);
  };
  
  this.iframe = iframeWin;
};

module.exports = Ui;