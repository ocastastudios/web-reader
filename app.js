/* global $ */
/*!
 * Electricomics
 * https://github.com/electricomics
 *
/*    
@licstart  The following is the entire license notice for the 
JavaScript below.

Copyright (C) 2015  Electricomics CIC

The JavaScript code in this page is free software: you can
redistribute it and/or modify it under the terms of the GNU
General Public License (GNU GPL) as published by the Free Software
Foundation, either version 3 of the License, or (at your option)
any later version.  The code is distributed WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.

As additional permission under GNU GPL version 3 section 7, you
may distribute non-source (e.g., minimized or compacted) forms of
that code without the copy of the GNU GPL normally required by
section 4, provided you include this license notice and a URL
through which recipients can access the Corresponding Source.   


@licend  The above is the entire license notice
for the JavaScript code in this page.
*/

// for debugging purposes
var DEBUG = true;

// npm modules
var nwgui = require('nw.gui');
var win = nwgui.Window.get();
var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var fs = require('fs');

// settings
var options = {
  host: '127.0.0.1',
  port: 8123
};

// server stuff
var server;
var sockets = {};
var nextSocketId = 0;

if (DEBUG) {
  win.showDevTools();
}
else {
  // win.maximize();
}

// hack to make keyboard shortcuts work (at least under Mac OS)
// https://github.com/nwjs/nw.js/issues/2462
var nativeMenuBar = new nwgui.Menu({ type: 'menubar' });
try {
  nativeMenuBar.createMacBuiltin('Electricomics Generator');
  win.menu = nativeMenuBar;
} catch (err) {
  // console.log(err.message);
}

// prevent backspace key from navigating back
// to fix as this jack would block all the back keys, even on input fields
// $(document).on('keydown', function(e) {
//   if (e.keyCode === 8) {
//     e.preventDefault();
//     return false;
//   }
// });

// address of the created server
// the port will be in an advanded setting panel to avoid collision with existent servers
var serverUrl = 'http://' + options.host + ':' + options.port;

// what do we save in local memory for each project?
// id is a unique for the session identifier, formed of:
// a counter, increased for every open project in the session
// name of the open project without the extension.
// with session we mean the time during which the app is open.
// when the app is closed and reopen the session restart, so does the counter
// project[id] = { fsPath, serverPath, name, files: { nameOfFile: { saved: bool } } }
var projects = {};
var projectsCounter = 0;
var projectExt = '.elcxproject';
var projectExtReg = new RegExp(projectExt + '$', 'i');
var iframesOpen = 0;
var currentProject;


/*
 * Disable/enable top menu items depending if any project is open or not
 * Items like "save project" or "close project" should not be available if no project is open
 */
var iframeFrill = function() {
  if (iframesOpen <= 0) {
    $menuItemProject.addClass('menu-item-disabled');
  }
  else {
    $menuItemProject.removeClass('menu-item-disabled');
  }
};

/**
 * Add an iframe with the open project url and its relative tab
 * @param {string} id - Project id
 */
var iframeAdd = function(id) {
  var $newIframe = $('<iframe class="iframe" src="' + serverUrl + '/loading.html?id=' + id + '&path=' + projects[id].serverPath + '" frameborder="0" id="iframe-' + id + '"></iframe>');
  var $newTab = $('<span class="tab" id="tab-' + id + '" data-iframe="' + id + '">' + projects[id].name + '</span>');
  $iframes.append($newIframe);
  $tabs.append($newTab);
  iframes[id] = $newIframe;
  tabs[id] = $newTab;
  iframeSelect(id);
  iframesOpen++;
  iframeFrill();
};

/**
 * Remove iframe and tab of selected project and focus the one on its left or its right
 * @param {string} id - Project id
 */
var iframeClose = function(id) {
  var prevIframe = tabs[id].prev();
  var nextIframe = tabs[id].next();
  if (prevIframe.length > 0) {
    iframeSelect(prevIframe.data('iframe'));
  }
  else if (nextIframe.length > 0) {
    iframeSelect(nextIframe.data('iframe'));
  }
  iframes[id].remove();
  tabs[id].remove();
  delete iframes[id];
  delete tabs[id];
  iframesOpen--;
  iframeFrill();
};

/**
 * Focus selected open project
 * @param {string} id - Project id
 */
var iframeSelect = function(id) {
  currentProject = id;
  $('.iframe-selected').removeClass('iframe-selected');
  iframes[currentProject].addClass('iframe-selected');
  $('.tab-selected').removeClass('tab-selected');
  tabs[currentProject].addClass('tab-selected');
};


/**
 * Start the local server
 */
var serverStart = function() {
  //check if server is already running
  http.get(options, function() {
    console.log('server is already running');
  }).on('error', function() {
    //server is not yet running

    // all environments
    app.set('port', options.port);
    app.use(express.static(path.join(process.cwd(), 'public')));

    server = http.createServer(app);
    server.listen(options.port, function() {
      console.log('server created');
      projectOpenAll();
    });

    server.on('connection', function (socket) {
      // Add a newly connected socket
      var socketId = nextSocketId++;
      sockets[socketId] = socket;
      // console.log('socket', socketId, 'opened');

      // Remove the socket when it closes
      socket.on('close', function () {
        // console.log('socket', socketId, 'closed');
        delete sockets[socketId];
      });
    });
  });
};

/**
 * Stop the local server
 */
