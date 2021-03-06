/* global $, Handlebars, Router, reader, features, internal */

$.each(reader.helpers, function(key, value) {
  Handlebars.registerHelper(key, new Function('return ' + value)());
});

var App = {
  init: function() {
    this.reader = reader;
    this.sections = $('.section');
    this.navs = $('.main-nav__link');
    this.libraryListTemplate = Handlebars.compile($('#library__list--template').html());
    this.libraryItemTemplate = Handlebars.compile($('#library-item__wrapper--template').html());
    this.storeListTemplate = Handlebars.compile($('#store__list--template').html() || '');
    this.storeItemTemplate = Handlebars.compile($('#store-item__wrapper--template').html() || '');
    this.addedTemplate = Handlebars.compile($('#added--template').html() || '');
    // this.render();
    // this.bindEvents();

    this.router = new Router({
      '/:section': function (section) {
        this.section = section;
        this.showSection();
      }.bind(this),

      '/:section/:item': function (section, item) {
        if (section === 'store-item') {
          if (this.reader.libraryList.indexOf(item) === -1) {
            this.renderStoreItem(item);
          }
          else {
            this.renderLibraryItem(item, 'store');
          }
          this.toggleNav('store');
        }
        
        if (section === 'store') {
          this.section = section;
          this.showSection(item);
        }
        
        if (section === 'library-item') {
          this.renderLibraryItem(item, 'library');
          this.toggleNav('library');
        }
        
        if (section === 'library') {
          this.section = section;
          this.showSection(item);
        }

        if (section === 'add-item') {
          this.renderLibraryItem(item, 'add');
          this.toggleNav('add');
        }
      }.bind(this)
    }).init(internal ? '/store' : '/library');
  },
  bindEvents: function() {
    
  },
  render: function() {
    this.renderLibraryList();
    this.renderStoreList();
    this.renderAdded();
  },
  toggleNav: function(section) {
    this.navs.toggleClass('main-nav__link--selected', false)
      .filter('[href="#/' + section + '"]').toggleClass('main-nav__link--selected', true);
  },
  showSection: function(item) {
    var s = this.section;
    this.sections.hide()
      .filter('#' + this.section).show();
    this.toggleNav(this.section);
    if (item) {
      setTimeout(function() {
        $('body').animate({
          scrollTop: $('#' + s).find('.id--' + item).offset().top - 150
        }, 0);
      }, 0);
    }
  },
  getStoreItem: function(item) {
    var lib = this.reader.store.library;
    for (var i = 0; i < lib.length; i++) {
      if (lib[i].id === item) {
        return lib[i];
      }
    }
    return {};
  },
  renderLibraryList: function() {
    $('#library__list').html(this.libraryListTemplate({
      library: this.reader.library,
      libraryList: this.reader.libraryList
    }));
  },
  renderLibraryItem: function(item, section) {
    $('#library-item__wrapper').html(this.libraryItemTemplate({
      id: item,
      item: this.reader.library[item],
      section: section,
      features: features,
      internal: internal
    }));
    this.sections.hide();
    $('#library-item').show();
  },
  renderStoreList: function() {
    $('#store__list').html(this.storeListTemplate({
      store: this.reader.store,
      libraryList: this.reader.libraryList
    }));
  },
  renderStoreItem: function(item) {
    $('#store-item__wrapper').html(this.storeItemTemplate({
      item: this.getStoreItem(item)
    }));
    this.sections.hide();
    $('#store-item').show();
  },
  renderAdded: function() {
    $('#added').html(this.addedTemplate({
      library: this.reader.library,
      added: this.reader.added
    }));
  }
};

App.init();