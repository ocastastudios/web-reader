/* global $, $document, sendMessage, receiveMessage, reader, App */

var $addRemoteForm = $('#add-remote-form');
var $addRemoteUrl = $('#add-remote-url');
var $addRemoteStop = $('#add-remote-stop');
var $addRemoteStatus = $('#add-remote-status');
var $addRemoteProgressbar = $('#add-remote-progressbar');
var $addRemoteProgressbarLabel = $addRemoteProgressbar.find('.progress-label');
var $addArchiveForm = $('#add-archive-form');
var $addArchiveStatus = $('#add-archive-status');
var $addStoreStop;
var $addStoreProgressbar;
var $addStoreProgressbarLabel;
var $currentStatus;
var totalDownload;
var whichRemote = '';
var whichImport = '';
var isImporting = false;

$addRemoteProgressbar.progressbar({
  value: false,
  change: function() {
    if ($addRemoteProgressbar.progressbar('value') === false) {
      $addRemoteProgressbarLabel.text('Downloading...');
    }
    else {
      $addRemoteProgressbarLabel.text('Downloaded ' + $addRemoteProgressbar.progressbar('value') + '% of ' + totalDownload);
    }
  },
  complete: function() {
    $addRemoteProgressbarLabel.text('Complete!');
  }
});

var setStatus = function(status) {
  $currentStatus.text(status);
};

/**
 * Sort comics by key, it actually changed the array
 * @param {string} key - Parameter to sort to - optional, if not given, title will be used
 */
var sortLibrary = function(key) {
  key = key || 'title';
  reader.libraryList.sort(function(a, b) {
    return compare(reader.library[a], reader.library[b], key);
  });
};

/**
 * Compare array items by key - this is used by the native Array.sort()
 * @param {string} key - Property to use for comparison
 */
var compare = function(a, b, key) {
  if (a.data[key] < b.data[key]) {
    return -1;
  }
  if (a.data[key] > b.data[key]) {
    return 1;
  }
  return 0;
};

/**
 * @param {boolean} disabled - True to disable
 */
var toggleForms = function(disable) {
  $addRemoteForm.find('input').prop('disabled', disable);
  $addArchiveForm.find('input').prop('disabled', disable);
  // not saving this element in a variable as it's generate by the templating system
  $('#add-store-button').prop('disabled', disable);
};

var enableForms = function() {
  toggleForms(false);
};

var disableForms = function() {
  toggleForms(true);
};

var importStart = function() {
  isImporting = true;
  setStatus('Waiting...');
  disableForms();
};

var importStarted = function() {
  setStatus('Importing...');
};

var importCompleted = function() {
  isImporting = false;
  setStatus('Import completed!');
  enableForms();
};

var importError = function() {
  isImporting = false;
  setStatus('Import interrupted with error');
  enableForms();
};


var remoteStart = function(url) {
  if (url !== '') {
    sendMessage('url', { url: url });
  }
};

var remoteStop = function() {
  sendMessage('interrupt');
};

var remoteStarted = function(val) {
  totalDownload = val;
  if (whichRemote === 'add') {
    $addRemoteStop.show().prop('disabled', false);
    $addRemoteProgressbar.progressbar('value', false);
    $addRemoteProgressbar.show();
  }
  if (whichRemote === 'store') {
    $addStoreProgressbar = $('#add-store-progressbar');
    $addStoreProgressbarLabel = $addStoreProgressbar.find('.progress-label');
    $addStoreStop = $('#add-store-stop');
    $addStoreProgressbar.progressbar({
      value: false,
      change: function() {
        if ($addStoreProgressbar.progressbar('value') === false) {
          $addStoreProgressbarLabel.text('Downloading...');
        }
        else {
          $addStoreProgressbarLabel.text('Downloaded ' + $addStoreProgressbar.progressbar('value') + '% of ' + totalDownload);
        }
      },
      complete: function() {
        $addStoreProgressbarLabel.text('Complete!');
        remoteCompleted();
      }
    });
    $addStoreStop.show().prop('disabled', false);
    $addStoreProgressbar.show();
  }
};

var remoteUpdated = function(val) {
  if (whichRemote === 'add') {
    $addRemoteProgressbar.progressbar('value', val);
  }
  if (whichRemote === 'store') {
    $addStoreProgressbar.progressbar('value', val);
  }
};