// not sure I need this
// var serverStop = function() {
//   if (server) {
//     server.close(function() {
//       console.log('closed');
//     });
//     for (var socketId in sockets) {
//       if (sockets.hasOwnProperty(socketId)) {
//         // console.log('socket', socketId, 'destroyed');
//         sockets[socketId].destroy();
//       }
//     }
//   }
// };


/**
 * Open project
 * @param {string} path - Path in the filesystem of the project
 * @param {string} name - Name in the filesystem of the project/file - It can be with or without extension, we take care of this later
 */
var projectOpen = function(path, name) {
  if (!path) {
    return false;
  }

  // if folder doesn't have our extension we throw a message notifing the error and asking
  // if the user want to select another folder
  if (!projectExtReg.test(path)) {
    var confirm = $('#dialog-project-open').dialog({
      resizable: false,
      modal: true,
      width: 550,
      buttons: {
        'Yes': function() {
          $(this).dialog('close');
          $openProject.val('');
          $openProject.trigger('click');
        },
        'No': function() {
          $(this).dialog('close');
        }
      }
    });
    confirm.html('<p>Project <em>' + path + '</em> not valid, do you want to open another project?</p>');
    confirm.dialog('open');
    return false;
  }

  // check if folder physically exists
  fs.stat(path, function(err) {
    if (err == null) {
      // folder exists
      return ok();
    }
    else if (err.code === 'ENOENT') {
      // folder does not exist
      return ko();
    }
    else {
      // some other error that we threat as if folder exists
      return ok();
    }
  });

  // folder doesn't exist, just do nothing and save current valid open projects in memory
  var ko = function() {
    localStorage.setItem('projects', JSON.stringify(projects));
  };

  // folder exists
  var ok = function() {
    for (var p in projects) {
      if (projects.hasOwnProperty(p)) {
        // check if this filesystem path aka the project has been already opened
        if (projects[p].fsPath === path) {
          return false;
        }
      }
    }
    // create session data of this project
    projectsCounter++;
    var nameNoExt = name.replace(projectExtReg, '');
    var id = projectsCounter + '-' + nameNoExt;
    projects[id] = {
      name: nameNoExt,
      fsPath: path,
      serverPath: '/' + id
    };
    // mount folder
    app.use('/' + id, express.static(path));
    // save that we opened this project
    localStorage.setItem('projects', JSON.stringify(projects));
    // load iframe
    iframeAdd(id);
  };
};

/**
 * Open all projects that were open when app was closed last time
 */
var projectOpenAll = function() {
  var proj;
  try {
    // try to load the projects that were opened in the last session
    proj = JSON.parse(localStorage.getItem('projects'));
  }
  catch (e) {
    return false;
  }
  for (var p in proj) {
    if (proj.hasOwnProperty(p)) {
      projectOpen(proj[p].fsPath, proj[p].name);
    }
  }
};

/**
 * Send a message to the iframe of the selected project
 * Communications between the app container (which runs under file://) and the pages in the local server (which runs under http://) can ben done only through window.postMessage (a method that enables cross-origin communication)
 * @param {string} type - Type of the message
 * @param {string} id - Project id
 */
var projectStartMessage = function(type, id) {
  var projectId = id || currentProject;
  iframes[projectId].get(0).contentWindow.postMessage('{"type": "'+ type + '", "iframe": "' + projectId + '"}', serverUrl);
};

/**
 * Close project
 * @param {object} content - Object containing file names and the content to write into
 * @param {string} id - Project id
 */
var projectClose = function(content, id) {
  var projectId = id || currentProject;
  // close function
  var cb = function() {
    iframeClose(projectId);
    delete projects[projectId];
    localStorage.setItem('projects', JSON.stringify(projects));
    // todo unmount folder
  };
  cb();  
};


// Listener for the postMessages from the iframes
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

  if (msg.type === 'close') {
    projectClose(msg.content, msg.iframe);
  }
}, false);



// UI
var $openProject = $('#open-project');
var $closeProject = $('#close-project');
var $comicPreview = $('#comic-preview');
var $comicFolder = $('#comic-folder');
var $quit = $('#quit');
var $iframes = $('#iframes');
var iframes = {};
var $tabs = $('#tabs');
var tabs = {};
var $menuItemProject = $('.menu-item-project');


$quit.on('click', function() {
  var confirm = $('#dialog-close-app').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Quit': function() {
        $(this).dialog('close');
        win.close();
      },
      Cancel: function() {
        $(this).dialog('close');
        return;
      }
    }
  });
  confirm.dialog('open');
});

// use the close event to catch every type of closing, not only the one from our
// top menu (e.g. keyboard shortcut close)
win.on('close', function() {
  this.hide(); // Pretend to be closed already
  // todo save all projects
  this.close(true);
});

$openProject.on('change', function() {
  var path = this.files[0].path;
  var name = this.files[0].name;
  console.log(path, name);
  if (path !== '') {
    projectOpen(path, name);
    // reset its value so it can catch the next event in case we select the same
    // previous value
    this.value = '';
  }
});

$closeProject.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  projectStartMessage('close');
});

$comicPreview.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  // open comic preview in the system default browser
  nwgui.Shell.openExternal(path.join(serverUrl, projects[currentProject].serverPath));
});

$comicFolder.on('click', function() {
  if ($(this).hasClass('menu-item-disabled')) {
    return;
  }
  // open the project folder in the system finder
  nwgui.Shell.showItemInFolder(projects[currentProject].fsPath);
});

$(document).on('click', '.tab', function() {
  var id = $(this).data('iframe');
  iframeSelect(id);
});



serverStart();