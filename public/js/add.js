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


var addItem = function(msg) {
  var id = msg.id;
  reader.library[id] = msg.data;
  reader.libraryList.push(id);

  if (reader.store.libraryList.indexOf(id) !== -1) {
    App.renderStoreList();
  }
  App.renderLibraryList();

  if (whichImport === 'store') {
    App.renderLibraryItem(id, 'store');
  }

  if (whichImport === 'archive' || whichImport === 'url') {
    App.renderLibraryItem(id, 'add');
    // reader.added.unshift(id);
  }
};

var giulia = function() {
  var msg = {
    id: 'afed27c144a0055de97bfc9a84d5464f5abb15b2'
  };
  App.renderLibraryItem(msg.id, 'add');
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
};