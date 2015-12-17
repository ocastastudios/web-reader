var nwgui = global.window.nwDispatcher.requireNwGui();
var win = nwgui.Window.get();


var chrome = function(opts) {
  var DEBUG = opts.debug || false;
  var title = opts.title || 'App';

  // clear cache
  nwgui.App.clearCache();
  
  // hack to make keyboard shortcuts work (at least under Mac OS)
  // https://github.com/nwjs/nw.js/issues/2462
  var nativeMenuBar = new nwgui.Menu({ type: 'menubar' });
  try {
    nativeMenuBar.createMacBuiltin(title);
    win.menu = nativeMenuBar;
  } catch (err) {
    // console.log(err.message);
  }

  if (DEBUG) {
    win.showDevTools();
  }
  else {
    // win.maximize();
  }

  // use the close event to catch every type of closing
  win.on('close', function() {
    win.hide();
    win.close(true);
  });

  this.openLink = function(url) {
    nwgui.Shell.openExternal(url);
  };
};

module.exports = chrome;