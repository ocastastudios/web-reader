# TODO

* [x] when adding local directory, check that it's not already open
* [x] when downloading archive, check we are not overwriting anything
* [x] when extracting archive, check we are not overwriting anything
* [x] add comic entry in the UI with ajax and scroll to it or show it or similar
* [x] add more error checking and control to the download archive functionality
* [ ] add this functionalities to all the comics:
  * [x] view in external browser - only if page is viewed from inside the app
  * [ ] inject js/css/html code for top navigation menu inside the comic index.html
* [x] add this functionalities to external comics:
  * [x] view folder in finder/explorer - only if page is viewed from inside the app
  * [x] remove entry and delete files - only if page is viewed from inside the app
* [x] add "about Electricomics" section
* [x] add progress bar to download
* [x] add loading screen when adding comic
* [x] add splash screen
* [ ] fix tilt for Sway
* [x] something that shows or interfaces with http://electricomics.net/library/
* [x] the download functionality needs:
  * [x] progress bar
  * [x] total final file size at the beginning
  * [x] be able to be interrupted at any time and return an "interrupted" error
  * [x] return an error if link doesn't work
  * [x] better url handling
* [x] read '/n' in the comic.json
* [ ] landscape/portrait? how?
* [x] add archive ui should copy the zip to the tmp folder and its own function
* [ ] get messages from us
* [ ] google analytics?

version:
* check if online
* if online, retrieve version.js (or similar)
* if there is a new version, show message

communication:
* check if online
* if online, retrive communications.js (or similar)

online/offline
* when offline
  * download from url should be disabled
  * an offline status should be shown in the market page
  * download comic buttons in market page should be disabled
