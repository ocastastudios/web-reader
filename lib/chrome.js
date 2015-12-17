var nwgui = global.window.nwDispatcher.requireNwGui();
var win = nwgui.Window.get();


var chrome = function(opts) {
  var DEBUG = opts.debug || false;
  var title = opts.title || 'App';
  var rightClickMenu;

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

  // create right click menu
  this.contextmenuCreate = function(document) {
    rightClickMenu = new nwgui.Menu();
    var cut = new nwgui.MenuItem({
      label: 'Cut',
      click: function() {
        document.execCommand('cut');
      }
    });
    var copy = new nwgui.MenuItem({
      label: 'Copy',
      click: function() {
        document.execCommand('copy');
      }
    });
    var paste = new nwgui.MenuItem({
      label: 'Paste',
      click: function() {
        document.execCommand('paste');
      }
    });
    rightClickMenu.append(cut);
    rightClickMenu.append(copy);
    rightClickMenu.append(paste);
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      rightClickMenu.popup(e.x, e.y);
    });
  };

  // trigger right click menu
  this.contextmenuTrigger = function(x, y) {
    x = x || 0;
    y = y || 0;
    rightClickMenu.popup(x, y);
  };

  // open url in external browser
  this.openLink = function(url) {
    nwgui.Shell.openExternal(url);
  };
};

module.exports = chrome;