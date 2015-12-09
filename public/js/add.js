/* global $, $document, sendMessage, receiveMessage */

var $currentOpen;

// Remote URL from add
var $openRemoteForm = $('#open-remote-form');
var $openRemoteUrl = $('#open-remote-url');
var $openRemoteStop = $('#open-remote-stop');
var $progressbarUrl = $('#progressbar-url');
var $progressLabelUrl = $progressbarUrl.find('.progress-label');
var totalDownload;

var remoteStart = function(url) {
  if (url !== '') {
    sendMessage('url', { url: url });
  }
};

var remoteStop = function() {
  $progressLabelUrl.text('Error!');
  $openRemoteStop.hide();
  $progressbarUrl.hide();
};

var remoteUpdated = function(val) {
  $progressbarUrl.progressbar('value', val);
};

var remoteStarted = function(val) {
  totalDownload = val;
  $openRemoteStop.show();
  $progressbarUrl.progressbar('value', false);
  $progressbarUrl.show();
};

$openRemoteForm.on('submit', function(e) {
  console.log('submit');
  e.preventDefault();
  $currentOpen = $openRemoteForm;
  var url = $openRemoteUrl.val();
  remoteStart(url);
});
$openRemoteStop.on('click', function() {
  sendMessage('interrupt');
});
$progressbarUrl.progressbar({
  value: false,
  change: function() {
    if ($progressbarUrl.progressbar('value') === false) {
      $progressLabelUrl.text('Downloading...');
    }
    else {
      $progressLabelUrl.text('Downloaded ' + $progressbarUrl.progressbar('value') + '% of ' + totalDownload);
    }
  },
  complete: function() {
    $progressLabelUrl.text('Complete!');
  }
});


// Remote URL from store
$document.on('click', '.js-store-item-download', function() {
  var $this = $(this);
  var url = $this.data('url');
  remoteStart(url);
});


// Local archive
var $openArchiveForm = $('#open-archive-form');
$('#open-local-archive').on('change', function() {
  var path = this.files[0].path;
  if (path !== '') {
    $currentOpen = $openArchiveForm;
    sendMessage('local-archive', { path: path });
    // reset its value so it can catch the next event in case we select the same previous value
    this.value = '';
  }
});


// General
var importStarted = function() {
  $openArchiveForm.find('.status').text('');
  $openRemoteForm.find('.status').text('');
  $currentOpen.find('.status').text('Importing');
  // disable all forms
  $openArchiveForm.find('input').prop('disabled', true);
  $openRemoteForm.find('input:not(#open-remote-stop)').prop('disabled', true);
};

var importError = function() {
  $currentOpen.find('.status').text('Import terminated with error');
  // enable all forms
  $openArchiveForm.find('input').prop('disabled', false);
  $openRemoteForm.find('input').prop('disabled', false);
};

var importCompleted = function() {
  $currentOpen.find('.status').text('Import completed!');
  // enable all forms
  $openArchiveForm.find('input').prop('disabled', false);
  $openRemoteForm.find('input').prop('disabled', false);
};

// overrind the receive function so every file it's more modular, and its
// inclusion or exclusion won't compromise the rest of the script
var loadReceiveMessage = receiveMessage;
receiveMessage = function(msg) {
  loadReceiveMessage(msg);

  if (msg.type === 'progress-url') {
    if (msg.message === -1) {
      remoteStop();
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
};