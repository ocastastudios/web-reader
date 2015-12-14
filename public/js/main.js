/* global $, reader */

var $document = $(document);
var $body = $('body');
var $comicIframe = $('#comic-iframe');

var sendMessage = function(type, obj) {
  var msg = {
    type: type
  };
  $.extend(msg, obj);
  window.parent.postMessage(JSON.stringify(msg), '*');
};

var receiveMessage = function(msg) {
  if (msg.type === 'error') {
    dialogError(msg.message);
  }
  if (msg.type === 'online') {
    $('#online').toggleClass('online', msg.status);
  }
  if (msg.type === 'ask-to-close') {
    dialogClose();
  }
};

var dialogError = function(msg) {
  var confirm = $('#dialog-error').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Close': function() {
        $(this).dialog('close');
      }
    }
  });
  confirm.html('<p>' + msg + '</p>');
  confirm.dialog('open');
};

var dialogClose = function() {
  var confirm = $('#dialog-close-app').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Quit': function() {
        $(this).dialog('close');
        sendMessage('close');
      },
      Cancel: function() {
        $(this).dialog('close');
        return;
      }
    }
  });
  confirm.dialog('open');
};

$document.on('click', '.js-open-folder', function() {
  var id = $(this).data('id');
  sendMessage('open-folder', { id: id });
});

var openComic = function(url) {
  $comicIframe.attr('src', url);
  $body.addClass('show-comic');
};

var closeComic = function() {
  $body.removeClass('show-comic');
  $comicIframe.attr('src', '');
};

$document.on('click', '.js-open-comic', function() {
  var url = $(this).data('url');
  openComic(url);
});

window.addEventListener('message', function(e) {
  var msg;
  // from the backend
  if (e.origin === 'file://') {
    try {
      msg = JSON.parse(e.data);
    }
    catch (err) {
      console.error(err);
      return false;
    }

    receiveMessage(msg);
  }
  // from the comics
  else if (e.origin === window.location.origin) {
    try {
      msg = JSON.parse(e.data);
    }
    catch (err) {
      console.error(err);
      return false;
    }
    if (msg.type === 'close-comic') {
      closeComic();
    }
  }
  // don't accept from anywhere else
  else {
    return false;
  }
});


sendMessage('online');