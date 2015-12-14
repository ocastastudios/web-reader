/* global $, elcxAdapt */

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

  var adaptComic = function() {
    var screenWidth;
    var screenHeight;
    var comicWidth;
    var comicHeight;

    var $comic = $('ec-comic').eq(0);
    var $panels = $('ec-panel');
    var originalWidth = parseInt($comic.css('width'), 10);
    var originalHeight = parseInt($comic.css('height'), 10);

    $panels.each(function() {
      var $this = $(this);
      var w = parseInt($this.css('width'), 10);
      var h = parseInt($this.css('height'), 10);
      var l = parseInt($this.css('left'), 10);
      var t = parseInt($this.css('top'), 10);
      $this
        .attr('data-width', w)
        .attr('data-height', h)
        .attr('data-left', l)
        .attr('data-top', t);
    });

    var resizeComic = function() {
      screenWidth = document.documentElement.clientWidth;
      screenHeight = document.documentElement.clientHeight;
      comicWidth = screenWidth;
      comicHeight = comicWidth / originalWidth * originalHeight;
      if (comicHeight > screenHeight) {
        comicHeight = screenHeight;
        comicWidth = comicHeight / originalHeight * originalWidth;
      }

      var propW = comicWidth / originalWidth;
      var propH = comicHeight / originalHeight;
      var propL = comicWidth / originalWidth;
      var propT = comicHeight / originalWidth;

      $panels.each(function() {
        var $this = $(this);
        var w = $this.data('width') * propW;
        var h = $this.data('height') * propH;
        var l = $this.data('left') * propL;
        var t = $this.data('top') * propT;
        $this
          .css('width', w + 'px')
          .css('height', h + 'px')
          .css('left', l + 'px')
          .css('top', t + 'px');
      });
    };

    resizeComic();

    window.addEventListener('resize', resizeComic);
  };

  if (elcxAdapt) {
    adaptComic();
  }

})();