var remoteError = function() {
  if (whichRemote === 'add') {
    $addRemoteProgressbarLabel.text('Error!');
    $addRemoteStop.hide();
    $addRemoteProgressbar.hide();
  }
  if (whichRemote === 'store') {
    $addStoreProgressbarLabel.text('Error!');
    $addStoreStop.hide();
    $addStoreProgressbar.hide();
  }
};

var remoteCompleted = function() {
  if (whichRemote === 'add') {
    $addRemoteStop.hide();
  }
  if (whichRemote === 'store') {
    $addStoreStop.hide();
  }
};


// Remote URL from add
$addRemoteForm.on('submit', function(e) {
  e.preventDefault();
  var url = $addRemoteUrl.val();
  if (url !== '') {
    $currentStatus = $addRemoteStatus;
    whichRemote = 'add';
    whichImport = 'url';
    remoteStart(url);
    importStart();
  }
});

$addRemoteStop.on('click', function() {
  remoteStop();
});


// Remote URL from store
$document.on('click', '#add-store-button', function() {
  var $this = $(this);
  var url = $this.data('url');
  if (url !== '') {
    $currentStatus = $('#add-store-status');
    whichRemote = 'store';
    whichImport = 'store';
    remoteStart(url);
    importStart();
  }
});

$document.on('click', '#add-store-stop', function() {
  remoteStop();
});


// Local archive
$('#add-archive-file').on('change', function() {
  var path = this.files[0].path;
  if (path !== '') {
    whichImport = 'archive';
    $currentStatus = $addArchiveStatus;
    sendMessage('local-archive', { path: path });
    importStart();
    // reset its value so it can catch the next event in case we select the same previous value
    this.value = '';
  }
});


// Delete comic
$document.on('click', '.js-delete-comic', function() {
  var id = $(this).data('id');
  dialogDelete(id);
});


var addItem = function(msg) {
  var id = msg.id;
  reader.library[id] = msg.data;
  reader.libraryList.push(id);
  sortLibrary();

  if (reader.store.libraryList.indexOf(id) !== -1) {
    App.renderStoreList();
  }
  App.renderLibraryList();

  if (whichImport === 'store') {
    App.renderLibraryItem(id, 'store');
  }

  if (whichImport === 'archive' || whichImport === 'url') {
    App.router.setRoute('/add-item/' + id);
    // todo clean forms and progressbar and status
    // reader.added.unshift(id); // todo - disabled at the moment
  }
};

var dialogDelete = function(id) {
  var confirm = $('#dialog-delete-comic').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Yes delete': function() {
        $(this).dialog('close');
        removeItem(id);
      },
      'No don\'t': function() {
        $(this).dialog('close');
        return;
      }
    }
  });
  confirm.dialog('open');
};

var removeItem = function(id) {
  sendMessage('remove-entry', { id: id });
};

var removedItem = function(id) {
  if (reader.library[id]) {
    delete reader.library[id];
  }
  var index = reader.libraryList.indexOf(id);
  if (index !== -1) {
    reader.libraryList.splice(index);
  }

  if (reader.store.libraryList.indexOf(id) !== -1) {
    App.renderStoreList();
  }
  App.renderLibraryList();
  App.router.setRoute('/' + App.section);
};


// overrind the receive function so every file it's more modular, and its
// inclusion or exclusion won't compromise the rest of the script
var loadReceiveMessage = receiveMessage;
receiveMessage = function(msg) {
  loadReceiveMessage(msg);

  if (msg.type === 'progress-url') {
    if (msg.message === -1) {
      remoteError();
    }
    else {
      remoteUpdated(msg.message);
    }
  }

  if (msg.type === 'download-started') {
    remoteStarted(msg.message);
  }

  if (msg.type === 'import') {
    var status = msg.message;
    if (status === 'started') {
      importStarted();
    }
    if (status === 'completed') {
      importCompleted();
    }
    if (status === 'error') {
      importError();
    }
  }

  if (msg.type === 'add-item') {
    addItem(msg);
  }

  if (msg.type === 'deleted') {
    removedItem(msg.id);
  }
};