(function() {

  var sendMessage = function(type) {
    var msg = {
      type: type
    };
    window.parent.postMessage(JSON.stringify(msg), window.location.origin);
  };

  var closeComic = function(event) {
    event.preventDefault();
    event.stopPropagation();
    sendMessage('close-comic');
  };

  var nav = document.getElementsByTagName('ec-webreader-nav');
  if (nav.length > 0) {
    nav[0].addEventListener('click', closeComic);
  }

})();